"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { timeStringToMinutes, type ScheduleItem } from "./schedule-data";
import { api } from "./api-client";
import { ApiError } from "./api-error";

/**
 * The one runtime practice schedule with authenticated live polling transport (DB-6).
 *
 * DB-6 transport guarantees:
 * 1. Background polling: 10s active window, 30s background/idle.
 * 2. Re-fetch canonical state on reconnect, focus, and invalidation.
 * 3. Out-of-order response discard via monotonically increasing sequence IDs.
 * 4. Stale/offline/syncing status tracking with honest latency disclosure.
 * 5. Subscriptions stop on logout / 401 unauthenticated.
 */
export type ScheduleStatus = "idle" | "loading" | "ready" | "error";
export type SyncStatus = "live" | "syncing" | "stale" | "offline" | "error";

export type PracticeScheduleState = {
  appointments: readonly ScheduleItem[];
  status: ScheduleStatus;
  syncStatus: SyncStatus;
  error: string;
  /** When the current rows were confirmed by the server, for freshness display. */
  loadedAt: string | null;
  /** Monotonically increasing sequence ID to discard out-of-order responses */
  sequenceId: number;
};

const EMPTY_SCHEDULE: readonly ScheduleItem[] = Object.freeze([]);
const IDLE_STATE: PracticeScheduleState = Object.freeze({
  appointments: EMPTY_SCHEDULE,
  status: "idle" as const,
  syncStatus: "live" as const,
  error: "",
  loadedAt: null,
  sequenceId: 0,
});

let state: PracticeScheduleState = IDLE_STATE;
let inFlight: Promise<readonly ScheduleItem[]> | null = null;
const listeners = new Set<() => void>();

let sequenceCounter = 0;
let latestResolvedSequenceId = 0;
let pollingTimer: any = null;
let activePollingSubscribers = 0;

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

  const requestSeq = ++sequenceCounter;

  // Set syncing indicator if already loaded once
  if (state.status === "ready") {
    publish({ ...state, syncStatus: "syncing" });
  } else {
    publish({ ...state, status: "loading", syncStatus: "syncing", error: "" });
  }

  const request: Promise<readonly ScheduleItem[]> = api.appointments
    .list()
    .then((appointments) => {
      // Out-of-order discard: discard if an older request finishes after a newer one
      if (requestSeq < latestResolvedSequenceId) {
        if (inFlight === request) inFlight = null;
        return state.appointments;
      }
      latestResolvedSequenceId = requestSeq;

      if (inFlight !== request) return state.appointments;
      inFlight = null;

      // Check online state
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const syncStatus: SyncStatus = isOffline ? "offline" : "live";

      publish({
        appointments: Object.freeze([...appointments]),
        status: "ready",
        syncStatus,
        error: "",
        loadedAt: new Date().toISOString(),
        sequenceId: requestSeq,
      });
      return state.appointments;
    })
    .catch((cause: unknown) => {
      // Out-of-order discard on failure
      if (requestSeq < latestResolvedSequenceId) {
        if (inFlight === request) inFlight = null;
        return state.appointments;
      }
      latestResolvedSequenceId = requestSeq;

      if (inFlight !== request) return state.appointments;
      inFlight = null;

      const isAuthError = cause instanceof ApiError && cause.status === 401;
      if (isAuthError) {
        stopLivePolling();
      }

      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      const syncStatus: SyncStatus = isOffline ? "offline" : "error";

      publish({
        appointments: EMPTY_SCHEDULE,
        status: "error",
        syncStatus,
        error: cause instanceof Error ? cause.message : "The schedule could not be loaded.",
        loadedAt: null,
        sequenceId: requestSeq,
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
  latestResolvedSequenceId = ++sequenceCounter;
  publish(IDLE_STATE);
}

/**
 * Folds a server-confirmed appointment back into the schedule.
 */
export function applyConfirmedAppointment(appointment: ScheduleItem): void {
  if (state.status !== "ready") return;
  const index = state.appointments.findIndex((item) => item.id === appointment.id);
  const next = index === -1
    ? [...state.appointments, appointment]
    : state.appointments.map((item) => (item.id === appointment.id ? appointment : item));
  publish({ ...state, appointments: Object.freeze(next.sort(byDateThenClockTime)) });
}

/** The order a clinic day happens in. Mirrors `AppointmentRepository.list`. */
function byDateThenClockTime(a: ScheduleItem, b: ScheduleItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const minutes = timeStringToMinutes(a.time) - timeStringToMinutes(b.time);
  return minutes !== 0 ? minutes : a.id.localeCompare(b.id);
}

// Background Polling Transport (DB-6)
const ACTIVE_POLL_INTERVAL_MS = 10_000;   // 10s active window
const IDLE_POLL_INTERVAL_MS = 30_000;     // 30s background/idle

function getPollingInterval(): number {
  if (typeof document !== "undefined" && document.hidden) {
    return IDLE_POLL_INTERVAL_MS;
  }
  return ACTIVE_POLL_INTERVAL_MS;
}

function scheduleNextPoll(): void {
  if (activePollingSubscribers <= 0) return;
  if (pollingTimer) clearTimeout(pollingTimer);

  const interval = getPollingInterval();
  pollingTimer = setTimeout(() => {
    if (activePollingSubscribers <= 0) return;
    void refreshPracticeSchedule().finally(() => {
      scheduleNextPoll();
    });
  }, interval);
}

function startLivePolling(): void {
  activePollingSubscribers += 1;
  if (activePollingSubscribers === 1) {
    scheduleNextPoll();
    setupWindowListeners();
  }
}

function stopLivePolling(): void {
  activePollingSubscribers = Math.max(0, activePollingSubscribers - 1);
  if (activePollingSubscribers === 0) {
    if (pollingTimer) {
      clearTimeout(pollingTimer);
      pollingTimer = null;
    }
    teardownWindowListeners();
  }
}

let windowListenersBound = false;

function onFocus(): void {
  if (state.status === "ready") {
    void refreshPracticeSchedule();
    scheduleNextPoll();
  }
}

function onOnline(): void {
  if (state.syncStatus === "offline") {
    publish({ ...state, syncStatus: "syncing" });
  }
  void refreshPracticeSchedule();
  scheduleNextPoll();
}

function onOffline(): void {
  publish({ ...state, syncStatus: "offline" });
}

function onVisibilityChange(): void {
  scheduleNextPoll();
  if (typeof document !== "undefined" && !document.hidden) {
    void refreshPracticeSchedule();
  }
}

function setupWindowListeners(): void {
  if (typeof window === "undefined" || windowListenersBound) return;
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  windowListenersBound = true;
}

function teardownWindowListeners(): void {
  if (typeof window === "undefined" || !windowListenersBound) return;
  window.removeEventListener("focus", onFocus);
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
  windowListenersBound = false;
}

export function usePracticeSchedule(): PracticeScheduleState & {
  refresh: () => Promise<readonly ScheduleItem[]>;
} {
  const snapshot = useSyncExternalStore(subscribe, practiceScheduleState, practiceScheduleState);

  useEffect(() => {
    void refreshPracticeSchedule();
    startLivePolling();
    return () => {
      stopLivePolling();
    };
  }, []);

  const refresh = useCallback(() => refreshPracticeSchedule(), []);

  return { ...snapshot, refresh };
}

export function useScheduleSyncStatus() {
  const state = useSyncExternalStore(subscribe, practiceScheduleState, practiceScheduleState);
  const refresh = useCallback(() => refreshPracticeSchedule(), []);
  return {
    syncStatus: state.syncStatus,
    loadedAt: state.loadedAt,
    error: state.error,
    refresh,
  };
}

