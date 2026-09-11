"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Patient } from "../domain/patient";
import type { PatientRecord } from "../server/repositories/patient-repository";
import { api } from "./api-client";

/**
 * The one runtime patient roster.
 *
 * Every live surface — tabs, omnibox search, detached windows, the order composer,
 * workspace restoration, the global queues — resolves patients through this module.
 * The synthetic array in `app/domain/patient.ts` is seed and fixture data; it is not
 * a second runtime truth, so nothing here falls back to it.
 *
 * `GET /api/patients` already narrows the roster to the signed-in clinician's
 * organization and assignment scope, so access filtering stays on the server and the
 * store only mirrors what that boundary returned.
 */
export type RosterPatient = PatientRecord;

export type PatientRosterStatus = "idle" | "loading" | "ready" | "error";

export type PatientRosterState = {
  patients: readonly RosterPatient[];
  status: PatientRosterStatus;
  error: string;
};

const EMPTY_ROSTER: readonly RosterPatient[] = Object.freeze([]);
const IDLE_STATE: PatientRosterState = Object.freeze({
  patients: EMPTY_ROSTER,
  status: "idle" as const,
  error: "",
});

let state: PatientRosterState = IDLE_STATE;
let inFlight: Promise<readonly RosterPatient[]> | null = null;
const listeners = new Set<() => void>();

function publish(next: PatientRosterState) {
  state = next;
  // Copied first: a subscriber that unsubscribes while being notified would
  // otherwise mutate the set mid-iteration.
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current roster snapshot, for code that cannot await (DOM restore, navigation). */
export function patientRosterState(): PatientRosterState {
  return state;
}

export function rosterPatients(): readonly RosterPatient[] {
  return state.patients;
}

/**
 * Loads the accessible roster once per session. Concurrent callers share the request
 * so the shell, the global queues, and workspace restoration do not each fetch it.
 */
export function loadPatientRoster({ force = false }: { force?: boolean } = {}): Promise<
  readonly RosterPatient[]
> {
  if (!force && state.status === "ready") return Promise.resolve(state.patients);
  if (!force && inFlight) return inFlight;

  publish({ patients: state.patients, status: "loading", error: "" });

  const request: Promise<readonly RosterPatient[]> = api.patients
    .list()
    .then((patients) => {
      // A response that arrives after a sign-out or a newer request must not
      // repopulate the store with a roster that is no longer the current one.
      if (inFlight !== request) return state.patients;
      inFlight = null;
      publish({ patients: Object.freeze([...patients]), status: "ready", error: "" });
      return state.patients;
    })
    .catch((cause: unknown) => {
      if (inFlight !== request) return state.patients;
      inFlight = null;
      // The roster is access-filtered clinical data. A failed load is an empty,
      // explicitly failed roster — never a silent fall back to synthetic patients.
      publish({
        patients: EMPTY_ROSTER,
        status: "error",
        error: cause instanceof Error ? cause.message : "The patient roster could not be loaded.",
      });
      return EMPTY_ROSTER;
    });

  inFlight = request;
  return request;
}

/** Re-reads the roster after a mutation that changes what the chart should show. */
export function refreshPatientRoster(): Promise<readonly RosterPatient[]> {
  return loadPatientRoster({ force: true });
}

/** Drops the cached roster when the session ends, so the next user loads their own. */
export function resetPatientRoster(): void {
  inFlight = null;
  publish(IDLE_STATE);
}

export function findRosterPatient(
  id: string | null | undefined,
  roster: readonly Patient[] = state.patients,
): Patient | undefined {
  if (!id) return undefined;
  return roster.find((patient) => patient.id === id);
}

export function rosterPatientIdForName(
  name: string,
  roster: readonly Patient[] = state.patients,
): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  return roster.find((patient) => patient.name === wanted)?.id ?? null;
}

export function rosterPatientNameForId(
  id: string,
  roster: readonly Patient[] = state.patients,
): string | null {
  return roster.find((patient) => patient.id === id)?.name ?? null;
}

/**
 * Keeps only the ids the signed-in clinician can still reach, in the order given.
 *
 * Saved workspaces outlive access changes: a chart can move to another organization,
 * an assignment can be withdrawn, a patient can be merged away. Restoring such a tab
 * would put a chart on screen that the backend will refuse to answer for, so stale
 * ids are discarded rather than opened.
 */
export function retainAccessiblePatientIds(
  ids: readonly string[],
  roster: readonly Patient[] = state.patients,
): string[] {
  const accessible = new Set(roster.map((patient) => patient.id));
  return ids.filter((id) => accessible.has(id));
}

/** Matches a free-text command against the accessible roster. */
export function resolveRosterPatientFromCommand(
  input: string,
  roster: readonly Patient[] = state.patients,
): Patient | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;

  return roster.find((patient) => {
    const name = patient.name.toLowerCase();
    const nameParts = name.split(" ").filter((part) => part.length > 2);
    return (
      normalized.includes(name) ||
      normalized.includes(patient.mrn.toLowerCase()) ||
      nameParts.some((part) => normalized.includes(part))
    );
  });
}

export function usePatientRoster(): PatientRosterState & {
  refresh: () => Promise<readonly RosterPatient[]>;
} {
  const snapshot = useSyncExternalStore(subscribe, patientRosterState, patientRosterState);

  useEffect(() => {
    void loadPatientRoster();
  }, []);

  const refresh = useCallback(() => refreshPatientRoster(), []);

  return { patients: snapshot.patients, status: snapshot.status, error: snapshot.error, refresh };
}
