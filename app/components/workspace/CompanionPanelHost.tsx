"use client";

import { useEffect, useRef, useState } from "react";
import CompanionPanelHeader from "../companion/CompanionPanelHeader";
import CompanionResizeHandle from "../ui/CompanionResizeHandle";
import ClinicalAiPanel from "../companion/ClinicalAiPanel";
import PatientToolScopeBanner from "../companion/PatientToolScopeBanner";
import ScratchpadPanel from "../companion/ScratchpadPanel";
import TasksPanel from "../companion/TasksPanel";
import PrescribingPanel from "../companion/PrescribingPanel";
import LabsCompanionPanel from "../companion/LabsCompanionPanel";
import CalculatorPanel from "../companion/CalculatorPanel";
import CalendarCompanionPanel from "../companion/CalendarCompanionPanel";
import {
  WORKSPACE_INSERT_TO_NOTE_EVENT,
  WORKSPACE_SWITCH_VIEW_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import type { CompanionToolId } from "../../lib/use-companion-rail-controller";
import type { CompanionWorkingData } from "../../lib/use-companion-working-data";
import type { RailSideKey } from "../../lib/workspace-tools";
import type { LabOrderDraftInput, StageLabOrderResult } from "../../lib/use-staged-orders";
import type { Patient, Section } from "../../domain/patient";
import type { WorkspaceView } from "../../lib/use-patient-tabs";
import type { ProviderPreferences } from "../../lib/preference-engine";
import type { WorkspaceCanvasContext } from "../../lib/workspace-canvas-context";
import { derivePatientToolScope } from "../../lib/companion-tool-scope";

import PatientMessages from "../patient/PatientMessages";
import CommunicationCompanionPanel from "../companion/CommunicationCompanionPanel";
import HrCompanionPanel from "../companion/HrCompanionPanel";

export interface CompanionPanelHostProps {
  activeCompanionPanel: CompanionToolId | null;
  companionPanelWidth: number;
  handlePanelWidthChange: (w: number) => void;
  closeCompanionPanel: () => void;
  togglePinnedTool: (side: RailSideKey, id: string) => void;
  activePatient: Patient | null | undefined;
  workspaceContext: WorkspaceCanvasContext;
  section: Section;
  activeView: WorkspaceView;
  globalAiPrompt: string;
  preferences: ProviderPreferences;
  persistPreferences: (updated: ProviderPreferences) => void;
  onOpenCustomizer: () => void;
  onNavigateSection: (sec: Section) => void;
  onSplitScreen: (targetId: string) => void;
  onNotify?: (message: string, holdMs?: number) => void;
  workingData: CompanionWorkingData;
  roster: readonly Patient[];
  calendarJumpDate: string | null;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  /**
   * Opens the prescription composer for a named patient rather than for whichever
   * chart is active. The Prescribing companion can be on a different patient from
   * the chart in front of the clinician, so it cannot use `onOpenOrderCart`, which
   * resolves the active one.
   */
  onOpenPrescribeFor?: (patientId: string) => void;
  onStageLabFor?: (patientId: string, input: LabOrderDraftInput) => StageLabOrderResult;
  stagedOrderCountFor?: (patientId: string) => number;
  onReviewOrdersFor?: (patientId: string) => void;
  companionPresentation?: "docked" | "expanded";
  onExpandCompanion?: () => void;
  onRedockCompanion?: () => void;
}

/**
 * Hosts whichever right companion tool panel is open (Clinical AI, Scratchpad,
 * Tasks, Calculators, Companion Calendar, or Messages) and its resize handle.
 */
export default function CompanionPanelHost({
  activeCompanionPanel,
  companionPanelWidth,
  handlePanelWidthChange,
  closeCompanionPanel,
  togglePinnedTool,
  activePatient,
  workspaceContext,
  section,
  activeView,
  globalAiPrompt,
  preferences,
  persistPreferences,
  onOpenCustomizer,
  onNavigateSection,
  onSplitScreen,
  onNotify,
  workingData,
  roster,
  calendarJumpDate,
  onOpenOrderCart,
  onOpenPrescribeFor,
  onStageLabFor,
  stagedOrderCountFor,
  onReviewOrdersFor,
  companionPresentation = "docked",
  onExpandCompanion,
  onRedockCompanion,
}: CompanionPanelHostProps) {
  const [aiBoundPatient, setAiBoundPatient] = useState<Patient | null>(null);
  const previousPanelRef = useRef<CompanionToolId | null>(null);

  useEffect(() => {
    const openingAi =
      activeCompanionPanel === "ai" && previousPanelRef.current !== "ai";

    if (openingAi) {
      setAiBoundPatient(
        workspaceContext.kind === "patient" && activePatient ? activePatient : null,
      );
    } else if (
      activeCompanionPanel === "ai" &&
      !aiBoundPatient &&
      workspaceContext.kind === "patient" &&
      activePatient
    ) {
      // A restored AI panel can mount before workspace restoration brings its
      // patient chart forward. Bind once the first explicit patient canvas is
      // actually foreground rather than remaining permanently unbound.
      setAiBoundPatient(activePatient);
    } else if (
      activeCompanionPanel === "ai" &&
      aiBoundPatient &&
      activePatient?.id === aiBoundPatient.id
    ) {
      // Refresh the bound chart snapshot without silently retargeting the tool.
      setAiBoundPatient(activePatient);
    }

    previousPanelRef.current = activeCompanionPanel;
  }, [
    activeCompanionPanel,
    activePatient,
    aiBoundPatient,
    workspaceContext.kind,
  ]);

  const aiScope = derivePatientToolScope({
    workspaceContext,
    boundPatient: aiBoundPatient
      ? { patientId: aiBoundPatient.id, patientName: aiBoundPatient.name }
      : null,
  });

  if (activeCompanionPanel === null) return null;

  return (
    <>
      {companionPresentation !== "expanded" && (
        <CompanionResizeHandle
          width={companionPanelWidth}
          onWidthChange={handlePanelWidthChange}
          onClose={closeCompanionPanel}
        />
      )}

      {/* Patient-scoped Clinical AI keeps the patient it was opened for. When
          another chart or a practice canvas takes the foreground, the live panel
          stays mounted (preserving draft/answer state) but is hidden behind an
          explicit parked state. That prevents silent retargeting while making the
          bound chart identity visible inside the tool itself. */}
      {activeCompanionPanel === "ai" && (
        <>
          <div
            hidden={!aiScope.canMutate}
            style={aiScope.canMutate ? { display: "contents" } : undefined}
          >
            {aiBoundPatient ? (
              <ClinicalAiPanel
                patient={aiBoundPatient}
                section={section}
                isScheduleView={false}
                command={globalAiPrompt}
                preferences={preferences}
                onUpdatePreferences={persistPreferences}
                onOpenCustomizer={onOpenCustomizer}
                onClose={closeCompanionPanel}
                onUnpin={() => {
                  togglePinnedTool("right", "ai");
                  closeCompanionPanel();
                }}
                onNavigateSection={onNavigateSection}
                onInsertToNote={(text) => {
                  if (!aiScope.canMutate) {
                    onNotify?.("Return to the pinned patient chart before inserting this AI answer.", 3200);
                    return;
                  }
                  dispatchWorkspaceEvent(WORKSPACE_INSERT_TO_NOTE_EVENT, {
                    text,
                    patientId: aiBoundPatient.id,
                  });
                  onNotify?.(`Inserted AI clinical synthesis into ${aiBoundPatient.name}'s note.`, 2400);
                }}
                onSplitScreen={onSplitScreen}
              />
            ) : null}
          </div>

          {!aiScope.canMutate && (
            <aside
              className="companion-panel companion-ai-panel"
              aria-label="Clinical AI Companion"
              data-patient-tool="clinical-ai"
              data-tool-scope-status={aiScope.status}
            >
              <CompanionPanelHeader
                title="Clinical AI Companion"
                context={
                  aiBoundPatient
                    ? `Target: ${aiBoundPatient.name} (${aiBoundPatient.id})`
                    : `Current canvas: ${workspaceContext.label}`
                }
                icon="auto_awesome"
                onClose={closeCompanionPanel}
                onUnpin={() => {
                  togglePinnedTool("right", "ai");
                  closeCompanionPanel();
                }}
                unpinLabel="Unpin Clinical AI"
              />
              <PatientToolScopeBanner scope={aiScope} />
              <div className="companion-empty-state patient-tool-parked">
                <p>
                  {aiBoundPatient
                    ? "Clinical AI is parked until this pinned patient chart is back in the foreground."
                    : "Open a patient chart, then open Clinical AI to bind it to that chart."}
                </p>
              </div>
            </aside>
          )}
        </>
      )}

      {/* D-086: the companion shows the viewer's own record; the directory is the workspace's job. */}
      {activeCompanionPanel === "hr" && (
        <HrCompanionPanel
          isExpanded={companionPresentation === "expanded"}
          onExpand={onExpandCompanion}
          onRedock={onRedockCompanion}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "hr");
            closeCompanionPanel();
          }}
          onOpenWorkspace={() => {
            dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "hr" });
          }}
        />
      )}

      {activeCompanionPanel === "scratchpad" && (
        <ScratchpadPanel
          notes={workingData.scratchpadNotes}
          loading={workingData.scratchpadLoading}
          error={workingData.scratchpadError}
          hasLoaded={workingData.scratchpadHasLoaded}
          onRetry={workingData.retryScratchpad}
          newNoteText={workingData.newNoteText}
          setNewNoteText={workingData.setNewNoteText}
          onAddNote={workingData.handleAddNote}
          onDeleteNote={workingData.handleDeleteNote}
          onInsertToNote={() => {
            onNotify?.("Copied note to clinical clipboard!", 2200);
          }}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "scratchpad");
            closeCompanionPanel();
          }}
        />
      )}

      {/* D-089: the companion owns Tasks, and its expanded presentation is the
          practice queue itself rather than a link to somebody else's copy of it. */}
      {activeCompanionPanel === "tasks" && (
        <TasksPanel
          tasks={workingData.tasks}
          loading={workingData.tasksLoading}
          error={workingData.tasksError}
          hasLoaded={workingData.tasksHasLoaded}
          onRetry={workingData.retryTasks}
          newTaskText={workingData.newTaskText}
          setNewTaskText={workingData.setNewTaskText}
          onToggleTask={workingData.handleToggleTask}
          onAddTask={workingData.handleAddTask}
          roster={roster}
          isExpanded={companionPresentation === "expanded"}
          onExpand={onExpandCompanion}
          onRedock={onRedockCompanion}
          onOpenWorkspace={() => {
            dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "tasks" });
          }}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "tasks");
            closeCompanionPanel();
          }}
        />
      )}

      {/* D-090/UI-7d: the companion owns the practice prescribing queue, because
          every action it offers needs the patient's chart alive beside it. */}
      {activeCompanionPanel === "prescribing" && (
        <PrescribingPanel
          roster={roster}
          activePatient={activePatient}
          onOpenPrescribeFor={onOpenPrescribeFor}
          isExpanded={companionPresentation === "expanded"}
          onExpand={onExpandCompanion}
          onRedock={onRedockCompanion}
          onOpenWorkspace={() => {
            dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, { view: "prescribing" });
          }}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "prescribing");
            closeCompanionPanel();
          }}
        />
      )}

      {activeCompanionPanel === "labs" && (
        <LabsCompanionPanel
          roster={roster}
          activePatient={activePatient}
          workspaceContext={workspaceContext}
          onStageLabFor={onStageLabFor}
          stagedOrderCountFor={stagedOrderCountFor}
          onReviewOrdersFor={onReviewOrdersFor}
          isExpanded={companionPresentation === "expanded"}
          onExpand={onExpandCompanion}
          onRedock={onRedockCompanion}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "labs");
            closeCompanionPanel();
          }}
        />
      )}

      {activeCompanionPanel === "calc" && (
        <CalculatorPanel
          patientId={activePatient?.id}
          patientName={activePatient?.name}
          workspaceContext={workspaceContext}
          answers={workingData.phqAnswers}
          onAnswer={workingData.handleAnswerPhq}
          onInsertToNote={(summary) => {
            if (
              !activePatient ||
              workspaceContext.kind !== "patient" ||
              workspaceContext.patientId !== activePatient.id
            ) {
              onNotify?.("Return to the pinned patient chart before inserting this assessment.", 3200);
              return;
            }

            if (workspaceContext.section !== "Encounter") {
              onNavigateSection("Encounter");
              onNotify?.(
                `Encounter opened for ${activePatient.name}. Review the target note, then press Insert again.`,
                3600,
              );
              return;
            }

            dispatchWorkspaceEvent(WORKSPACE_INSERT_TO_NOTE_EVENT, {
              text: summary,
              patientId: activePatient.id,
            });
            onNotify?.(`Inserted assessment into ${activePatient.name}'s encounter note.`, 2600);
          }}
          onAssessmentSaved={(rec) => {
            onNotify?.(
              `Recorded assessment ${rec.title}: Score ${rec.totalScore}/${rec.maxScore} (${rec.severity})`,
              3500,
            );
          }}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "calc");
            closeCompanionPanel();
          }}
        />
      )}

      {(activeCompanionPanel === "calendar" ||
        activeCompanionPanel === "schedule") && (
        <CalendarCompanionPanel
          activePatient={activePatient}
          roster={roster}
          initialDate={calendarJumpDate ?? undefined}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "calendar");
            closeCompanionPanel();
          }}
          onOpenFullCalendar={() => {
            closeCompanionPanel();
            dispatchWorkspaceEvent(WORKSPACE_SWITCH_VIEW_EVENT, {
              view: "calendar",
            });
          }}
        />
      )}

      {activeCompanionPanel === "messages" && activePatient && (
        <section
          className="companion-panel companion-messages-panel"
          data-context-tab={workspaceContext.tabId}
          aria-label="Patient messages"
        >
          <CompanionPanelHeader
            title="Messages"
            context={activePatient.name}
            icon="chat"
            onClose={closeCompanionPanel}
            closeLabel="Close messages"
            onUnpin={() => {
              togglePinnedTool("right", "messages");
              closeCompanionPanel();
            }}
            unpinLabel="Unpin Messages"
          />
          <div className="companion-panel-body">
            <PatientMessages
              patient={activePatient}
              onOpenOrderCart={(tab, prefill) => onOpenOrderCart?.(tab, prefill)}
              onAddTask={(text) => { void workingData.handleAddTask(text); }}
              onToast={(msg) => onNotify?.(msg, 2400)}
            />
          </div>
        </section>
      )}

      {activeCompanionPanel === "messages" && !activePatient && (
        <aside
          className="companion-panel companion-messages-panel"
          data-context-tab={workspaceContext.tabId}
          aria-label="Patient messages"
        >
          <CompanionPanelHeader
            title="Messages"
            context={`Current canvas: ${workspaceContext.label}`}
            icon="chat"
            onClose={closeCompanionPanel}
            closeLabel="Close messages"
            onUnpin={() => {
              togglePinnedTool("right", "messages");
              closeCompanionPanel();
            }}
            unpinLabel="Unpin Messages"
          />
          <div className="companion-empty-state">
            <p>Return to a patient chart to view or send chart-bound messages.</p>
          </div>
        </aside>
      )}

      {activeCompanionPanel === "communication" && (
        <CommunicationCompanionPanel
          activePatient={activePatient}
          workspaceContext={workspaceContext}
          roster={roster}
          isExpanded={companionPresentation === "expanded"}
          onExpand={onExpandCompanion}
          onRedock={onRedockCompanion}
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "communication");
            closeCompanionPanel();
          }}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
