"use client";

import { useState, type FormEvent } from "react";
import type { ClinicalTask } from "../../domain/tasks";
import type { Patient } from "../../domain/patient";
import { findRosterPatient } from "../../lib/patient-roster";
import { api } from "../../lib/api-client";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import {
  WORKSPACE_TASKS_UPDATED_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type TaskFilter = "open" | "completed" | "patient-linked" | "all";

/**
 * The practice task queue — one implementation, two presentations.
 *
 * It was once read-only: rows rendered, the check glyph was decoration, and clicking
 * did nothing unless the task happened to carry a patient id — which none of the
 * seeded practice tasks do. A queue you cannot work is not a queue, so completing,
 * adding and removing all go through the authoritative task API, which already
 * supported them. That is why this is worth sharing rather than re-implementing.
 *
 * UI-7b made the right companion the owner of Tasks, and a companion that owns a
 * capability has to be able to do the whole of it when it is expanded to the main
 * canvas. Rather than grow a second queue inside the companion, the queue the
 * `tasks` module renders moved here and both surfaces render it: the module shell
 * and `TasksPanel`'s expanded presentation. Two views of one queue, not two task
 * truths (see D-089).
 *
 * Filter and draft are owned by the caller so they can outlive this component. The
 * companion redocks by unmounting the expanded presentation, and a filter the
 * clinician chose has to survive that; the docked panel holds both instead.
 *
 * Completing and removing are the same act from either surface, so they stay here
 * and announce themselves with `ehr-tasks-updated`. Adding is not: a task added
 * from a chart-side companion belongs to that patient, and one added from the
 * practice queue belongs to the practice. `onAddTask` therefore owns the whole
 * add, including announcing it, so that one add produces one reload.
 */
export default function PracticeTaskQueue({
  tasks,
  loading,
  loadError,
  loadWarning,
  hasLoadedOnce,
  onReload,
  roster,
  filter,
  onFilterChange,
  draft,
  onDraftChange,
  onAddTask,
  composePlaceholder = "Add a practice task…",
}: {
  tasks: readonly ClinicalTask[];
  loading: boolean;
  loadError: string;
  loadWarning: string;
  hasLoadedOnce: boolean;
  onReload: () => void | Promise<void>;
  roster: readonly Patient[];
  filter: TaskFilter;
  onFilterChange: (filter: TaskFilter) => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  onAddTask: (text: string) => void | Promise<void>;
  composePlaceholder?: string;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState("");

  const openTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  /**
   * "Patient-linked" used to be a third number on a tile with nothing behind it:
   * it named a subset of the queue the clinician could not then look at. It is a
   * filter now, so the count and the thing it counts are the same control.
   */
  const patientLinkedTasks = tasks.filter((task) => Boolean(task.patientId));
  const visible =
    filter === "open" ? openTasks
      : filter === "completed" ? completedTasks
      : filter === "patient-linked" ? patientLinkedTasks
      : tasks;

  /** Counts are a claim about the queue, so they wait for the queue to load. */
  const countsKnown = hasLoadedOnce && !loadError;
  const count = (value: number) => (countsKnown ? ` (${value})` : "");

  /**
   * A change is announced rather than handed back to one caller, because both
   * presentations of this queue and the shell's open-task count are listening. The
   * listeners reload; nothing they do dispatches this again, so it cannot cycle.
   */
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setMutationError("");
    try {
      await action();
      dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
    } catch {
      setMutationError("That task change could not be saved. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setBusyId("new");
    setMutationError("");
    try {
      await onAddTask(text);
    } catch {
      setMutationError("That task could not be added. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="global-tasks-workspace">
      <form className="global-task-compose" onSubmit={addTask}>
        {/* Adding to a queue that has not answered yet would be adding to something
            unknown, and the companion's own compose box has always refused it. It
            says so rather than accepting the click and doing nothing. */}
        <input
          value={draft}
          disabled={!hasLoadedOnce}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={composePlaceholder}
          aria-label={composePlaceholder.replace("…", "")}
        />
        {!hasLoadedOnce ? (
          <Button type="submit" variant="primary" disabled disabledReason="The queue has not answered yet.">
            Add task
          </Button>
        ) : draft.trim() ? (
          <Button type="submit" variant="primary" loading={busyId === "new"} loadingLabel="Adding…">
            Add task
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled disabledReason="Type a task first.">
            Add task
          </Button>
        )}
      </form>

      {/*
        The counts live on the filters that produce them. They were previously
        also stacked above as three large tiles, which spent the top of the queue
        restating two numbers the filters already carried and one — patient-linked
        — that nothing could act on (DASH-13). A queue that has not answered yet
        has no counts, so the filters carry no number rather than zero until it
        has (DASH-11).
      */}
      <div className="global-task-filters" role="group" aria-label="Filter tasks">
        {(["open", "completed", "patient-linked", "all"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            pressed={filter === value}
            onClick={() => onFilterChange(value)}
          >
            {value === "open" ? `Open${count(openTasks.length)}`
              : value === "completed" ? `Completed${count(completedTasks.length)}`
              : value === "patient-linked" ? `Patient-linked${count(patientLinkedTasks.length)}`
              : `All${count(tasks.length)}`}
          </Button>
        ))}
      </div>

      {loadWarning ? <InlineError message={loadWarning} onRetry={() => void onReload()} /> : null}
      <div className="global-task-list">
        <AsyncSection
          loading={loading}
          error={mutationError || loadError || null}
          isEmpty={visible.length === 0}
          hasLoadedOnce={hasLoadedOnce}
          loadingMessage="Loading tasks…"
          emptyMessage={
            filter === "open" ? "Nothing open. Every task in the queue is done."
              : filter === "completed" ? "No tasks have been completed yet."
              : filter === "patient-linked" ? "No task in the queue is linked to a patient chart."
              : "No tasks are currently in the authoritative task queue."
          }
          onRetry={() => { setMutationError(""); void onReload(); }}
        >
          {visible.map((task) => {
            const patient = findRosterPatient(task.patientId, roster);
            const busy = busyId === task.id;
            return (
              <div key={task.id} className={`global-task-row ${task.completed ? "completed" : ""}`}>
                <button
                  type="button"
                  className="global-task-check"
                  disabled={busy}
                  aria-pressed={task.completed}
                  title={task.completed ? "Mark as not done" : "Mark as done"}
                  aria-label={task.completed ? `Mark "${task.text}" as not done` : `Mark "${task.text}" as done`}
                  onClick={() => void run(task.id, () => api.tasks.toggle(task.id, task.patientId))}
                >
                  {task.completed ? <Icon name="check" /> : "○"}
                </button>

                <span className="global-task-copy">
                  <strong>{task.text}</strong>
                  <small>
                    {patient ? `${patient.name} · ${patient.mrn}` : "Practice task"}
                    {task.due ? ` · ${task.due}` : ""}
                  </small>
                </span>

                {patient && (
                  <button
                    type="button"
                    className="global-task-open"
                    disabled={busy}
                    onClick={() => void navigateToPatientLocation(patient.id, "Overview")}
                  >
                    Open chart →
                  </button>
                )}

                <button
                  type="button"
                  className="global-task-delete"
                  disabled={busy}
                  title="Remove this task"
                  aria-label={`Remove "${task.text}"`}
                  onClick={() => void run(task.id, () => api.tasks.delete(task.id, task.patientId))}
                >
                  <Icon name="close" />
                </button>
              </div>
            );
          })}
        </AsyncSection>
      </div>
    </div>
  );
}
