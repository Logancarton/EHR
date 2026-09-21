"use client";

import CompanionPanelHeader from "../companion/CompanionPanelHeader";
import CompanionResizeHandle from "../ui/CompanionResizeHandle";
import ClinicalAiPanel from "../companion/ClinicalAiPanel";
import ScratchpadPanel from "../companion/ScratchpadPanel";
import TasksPanel from "../companion/TasksPanel";
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
import type { Patient, Section } from "../../domain/patient";
import type { WorkspaceView } from "../../lib/use-patient-tabs";
import type { ProviderPreferences } from "../../lib/preference-engine";

import PatientMessages from "../patient/PatientMessages";
import CommunicationCompanionPanel from "../companion/CommunicationCompanionPanel";

export interface CompanionPanelHostProps {
  activeCompanionPanel: CompanionToolId | null;
  companionPanelWidth: number;
  handlePanelWidthChange: (w: number) => void;
  closeCompanionPanel: () => void;
  togglePinnedTool: (side: RailSideKey, id: string) => void;
  activePatient: Patient | null | undefined;
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
  companionPresentation = "docked",
  onExpandCompanion,
  onRedockCompanion,
}: CompanionPanelHostProps) {
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

      {/* Clinical AI reads one chart. With none open it says so rather than
          answering about a patient the clinician never chose. */}
      {activeCompanionPanel === "ai" && !activePatient && (
        <aside className="companion-panel">
          <CompanionPanelHeader
            title="Clinical AI"
            context="Chart-aware assistance"
            icon="auto_awesome"
            onClose={closeCompanionPanel}
            onUnpin={() => {
              togglePinnedTool("right", "ai");
              closeCompanionPanel();
            }}
            unpinLabel="Unpin Clinical AI"
          />
          <div className="companion-empty-state">
            <p>Open a patient chart to ask Clinical AI about it.</p>
          </div>
        </aside>
      )}

      {activeCompanionPanel === "ai" && activePatient && (
        <ClinicalAiPanel
          patient={activePatient}
          section={section}
          isScheduleView={activeView === "today" || activeView === "calendar"}
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
            if (activePatient) {
              dispatchWorkspaceEvent(WORKSPACE_INSERT_TO_NOTE_EVENT, {
                text,
                patientId: activePatient.id,
              });
            }
            onNotify?.("Inserted AI clinical synthesis into note!", 2400);
          }}
          onSplitScreen={onSplitScreen}
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
          onClose={closeCompanionPanel}
          onUnpin={() => {
            togglePinnedTool("right", "tasks");
            closeCompanionPanel();
          }}
        />
      )}

      {activeCompanionPanel === "calc" && (
        <CalculatorPanel
          patientId={activePatient?.id}
          answers={workingData.phqAnswers}
          onAnswer={workingData.handleAnswerPhq}
          onInsertToNote={(summary) => {
            onNotify?.(`Copied "${summary}" to clinical clipboard!`, 2200);
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
              onAddTask={(text) => workingData.handleAddTask(text)}
              onToast={(msg) => onNotify?.(msg, 2400)}
            />
          </div>
        </section>
      )}

      {activeCompanionPanel === "communication" && (
        <CommunicationCompanionPanel
          activePatient={activePatient}
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
