import type { ClinicalRecordSnapshot } from "./clinical-records";

/** Reject the entire projection: silently filtering foreign facts could hide an access defect.
 * Vitals have no patient field; they inherit scope from the authorized snapshot endpoint. */
export function assertClinicalSnapshotPatient(snapshot: ClinicalRecordSnapshot, patientId: string): void {
  const snake = [...snapshot.problems, ...snapshot.allergies, ...snapshot.medications, ...(snapshot.observations ?? [])];
  const camel = [...(snapshot.psychiatricHistory ?? []), ...(snapshot.encounters ?? []),
    ...(snapshot.upcomingAppointments ?? []), ...(snapshot.documents ?? [])];
  if (snake.some((item) => item.patient_id !== patientId)
    || camel.some((item) => item.patientId !== patientId)
    || snapshot.assessments?.some((item) => item.patientId != null && item.patientId !== patientId)) {
    throw new Error("Clinical snapshot returned records for a different patient.");
  }
}
