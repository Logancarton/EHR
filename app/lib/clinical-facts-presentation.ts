import type { AllergyRecord, ProblemRecord } from "../domain/clinical-records";

/**
 * Load state for a patient's problem/allergy facts. The patient id is carried
 * inside the state rather than tracked separately so that a stale result can
 * always be recognised as belonging to a different patient.
 */
export type FactsLoad =
  | { status: "loading"; patientId: string }
  | { status: "loaded"; patientId: string; problems: ProblemRecord[]; allergies: AllergyRecord[] }
  | { status: "failed"; patientId: string; message: string };

/**
 * What the patient header is permitted to display.
 *
 * `facts` is the only variant that authorises an empty list to be rendered as a
 * clinical assertion ("None recorded"). `pending` and `unverified` must never be
 * presented as an absence of problems or allergies: not-yet-known and
 * failed-to-load are not the same as none.
 */
export type FactsPresentation =
  | { kind: "pending" }
  | { kind: "unverified"; message: string }
  | { kind: "facts"; problems: ProblemRecord[]; allergies: AllergyRecord[] };

/**
 * Resolve what may be shown for `patientId`.
 *
 * Safety rule: a load belonging to any other patient is treated as pending, so
 * the header cannot momentarily attribute one patient's allergies to another
 * while a switch is in flight.
 */
export function presentClinicalFacts(load: FactsLoad, patientId: string): FactsPresentation {
  if (load.patientId !== patientId) return { kind: "pending" };
  if (load.status === "loading") return { kind: "pending" };
  if (load.status === "failed") return { kind: "unverified", message: load.message };
  return { kind: "facts", problems: load.problems, allergies: load.allergies };
}

/**
 * Whether an empty list may be rendered as "None active"/"None recorded".
 * Kept explicit so the assertion is a deliberate decision at the call site.
 */
export function mayAssertAbsence(presentation: FactsPresentation): boolean {
  return presentation.kind === "facts";
}
