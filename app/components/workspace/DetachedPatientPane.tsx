"use client";

import Icon from "../ui/Icon";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import SectionTabs from "./SectionTabs";
import PatientSectionRouter, {
  type PatientSectionActions,
} from "./PatientSectionRouter";
import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";

export interface DetachedPatientPaneProps {
  patient: Patient;
  paneSection: Section;
  preferences: ProviderPreferences;
  onPatientSectionChange: (patientId: string, nextSection: Section) => void;
  onStartPatientDrag: (patientId: string, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDockPatient: (patientId: string) => void;
  onClosePatient: (patientId: string) => void;
  actions: PatientSectionActions;
}

/**
 * Encapsulates a detached side-by-side patient chart pane, preserving all DOM classes,
 * selectors, and drag/dock contracts.
 */
export default function DetachedPatientPane({
  patient,
  paneSection,
  preferences,
  onPatientSectionChange,
  onStartPatientDrag,
  onDragEnd,
  onDockPatient,
  onClosePatient,
  actions,
}: DetachedPatientPaneProps) {
  return (
    <section
      className="detached-patient-pane"
      data-scroll-patient-id={patient.id}
      data-scroll-section={paneSection}
    >
      <div
        className="detached-pane-header"
        draggable
        onDragStart={(event) => onStartPatientDrag(patient.id, event)}
        onDragEnd={onDragEnd}
        title="Drag this header back to the tab bar to dock"
      >
        <span className="pane-drag-handle" aria-hidden="true">
          <Icon name="drag_indicator" />
        </span>
        <PatientPhotoSpot
          patient={patient}
          size="sm"
          editable={false}
          showBadge={false}
        />
        <div className="detached-pane-title">
          <strong>{patient.name}</strong>
          <small>
            {patient.mrn} · DOB {patient.dob}
          </small>
        </div>
        <button
          draggable={false}
          className="dock-button"
          onClick={() => onDockPatient(patient.id)}
          title="Return to tab bar"
        >
          Dock
        </button>
        <button
          draggable={false}
          className="pane-close-button"
          aria-label={`Close ${patient.name}`}
          onClick={() => onClosePatient(patient.id)}
        >
          ×
        </button>
      </div>

      {patient.alert && <div className="detached-alert">{patient.alert}</div>}

      <SectionTabs
        compact
        value={paneSection}
        onChange={(nextSection: Section) => onPatientSectionChange(patient.id, nextSection)}
      />

      <div
        className={`detached-content ${paneSection === "Encounter" ? "encounter-mode" : ""}`}
      >
        <PatientSectionRouter
          patient={patient}
          section={paneSection}
          preferences={preferences}
          actions={actions}
        />
      </div>
    </section>
  );
}
