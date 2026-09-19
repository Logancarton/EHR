"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type ClinicalTask,
  type ScratchNote,
} from "../domain/tasks";
import {
  WORKSPACE_TASKS_UPDATED_EVENT,
  dispatchWorkspaceEvent,
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
  phqAnswers: Record<number, number>;
  handleAddNote: (text: string) => void;
  handleDeleteNote: (id: string) => void;
  handleToggleTask: (id: string) => void;
  handleAddTask: (text: string) => void;
  handleAnswerPhq: (index: number, score: number) => void;
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
  const [phqAnswers, setPhqAnswers] = useState<Record<number, number>>({
    0: 2,
    1: 1,
    2: 2,
    3: 2,
    4: 1,
    5: 1,
    6: 1,
    7: 0,
    8: 0,
  });

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

  const handleAddNote = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !scratchpadHasLoaded) return;
      void api.tasks
        .createScratchNote(trimmed, "note-yellow", activePatientId)
        .then((created) => {
          setScratchpadNotes((prev) => [created, ...prev]);
          setNewNoteText("");
        })
        .catch(() => {
          onNotify?.("Scratchpad note was not saved. Try again.", 3000);
        });
    },
    [activePatientId, onNotify, scratchpadHasLoaded],
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

  const handleAddTask = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !tasksHasLoaded) return;
      void api.tasks
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

  const handleAnswerPhq = useCallback((index: number, score: number) => {
    setPhqAnswers((prev) => ({ ...prev, [index]: score }));
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
    phqAnswers,
    handleAddNote,
    handleDeleteNote,
    handleToggleTask,
    handleAddTask,
    handleAnswerPhq,
  };
}
