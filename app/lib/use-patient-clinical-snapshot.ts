"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClinicalRecordSnapshot } from "../domain/clinical-records";
import { assertClinicalSnapshotPatient } from "../domain/clinical-snapshot";
import { clinicalRecordApi } from "./clinical-record-api";
import {
  subscribeWorkspaceEvent, WORKSPACE_PATIENT_UPDATED_EVENT,
  WORKSPACE_ENCOUNTER_SIGNED_EVENT, WORKSPACE_ORDER_CART_UPDATED_EVENT,
  WORKSPACE_ORDER_CREATED_EVENT, WORKSPACE_APPOINTMENT_UPDATED_EVENT,
  WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT, WORKSPACE_CARE_COMPLETION_CHANGED_EVENT,
} from "./workspace-events";

type SnapshotState = {
  patientId: string;
  snapshot: ClinicalRecordSnapshot | null;
  status: "loading" | "loaded" | "error";
  error: string | null;
};

/** Shared read lifecycle, not another patient database. Only mounted projections read;
 * every refresh revalidates access. Never retain clinical facts in browser storage. */
export function usePatientClinicalSnapshot(patientId: string) {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  const [state, setState] = useState<SnapshotState>({ patientId, snapshot: null, status: "loading", error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ patientId, snapshot: null, status: "loading", error: null });
    clinicalRecordApi.snapshot(patientId).then((snapshot) => {
      assertClinicalSnapshotPatient(snapshot, patientId);
      if (!cancelled) setState({ patientId, snapshot, status: "loaded", error: null });
    }).catch(() => {
      if (!cancelled) setState({ patientId, snapshot: null, status: "error",
        error: "Clinical context could not be loaded. No empty or fixture chart state was substituted." });
    });
    return () => { cancelled = true; };
  }, [patientId, nonce]);

  useEffect(() => {
    const forPatient = (detail: { patientId: string }) => { if (detail.patientId === patientId) refresh(); };
    const subscriptions = [
      subscribeWorkspaceEvent(WORKSPACE_PATIENT_UPDATED_EVENT, forPatient),
      subscribeWorkspaceEvent(WORKSPACE_ENCOUNTER_SIGNED_EVENT, forPatient),
      subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, forPatient),
      subscribeWorkspaceEvent(WORKSPACE_ORDER_CREATED_EVENT, (detail) => { if (!detail.patientId || detail.patientId === patientId) refresh(); }),
      subscribeWorkspaceEvent(WORKSPACE_APPOINTMENT_UPDATED_EVENT, refresh),
      subscribeWorkspaceEvent(WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT, forPatient),
      subscribeWorkspaceEvent(WORKSPACE_CARE_COMPLETION_CHANGED_EVENT, refresh),
    ];
    window.addEventListener("focus", refresh);
    return () => { subscriptions.forEach((unsubscribe) => unsubscribe()); window.removeEventListener("focus", refresh); };
  }, [patientId, refresh]);

  // Effects run after paint. Hide the former patient's facts on the switching render itself.
  const visible = state.patientId === patientId ? state : { patientId, snapshot: null, status: "loading" as const, error: null };
  return { ...visible, refresh };
}
