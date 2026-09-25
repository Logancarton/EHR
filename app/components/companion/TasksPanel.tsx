"use client";

import { useState } from "react";
import { type ClinicalTask } from "../../domain/tasks";
import type { Patient } from "../../domain/patient";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Icon from "../ui/Icon";
import PracticeTaskQueue, { type TaskFilter } from "../workspace/PracticeTaskQueue";
import CompanionPanelFrame from "./CompanionPanelFrame";

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
}: {
  tasks: ClinicalTask[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  onRetry: () => void;
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (text: string) => void | Promise<void>;
  onClose: () => void;
  onUnpin?: () => void;
  roster?: readonly Patient[];
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onOpenWorkspace?: () => void;
}) {
  const [filter, setFilter] = useState<TaskFilter>("open");
  const openCount = tasks.filter((task) => !task.completed).length;

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
              placeholder="Add a clinical task…"
              aria-label="New task"
              value={newTaskText}
              disabled={!hasLoaded || loading}
              onChange={(e) => setNewTaskText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAddTask(newTaskText);
              }}
            />
            <button
              type="button"
              aria-label="Add task"
              title="Add task"
              disabled={!hasLoaded || loading}
              onClick={() => void onAddTask(newTaskText)}
            >
              <Icon name="add" size="sm" />
            </button>
          </div>

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
          {tasks.map((task) => (
            <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => onToggleTask(task.id)}
                aria-label={`Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`}
              />
              <div className="task-content">
                <strong>{task.text}</strong>
                <small>{task.due}</small>
              </div>
            </div>
          ))}
          </AsyncSection>
        </>
      )}
    </CompanionPanelFrame>
  );
}
