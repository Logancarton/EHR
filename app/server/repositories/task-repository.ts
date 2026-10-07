import { getDatabase } from "../db/connection";
import { type ClinicalTask } from "../../domain/tasks";
import { resolveTaskDue, storedTaskDue } from "../../domain/task-due";
import { practiceDateOf, practiceToday } from "../../lib/practice-calendar";

/** Legacy rows hold words ("Today"); they are read against the day they were made. */
function taskFromRow(r: any): ClinicalTask {
  const createdOn = r.created_at ? practiceDateOf(new Date(r.created_at)) : practiceToday();
  return {
    id: r.id,
    patientId: r.patient_id || undefined,
    text: r.text,
    completed: Boolean(r.completed),
    due: storedTaskDue(r.due_date, createdOn),
  };
}

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
    return rows.map(taskFromRow);
  },

  createTask(task: { text: string; patientId?: string; due?: string }): ClinicalTask {
    const db = getDatabase();
    const id = `task-${Date.now()}`;
    const now = new Date().toISOString();
    // Resolved once, now: "Today" means this practice day, not every future one.
    const due = resolveTaskDue(task.due, practiceToday());

    db.prepare(`
      INSERT INTO tasks (id, patient_id, text, completed, due_date, type, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, 'task', ?, ?)
    `).run(id, task.patientId || null, task.text, due, now, now);

    return {
      id,
      patientId: task.patientId,
      text: task.text,
      completed: false,
      due,
    };
  },

  toggleTask(id: string): ClinicalTask | null {
    const db = getDatabase();
    const existing = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!existing) return null;

    const nextCompleted = existing.completed ? 0 : 1;
    const now = new Date().toISOString();

    db.prepare("UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?").run(nextCompleted, now, id);

    return taskFromRow({ ...existing, completed: nextCompleted });
  },

  deleteTask(id: string): boolean {
    const db = getDatabase();
    const res = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return res.changes > 0;
  },
};
