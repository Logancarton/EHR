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
  newNoteText: string;
  setNewNoteText: React.Dispatch<React.SetStateAction<string>>;
  tasks: ClinicalTask[];
  tasksLoading: boolean;
  tasksError: string | null;
  tasksHasLoaded: boolean;
  retryTasks: () => void;
  newTaskText: string;
  setNewTaskText: React.Dispatch<React.SetStateAction<string>>;
  /**
   * Rating-scale answers keyed by `patientId:instrument`. Every scale starts
   * blank: a pre-filled answer set would be a fabricated score one click away
   * from the chart, and a workspace-wide set would carry one patient's answers
   * into another patient's assessment.
   */
  assessmentAnswers: Record<string, Record<number, number>>;
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
  const [newNoteText, setNewNoteText] = useState("");
  const [tasks, setTasks] = useState<ClinicalTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [tasksHasLoaded, setTasksHasLoaded] = useState(false);
  const [newTaskText, setNewTaskText] = useState("");
  const [assessmentAnswers, setAssessmentAnswers] = useState<Record<string, Record<number, number>>>({});

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
      void api.tasks
        .createScratchNote(trimmed, "note-yellow", patientId)
        .then((created) => {
          setScratchpadNotes((prev) => [created, ...prev]);
          setNewNoteText("");
        })
        .catch(() => {
          onNotify?.("Scratchpad note was not saved. Try again.", 3000);
        });
    },
    [onNotify, scratchpadHasLoaded],
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
      await api.tasks
        .create(trimmed, activePatientId, "Today")
        .then((created) => {
          setTasks((prev) => [...prev, created]);
          setNewTaskText("");
          dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
          onNotify?.(`Added task: "${trimmed}"`, 3000);
        })
        .catch(() => {
          onNotify?.("Task was not added. Try again.", 3000);
        });
    },
    [activePatientId, onNotify, tasksHasLoaded],
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
    tasks,
    tasksLoading,
    tasksError,
    tasksHasLoaded,
    retryTasks: () => { void loadTasks(); },
    newTaskText,
    setNewTaskText,
    assessmentAnswers,
    handleAddNote,
    handleDeleteNote,
    handleToggleTask,
    handleAddTask,
    handleAssessmentAnswer,
  };
}
