"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ClinicalTask,
  type ScratchNote,
} from "../domain/tasks";
import {
  WORKSPACE_TASKS_UPDATED_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "./workspace-events";
import { api } from "./api-client";
import {
  type ScopedDraftStore,
  draftScopeFor,
  textDraft,
  useScopedDrafts,
} from "./use-scoped-drafts";
import { inFlightKey, useInFlight } from "./use-in-flight";
import { hasUnsentDraft, useWarnBeforeLeaving } from "./use-warn-before-leaving";

export interface UseCompanionWorkingDataOptions {
  activePatientId?: string;
  onNotify?: (message: string, holdMs?: number) => void;
}

export interface CompanionWorkingData {
  scratchpadNotes: ScratchNote[];
  scratchpadLoading: boolean;
  scratchpadError: string | null;
  scratchpadHasLoaded: boolean;
  retryScratchpad: () => void;
  /**
   * The Scratchpad draft for the chart in front (or the practice). Drafts are kept
   * per patient, so changing charts shows that chart's draft rather than carrying
   * this one across (CB-6c).
   */
  newNoteText: string;
  setNewNoteText: React.Dispatch<React.SetStateAction<string>>;
  /**
   * Who the Scratchpad draft is about: a patient id, or `""` for a practice note.
   * Kept with the draft, so a note marked "practice" stays a practice note.
   */
  newNoteTarget: string;
  setNewNoteTarget: (target: string) => void;
  /** The Scratchpad draft in front is being saved; Add note waits (CB-6e). */
  noteSaving: boolean;
  tasks: ClinicalTask[];
  tasksLoading: boolean;
  tasksError: string | null;
  tasksHasLoaded: boolean;
  retryTasks: () => void;
  /** The task draft for the chart in front (or the practice), kept per patient. */
  newTaskText: string;
  setNewTaskText: React.Dispatch<React.SetStateAction<string>>;
  /** The task draft in front is being saved; Add task waits (CB-6e). */
  taskSaving: boolean;
  /**
   * Rating-scale answers keyed by `patientId:instrument`. Every scale starts
   * blank: a pre-filled answer set would be a fabricated score one click away
   * from the chart, and a workspace-wide set would carry one patient's answers
   * into another patient's assessment.
   */
  assessmentAnswers: Record<string, Record<number, number>>;
  /**
   * The Messages companion's reply drafts (per patient and thread) and open thread
   * (per patient). The panel unmounts when another tool is chosen, so they are held
   * here, where they outlive it (CB-6).
   */
  messageReplyDrafts: ScopedDraftStore<string>;
  messageOpenThreads: ScopedDraftStore<string>;
  /** `patientId` omitted means a practice note that belongs to no patient. */
  handleAddNote: (text: string, patientId?: string) => void;
  handleDeleteNote: (id: string) => void;
  handleToggleTask: (id: string) => void;
  handleAddTask: (text: string) => Promise<void>;
  handleAssessmentAnswer: (key: string, questionId: number, score: number) => void;
}

/**
 * Manages working state for companion tools: Scratchpad notes, practice/patient tasks,
 * and clinical assessment calculators (e.g. PHQ-9).
 */
export function useCompanionWorkingData({
  activePatientId,
  onNotify,
}: UseCompanionWorkingDataOptions = {}): CompanionWorkingData {
  const [scratchpadNotes, setScratchpadNotes] = useState<ScratchNote[]>([]);
  const [scratchpadLoading, setScratchpadLoading] = useState(true);
  const [scratchpadError, setScratchpadError] = useState<string | null>(null);
  const [scratchpadHasLoaded, setScratchpadHasLoaded] = useState(false);
  const [tasks, setTasks] = useState<ClinicalTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksHasLoaded, setTasksHasLoaded] = useState(false);
  const [assessmentAnswers, setAssessmentAnswers] = useState<Record<string, Record<number, number>>>({});

  // CB-6c: drafts belong to the patient they were typed for. The scope is read
  // when a save starts, so a chart switch while it is in flight cannot redirect
  // it or clear another patient's draft.
  const draftScope = draftScopeFor(activePatientId);
  const { drafts: noteTexts, write: writeNoteText } = useScopedDrafts<string>();
  const { drafts: noteTargets, write: writeNoteTarget } = useScopedDrafts<string>();
  const { drafts: taskTexts, write: writeTaskText } = useScopedDrafts<string>();
  const messageReplyDrafts = useScopedDrafts<string>();
  // Drafts are in memory, so a refresh would lose them: the browser asks first
  // (CB-6h). Every patient's drafts count, not only the chart in front. A draft
  // leaves its store only when its save succeeds, so this also covers a save
  // still in flight.
  useWarnBeforeLeaving(
    hasUnsentDraft(noteTexts) || hasUnsentDraft(taskTexts) || hasUnsentDraft(messageReplyDrafts.drafts),
  );
  const { begin: beginNoteSave, end: endNoteSave, isInFlight: isNoteSaving } = useInFlight();
  const { begin: beginTaskSave, end: endTaskSave, isInFlight: isTaskSaving } = useInFlight();
  const messageOpenThreads = useScopedDrafts<string>();

  const newNoteText = noteTexts[draftScope] ?? "";
  const newNoteTarget = noteTargets[draftScope] ?? activePatientId ?? "";
  const newTaskText = taskTexts[draftScope] ?? "";

  const setNewNoteText = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (next) =>
      writeNoteText(draftScope, (current) =>
        textDraft(typeof next === "function" ? next(current ?? "") : next),
      ),
    [draftScope, writeNoteText],
  );
  const setNewNoteTarget = useCallback(
    (target: string) => writeNoteTarget(draftScope, target),
    [draftScope, writeNoteTarget],
  );
  const setNewTaskText = useCallback<React.Dispatch<React.SetStateAction<string>>>(
    (next) =>
      writeTaskText(draftScope, (current) =>
        textDraft(typeof next === "function" ? next(current ?? "") : next),
      ),
    [draftScope, writeTaskText],
  );

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    setTasksError(null);
    try {
      const remoteTasks = await api.tasks.list();
      setTasks(remoteTasks);
      setTasksHasLoaded(true);
    } catch {
      setTasksError("Tasks could not be loaded. Try again.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadScratchpad = useCallback(async () => {
    setScratchpadLoading(true);
    setScratchpadError(null);
    try {
      const remoteNotes = await api.tasks.getScratchNotes();
      setScratchpadNotes(remoteNotes);
      setScratchpadHasLoaded(true);
    } catch {
      setScratchpadError("Scratchpad notes could not be loaded. Try again.");
    } finally {
      setScratchpadLoading(false);
    }
  }, []);

  // Backend results are authoritative, including a successful empty list.
  useEffect(() => {
    void loadTasks();
    void loadScratchpad();
  }, [loadScratchpad, loadTasks]);

  /**
   * The task queue has more than one surface — this companion docked, the same
   * companion expanded to the main canvas, and the `tasks` module — so a change made
   * on any of them has to reach the others. They all announce with this event and
   * reload from the server rather than trading optimistic copies of a list. Reloading
   * does not announce, so this cannot cycle.
   */
  useEffect(
    () => subscribeWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT, () => { void loadTasks(); }),
    [loadTasks],
  );

  const handleAddNote = useCallback(
    (text: string, patientId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || !scratchpadHasLoaded) return;
      const scope = draftScope;
      const saveKey = inFlightKey(scope, trimmed);
      if (!beginNoteSave(saveKey)) return;
      void api.tasks
        .createScratchNote(trimmed, "note-yellow", patientId)
        .then((created) => {
          setScratchpadNotes((prev) => [created, ...prev]);
          // Clear the draft that was saved, and only if it is still that text.
          writeNoteText(scope, (current) => (current?.trim() === trimmed ? undefined : current));
          writeNoteTarget(scope, undefined);
        })
        .catch(() => {
          onNotify?.("Scratchpad note was not saved. Try again.", 3000);
        })
        .finally(() => endNoteSave(saveKey));
    },
    [beginNoteSave, draftScope, endNoteSave, onNotify, scratchpadHasLoaded, writeNoteTarget, writeNoteText],
  );

  const handleDeleteNote = useCallback((id: string) => {
    if (!scratchpadHasLoaded) return;
    void api.tasks
      .deleteScratchNote(id)
      .then(() => {
        setScratchpadNotes((prev) => prev.filter((note) => note.id !== id));
      })
      .catch(() => {
        onNotify?.("Scratchpad note could not be deleted. Try again.", 3000);
      });
  }, [onNotify, scratchpadHasLoaded]);

  const handleToggleTask = useCallback((id: string) => {
    if (!tasksHasLoaded) return;
    void api.tasks
      .toggle(id)
      .then((updated) => {
        setTasks((prev) => prev.map((task) => (task.id === id ? updated : task)));
        dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
      })
      .catch(() => {
        onNotify?.("Task change was not saved. Try again.", 3000);
      });
  }, [onNotify, tasksHasLoaded]);

  // The caller awaits this so a compose control can show that the add is in flight;
  // the promise resolves when the server has answered, not when the click happened.
  const handleAddTask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !tasksHasLoaded) return;
      const scope = draftScope;
      const saveKey = inFlightKey(scope, trimmed);
      if (!beginTaskSave(saveKey)) return;
      await api.tasks
        .create(trimmed, activePatientId, "Today")
        .then((created) => {
          setTasks((prev) => [...prev, created]);
          // Other surfaces (a message's "add task") call this with their own text;
          // only the composer draft that was actually submitted is cleared.
          writeTaskText(scope, (current) => (current?.trim() === trimmed ? undefined : current));
          dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
          onNotify?.(`Added task: "${trimmed}"`, 3000);
        })
        .catch(() => {
          onNotify?.("Task was not added. Try again.", 3000);
        })
        .finally(() => endTaskSave(saveKey));
    },
    [activePatientId, beginTaskSave, draftScope, endTaskSave, onNotify, tasksHasLoaded, writeTaskText],
  );

  const handleAssessmentAnswer = useCallback((key: string, questionId: number, score: number) => {
    setAssessmentAnswers((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [questionId]: score } }));
  }, []);

  return {
    scratchpadNotes,
    scratchpadLoading,
    scratchpadError,
    scratchpadHasLoaded,
    retryScratchpad: () => { void loadScratchpad(); },
    newNoteText,
    setNewNoteText,
    newNoteTarget,
    setNewNoteTarget,
    noteSaving: isNoteSaving(inFlightKey(draftScope, newNoteText)),
    tasks,
    tasksLoading,
    tasksError,
    tasksHasLoaded,
    retryTasks: () => { void loadTasks(); },
    newTaskText,
    setNewTaskText,
    taskSaving: isTaskSaving(inFlightKey(draftScope, newTaskText)),
    assessmentAnswers,
    messageReplyDrafts,
    messageOpenThreads,
    handleAddNote,
    handleDeleteNote,
    handleToggleTask,
    handleAddTask,
    handleAssessmentAnswer,
  };
}
