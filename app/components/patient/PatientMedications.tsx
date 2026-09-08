"use client";

import { useState } from "react";
import type { Patient } from "../../domain/patient";
import MedicationTruthPanel from "./MedicationTruthPanel";
import PatientPrescriptionWork from "./PatientPrescriptionWork";

export default function PatientMedications({
  patient,
  onDraftOrder,
  onOpenPrescribe,
}: {
  patient: Patient;
  onDraftOrder?: (orderName: string) => void;
  onOpenPrescribe?: () => void;
}) {
  const [truthRevision, setTruthRevision] = useState(0);

  return (
    <>
      <MedicationTruthPanel
        key={`${patient.id}:medication-truth:${truthRevision}`}
        patient={patient}
        onDraftOrder={onDraftOrder}
      />
      <PatientPrescriptionWork
        patient={patient}
        onOpenPrescribe={onOpenPrescribe}
        onMedicationTruthChanged={() => setTruthRevision((value) => value + 1)}
      />
    </>
  );
}
