export type CompanionPatientSelection = { patientId: string; foregroundId: string | null };

/** A new foreground chart wins; a practice canvas preserves an explicit tool target. */
export function followCompanionPatient(
  selection: CompanionPatientSelection,
  foregroundId: string | null,
): CompanionPatientSelection {
  if (selection.foregroundId === foregroundId) return selection;
  return { patientId: foregroundId ?? selection.patientId, foregroundId };
}
