"use client";

import type { NoteStartMode, NoteType } from "../domain/note-types";

/**
 * A note the clinician asked for from the voice menu, handed to that patient's chart.
 *
 * Like `active-visit`, this is a handover between two surfaces in one browser, not
 * clinical state: the menu knows the patient, the type and whether to dictate or
 * scribe; the chart is the only place that can apply them, and only once its saved
 * draft has loaded. Held in memory, claimed once by nonce, and announced with an
 * event so a chart that is already open notices it.
 */
export type NoteStartRequest = {
  patientId: string;
  noteType: NoteType;
  /** Null when only the note type is being chosen, as when a booked visit starts. */
  mode: NoteStartMode | null;
  nonce: number;
};

export const NOTE_START_REQUESTED_EVENT = "ehr-note-start-requested";

let pending: NoteStartRequest | null = null;
let sequence = 0;

export function requestNoteStart(request: Omit<NoteStartRequest, "nonce">): NoteStartRequest {
  sequence += 1;
  pending = { ...request, nonce: sequence };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NOTE_START_REQUESTED_EVENT, { detail: { patientId: request.patientId } }));
  }
  return pending;
}

/** The request waiting for this patient's chart, if any. Reading does not claim it. */
export function pendingNoteStartFor(patientId: string): NoteStartRequest | null {
  return pending && pending.patientId === patientId ? pending : null;
}

/** Claims the request so it is applied exactly once, by whichever chart copy acts. */
export function claimNoteStart(nonce: number): boolean {
  if (!pending || pending.nonce !== nonce) return false;
  pending = null;
  return true;
}

export function subscribeNoteStartRequests(listener: (patientId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const patientId = (event as CustomEvent<{ patientId?: string }>).detail?.patientId;
    if (patientId) listener(patientId);
  };
  window.addEventListener(NOTE_START_REQUESTED_EVENT, handler);
  return () => window.removeEventListener(NOTE_START_REQUESTED_EVENT, handler);
}
