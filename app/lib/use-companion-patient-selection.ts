"use client";

import { useEffect, useState } from "react";
import type { Patient } from "../domain/patient";
import { followCompanionPatient, type CompanionPatientSelection } from "./companion-patient-selection";

/** Selection lives with the open tool, never with a remembered background chart. */
export function useCompanionPatientSelection(activePatient?: Patient | null) {
  const foregroundId = activePatient?.id ?? null;
  const [selection, setSelection] = useState<CompanionPatientSelection>(() => ({
    patientId: foregroundId ?? "", foregroundId,
  }));
  // Resolve synchronously so the first render after a tab switch cannot pair old
  // record content or action closures with the new patient label.
  const current = followCompanionPatient(selection, foregroundId);
  useEffect(() => {
    setSelection((previous) => followCompanionPatient(previous, foregroundId));
  }, [foregroundId]);
  return [current.patientId, (patientId: string) => setSelection({ patientId, foregroundId })] as const;
}
