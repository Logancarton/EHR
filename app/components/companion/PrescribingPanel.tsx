"use client";

import { useEffect, useMemo, useState } from "react";
import type { Patient } from "../../domain/patient";
import PrescriptionOperationsWorkspace from "../PrescriptionOperationsWorkspace";
import PatientPrescriptionWork from "../patient/PatientPrescriptionWork";
import { ensurePatientOpen, settleWorkspace } from "../../lib/workspace-navigation";
import {
  WORKSPACE_ORDER_CREATED_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import CompanionPanelHeader from "./CompanionPanelHeader";
import Icon from "../ui/Icon";

/**
 * Prescribing as a companion (UI-7d, D-090; patient selection added by D-093).
 *
 * Two things live here, and the selector at the top says which one is on screen.
 *
 * **The practice queue** is the cross-patient attention list — prescriptions whose
 * transport outcome is unknown, interrupted, failed, conflicted or stuck in callback
 * processing. Every action it offers is gated on the patient's chart being the
 * *active* execution context, which is why the queue belongs in the companion layer
 * at all: a full-canvas module and a chart cannot both own the active tab.
 *
 * **A patient's own prescribing work** is what the selector reaches. That was
 * previously only available by navigating into the chart's Medications section, so a
 * companion called Prescribing offered nothing to do with a prescription — and,
 * because the practice queue is empty without an enabled e-prescribing integration,
 * nothing at all. Picking a patient here renders the same `PatientPrescriptionWork`
 * the chart renders: one component, two callers, so the two cannot disagree about
 * what a clinician may do to a prescription.
 *
 * **Identity is carried per pane, not per application.** The companion can be on a
 * different patient from the active chart — that is the point of picking one — so it
 * names its patient in a header of its own, and says so explicitly when the two
 * differ. Nothing here relaxes the binding underneath: every request carries
 * `x-ehr-patient-id`, and the server re-derives the patient from the record itself
 * and refuses a mismatch.
 */
export default function PrescribingPanel({
  roster = [],
  activePatient,
  onOpenPrescribeFor,
  onClose,
  onUnpin,
  isExpanded = false,
  onExpand,
  onRedock,
  onOpenWorkspace,
}: {
  roster?: readonly Patient[];
  activePatient?: Patient | null;
  onOpenPrescribeFor?: (patientId: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onOpenWorkspace?: () => void;
}) {
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [openingChart, setOpeningChart] = useState(false);
  const [workRevision, setWorkRevision] = useState(0);

  /**
   * A prescription staged from here lands in the same list underneath it.
   *
   * `PatientPrescriptionWork` loads once per patient, so without this the
   * clinician authorised an order from this panel and the panel went on saying
   * the patient had no prescribing history — which reads as the action having
   * failed. Only this patient's orders reopen it; another chart's do not.
   */
  useEffect(() => {
    if (!selectedPatientId) return;
    return subscribeWorkspaceEvent(WORKSPACE_ORDER_CREATED_EVENT, (detail) => {
      if (detail?.patientId && detail.patientId !== selectedPatientId) return;
      setWorkRevision((value) => value + 1);
    });
  }, [selectedPatientId]);

  const selectedPatient = useMemo(
    () => roster.find((candidate) => candidate.id === selectedPatientId) || null,
    [roster, selectedPatientId],
  );
  const differsFromActiveChart = Boolean(
    selectedPatient && activePatient && selectedPatient.id !== activePatient.id,
  );

  async function openSelectedChart() {
    if (!selectedPatient) return;
    setOpeningChart(true);
    try {
      const tab = await ensurePatientOpen(selectedPatient.id);
      tab?.click();
      await settleWorkspace(2);
    } finally {
      setOpeningChart(false);
    }
  }

  return (
    <aside
      className={`companion-panel ${isExpanded ? "companion-expanded-canvas" : ""}`}
      data-companion-panel="prescribing"
      data-companion-presentation={isExpanded ? "expanded" : "docked"}
      data-prescribing-scope={selectedPatient ? "patient" : "practice"}
      aria-label="Prescribing"
    >
      <CompanionPanelHeader
        title="Prescribing"
        context={selectedPatient ? selectedPatient.name : "Prescriptions needing attention"}
        icon="prescriptions"
        iconStyle={{ background: "#fce8e6", color: "#c5221f" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Prescribing"
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />

      <div className="prescribing-scope-bar">
        <label className="prescribing-scope-field">
          <span>Prescribing for</span>
          <select
            className="prescribing-patient-select"
            value={selectedPatientId}
            onChange={(event) => setSelectedPatientId(event.target.value)}
            aria-label="Choose whose prescribing work to show"
          >
            <option value="">Practice queue — all patients</option>
            {roster.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} · {patient.mrn}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedPatient ? (
        <div className="prescribing-patient-scope">
          {/*
            The pane's own identity. A companion showing a different patient from
            the chart in front of the clinician is exactly the case a per-pane
            identity header exists for, so it carries name, MRN and date of birth
            rather than borrowing the workspace's.
          */}
          <header className="prescribing-patient-identity">
            <div>
              <strong>{selectedPatient.name}</strong>
              <span>
                {selectedPatient.mrn} · DOB {selectedPatient.dob}
              </span>
            </div>
            <div className="prescribing-patient-identity-actions">
              {onOpenPrescribeFor && (
                <button
                  type="button"
                  onClick={() => onOpenPrescribeFor(selectedPatient.id)}
                >
                  <Icon name="prescriptions" size="sm" />
                  <span>New prescription</span>
                </button>
              )}
              <button type="button" disabled={openingChart} onClick={() => void openSelectedChart()}>
                <Icon name="fullscreen" size="sm" />
                <span>{openingChart ? "Opening…" : "Open chart"}</span>
              </button>
            </div>
          </header>

          {differsFromActiveChart && (
            <p className="prescribing-context-note" role="status">
              This is {selectedPatient.name}, not the chart in front of you
              ({activePatient?.name}). Every action below is submitted against{" "}
              {selectedPatient.name}&apos;s record.
            </p>
          )}

          <div className="prescribing-patient-work">
            <PatientPrescriptionWork
              key={`${selectedPatient.id}:${workRevision}`}
              patient={selectedPatient}
              onOpenPrescribe={
                onOpenPrescribeFor ? () => onOpenPrescribeFor(selectedPatient.id) : undefined
              }
            />
          </div>
        </div>
      ) : (
        <div className="prescribing-companion-body">
          <PrescriptionOperationsWorkspace presentation={isExpanded ? "workspace" : "companion"} />
        </div>
      )}

      {/*
        The queue is also a workspace tab, and was reachable as one from the
        Clinical menu until UI-7d. This keeps that path rather than stranding a
        saved layout that has the module open.
      */}
      {onOpenWorkspace && (
        <button type="button" className="comm-launch-workspace-btn" onClick={onOpenWorkspace}>
          <Icon name="fullscreen" size="sm" />
          <span>Open Full Prescribing Workspace</span>
        </button>
      )}
    </aside>
  );
}
