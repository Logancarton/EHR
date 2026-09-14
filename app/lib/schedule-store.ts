"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { timeStringToMinutes, type ScheduleItem } from "./schedule-data";
import { api } from "./api-client";

/**
 * The one runtime practice schedule.
 *
 * The dashboard used to start from `initialSchedule` and only replace it when the
 * backend answered with a non-empty list. That made the seed fixtures live truth in
 * three separate situations: a practice with no appointments, a clinician whose
 * access scope contains none, and a failed request. All three rendered a full,
 * confident clinic day for patients the signed-in user might not even be able to
 * open.
 *
 * So this store mirrors `patient-roster`: a successful response is the schedule,
 * including when it is empty, and a failed one is an explicit error with nothing in
 * it. Nothing here falls back to fixtures.
 *
 * `GET /api/appointments` narrows the day to the caller's accessible patient
 * population, so access filtering stays on the server and this only mirrors what
 * that boundary returned.
 */
export type ScheduleStatus = "idle" | "loading" | "ready" | "error";

export type PracticeScheduleState = {
  appointments: readonly ScheduleItem[];
  status: ScheduleStatus;
  error: string;
  /** When the current rows were confirmed by the server, for freshness display. */
  loadedAt: string | null;
};

const EMPTY_SCHEDULE: readonly ScheduleItem[] = Object.freeze([]);
const IDLE_STATE: PracticeScheduleState = Object.freeze({
  appointments: EMPTY_SCHEDULE,
  status: "idle" as const,
  error: "",
  loadedAt: null,
});

let state: PracticeScheduleState = IDLE_STATE;
let inFlight: Promise<readonly ScheduleItem[]> | null = null;
const listeners = new Set<() => void>();

function publish(next: PracticeScheduleState) {
  state = next;
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function practiceScheduleState(): PracticeScheduleState {
  return state;
}

export function loadPracticeSchedule({ force = false }: { force?: boolean } = {}): Promise<
  readonly ScheduleItem[]
> {
  if (!force && state.status === "ready") return Promise.resolve(state.appointments);
  if (!force && inFlight) return inFlight;

  publish({ ...state, status: "loading", error: "" });

  const request: Promise<readonly ScheduleItem[]> = api.appointments
    .list()
    .then((appointments) => {
      if (inFlight !== request) return state.appointments;
      inFlight = null;
      // An empty day is an answer. Keeping the previous rows here is what let a
      // stale or seeded schedule outlive the practice it belonged to.
      publish({
        appointments: Object.freeze([...appointments]),
        status: "ready",
        error: "",
        loadedAt: new Date().toISOString(),
      });
      return state.appointments;
    })
    .catch((cause: unknown) => {
      if (inFlight !== request) return state.appointments;
      inFlight = null;
      publish({
        appointments: EMPTY_SCHEDULE,
        status: "error",
        error: cause instanceof Error ? cause.message : "The schedule could not be loaded.",
        loadedAt: null,
      });
      return EMPTY_SCHEDULE;
    });

  inFlight = request;
  return request;
}

export function refreshPracticeSchedule(): Promise<readonly ScheduleItem[]> {
  return loadPracticeSchedule({ force: true });
}

export function resetPracticeSchedule(): void {
  inFlight = null;
  publish(IDLE_STATE);
}

/**
 * Folds a server-confirmed appointment back into the schedule.
 *
 * Only ever called with what a mutation returned, never with what the client hoped
 * would happen: a row that looks saved but was refused is the failure mode this
 * whole store exists to remove.
 */
export function applyConfirmedAppointment(appointment: ScheduleItem): void {
  if (state.status !== "ready") return;
  const index = state.appointments.findIndex((item) => item.id === appointment.id);
  const next = index === -1
    ? [...state.appointments, appointment]
    : state.appointments.map((item) => (item.id === appointment.id ? appointment : item));
  // Sorted on the way in, by the rule the server sorts by. Appending left a visit
  // booked for 7am sitting under the 5pm one until the next read — the roster's
  // whole job is to be in the order the day happens.
  publish({ ...state, appointments: Object.freeze(next.sort(byDateThenClockTime)) });
}

/** The order a clinic day happens in. Mirrors `AppointmentRepository.list`. */
function byDateThenClockTime(a: ScheduleItem, b: ScheduleItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const minutes = timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
  return minutes !== 0 ? minutes : a.id.localeCompare(b.id);
}

export function usePracticeSchedule(): PracticeScheduleState & {
  refresh: () => Promise<readonly ScheduleItem[]>;
} {
  const snapshot = useSyncExternalStore(subscribe, practiceScheduleState, practiceScheduleState);

  useEffect(() => {
    // Re-read on mount rather than serving whatever was cached. The dashboard
    // unmounts whenever a chart is in front, and appointments move while it is
    // away — a visit closed from the encounter workspace, a colleague's change.
    // Returning to a cached day would show work as still open after it was done.
    // The rows already on screen stay there while the read is in flight.
    void refreshPracticeSchedule();
  }, []);

  const refresh = useCallback(() => refreshPracticeSchedule(), []);

  return { ...snapshot, refresh };
}
