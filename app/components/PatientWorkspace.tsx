"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TodayDashboard from "./TodayDashboard";
import CalendarWorkspace from "./workspaces/CalendarWorkspace";
import ZenHomeWindow from "./home/ZenHomeWindow";
import WorkspaceCustomizer from "./WorkspaceCustomizer";
import ClinicalMonitoringSettingsModal from "./ClinicalMonitoringSettingsModal";
import OrderCartModal from "./orders/OrderCartModal";
import PatientInformationDrawer from "./patient/PatientInformationDrawer";
import WorkspaceTopBar from "./workspace/WorkspaceTopBar";
import WorkspaceTabStrip from "./workspace/WorkspaceTabStrip";
import WorkspaceCompanionRail from "./workspace/WorkspaceCompanionRail";
import CompanionPanelHost from "./workspace/CompanionPanelHost";
import PatientChartSurface from "./workspace/PatientChartSurface";
import DetachedPatientPane from "./workspace/DetachedPatientPane";
import type { PatientSectionActions } from "./workspace/PatientSectionRouter";

import type { Patient, Section } from "../domain/patient";
import { findRosterPatient, usePatientRoster } from "../lib/patient-roster";
import { noteVisitStartedFromSchedule } from "../lib/active-visit";
import { pinnedTools } from "../lib/workspace-tools";
import { usePatientTabs } from "../lib/use-patient-tabs";
import { useStagedOrders } from "../lib/use-staged-orders";
import { useToolPins } from "../lib/use-tool-pins";
import { usePersistentWorkspaceTabs } from "../lib/use-persistent-workspace-tabs";
import { useWorkspacePreferencesController } from "../lib/use-workspace-preferences-controller";
import { useWorkspaceChromeGeometry } from "../lib/use-workspace-chrome-geometry";
import { useCompanionRailController } from "../lib/use-companion-rail-controller";
import { useCompanionWorkingData } from "../lib/use-companion-working-data";
import { useWorkspaceVoiceInput } from "../lib/use-workspace-voice-input";
import { useOmniboxController } from "../lib/use-omnibox-controller";
import {
  WORKSPACE_SELECT_DOCUMENT_EVENT,
  dispatchWorkspaceEvent,
} from "../lib/workspace-events";
import { useWorkspaceNavigation } from "../lib/workspace-navigation-context";
import type { GlobalWorkspaceModule } from "../lib/workspace-navigation";
import { deriveWorkspaceCanvasContext } from "../lib/workspace-canvas-context";

/**
 * Top-level Clinical Bond workspace shell.
 *
 * Coordinates:
 * - Authoritative accessible patient roster (`usePatientRoster`)
 * - Persistent browser-like patient workspaces & tabs (`usePatientTabs`)
 * - Persistent non-patient views & overlays (`usePersistentWorkspaceTabs`)
 * - Staged orders cart modal & drafting (`useStagedOrders`)
 * - Tool rail pin synchronization (`useToolPins`)
 * - Clinician preferences & practice templates (`useWorkspacePreferencesController`)
 * - Shell chrome measurement & CSS properties (`useWorkspaceChromeGeometry`)
 * - Companion rail state & resize handling (`useCompanionRailController`)
 * - Companion working data: notes, tasks, calculators (`useCompanionWorkingData`)
 * - Voice input & psychiatric vocabulary correction (`useWorkspaceVoiceInput`)
 * - Clinical AI & EHR search omnibox (`useOmniboxController`)
 */
