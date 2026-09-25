"use client";

import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import PatientOverview from "../patient/PatientOverview";
import EncounterWorkspace from "../encounter/EncounterWorkspace";
import PatientMedications from "../patient/PatientMedications";
import PatientLabs from "../patient/PatientLabs";
import PatientDocuments from "../patient/PatientDocuments";
import PatientMessages from "../patient/PatientMessages";
import PatientHistory from "../patient/PatientHistory";

export interface PatientSectionActions {
  onDraftOrder: (orderName: string) => void;
  onInsertText: (text: string) => void;
  onEncounterSigned?: (patientId: string, appointmentId?: string) => void;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  onDraftAllOverdue?: (labs: string[]) => void;
  onOpenPrescribe?: () => void;
  onOpenLabComposer?: () => void;
  onAddTask?: (text: string) => void;
  onToast?: (msg: string) => void;
  onNavigateSection?: (section: Section) => void;
  onOpenAdminDrawer?: () => void;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
}

export interface PatientSectionRouterProps {
  patient: Patient;
  section: Section;
  preferences?: ProviderPreferences;
  actions: PatientSectionActions;
}

/**
 * Routes the active patient section ("Overview", "Encounter", "Meds", "Labs",
 * "Documents", "Messages", or "History") to its corresponding clinical surface.
 */
export default function PatientSectionRouter({
  patient,
  section,
  preferences,
  actions,
}: PatientSectionRouterProps) {
  const {
    onDraftOrder,
    onInsertText,
    onEncounterSigned,
    onOpenOrderCart,
    onDraftAllOverdue,
    onOpenPrescribe,
    onOpenLabComposer,
    onAddTask,
    onToast,
    onNavigateSection,
    onOpenAdminDrawer,
    onUpdatePreferences,
  } = actions;

  if (section === "Overview") {
    return (
      <PatientOverview
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
        onNavigateSection={onNavigateSection}
        onOpenAdminDrawer={onOpenAdminDrawer}
        onToast={onToast}
      />
    );
  }

  if (section === "Encounter") {
    return (
      <EncounterWorkspace
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
        onInsertText={onInsertText}
        onEncounterSigned={onEncounterSigned}
        onDraftOrder={onDraftOrder}
        onOpenOrderCart={onOpenOrderCart}
        onNavigateSection={onNavigateSection}
        onOpenAdminDrawer={onOpenAdminDrawer}
      />
    );
  }

  if (section === "Meds") {
    return (
      <PatientMedications
        patient={patient}
        onDraftOrder={onDraftOrder}
        onOpenPrescribe={onOpenPrescribe}
      />
    );
  }

  if (section === "Labs") {
    return (
      <PatientLabs
        patient={patient}
        onDraftOrder={onDraftOrder}
        onDraftAllOverdue={onDraftAllOverdue}
        onOpenLabComposer={onOpenLabComposer}
      />
    );
  }

  if (section === "Documents") {
    return <PatientDocuments patient={patient} />;
  }

  if (section === "Messages") {
    return (
      <PatientMessages
        patient={patient}
        onOpenOrderCart={onOpenOrderCart}
        onAddTask={onAddTask}
        onToast={onToast}
      />
    );
  }

  return (
    <PatientHistory
      patient={patient}
      onInsertText={onInsertText}
      onToast={onToast}
      onNavigateSection={onNavigateSection}
    />
  );
}
