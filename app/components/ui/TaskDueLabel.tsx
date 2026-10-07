"use client";

import { describeTaskDue } from "../../domain/task-due";
import { practiceToday } from "../../lib/practice-calendar";

/** " · Due today", " · Overdue · Oct 6": the task's due state on the practice clock. */
export default function TaskDueLabel({ due, completed }: { due: string | null | undefined; completed: boolean }) {
  const view = describeTaskDue(due, practiceToday(), completed);
  return (
    <span className={`task-due-label${view.overdue ? " is-overdue" : ""}`} data-task-overdue={view.overdue ? "true" : undefined}>
      {` · ${view.label}`}
    </span>
  );
}
