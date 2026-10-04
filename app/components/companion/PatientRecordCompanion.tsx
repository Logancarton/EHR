"use client";

import { useState } from "react";
import PrescriptionOperationsWorkspace from "../PrescriptionOperationsWorkspace";
import { WORKSPACE_SWITCH_VIEW_EVENT, dispatchWorkspaceEvent } from "../../lib/workspace-events";
import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import { findTool } from "../../lib/workspace-tools";
import { useCompanionPatientSelection } from "../../lib/use-companion-patient-selection";
import { useAuthSession } from "../auth/AuthSessionGate";
import PatientSectionRouter, { type PatientSectionActions } from "../workspace/PatientSectionRouter";
import CompanionPanelFrame from "./CompanionPanelFrame";
import Button from "../ui/Button";

const recordSections = {
  medications: "Meds", documents: "Documents", history: "History", orders: undefined,
} as const satisfies Record<string, Section | undefined>;
export type PatientRecordToolId = keyof typeof recordSections;
export function isPatientRecordToolId(id: string): id is PatientRecordToolId {
  return Object.hasOwn(recordSections, id);
}

/** The existing clinical surfaces in the existing companion lifecycle. */
export default function PatientRecordCompanion({
  toolId, activePatient, roster, preferences, actionsForPatient,
  stagedOrderCountFor, onClose, isExpanded, onExpand, onRedock,
}: {
  toolId: PatientRecordToolId;
  activePatient?: Patient | null;
  roster: readonly Patient[];
  preferences: ProviderPreferences;
  actionsForPatient: (patientId: string) => PatientSectionActions;
  stagedOrderCountFor?: (patientId: string) => number;
  onClose: () => void;
  isExpanded: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const [medicationView, setMedicationView] = useState<"record" | "queue">("record");
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [patientId, selectPatient] = useCompanionPatientSelection(activePatient);
  const patient = roster.find((entry) => entry.id === patientId);
  const { hasPermission } = useAuthSession();
  const tool = findTool(toolId)!;
  const actions = patient ? actionsForPatient(patient.id) : null;
  const followsActiveChart = Boolean(patient && activePatient && patient.id === activePatient.id);
  const pinnedAwayFromChart = Boolean(patient && (!activePatient || patient.id !== activePatient.id));

  const selectAndClose = (nextPatientId: string) => {
    selectPatient(nextPatientId);
    setShowPatientPicker(false);
  };

  return (
    <CompanionPanelFrame
      className="patient-record-companion"
      rootProps={{
        "data-patient-record-tool": toolId,
        "data-bound-patient-id": patient?.id ?? "",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
        "data-patient-binding": followsActiveChart ? "following" : pinnedAwayFromChart ? "pinned" : "unbound",
      }}
      title={tool.label} icon={tool.icon}
      context={followsActiveChart ? "Following active chart" : pinnedAwayFromChart ? "Pinned patient" : "Choose a patient"}
      onClose={onClose} closeLabel={`Close ${tool.label.toLowerCase()}`} isExpanded={isExpanded} onExpand={onExpand} onRedock={onRedock}
      toolbar={
        <div className="patient-record-picker">
          {followsActiveChart && patient ? (
            <>
              <strong role="status">Following active chart · {patient.name}</strong>
              <Button onClick={() => setShowPatientPicker((open) => !open)}>
                {showPatientPicker ? "Cancel" : "Pin another patient"}
              </Button>
            </>
          ) : pinnedAwayFromChart && patient ? (
            <>
              <strong role="status">Pinned to {patient.name} · Not current chart</strong>
              <div className="patient-header-actions">
                {activePatient ? (
                  <Button onClick={() => selectAndClose(activePatient.id)}>
                    Return to {activePatient.name}
                  </Button>
                ) : null}
                <Button onClick={() => setShowPatientPicker((open) => !open)}>
                  {showPatientPicker ? "Cancel" : "Change patient"}
                </Button>
              </div>
            </>
          ) : null}

          {(!patient || showPatientPicker) && (
            <label className="patient-record-picker">
              <span>{patient ? "Choose a different patient" : "Patient"}</span>
              <select
                aria-label={`Choose patient for ${tool.label.toLowerCase()}`}
                value={patient?.id ?? ""}
                onChange={(event) => selectAndClose(event.target.value)}
              >
                <option value="">Choose a patient</option>
                {roster.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.mrn}</option>)}
              </select>
            </label>
          )}
        </div>
      }
    >
      {toolId === "medications" && (
        <div className="prescribing-scope-bar" role="group" aria-label="Medication views">
          <Button pressed={medicationView === "record"} onClick={() => setMedicationView("record")}>Patient medications</Button>
          <Button pressed={medicationView === "queue"} onClick={() => setMedicationView("queue")}>Prescribing queue</Button>
        </div>
      )}
      {toolId === "medications" && medicationView === "queue" ? (
        <>
          <PrescriptionOperationsWorkspace presentation={isExpanded ? "workspace" : "companion"} />
          <Button onClick={() => dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "prescribing" })}>Open Full Prescribing Workspace</Button>
        </>
      ) : !patient || !actions ? <p className="companion-empty-state">Choose a patient to open their {tool.label.toLowerCase()}.</p>
        : !hasPermission("read_clinical") ? <p className="companion-empty-state">Clinical record access is required.</p>
        : toolId === "orders" ? (
          <div className="patient-record-orders">
            <p>{stagedOrderCountFor?.(patient.id) ?? 0} orders in this patient&apos;s staging cart.</p>
            <p>Staging does not authorize or transmit an order.</p>
            <Button onClick={() => actions.onOpenOrderCart?.("cart")}>Review orders</Button>
            <Button onClick={actions.onOpenPrescribe}>Prepare prescription</Button>
            <Button onClick={actions.onOpenLabComposer}>Prepare lab order</Button>
          </div>
        ) : (
          <PatientSectionRouter key={patient.id} patient={patient} section={recordSections[toolId]!}
            preferences={preferences} actions={actions} />
        )}
    </CompanionPanelFrame>
  );
}
