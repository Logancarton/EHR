"use client";

import { useCallback, useEffect, useState } from "react";
import {
  initialScratchNotes,
  initialTasks,
  type ClinicalTask,
  type ScratchNote,
} from "../domain/tasks";
import { api } from "./api-client";

export interface UseCompanionWorkingDataOptions {
  activePatientId?: string;
  onNotify?: (message: string, holdMs?: number) => void;
}

export interface CompanionWorkingData {
  scratchpadNotes: ScratchNote[];
  newNoteText: string;
  setNewNoteText: React.Dispatch<React.SetStateAction<string>>;
  tasks: ClinicalTask[];
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
  const [scratchpadNotes, setScratchpadNotes] = useState<ScratchNote[]>(initialScratchNotes);
  const [newNoteText, setNewNoteText] = useState("");
  const [tasks, setTasks] = useState<ClinicalTask[]>(initialTasks);
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

  // Hydrate tasks and scratch notes from backend
  useEffect(() => {
    api.tasks
      .list()
      .then((remoteTasks) => {
        if (remoteTasks && remoteTasks.length > 0) setTasks(remoteTasks);
      })
      .catch(() => {});

    api.tasks
      .getScratchNotes()
      .then((remoteNotes) => {
        if (remoteNotes && remoteNotes.length > 0) setScratchpadNotes(remoteNotes);
      })
      .catch(() => {});
  }, []);

  const handleAddNote = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const newNote: ScratchNote = {
        id: `note-${Date.now()}`,
        text,
        time: "Just now",
        color: "note-yellow",
        patientId: activePatientId,
      };
      setScratchpadNotes((prev) => [newNote, ...prev]);
      setNewNoteText("");
      api.tasks.createScratchNote(text, "note-yellow", activePatientId).catch(() => {});
    },
    [activePatientId],
  );

  const handleDeleteNote = useCallback((id: string) => {
    setScratchpadNotes((prev) => prev.filter((n) => n.id !== id));
    api.tasks.deleteScratchNote(id).catch(() => {});
  }, []);

  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
    api.tasks.toggle(id).catch(() => {});
  }, []);

  const handleAddTask = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const newTask: ClinicalTask = {
        id: `task-${Date.now()}`,
        text,
        completed: false,
        due: "Today",
        patientId: activePatientId,
      };
      setTasks((prev) => [...prev, newTask]);
      setNewTaskText("");
      api.tasks.create(text, activePatientId, "Today").catch(() => {});
      onNotify?.(`Added task: "${text}"`, 3000);
    },
    [activePatientId, onNotify],
  );

  const handleAnswerPhq = useCallback((index: number, score: number) => {
    setPhqAnswers((prev) => ({ ...prev, [index]: score }));
  }, []);

  return {
    scratchpadNotes,
    newNoteText,
    setNewNoteText,
    tasks,
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
