"use client";

import { type ClinicalTask } from "../../domain/tasks";

export default function TasksPanel({
  tasks,
  newTaskText,
  setNewTaskText,
  onToggleTask,
  onAddTask,
  onClose,
}: {
  tasks: ClinicalTask[];
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#d3e3fd", color: "#0b57d0" }}>✓</span>
          <div>
            <strong>Tasks &amp; Follow-ups</strong>
            <small>Personal clinical action list</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="tasks-container">
        <div className="tasks-add-box">
          <input
            placeholder="Add a clinical task..."
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddTask(newTaskText);
            }}
          />
          <button type="button" onClick={() => onAddTask(newTaskText)}>
            ＋
          </button>
        </div>

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
      </div>
    </aside>
  );
}
