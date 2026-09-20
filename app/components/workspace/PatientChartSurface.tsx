"use client";

import PatientHeader from "./PatientHeader";
import SectionTabs from "./SectionTabs";
import SectionColumns from "./SectionColumns";
import PatientSectionRouter, {
  type PatientSectionActions,
} from "./PatientSectionRouter";
import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import type { WorkspaceView } from "../../lib/use-patient-tabs";

export interface PatientChartSurfaceProps {
  patient: Patient;
  section: Section;
  onSectionChange: (sec: Section) => void;
  columnsOpen: boolean;
  setColumnsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  preferences: ProviderPreferences;
  onOpenPatientInformation: () => void;
  onOpenCustomizer: () => void;
  stagedOrdersCount: number;
  onOpenOrderCart: () => void;
  onNavigateView: (view: WorkspaceView) => void;
  actions: PatientSectionActions;
}

/**
 * Renders the primary patient chart workspace pane, including PatientHeader,
 * section navigation tabs, multi-column comparison view, and section contents.
 */
export default function PatientChartSurface({
  patient,
  section,
  onSectionChange,
  columnsOpen,
  setColumnsOpen,
  preferences,
  onOpenPatientInformation,
  onOpenCustomizer,
  stagedOrdersCount,
  onOpenOrderCart,
  onNavigateView,
  actions,
}: PatientChartSurfaceProps) {
  return (
    <section
      className="primary-workspace-pane"
      data-scroll-patient-id={patient.id}
      data-scroll-section={section}
    >
      <PatientHeader
        patient={patient}
        headerDensity={preferences.headerDensity}
        onOpenPatientInformation={onOpenPatientInformation}
        onOpenCustomizer={onOpenCustomizer}
        stagedOrdersCount={stagedOrdersCount}
        onOpenOrderCart={onOpenOrderCart}
        onNavigateSection={onSectionChange}
        onNavigateView={onNavigateView}
      />

      {patient.alert && (
        <div className="clinical-alert">
          <strong>Attention:</strong> {patient.alert}
          <button type="button" onClick={() => onSectionChange("Overview")}>Review</button>
        </div>
      )}

      <SectionTabs
        value={section}
        onChange={(next: Section) => {
          onSectionChange(next);
          setColumnsOpen(false);
        }}
        columnsOpen={columnsOpen}
        onToggleColumns={() => setColumnsOpen((open) => !open)}
      />

      {columnsOpen ? (
        <SectionColumns
          active={section}
          onClose={() => setColumnsOpen(false)}
          onPromote={(next: Section) => {
            onSectionChange(next);
            setColumnsOpen(false);
          }}
          renderSection={(columnSection: Section) => (
            <PatientSectionRouter
              patient={patient}
              section={columnSection}
              preferences={preferences}
              actions={actions}
            />
          )}
        />
      ) : (
        <div
          className={`content-area ${section === "Encounter" ? "encounter-mode" : ""}`}
        >
          <PatientSectionRouter
            patient={patient}
            section={section}
            preferences={preferences}
            actions={actions}
          />
        </div>
      )}
    </section>
  );
}
