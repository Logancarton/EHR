import { getDatabase } from "../db/connection";
import { type ClinicalTask, type ScratchNote } from "../../domain/tasks";

export const TaskRepository = {
  getTasks(patientId?: string): ClinicalTask[] {
    const db = getDatabase();
    let query = "SELECT * FROM tasks WHERE type = 'task'";
    const params: any[] = [];

    if (patientId) {
      query += " AND patient_id = ?";
      params.push(patientId);
    }
    query += " ORDER BY completed ASC, created_at DESC";

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id || undefined,
      text: r.text,
      completed: Boolean(r.completed),
      due: r.due_date || "Today",
    }));
  },

  createTask(task: { text: string; patientId?: string; due?: string }): ClinicalTask {
    const db = getDatabase();
    const id = `task-${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, patient_id, text, completed, due_date, type, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, 'task', ?, ?)
    `).run(id, task.patientId || null, task.text, task.due || "Today", now, now);

    return {
      id,
      patientId: task.patientId,
      text: task.text,
      completed: false,
      due: task.due || "Today",
    };
  },

  toggleTask(id: string): ClinicalTask | null {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!existing) return null;

    const nextCompleted = existing.completed ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare("UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?").run(nextCompleted, now, id);

    return {
      id: existing.id,
      patientId: existing.patient_id || undefined,
      text: existing.text,
      completed: Boolean(nextCompleted),
      due: existing.due_date || "Today",
    };
  },

  deleteTask(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return res.changes > 0;
  },

  getScratchNotes(): ScratchNote[] {
    const db = getDatabase();
    const rows = db.prepare("SELECT * FROM tasks WHERE type = 'scratchpad' ORDER BY created_at DESC").all() as any[];
    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id || undefined,
      text: r.text,
      time: r.updated_at ? new Date(r.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Today",
      color: r.color || "note-yellow",
    }));
  },

  createScratchNote(note: { text: string; color?: string; patientId?: string }): ScratchNote {
    const db = getDatabase();
    const id = `sn-${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tasks (id, patient_id, text, completed, type, color, created_at, updated_at)
      VALUES (?, ?, ?, 0, 'scratchpad', ?, ?, ?)
    `).run(id, note.patientId || null, note.text, note.color || "note-yellow", now, now);

    return {
      id,
      patientId: note.patientId,
      text: note.text,
      time: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      color: note.color || "note-yellow",
    };
  },

  deleteScratchNote(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM tasks WHERE id = ? AND type = 'scratchpad'").run(id);
    return res.changes > 0;
  },
};