export default function PatientWorkspace() {
  const { patients: roster, status: rosterStatus, refresh: refreshRoster } = usePatientRoster();

  // Screen reader announcement region
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = useState("");
  const announce = useCallback((message: string) => {
    setScreenReaderAnnouncement(message);
    window.setTimeout(() => setScreenReaderAnnouncement(""), 1000);
  }, []);

  // Shell toast notifications
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const showToast = useCallback((message: string, holdMs = 3000) => {
    setWorkspaceMessage(message);
    window.setTimeout(() => setWorkspaceMessage(""), holdMs);
  }, []);

  // 1. Preferences & practice templates controller
  const prefsController = useWorkspacePreferencesController({
    onNotify: showToast,
  });
  const { preferences, persistPreferences } = prefsController;

  // Bridge ref for dismissing omnibox when charts open
  const dismissOmniboxRef = useRef<() => void>(() => {});

  // 2. Patient tabs & browser-like chart workspace model
  const tabs = usePatientTabs({
    roster,
    rosterReady: rosterStatus === "ready",
    announce,
    onChartOpened: () => dismissOmniboxRef.current(),
    initialView: preferences.defaultLandingView === "home" ? "home" : "today",
  });

  const activePatient = findRosterPatient(tabs.activePatientId, roster);
  const nav = useWorkspaceNavigation();
  const workspaceContext = useMemo(
    () =>
      deriveWorkspaceCanvasContext({
        activeView: tabs.activeView,
        activeModule: nav.activeModule,
        activePatientId: activePatient?.id,
        activePatientName: activePatient?.name,
        patientSection: tabs.section,
      }),
    [tabs.activeView, tabs.section, nav.activeModule, activePatient],
  );
  const contextualPatient =
    workspaceContext.kind === "patient" ? activePatient : null;

  // 3. Persistent workspace tabs (Dashboard, Calendar, and module overlays)
  const navTabs = usePersistentWorkspaceTabs({
    activeView: tabs.activeView,
    setActiveView: tabs.setActiveView,
    activePatient,
    preferences,
  });

  // 4. Staged orders
  const orders = useStagedOrders({ roster });
  const orderModalPatient =
    findRosterPatient(orders.composerPatientId, roster) ?? activePatient;

  // 5. Tool pins
  const { pins, toggle: togglePinnedTool } = useToolPins();
  const companionToolIds = useMemo(() => pins.right, [pins]);
  const companionTools = useMemo(() => pinnedTools(pins, "right"), [pins]);

  const persistCompanionPanelState = useCallback(
    (panelId: string | null, open: boolean) => {
      persistPreferences({
        ...preferences,
        rails: {
          ...preferences.rails,
          activeRightPanel: panelId,
          rightPanelOpen: open,
        },
      });
    },
    [persistPreferences, preferences],
  );

  // 6. Companion rail controller
  const companion = useCompanionRailController({
    showCompanionRail: preferences.showCompanionRail,
    companionToolIds,
    onNotify: showToast,
    activeView: tabs.activeView,
    initialCompanionPanel: preferences.rails.activeRightPanel ?? null,
    initialCompanionPanelOpen: preferences.rails.rightPanelOpen ?? false,
    onCompanionPanelStateChange: persistCompanionPanelState,
  });

  // 7. Companion working data (scratchpad, tasks, PHQ-9 calculator)
  const companionData = useCompanionWorkingData({
    activePatientId: contextualPatient?.id,
    onNotify: showToast,
  });

  // 8. Geometry: measure tab strip bottom and publish --workspace-chrome-h
  const topbarRef = useRef<HTMLElement | null>(null);
  const tabStripRef = useRef<HTMLDivElement | null>(null);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  useWorkspaceChromeGeometry(topbarRef, tabStripRef);

  // 9. Omnibox & Voice state
  const [globalAiPrompt, setGlobalAiPrompt] = useState("");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [patientInfoOpen, setPatientInfoOpen] = useState(false);
  const [clinicalMonitoringOpen, setClinicalMonitoringOpen] = useState(false);

  const omnibox = useOmniboxController({
    roster,
    activePatient: contextualPatient,
    preferences,
    onPersistPreferences: persistPreferences,
    onJumpCalendarDate: companion.handleJumpCalendarDate,
    onSplitScreenPatient: tabs.splitScreenPatient,
    onOpenComposer: orders.openComposer,
    onDraftLabOrder: orders.draftLabOrder,
    onOpenPatient: nav.openPatient,
    onSetSection: tabs.setSection,
    onToggleCompanionPanel: companion.toggleCompanionPanel,
    activeCompanionPanel: companion.activeCompanionPanel,
    onSetGlobalAiPrompt: setGlobalAiPrompt,
    onNotify: showToast,
    commandInputRef,
  });

  useEffect(() => {
    dismissOmniboxRef.current = omnibox.dismissOmnibox;
  }, [omnibox.dismissOmnibox]);

  const voice = useWorkspaceVoiceInput({
    onTranscript: omnibox.setQuery,
    onListeningFocus: () => omnibox.setSearchFocused(true),
    commandInputRef,
  });

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const currentTabsActiveView = tabs.activeView;
  const setTabsActiveView = tabs.setActiveView;
  useEffect(() => {
    if (nav.activeView !== currentTabsActiveView) {
      setTabsActiveView(nav.activeView);
    }
  }, [nav.activeView, currentTabsActiveView, setTabsActiveView]);

  const registerPatientHandler = nav.registerPatientHandler;
  useEffect(() => {
    registerPatientHandler({
      openPatient: (patientId, targetSection, options) => {
        tabsRef.current.openPatient(patientId, targetSection as any);
        if (options?.documentId) {
          dispatchWorkspaceEvent(WORKSPACE_SELECT_DOCUMENT_EVENT, {
            patientId,
            documentId: options.documentId,
          });
        }
      },
      get activePatientId() {
        return tabsRef.current.activePatientId;
      },
      get activePatientSection() {
        return tabsRef.current.section;
      },
    });
    return () => {
      registerPatientHandler(null);
    };
  }, [registerPatientHandler]);

  // Encounter signed coordination: refreshes roster snapshot and displays confirmation toast.
  // The authoritative ehr-encounter-signed notification is dispatched once by EncounterWorkspace
  // upon successful server persistence.
  const handleEncounterSigned = useCallback(
    (patientId: string, _appointmentId?: string) => {
      const p = findRosterPatient(patientId, roster);
      void refreshRoster();
      showToast(
        `Encounter for ${p?.name || patientId} signed and added to legal medical record!`,
        4000,
      );
    },
    [roster, refreshRoster, showToast],
  );

  // Section actions for primary chart
  const primaryPatientActions: PatientSectionActions = useMemo(
    () => ({
      onDraftOrder: (orderName) => {
        if (activePatient) orders.draftLabOrder(activePatient.id, orderName);
      },
      onDraftAllOverdue: (labs) => {
        if (activePatient) orders.draftOverdueLabs(activePatient.id, labs);
      },
      onOpenOrderCart: (tab, prefill) => {
        if (activePatient) orders.openComposer(activePatient.id, tab, prefill);
      },
      onOpenPrescribe: () => {
        if (activePatient) orders.openComposer(activePatient.id, "prescribe");
      },
      onOpenLabComposer: () => {
        if (activePatient) orders.openComposer(activePatient.id, "labs");
      },
      onAddTask: (text) => { void companionData.handleAddTask(text); },
      onToast: (msg) => showToast(msg),
      onInsertText: () => showToast("Inserted context into active encounter!"),
      onEncounterSigned: handleEncounterSigned,
      onNavigateSection: (next) => tabs.setSection(next),
      onOpenAdminDrawer: () => setPatientInfoOpen(true),
      onUpdatePreferences: persistPreferences,
    }),
    [
      activePatient,
      orders,
      companionData,
      showToast,
      handleEncounterSigned,
      tabs,
      persistPreferences,
    ],
  );

  // Section actions factory for detached patient panes
  const getDetachedPatientActions = useCallback(
    (patientId: string): PatientSectionActions => ({
      onDraftOrder: (orderName) => orders.draftLabOrder(patientId, orderName),
      onDraftAllOverdue: (labs) => orders.draftOverdueLabs(patientId, labs),
      onOpenOrderCart: (tab, prefill) => orders.openComposer(patientId, tab, prefill),
      onOpenPrescribe: () => orders.openComposer(patientId, "prescribe"),
      onOpenLabComposer: () => orders.openComposer(patientId, "labs"),
      onAddTask: (text) => { void companionData.handleAddTask(text); },
      onToast: (msg) => showToast(msg),
      onInsertText: () => showToast("Inserted context into active encounter!"),
      onEncounterSigned: handleEncounterSigned,
      onNavigateSection: (next) => tabs.setPatientSection(patientId, next),
      onOpenAdminDrawer: () => setPatientInfoOpen(true),
      onUpdatePreferences: persistPreferences,
    }),
    [orders, companionData, showToast, handleEncounterSigned, tabs, persistPreferences],
  );

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {screenReaderAnnouncement}
      </div>

      <main
        className={`app-shell three-row-shell density-${preferences.density} ${
          tabs.activeView === "home" ? "view-zen-home" : ""
        } ${preferences.privacyMode ? "privacy-mode-active" : ""}`}
      >
        <WorkspaceTopBar
          topbarRef={topbarRef}
          commandInputRef={commandInputRef}
          activeView={tabs.activeView}
          onGoToWorkspaceView={(view) => {
            if (view === "today") nav.openToday();
            else if (view === "calendar") nav.openCalendar();
            else if (view === "home") nav.openHome();
            navTabs.goToWorkspaceView(view);
          }}
          omnibox={omnibox}
          voice={voice}
          preferences={preferences}
          practiceTemplates={prefsController.practiceTemplates}
          onOpenCustomizer={() => prefsController.setCustomizerOpen(true)}
          onOpenClinicalMonitoring={() => setClinicalMonitoringOpen(true)}
          onResetDefaults={prefsController.handleResetDefaults}
          onApplyTemplate={prefsController.handleApplyTemplate}
          onApplyFavorite={prefsController.handleApplyFavorite}
          onSaveFavorite={prefsController.handleSaveFavorite}
          onDeleteFavorite={prefsController.handleDeleteFavorite}
          onSavePracticeDefault={prefsController.handleSavePracticeDefault}
          onDeletePracticeDefault={prefsController.handleDeletePracticeDefault}
          onSplitScreenPatient={(patientId) => {
            tabs.splitScreenPatient(patientId);
            showToast(
              `Split screen opened with ${findRosterPatient(patientId, roster)?.name ?? patientId}`,
              3000,
            );
          }}
          onOpenComposer={orders.openComposer}
          onJumpCalendarDate={companion.handleJumpCalendarDate}
          onOpenPatient={nav.openPatient}
          onDraftLabOrder={orders.draftLabOrder}
        />

        <section
          className={`workspace ${
            companion.activeCompanionPanel !== null ? "with-companion" : ""
          } ${preferences.showCompanionRail ? "" : "without-companion-rail"}`}
        >
          <WorkspaceTabStrip
            tabStripRef={tabStripRef}
            draggedId={tabs.draggedId}
            detachedPatientIds={tabs.detachedPatientIds}
            dockPatient={tabs.dockPatient}
            dashboardTabOpen={navTabs.dashboardTabOpen}
            calendarTabOpen={navTabs.calendarTabOpen}
            globalModuleOpen={navTabs.globalModuleOpen}
            activeView={tabs.activeView}
            openModuleTabs={navTabs.openModuleTabs}
            openModuleView={navTabs.openModuleView}
            dockedPatientIds={tabs.dockedPatientIds}
            roster={roster}
            activePatientId={tabs.activePatientId}
            patientSections={tabs.patientSections}
            onGoToWorkspaceView={(view) => {
              if (view === "today") nav.openToday();
              else if (view === "calendar") nav.openCalendar();
              else if (view === "home") nav.openHome();
              else if (view === "patient") {
                if (tabs.activePatientId) {
                  nav.openPatient(
                    tabs.activePatientId,
                    tabs.patientSections[tabs.activePatientId] ?? "Overview",
                  );
                }
              }
              navTabs.goToWorkspaceView(view);
            }}
            onCloseDashboardTab={navTabs.closeDashboardTab}
            onCloseCalendarTab={navTabs.closeCalendarTab}
            onCloseModuleTab={navTabs.closeModuleTab}
            onSelectPatientTab={(patientId) => {
              tabs.setActivePatientId(patientId);
              nav.openPatient(
                patientId,
                tabs.patientSections[patientId] ?? "Overview",
              );
              navTabs.goToWorkspaceView("patient");
            }}
            onClosePatientTab={tabs.closePatient}
            startPatientDrag={tabs.startPatientDrag}
            reorderTab={tabs.reorderTab}
            setDraggedId={tabs.setDraggedId}
            onSelectWorkspace={(destination) => {
              if (destination === "home") {
                nav.openHome();
                navTabs.goToWorkspaceView("home");
              } else if (destination === "dashboard") {
                nav.openToday();
                navTabs.goToWorkspaceView("today");
              } else if (destination === "calendar") {
                nav.openCalendar();
                navTabs.goToWorkspaceView("calendar");
              } else if (destination === "patients") {
                if (tabs.activePatientId) {
                  tabs.setActivePatientId(tabs.activePatientId);
                  nav.openPatient(
                    tabs.activePatientId,
                    tabs.patientSections[tabs.activePatientId] ?? "Overview",
                  );
                  navTabs.goToWorkspaceView("patient");
                } else if (roster[0]?.id) {
                  tabs.setActivePatientId(roster[0].id);
                  nav.openPatient(
                    roster[0].id,
                    tabs.patientSections[roster[0].id] ?? "Overview",
                  );
                  navTabs.goToWorkspaceView("patient");
                }
              } else {
                nav.openGlobalModule(destination as GlobalWorkspaceModule);
              }
            }}
            onOpenPatientChart={(patientId) => {
              tabs.setActivePatientId(patientId);
              nav.openPatient(
                patientId,
                tabs.patientSections[patientId] ?? "Overview",
              );
              navTabs.goToWorkspaceView("patient");
            }}
          />

          <div
            className={`workspace-body ${
              tabs.draggedId && !tabs.detachedPatientIds.includes(tabs.draggedId)
                ? "tab-drag-active"
                : ""
            }`}
            onDragOver={(event) => {
              if (tabs.draggedId && !tabs.detachedPatientIds.includes(tabs.draggedId)) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              if (!tabs.draggedId || tabs.detachedPatientIds.includes(tabs.draggedId)) return;
              event.preventDefault();
              tabs.detachPatient(tabs.draggedId);
            }}
          >
            {tabs.draggedId && !tabs.detachedPatientIds.includes(tabs.draggedId) && (
              <div className="detach-drop-hint">
                Drop here to open this patient side by side
              </div>
            )}

            {tabs.activeView === "home" ? (
              <section className="primary-workspace-pane zen-home-pane">
                <ZenHomeWindow
                  onNavigateShortcut={(shortcut: string) => {
                    if (shortcut === "clinical" || shortcut === "ehr") {
                      nav.openToday();
                    } else if (shortcut === "calendar" || shortcut === "schedule") {
                      nav.openCalendar();
                    } else {
                      nav.openGlobalModule(shortcut as GlobalWorkspaceModule);
                    }
                  }}
                  onOpenPatientChart={(patientId: string, section?: Section) => {
                    nav.openPatient(patientId, section ?? "Overview");
                  }}
                />
              </section>
            ) : tabs.activeView === "calendar" ? (
              <section className="primary-workspace-pane calendar-primary-workspace">
                <CalendarWorkspace onClose={navTabs.closeCalendarTab} />
              </section>
            ) : tabs.activeView === "today" || !activePatient ? (
              <section className="primary-workspace-pane">
                <TodayDashboard
                  surface="dashboard"
                  preferences={preferences}
                  onUpdatePreferences={persistPreferences}
                  onOpenCustomizer={() => prefsController.setCustomizerOpen(true)}
                  onStartVisit={(patientId, patientName, appointmentId) => {
                    noteVisitStartedFromSchedule(patientId, appointmentId);
                    nav.openPatient(patientId, "Encounter");
                    announce(`Started encounter for ${patientName}`);
                  }}
                  onOpenChart={(patientId, targetSection) => {
                    nav.openPatient(patientId, targetSection);
                  }}
                  onDraftLabOrder={(patientName: string, labName: string) => {
                    const target =
                      roster.find((p: Patient) => p.name === patientName) ?? activePatient;
                    if (target) orders.draftLabOrder(target.id, labName);
                  }}
                />
              </section>
            ) : (
              <PatientChartSurface
                patient={activePatient}
                section={tabs.section}
                onSectionChange={tabs.setSection}
                columnsOpen={columnsOpen}
                setColumnsOpen={setColumnsOpen}
                preferences={preferences}
                onOpenPatientInformation={() => setPatientInfoOpen(true)}
                onOpenCustomizer={() => prefsController.setCustomizerOpen(true)}
                stagedOrdersCount={
                  (orders.byPatient[activePatient.id] || []).length
                }
                onOpenOrderCart={() => orders.openComposer(activePatient.id, "cart")}
                onNavigateView={navTabs.goToWorkspaceView}
                actions={primaryPatientActions}
              />
            )}

            {tabs.detachedPatientIds.map((id) => {
              const patient = findRosterPatient(id, roster);
              if (!patient) return null;
              const paneSection = tabs.patientSections[id] ?? "Overview";

              return (
                <DetachedPatientPane
                  key={id}
                  patient={patient}
                  paneSection={paneSection}
                  preferences={preferences}
                  onPatientSectionChange={tabs.setPatientSection}
                  onStartPatientDrag={tabs.startPatientDrag}
                  onDragEnd={() => tabs.setDraggedId(null)}
                  onDockPatient={tabs.dockPatient}
                  onClosePatient={tabs.closePatient}
                  actions={getDetachedPatientActions(id)}
                />
              );
            })}
          </div>
        </section>

        <WorkspaceCompanionRail
          showCompanionRail={preferences.showCompanionRail}
          addToolMenuOpen={companion.addToolMenuOpen}
          setAddToolMenuOpen={companion.setAddToolMenuOpen}
          companionAddRef={companion.companionAddRef}
          companionRailWidth={companion.companionRailWidth}
          handleCompanionWidth={companion.handleCompanionWidth}
          companionTools={companionTools}
          activeCompanionPanel={companion.activeCompanionPanel}
          toggleCompanionPanel={companion.toggleCompanionPanel}
          companionContextMenu={companion.companionContextMenu}
          setCompanionContextMenu={companion.setCompanionContextMenu}
          pins={pins}
          togglePinnedTool={togglePinnedTool}
          onHideRail={() =>
            persistPreferences({ ...preferences, showCompanionRail: false })
          }
          onShowRail={() =>
            persistPreferences({ ...preferences, showCompanionRail: true })
          }
        />

        <CompanionPanelHost
          activeCompanionPanel={companion.activeCompanionPanel}
          companionPanelWidth={companion.companionPanelWidth}
          handlePanelWidthChange={companion.handlePanelWidthChange}
          closeCompanionPanel={companion.closeCompanionPanel}
          togglePinnedTool={togglePinnedTool}
          activePatient={contextualPatient}
          workspaceContext={workspaceContext}
          section={tabs.section}
          activeView={tabs.activeView}
          globalAiPrompt={globalAiPrompt}
          preferences={preferences}
          persistPreferences={persistPreferences}
          onOpenCustomizer={() => prefsController.setCustomizerOpen(true)}
          onNavigateSection={(sec) => tabs.setSection(sec)}
          onSplitScreen={(targetId) => tabs.splitScreenPatient(targetId)}
          onNotify={showToast}
          workingData={companionData}
          roster={roster}
          calendarJumpDate={companion.calendarJumpDate}
          onOpenPrescribeFor={(patientId) => orders.openComposer(patientId, "prescribe")}
          onStageLabFor={orders.stageLabOrder}
          stagedOrderCountFor={orders.countFor}
          onReviewOrdersFor={(patientId) => orders.openComposer(patientId, "cart")}
          onOpenOrderCart={(tab, prefill) => {
            if (contextualPatient) orders.openComposer(contextualPatient.id, tab, prefill);
          }}
          companionPresentation={companion.companionPresentation}
          onExpandCompanion={companion.expandCompanionPanel}
          onRedockCompanion={companion.redockCompanionPanel}
        />

        {prefsController.customizerOpen && (
          <WorkspaceCustomizer
            isOpen
            onClose={() => prefsController.setCustomizerOpen(false)}
            preferences={preferences}
            workspaceContext={workspaceContext}
            onUpdatePreferences={persistPreferences}
            onToast={(msg) => showToast(msg, 2800)}
          />
        )}

        {clinicalMonitoringOpen && (
          <ClinicalMonitoringSettingsModal
            isOpen
            onClose={() => setClinicalMonitoringOpen(false)}
            patientId={contextualPatient?.id}
            patientName={contextualPatient?.name}
            onSaved={(message) => showToast(message, 3200)}
          />
        )}

        {orderModalPatient && (
          <OrderCartModal
            isOpen={orders.composerOpen}
            onClose={orders.closeComposer}
            patient={orderModalPatient}
            stagedOrders={orders.byPatient[orders.composerPatientId] || []}
            onUpdateStagedOrders={(updated) =>
              orders.setStagedForPatient(orders.composerPatientId, updated)
            }
            onOrderTransmitted={(receipt) => {
              showToast(`Orders authorized and dispatched! ${receipt.summaryText}`, 5000);
            }}
            initialTab={orders.composerTab}
            prefillLab={orders.composerPrefillLab}
          />
        )}

        {patientInfoOpen && activePatient && (
          <PatientInformationDrawer
            key={activePatient.id}
            patientId={activePatient.id}
            patientName={activePatient.name}
            onClose={() => setPatientInfoOpen(false)}
          />
        )}

        {workspaceMessage && <div className="workspace-toast">{workspaceMessage}</div>}
      </main>
    </>
  );
}
