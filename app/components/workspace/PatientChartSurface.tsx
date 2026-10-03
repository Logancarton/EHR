"use client";

import { useCallback, useEffect, useState } from "react";
import PatientHeader from "./PatientHeader";
import SectionTabs from "./SectionTabs";
import SectionColumns from "./SectionColumns";
import PatientSectionRouter, {
  type PatientSectionActions,
} from "./PatientSectionRouter";
import type { Patient, Section } from "../../domain/patient";
import type { ProviderPreferences } from "../../lib/preference-engine";
import type { WorkspaceView } from "../../lib/use-patient-tabs";
import { displayablePatientAlert } from "../../lib/clinical-protocols";
import {
  careCompletionApi,
  CARE_COMPLETION_CHANGED_EVENT,
  announceCareCompletionChange,
} from "../../lib/care-completion-api";
import {
  WORKSPACE_ORDER_CART_UPDATED_EVENT,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";

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
 * Google-style vertical section navigation, multi-column comparison view,
 * and section contents.
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const headerAlert = displayablePatientAlert(patient.alert);

  const [liveStagedOrdersCount, setLiveStagedOrdersCount] = useState(stagedOrdersCount);

  useEffect(() => {
    setLiveStagedOrdersCount(stagedOrdersCount);
  }, [stagedOrdersCount]);

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, (detail) => {
      if (detail.patientId === patient.id) {
        setLiveStagedOrdersCount(detail.remainingCount ?? 0);
      }
    });
  }, [patient.id]);

  const [pinned, setPinned] = useState<boolean | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const readPinState = useCallback(async (patientId: string) => {
    try {
      setPinned(await careCompletionApi.isPinned(patientId));
    } catch {
      setPinned(null);
    }
  }, []);

  useEffect(() => {
    setPinned(null);
    void readPinState(patient.id);
  }, [patient.id, readPinState]);

  useEffect(() => {
    const handler = () => void readPinState(patient.id);
    window.addEventListener(CARE_COMPLETION_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CARE_COMPLETION_CHANGED_EVENT, handler);
  }, [patient.id, readPinState]);

  const togglePin = useCallback(async () => {
    setPinBusy(true);
    try {
      if (pinned) await careCompletionApi.unpin(patient.id);
      else await careCompletionApi.pin(patient.id, "chart-sidebar");
      setPinned(!pinned);
      announceCareCompletionChange({ patientId: patient.id });
    } catch {
      await readPinState(patient.id);
    } finally {
      setPinBusy(false);
    }
  }, [pinned, patient.id, readPinState]);

  return (
    <section
      className="primary-workspace-pane"
      data-scroll-patient-id={patient.id}
      data-scroll-section={section}
    >
      <PatientHeader
        patient={patient}
        headerDensity={preferences.headerDensity}
        currentSection={section}
        onOpenPatientInformation={onOpenPatientInformation}
        onOpenCustomizer={onOpenCustomizer}
        stagedOrdersCount={liveStagedOrdersCount}
        onOpenOrderCart={onOpenOrderCart}
        onNavigateSection={onSectionChange}
        onNavigateView={onNavigateView}
      />

      {headerAlert && (
        <div className="clinical-alert">
          <strong>Attention:</strong> {headerAlert}
          <button type="button" onClick={() => onSectionChange("Overview")}>Review</button>
        </div>
      )}

      <div className="patient-chart-layout">
        <SectionTabs
          orientation="vertical"
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((open) => !open)}
          value={section}
          onChange={(next: Section) => {
            onSectionChange(next);
            setColumnsOpen(false);
          }}
          columnsOpen={columnsOpen}
          onToggleColumns={() => setColumnsOpen((open) => !open)}
          onOpenOrderCart={onOpenOrderCart}
          stagedOrdersCount={liveStagedOrdersCount}
          onOpenPatientInformation={onOpenPatientInformation}
          pinned={pinned}
          pinBusy={pinBusy}
          onTogglePin={togglePin}
        />

        <main className="patient-chart-main-content">
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
        </main>
      </div>
    </section>
  );
}
