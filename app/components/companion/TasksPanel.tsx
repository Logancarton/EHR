"use client";

import { useRef, useState } from "react";
import { findRosterPatient } from "../../lib/patient-roster";
import { type ClinicalTask } from "../../domain/tasks";
import type { Patient } from "../../domain/patient";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Icon from "../ui/Icon";
import PracticeTaskQueue, { type TaskFilter } from "../workspace/PracticeTaskQueue";
import CompanionPanelFrame from "./CompanionPanelFrame";

const DUE_OPTIONS = ["Today", "Tomorrow", "In 1 week", "In 2 weeks", "In 4 weeks", "No due date"] as const;

/**
 * Tasks as a companion (UI-7b, D-089).
 *
 * Docked, this is the short list it has always been: what is outstanding, beside
 * whatever the clinician is doing, with one box to add to it. Expanded, it is the
 * whole practice queue — the same `PracticeTaskQueue` the `tasks` module renders,
 * with its filters, its patient links and its removals. One capability at two
 * densities rather than a companion that can only look at a queue somebody else
 * works.
 *
 * Filter and draft live here rather than inside the expanded queue, because
 * redocking unmounts that presentation and the canonical companion lifecycle
 * requires a clinician's filter and half-typed task to survive it.
 */
export default function TasksPanel({
  tasks,
  loading,
  error,
  hasLoaded,
  onRetry,
  newTaskText,
  setNewTaskText,
  onToggleTask,
  onAddTask,
  onClose,
  onUnpin,
  roster = [],
  isExpanded = false,
  onExpand,
  onRedock,
  onOpenWorkspace,
  draftTargetName = null,
  draftTargetId = null,
  newTaskTarget,
  setNewTaskTarget,
  saving = false,
}: {
  tasks: ClinicalTask[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  onRetry: () => void;
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  onToggleTask: (id: string) => void;
  /** `patientId` null files a practice task; omitted means the chart in front. */
  onAddTask: (text: string, due?: string, patientId?: string | null) => void | Promise<void>;
  onClose: () => void;
  onUnpin?: () => void;
  roster?: readonly Patient[];
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onOpenWorkspace?: () => void;
  /**
   * The patient a new task will be linked to — the chart in front — or null for a
   * practice task. Shown under the box, because the draft belongs to that patient
   * (CB-6c) and the clinician should not have to infer it from the tab strip.
   */
  draftTargetName?: string | null;
  draftTargetId?: string | null;
  /**
   * Who the docked draft is for — a patient id or "" for the practice — held by
   * the caller per chart so it survives redocking. Without it the draft follows
   * the chart in front, as it always has.
   */
  newTaskTarget?: string;
  setNewTaskTarget?: (target: string) => void;
  /** This draft is being saved; Add task reports it and does not send again (CB-6e). */
  saving?: boolean;
}) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  const [due, setDue] = useState<(typeof DUE_OPTIONS)[number]>("Today");
  const [nudge, setNudge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openCount = tasks.filter((task) => !task.completed).length;
  const target = newTaskTarget ?? draftTargetId ?? "";
  const targetName = target
    ? target === draftTargetId
      ? draftTargetName
      : findRosterPatient(target, roster)?.name ?? "Unlisted patient"
    : null;
  // Open work first: a docked list of 20+ rows with the finished ones mixed in
  // buries what is still owed.
  const orderedTasks = [...tasks].sort((a, b) => Number(a.completed) - Number(b.completed));

  /**
   * The + used to do nothing at all with an empty box, which read as a broken
   * button. Empty, it now puts the cursor in the box and says what it needs;
   * with text, it adds — for the patient and due date chosen below.
   */
  function addFromComposer() {
    if (!newTaskText.trim()) {
      setNudge(true);
      inputRef.current?.focus();
      return;
    }
    setNudge(false);
    void onAddTask(newTaskText, due, target || null);
  }

  return (
    <CompanionPanelFrame
      rootProps={{
        "data-companion-panel": "tasks",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
      }}
      ariaLabel="Tasks"
      title="Tasks & Follow-ups"
      // "Personal clinical action list" was never true of this panel: `GET /api/tasks`
      // returns the practice queue, the same rows the module shows, and UI-7b makes
      // this the surface that owns it. A subtitle that narrows what a clinician is
      // looking at is worse here than anywhere, because there is no second door.
      context={hasLoaded ? `Practice task queue · ${openCount} open` : "Practice task queue"}
      icon="check"
      iconStyle={{ background: "#d3e3fd", color: "#0b57d0" }}
      onClose={onClose}
      onUnpin={onUnpin}
      unpinLabel="Unpin Tasks"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      bodyClassName={isExpanded ? "tasks-expanded-body" : "tasks-container"}
      footer={
        /*
          The queue is also a workspace tab, and it was reachable as one from the
          Clinical menu until UI-7b. This keeps that path: the tab is where a
          clinician who wants to work the queue while a chart stays in front of them
          goes, which a companion overlay cannot be.
        */
        onOpenWorkspace ? (
          <button type="button" className="comm-launch-workspace-btn" onClick={onOpenWorkspace}>
            <Icon name="fullscreen" size="sm" />
            <span>Open Full Tasks Workspace</span>
          </button>
        ) : undefined
      }
    >
      {isExpanded ? (
        <PracticeTaskQueue
          tasks={tasks}
          loading={loading}
          loadError={hasLoaded ? "" : error ?? ""}
          loadWarning={hasLoaded && error ? error : ""}
          hasLoadedOnce={hasLoaded}
          onReload={onRetry}
          roster={roster}
          filter={filter}
          onFilterChange={setFilter}
          draft={newTaskText}
          onDraftChange={setNewTaskText}
          onAddTask={onAddTask}
          composePlaceholder="Add a clinical task…"
        />
      ) : (
        <>
          <div className="tasks-add-box">
            <input
              ref={inputRef}
              placeholder="Add a clinical task…"
              aria-label="New task"
              aria-describedby={nudge ? "tasks-compose-nudge" : undefined}
              value={newTaskText}
              disabled={!hasLoaded || loading}
              onChange={(e) => {
                setNudge(false);
                setNewTaskText(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") addFromComposer();
              }}
            />
            <button
              type="button"
              aria-label="Add task"
              title={saving ? "Adding task…" : "Add task"}
              aria-busy={saving || undefined}
              disabled={!hasLoaded || loading}
              onClick={addFromComposer}
            >
              <Icon name="add" size="sm" />
            </button>
          </div>
          {nudge ? (
            <p id="tasks-compose-nudge" className="tasks-compose-nudge" role="status">
              Type what needs doing, then press + or Enter.
            </p>
          ) : null}
          <div className="tasks-compose-options">
            <label className="scratchpad-target">
              <span>For</span>
              <select
                value={target}
                aria-label="Who this task is for"
                disabled={!setNewTaskTarget}
                onChange={(e) => setNewTaskTarget?.(e.target.value)}
              >
                {draftTargetId ? <option value={draftTargetId}>{draftTargetName ?? "This patient"}</option> : null}
                <option value="">Practice task — no patient</option>
                {roster
                  .filter((patient) => patient.id !== draftTargetId)
                  .map((patient) => (
                    <option key={patient.id} value={patient.id}>{patient.name}</option>
                  ))}
              </select>
            </label>
            <label className="scratchpad-target">
              <span>Due</span>
              <select value={due} aria-label="When this task is due" onChange={(e) => setDue(e.target.value as typeof due)}>
                {DUE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <p className="tasks-draft-target" data-testid="task-draft-target">
            {targetName ? `New tasks link to ${targetName}` : "New tasks are practice tasks — no patient"}
          </p>

          {error && hasLoaded ? <InlineError message={error} onRetry={onRetry} /> : null}
          <AsyncSection
            loading={loading}
            error={!hasLoaded ? error : null}
            isEmpty={tasks.length === 0}
            hasLoadedOnce={hasLoaded}
            loadingMessage="Loading tasks…"
            emptyMessage="No tasks are currently in the authoritative task queue."
            onRetry={onRetry}
          >
          {orderedTasks.map((task) => (
            <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => onToggleTask(task.id)}
                aria-label={`Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`}
              />
              <div className="task-content">
                <strong title={task.text}>{task.text}</strong>
                <small>
                  {task.patientId ? findRosterPatient(task.patientId, roster)?.name ?? "Linked patient" : "Practice task"}
                  {task.due ? ` · ${task.due}` : ""}
                </small>
              </div>
            </div>
          ))}
          </AsyncSection>
        </>
      )}
    </CompanionPanelFrame>
  );
}
