/**
 * Indications offered beside a patient's own problems when writing a prescription.
 *
 * The composer lists the patient's problems first. A coded entry here whose
 * description is already one of those problems is left out, so "Generalized
 * anxiety disorder" is not offered a second time as "F41.1 - Generalized anxiety
 * disorder" — two options for one choice reads as two different diagnoses.
 */
export const COMMON_PRESCRIPTION_INDICATIONS = [
  "F41.1 - Generalized anxiety disorder",
  "F90.2 - ADHD, combined presentation",
  "F33.1 - Major depressive disorder",
  "F31.9 - Bipolar disorder",
] as const;

function description(indication: string): string {
  return indication.replace(/^[A-Z]\d{2}(?:\.\w+)?\s*-\s*/, "").trim().toLowerCase();
}

export function otherPrescriptionIndications(patientProblems: readonly string[]): string[] {
  const known = new Set(patientProblems.map(description));
  return COMMON_PRESCRIPTION_INDICATIONS.filter((indication) => !known.has(description(indication)));
}
