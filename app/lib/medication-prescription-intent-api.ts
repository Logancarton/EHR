import type { MedicationRecord } from "../domain/clinical-records";

export type PrescriptionTruthSelection = {
  operation: "add" | "update";
  medicationId?: string;
};

export async function confirmPrescriptionMedicationTruth(
  patientId: string,
  orderId: string,
  selection: PrescriptionTruthSelection,
): Promise<MedicationRecord> {
  const response = await fetch("/api/orders", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-ehr-patient-id": patientId,
    },
    body: JSON.stringify({
      id: orderId,
      operation: "confirm_medication_truth",
      truthOperation: selection.operation,
      medicationId: selection.medicationId,
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || "Failed to confirm prescription medication truth.");
  }
  return payload.medication as MedicationRecord;
}
