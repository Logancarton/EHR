"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import PatientHeader from "./PatientHeader";
import Button from "../ui/Button";
import { useDismissible } from "../../lib/use-dismissible";
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
  WORKSPACE_OPEN_COMPANION_EVENT,
  WORKSPACE_ORDER_CART_UPDATED_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import { CHART_INDEX, type ChartIndexTarget, type PatientInfoSection } from "../../lib/chart-index";
import Icon from "../ui/Icon";

export interface PatientChartSurfaceProps {
  patient: Patient;
  section: Section;
  onSectionChange: (sec: Section) => void;
  columnsOpen: boolean;
  setColumnsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  preferences: ProviderPreferences;
  /** Opens Patient information, at a section when one is named. */
  onOpenPatientInformation: (section?: PatientInfoSection) => void;
  onOpenCustomizer: () => void;
  stagedOrdersCount: number;
  onOpenOrderCart: () => void;
  onNavigateView: (view: WorkspaceView) => void;
  actions: PatientSectionActions;
}

/**
 * Renders the primary patient chart workspace pane, including PatientHeader,
 * header navigation, multi-column comparison view,
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
  const moreRef = useRef<HTMLDetailsElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const dismissMore = useCallback(() => {
    if (moreRef.current) moreRef.current.open = false;
    setMoreOpen(false);
    moreRef.current?.querySelector("summary")?.focus();
  }, []);
  useDismissible({ active: moreOpen, onDismiss: dismissMore, surface: moreRef, dismissOnOutsideClick: true });
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

  const openChartIndexTarget = (target: ChartIndexTarget) => {
    dismissMore();
    if (target.kind === "section") {
      onSectionChange(target.section);
      setColumnsOpen(false);
    } else if (target.kind === "companion") {
      dispatchWorkspaceEvent(WORKSPACE_OPEN_COMPANION_EVENT, { tool: target.tool });
    } else {
      onOpenPatientInformation(target.section);
    }
  };

  return (
    <section
      className="primary-workspace-pane"
      data-scroll-patient-id={patient.id}
      data-scroll-section={section}
    >
      <PatientHeader
        patient={patient}
        headerActions={
          <div className="patient-header-actions" role="group" aria-label="Patient workspace controls">
            <Button size="sm" variant={section === "Overview" ? "primary" : "secondary"}
              pressed={section === "Overview"} onClick={() => { onSectionChange("Overview"); setColumnsOpen(false); }}>Overview</Button>
            <Button size="sm" variant={section === "Encounter" ? "primary" : "secondary"}
              pressed={section === "Encounter"} onClick={() => { onSectionChange("Encounter"); setColumnsOpen(false); }}>Encounter</Button>
            <Button size="sm" variant="tertiary" onClick={() => onOpenPatientInformation()}>Patient info</Button>
            <details className="patient-workspace-more chart-index" ref={moreRef} onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
              <summary aria-label={`Chart index for ${patient.name}`}>
                <Icon name="menu_book" size="sm" /> Chart
              </summary>
              <div className="chart-index-panel">
                {CHART_INDEX.map((group) => (
                  <nav key={group.label} className="chart-index-group" aria-label={group.label}>
                    <span className="chart-index-heading">{group.label}</span>
                    {group.entries.map((entry) => (
                      <button key={entry.id} type="button" className="chart-index-entry" onClick={() => openChartIndexTarget(entry.target)}>
                        <Icon name={entry.icon} size="sm" />
                        <span>{entry.label}</span>
                        <small>{entry.where}</small>
                      </button>
                    ))}
                  </nav>
                ))}
                <div className="chart-index-group chart-index-tools" role="group" aria-label="Chart tools">
                  <span className="chart-index-heading">Tools</span>
                  <Button size="sm" pressed={pinned === true} loading={pinBusy} onClick={() => void togglePin()}>{pinned ? "On worklist" : "Worklist"}</Button>
                  <Button size="sm" pressed={columnsOpen} onClick={() => setColumnsOpen((open) => !open)}>{columnsOpen ? "Close columns" : "Columns"}</Button>
                </div>
              </div>
            </details>
          </div>
        }
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
