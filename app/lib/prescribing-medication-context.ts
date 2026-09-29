import type { AllergyRecord, ClinicalRecordSnapshot, MedicationRecord } from "../domain/clinical-records";
import type { PsychiatricHistoryItem } from "../domain/clinical-measurements";

/**
 * What a prescriber needs in view before writing a prescription: allergies,
 * what the patient is taking now, and what has already been tried.
 *
 * Read-only projection of the clinical record snapshot. It never merges or
 * deduplicates across sources — a discontinued medication record and a
 * psychiatric-history trial entry are different kinds of evidence, so each past
 * trial keeps the source it came from.
 */
export type PastTrial = {
  id: string;
  title: string;
  detail: string;
  /** Sort key; the latest known date for the trial, or "" when none is recorded. */
  endedOn: string;
  source: "medication-record" | "psychiatric-history";
};

export type PrescribingMedicationContext = {
  allergies: AllergyRecord[];
  /** An active, explicit NKDA assessment. Distinct from an empty allergy list. */
  nkdaAssessed: boolean;
  activeMedications: MedicationRecord[];
  pastTrials: PastTrial[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function medicationTrial(medication: MedicationRecord): PastTrial {
  const dosing = [medication.strength, medication.dose, medication.frequency].filter(Boolean).join(" ");
  const dates = [medication.start_date, medication.end_date].filter(Boolean).join(" – ");
  return {
    id: `medication:${medication.id}`,
    title: medication.display_text || medication.medication_name,
    detail: [
      dosing,
      medication.indication ? `for ${medication.indication}` : "",
      dates,
      medication.status.replaceAll("-", " "),
    ].filter(Boolean).join(" · "),
    endedOn: medication.end_date || medication.start_date || "",
    source: "medication-record",
  };
}

function historyTrial(item: PsychiatricHistoryItem): PastTrial {
  const details = item.details || {};
  const reason = text(details.reasonForDiscontinuation);
  return {
    id: `history:${item.id}`,
    title: text(details.drug) || item.title,
    detail: [
      text(details.maxDose) ? `max ${text(details.maxDose)}` : "",
      text(details.duration),
      text(details.outcome),
      reason ? `stopped: ${reason}` : "",
    ].filter(Boolean).join(" · "),
    endedOn: item.resolvedDate || item.onsetDate || "",
    source: "psychiatric-history",
  };
}

export function summarizePrescribingContext(
  snapshot: Pick<ClinicalRecordSnapshot, "allergies" | "medications" | "psychiatricHistory">,
  patientId: string,
): PrescribingMedicationContext {
  // Records are filtered to the requested patient as well as by status: the
  // server already binds the snapshot, and this keeps a mis-bound row from ever
  // being shown under another patient's name.
  const own = <T extends { patient_id?: string; patientId?: string }>(row: T) =>
    (row.patient_id ?? row.patientId) === patientId;

  const activeAllergies = snapshot.allergies.filter((a) => own(a) && a.status === "active");
  const medications = snapshot.medications.filter((m) => own(m) && m.status !== "entered-in-error");

  const pastTrials = [
    ...medications.filter((m) => m.status !== "active").map(medicationTrial),
    ...(snapshot.psychiatricHistory || [])
      .filter((item) => own(item) && item.category === "medication_trial" && item.status !== "entered-in-error")
      .map(historyTrial),
  ].sort((a, b) => b.endedOn.localeCompare(a.endedOn));

  return {
    allergies: activeAllergies.filter((a) => !a.is_nkda),
    nkdaAssessed: activeAllergies.some((a) => a.is_nkda),
    activeMedications: medications.filter((m) => m.status === "active"),
    pastTrials,
  };
}
