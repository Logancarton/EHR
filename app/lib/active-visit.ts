"use client";

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

/** The roster's Start control recording what it started. */
export function noteVisitStartedFromSchedule(patientId: string, appointmentId: string): void {
  pending = { patientId, appointmentId };
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
