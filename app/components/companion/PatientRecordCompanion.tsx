"use client";

import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import type { CompanionWorkingData } from "../../lib/use-companion-working-data";
import { findTool } from "../../lib/workspace-tools";
import { useCompanionPatientSelection } from "../../lib/use-companion-patient-selection";
import { useAuthSession } from "../auth/AuthSessionGate";
import PatientSectionRouter, { type PatientSectionActions } from "../workspace/PatientSectionRouter";
import PatientMessages from "../patient/PatientMessages";
import MessagesRecipientPanel from "./MessagesRecipientPanel";
import CompanionPanelFrame from "./CompanionPanelFrame";
import Button from "../ui/Button";

const recordSections = {
  medications: "Meds", documents: "Documents", messages: "Messages", history: "History", orders: undefined,
} as const satisfies Record<string, Section | undefined>;
export type PatientRecordToolId = keyof typeof recordSections;
export function isPatientRecordToolId(id: string): id is PatientRecordToolId {
  return Object.hasOwn(recordSections, id);
}

/** The existing clinical surfaces in the existing companion lifecycle. */
export default function PatientRecordCompanion({
  toolId, activePatient, roster, preferences, workingData, actionsForPatient,
  stagedOrderCountFor, onClose, isExpanded, onExpand, onRedock,
}: {
  toolId: PatientRecordToolId;
  activePatient?: Patient | null;
  roster: readonly Patient[];
  preferences: ProviderPreferences;
  workingData: CompanionWorkingData;
  actionsForPatient: (patientId: string) => PatientSectionActions;
  stagedOrderCountFor?: (patientId: string) => number;
  onClose: () => void;
  isExpanded: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const [patientId, selectPatient] = useCompanionPatientSelection(activePatient);
  const patient = roster.find((entry) => entry.id === patientId);
  const { hasPermission } = useAuthSession();
  const tool = findTool(toolId)!;
  const actions = patient ? actionsForPatient(patient.id) : null;
  return (
    <CompanionPanelFrame
      className={`patient-record-companion ${toolId === "messages" ? "companion-messages-panel" : ""}`}
      rootProps={{ "data-patient-record-tool": toolId, "data-bound-patient-id": patient?.id ?? "" }}
      title={tool.label} icon={tool.icon}
      context={patient ? `${patient.name} · ${patient.mrn} · DOB ${patient.dob}` : "Choose a patient"}
      onClose={onClose} closeLabel={toolId === "messages" ? "Close messages" : `Close ${tool.label.toLowerCase()}`} isExpanded={isExpanded} onExpand={onExpand} onRedock={onRedock}
      toolbar={toolId === "messages" && !patient ? undefined :
        <label className="patient-record-picker">
          <span>Patient</span>
          <select aria-label={`Choose patient for ${tool.label.toLowerCase()}`} value={patient?.id ?? ""}
            onChange={(event) => selectPatient(event.target.value)}>
            <option value="">Choose a patient</option>
            {roster.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.mrn}</option>)}
          </select>
          {patient && !activePatient && <small>Patient retained while you work elsewhere.</small>}
        </label>
      }
    >
      {toolId === "messages" && !patient ? (
        <MessagesRecipientPanel canvasTabId="open-record-tool" roster={roster}
          onSelectPatient={selectPatient}
          replyDraftStore={workingData.messageReplyDrafts} openThreadStore={workingData.messageOpenThreads} />
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
        ) : toolId === "messages" ? (
          <PatientMessages patient={patient} onOpenOrderCart={actions.onOpenOrderCart}
            onAddTask={actions.onAddTask} onToast={actions.onToast}
            replyDraftStore={workingData.messageReplyDrafts} openThreadStore={workingData.messageOpenThreads} />
        ) : (
          <PatientSectionRouter key={patient.id} patient={patient} section={recordSections[toolId]!}
            preferences={preferences} actions={actions} />
        )}
    </CompanionPanelFrame>
  );
}
