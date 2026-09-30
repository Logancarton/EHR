"use client";

import { noteTypeForAppointment } from "../domain/note-types";
import { requestNoteStart } from "./note-start-request";

/**
 * Which appointment a visit was started from.
 *
 * Starting a visit from the roster is the one moment the application knows that
 * this encounter is this appointment. Nothing downstream can recover it: the chart
 * only knows the patient, and a patient can have two visits on one day, a follow-up
 * next week and a cancelled slot this morning. Guessing from same-day proximity is
 * exactly the inference `encounters.appointment_id` exists to replace.
 *
 * So the link is carried here, from the click that made it to the draft that
 * records it, and is claimed once. A chart opened any other way produces an
 * encounter with no appointment — which is the truth, and which means signing it
 * closes no appointment at all.
 *
 * Deliberately not persisted and deliberately tiny: this is a handover between two
 * surfaces in one browser, not clinical state. `encounters.appointment_id` is the
 * record.
 */
type PendingVisit = {
  patientId: string;
  appointmentId: string;
};

let pending: PendingVisit | null = null;

/**
 * The roster's (or calendar's) Start control recording what it started.
 *
 * The appointment's type also chooses the note it opens with — an intake opens the
 * intake note — through the same one-shot handover the voice menu uses, which only
 * applies to a blank note, so resuming a visit never replaces written work.
 */
export function noteVisitStartedFromSchedule(patientId: string, appointmentId: string, appointmentType?: string): void {
  pending = { patientId, appointmentId };
  const noteType = noteTypeForAppointment(appointmentType);
  if (noteType) requestNoteStart({ patientId, noteType, mode: null });
}

/**
 * The appointment a visit was started from, if this chart is that visit.
 *
 * Reading does not consume. The chart renders in more than one place — the primary
 * pane, a detached window, a side column — and a one-shot read meant whichever
 * copy asked first took the link and the copy that actually saved got nothing.
 *
 * It stops being pending when the server confirms an encounter carrying it, or
 * when a different visit is started. Until then it can only ever attach to the
 * same patient, and the server refuses to re-point an encounter that already has
 * a link — so a stale value cannot move a note onto the wrong visit.
 */
export function scheduledVisitFor(patientId: string): string | undefined {
  if (!pending || pending.patientId !== patientId) return undefined;
  return pending.appointmentId;
}

/** The server has recorded this link; it is the record's now, not a pending one. */
export function confirmScheduledVisit(patientId: string, appointmentId: string): void {
  if (pending?.patientId === patientId && pending.appointmentId === appointmentId) {
    pending = null;
  }
}

/** Drops a start that never became an encounter, e.g. on sign-out. */
export function clearScheduledVisit(): void {
  pending = null;
}
