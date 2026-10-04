"use client";

import { useEffect, useState } from "react";
import type { Patient } from "../../domain/patient";
import { subscribeWorkspaceEvent, WORKSPACE_ORDER_CREATED_EVENT } from "../../lib/workspace-events";
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

  useEffect(() => subscribeWorkspaceEvent(WORKSPACE_ORDER_CREATED_EVENT, (detail) => {
    if (detail?.patientId === patient.id) setTruthRevision((value) => value + 1);
  }), [patient.id]);

  return (
    <>
      <MedicationTruthPanel
        key={`${patient.id}:medication-truth:${truthRevision}`}
        patient={patient}
        onDraftOrder={onDraftOrder}
      />
      <PatientPrescriptionWork
        key={`${patient.id}:prescription-work:${truthRevision}`}
        patient={patient}
        onOpenPrescribe={onOpenPrescribe}
        onMedicationTruthChanged={() => setTruthRevision((value) => value + 1)}
      />
    </>
  );
}
