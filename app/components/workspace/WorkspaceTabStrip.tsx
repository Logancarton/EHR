"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import Icon from "../ui/Icon";
import { findRosterPatient } from "../../lib/patient-roster";
import {
  moduleTitle,
  type GlobalWorkspaceModule,
} from "../../lib/workspace-navigation";
import {
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import type { WorkspaceView } from "../../lib/use-patient-tabs";
import type { Patient, Section } from "../../domain/patient";
import { useDismissible } from "../../lib/use-dismissible";
import { useWorkspaceBadgeCounts } from "../../lib/use-workspace-badges";
import OpenWorkspaceLauncher, {
  type WorkspaceDestination,
} from "./OpenWorkspaceLauncher";

const MAX_VISIBLE_PATIENT_TABS = 4;

export interface WorkspaceTabStripProps {
  tabStripRef: RefObject<HTMLDivElement | null>;
  draggedId: string | null;
  detachedPatientIds: string[];
  dockPatient: (id: string) => void;
  dashboardTabOpen: boolean;
  calendarTabOpen: boolean;
  globalModuleOpen: boolean;
  activeView: WorkspaceView;
  openModuleTabs: GlobalWorkspaceModule[];
  openModuleView: GlobalWorkspaceModule | null;
  dockedPatientIds: string[];
  roster: readonly Patient[];
  activePatientId: string;
  patientSections: Record<string, Section>;
  onGoToWorkspaceView: (view: WorkspaceView) => void;
  onCloseDashboardTab: () => void;
  onCloseCalendarTab: () => void;
  onCloseModuleTab: (module: GlobalWorkspaceModule) => void;
  onSelectPatientTab: (patientId: string) => void;
  onClosePatientTab: (patientId: string) => void;
  startPatientDrag: (id: string, event: React.DragEvent<HTMLElement>) => void;
  reorderTab: (targetId: string) => void;
  setDraggedId: (id: string | null) => void;
  onOpenNewTabClick?: () => void;
  onSelectWorkspace?: (destination: WorkspaceDestination) => void;
  onOpenPatientChart?: (patientId: string) => void;
}

/**
 * Renders the persistent browser-like tab strip containing Dashboard, Calendar,
 * global module tabs (Inbox, Tasks, etc.), docked patient tabs, and tab management controls.
 *
 * All DOM selectors, data-* attributes, and drag/drop behaviors are preserved for
 * WorkspaceStateManager and automation contracts.
 */
export default function WorkspaceTabStrip({
  tabStripRef,
  draggedId,
  detachedPatientIds,
  dockPatient,
  dashboardTabOpen,
  calendarTabOpen,
  globalModuleOpen,
  activeView,
  openModuleTabs,
  openModuleView,
  dockedPatientIds,
  roster,
  activePatientId,
  patientSections,
  onGoToWorkspaceView,
  onCloseDashboardTab,
  onCloseCalendarTab,
  onCloseModuleTab,
  onSelectPatientTab,
  onClosePatientTab,
  startPatientDrag,
  reorderTab,
  setDraggedId,
  onOpenNewTabClick,
  onSelectWorkspace,
  onOpenPatientChart,
}: WorkspaceTabStripProps) {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [patientOverflowOpen, setPatientOverflowOpen] = useState(false);
  /**
   * Held here rather than inside the launcher: the popover mounts only while open,
   * and the queues publish their counts once, at load.
   */
  const badgeCounts = useWorkspaceBadgeCounts();
  const launcherButtonRef = useRef<HTMLButtonElement>(null);
  const launcherAnchorRef = useRef<HTMLDivElement>(null);
  const patientOverflowRef = useRef<HTMLDivElement>(null);

  useDismissible({
    active: launcherOpen,
    onDismiss: () => setLauncherOpen(false),
    surface: launcherAnchorRef,
    dismissOnOutsideClick: true,
    dismissFromTextEntry: true,
  });

  useDismissible({
    active: patientOverflowOpen,
    onDismiss: () => setPatientOverflowOpen(false),
    surface: patientOverflowRef,
    dismissOnOutsideClick: true,
    dismissFromTextEntry: true,
  });

  const handleSelectWorkspace = useCallback(
    (destination: WorkspaceDestination) => {
      if (onSelectWorkspace) {
        onSelectWorkspace(destination);
        return;
      }
      if (destination === "home") {
        onGoToWorkspaceView("home");
      } else if (destination === "dashboard") {
        onGoToWorkspaceView("today");
      } else if (destination === "calendar") {
        onGoToWorkspaceView("calendar");
      } else if (destination === "patients") {
        if (activePatientId) {
          onSelectPatientTab(activePatientId);
        } else if (roster[0]?.id) {
          onSelectPatientTab(roster[0].id);
        }
      } else if (destination === "brand") {
        dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "website" });
      } else {
        dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: destination });
      }
    },
    [onSelectWorkspace, onGoToWorkspaceView, activePatientId, roster, onSelectPatientTab],
  );

  const handleSelectPatient = useCallback(
    (patientId: string) => {
      if (onOpenPatientChart) {
        onOpenPatientChart(patientId);
      } else {
        onSelectPatientTab(patientId);
      }
    },
    [onOpenPatientChart, onSelectPatientTab],
  );

  const visiblePatientIds = useMemo(() => {
    if (dockedPatientIds.length <= MAX_VISIBLE_PATIENT_TABS) return dockedPatientIds;

    const visible = dockedPatientIds.slice(0, MAX_VISIBLE_PATIENT_TABS);
    if (
      activeView === "patient" &&
      activePatientId &&
      !visible.includes(activePatientId)
    ) {
      return [...dockedPatientIds.slice(0, MAX_VISIBLE_PATIENT_TABS - 1), activePatientId];
    }
    return visible;
  }, [activePatientId, activeView, dockedPatientIds]);

  const hiddenPatientIds = useMemo(
    () => dockedPatientIds.filter((id) => !visiblePatientIds.includes(id)),
    [dockedPatientIds, visiblePatientIds],
  );

  const patientTabBaseOrder =
    (dashboardTabOpen ? 1 : 0) +
    (calendarTabOpen ? 1 : 0) +
    openModuleTabs.length;

  const renderPatientTab = (id: string, overflowHidden = false) => {
    const patient = findRosterPatient(id, roster);
    if (!patient) return null;
    const workspaceOrder = patientTabBaseOrder + dockedPatientIds.indexOf(patient.id);

    return (
      <div
        key={patient.id}
        draggable={!overflowHidden}
        onDragStart={(event) => startPatientDrag(patient.id, event)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          reorderTab(patient.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        data-workspace-tab="patient"
        data-workspace-order={workspaceOrder}
        data-tab-overflow-hidden={overflowHidden ? "true" : undefined}
        data-patient-section={patientSections[patient.id] ?? "Overview"}
        aria-hidden={overflowHidden || undefined}
        className={`browser-tab ${overflowHidden ? "patient-tab-overflow-source" : ""} ${
          activeView === "patient" &&
          patient.id === activePatientId &&
          !globalModuleOpen
            ? "active"
            : ""
        }`}
        onClick={() => onSelectPatientTab(patient.id)}
        title="Drag to reorder, or drag into the chart area to split this patient into a pane"
      >
        <span className="tab-dot" />
        <span className="tab-name">{patient.name}</span>
        {patient.alert && <span className="alert-dot" title={patient.alert} />}
        <button
          aria-label={`Close ${patient.name}`}
          tabIndex={overflowHidden ? -1 : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onClosePatientTab(patient.id);
          }}
        >
          <Icon name="close" size="sm" />
        </button>
      </div>
    );
  };

  return (
    <div
      ref={tabStripRef}
      className={`browser-tabs ${draggedId && detachedPatientIds.includes(draggedId) ? "dock-ready" : ""}`}
      onDragOver={(event) => {
        if (draggedId && detachedPatientIds.includes(draggedId)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!draggedId || !detachedPatientIds.includes(draggedId)) return;
        event.preventDefault();
        dockPatient(draggedId);
      }}
    >
      {/* Dashboard and Calendar stay open until explicitly closed; patient charts
          can move in front without erasing either practice workspace. */}
      {dashboardTabOpen && (
        <div
          className={`browser-tab ${activeView === "today" && !globalModuleOpen ? "active" : ""}`}
          data-workspace-tab="dashboard"
          data-workspace-view="today"
          data-workspace-order={0}
          onClick={() => onGoToWorkspaceView("today")}
          title="Practice Dashboard"
        >
          <span className="tab-dot" />
          <span className="tab-name">Dashboard</span>
          <button
            aria-label="Close Dashboard tab"
            onClick={(event) => {
              event.stopPropagation();
              onCloseDashboardTab();
            }}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      )}

      {calendarTabOpen && (
        <div
          className={`browser-tab ${activeView === "calendar" && !globalModuleOpen ? "active" : ""}`}
          data-workspace-tab="calendar"
          data-workspace-view="calendar"
          data-workspace-order={dashboardTabOpen ? 1 : 0}
          onClick={() => onGoToWorkspaceView("calendar")}
          title="Practice Calendar"
        >
          <span className="tab-dot" />
          <span className="tab-name">Calendar</span>
          <button
            aria-label="Close Calendar tab"
            onClick={(event) => {
              event.stopPropagation();
              onCloseCalendarTab();
            }}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      )}

      {openModuleTabs.map((mod, moduleIndex) => (
        <div
          key={mod}
          className={`browser-tab ${openModuleView === mod ? "active" : ""}`}
          data-workspace-tab="module"
          data-workspace-view={mod}
          data-workspace-order={(dashboardTabOpen ? 1 : 0) + (calendarTabOpen ? 1 : 0) + moduleIndex}
          onClick={() =>
            dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: mod })
          }
          title={moduleTitle(mod)}
        >
          <span className="tab-dot" />
          <span className="tab-name">{moduleTitle(mod)}</span>
          <button
            aria-label={`Close ${moduleTitle(mod)} tab`}
            onClick={(event) => {
              event.stopPropagation();
              onCloseModuleTab(mod);
            }}
          >
            <Icon name="close" size="sm" />
          </button>
        </div>
      ))}

      {visiblePatientIds.map((id) => renderPatientTab(id))}
      {hiddenPatientIds.map((id) => renderPatientTab(id, true))}

      {hiddenPatientIds.length > 0 && (
        <div className="patient-tab-overflow-anchor" ref={patientOverflowRef}>
          <button
            type="button"
            className={`patient-tab-overflow-trigger ${patientOverflowOpen ? "active" : ""}`}
            aria-label={`More patient tabs (${hiddenPatientIds.length})`}
            aria-haspopup="menu"
            aria-expanded={patientOverflowOpen}
            onClick={() => setPatientOverflowOpen((open) => !open)}
          >
            <Icon name="groups" size="sm" />
            <span>Patients +{hiddenPatientIds.length}</span>
          </button>

          {patientOverflowOpen && (
            <div className="patient-tab-overflow-menu" role="menu" aria-label="Open patient tabs">
              <div className="patient-tab-overflow-heading">
                <strong>Open patient charts</strong>
                <span>{dockedPatientIds.length} open</span>
              </div>
              {hiddenPatientIds.map((id) => {
                const patient = findRosterPatient(id, roster);
                if (!patient) return null;
                return (
                  <div className="patient-tab-overflow-row" key={patient.id}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onSelectPatientTab(patient.id);
                        setPatientOverflowOpen(false);
                      }}
                    >
                      <span>{patient.name}</span>
                      <small>{patientSections[patient.id] ?? "Overview"}</small>
                    </button>
                    <button
                      type="button"
                      aria-label={`Close ${patient.name} from overflow`}
                      onClick={() => onClosePatientTab(patient.id)}
                    >
                      <Icon name="close" size="sm" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="open-workspace-anchor" ref={launcherAnchorRef}>
        <button
          ref={launcherButtonRef}
          type="button"
          className={`new-tab ${launcherOpen ? "active" : ""}`}
          aria-label="Open workspace"
          title="Open workspace"
          aria-haspopup="dialog"
          aria-expanded={launcherOpen}
          data-workspace-control="open-workspace-launcher"
          onClick={() => {
            setLauncherOpen((prev) => !prev);
            onOpenNewTabClick?.();
          }}
        >
          <Icon name="add" size="sm" />
        </button>

        {launcherOpen && (
          <OpenWorkspaceLauncher
            isOpen={launcherOpen}
            onClose={() => {
              setLauncherOpen(false);
              launcherButtonRef.current?.focus();
            }}
            anchorRef={launcherButtonRef}
            activeView={activeView}
            dashboardTabOpen={dashboardTabOpen}
            calendarTabOpen={calendarTabOpen}
            openModuleTabs={openModuleTabs}
            activeModule={openModuleView}
            dockedPatientIds={dockedPatientIds}
            activePatientId={activePatientId}
            roster={roster}
            counts={badgeCounts}
            onSelectWorkspace={handleSelectWorkspace}
            onSelectPatient={handleSelectPatient}
          />
        )}
      </div>

      <div className="tab-spacer" />
      {detachedPatientIds.length > 0 && (
        <span className="detached-count">{detachedPatientIds.length} split</span>
      )}
    </div>
  );
}
