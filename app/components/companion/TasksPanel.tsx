"use client";

import { type ClinicalTask } from "../../domain/tasks";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Icon from "../ui/Icon";

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
}: {
  tasks: ClinicalTask[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  onRetry: () => void;
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (text: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
}) {
  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#d3e3fd", color: "#0b57d0" }}><Icon name="check" /></span>
          <div>
            <strong>Tasks &amp; Follow-ups</strong>
            <small>Personal clinical action list</small>
          </div>
        </div>
        <div className="companion-header-actions">
          {onUnpin && (
            <button
              type="button"
              className="companion-unpin-btn"
              title="Unpin Tasks from companion rail"
              aria-label="Unpin Tasks"
              onClick={onUnpin}
            >
              <Icon name="keep_off" size="sm" />
            </button>
          )}
          <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="tasks-container">
        <div className="tasks-add-box">
          <input
            placeholder="Add a clinical task..."
            value={newTaskText}
            disabled={!hasLoaded || loading}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddTask(newTaskText);
            }}
          />
          <button type="button" disabled={!hasLoaded || loading} onClick={() => onAddTask(newTaskText)}>
            ＋
          </button>
        </div>

        {error && hasLoaded ? <InlineError message={error} onRetry={onRetry} /> : null}
        <AsyncSection
          loading={loading}
          error={!hasLoaded ? error : null}
          isEmpty={tasks.length === 0}
          hasLoadedOnce={hasLoaded}
          loadingMessage="Loading tasks…"
          emptyMessage="No tasks are currently in your authoritative task list."
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
      </div>
    </aside>
  );
}
