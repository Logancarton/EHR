"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  type RosterPatient,
  findRosterPatient,
  usePatientRoster,
} from "../lib/patient-roster";
import type { PatientMessageThread, MessageCategory } from "../domain/messages";
import type { ClinicalTask } from "../domain/tasks";
import { api } from "../lib/api-client";
import {
  GLOBAL_WORKSPACE_MODULES,
  type GlobalWorkspaceModule,
  navigateToPatientLocation,
} from "../lib/workspace-navigation";
import { sanitizeWorkspaceState } from "../lib/workspace-state";
import PrescriptionOperationsWorkspace from "./PrescriptionOperationsWorkspace";
import PracticeStaffWorkspace from "./global/PracticeStaffWorkspace";
import AsyncSection from "./ui/AsyncSection";
import Button from "./ui/Button";
import Icon from "./ui/Icon";

type InboxRow = {
  patientId: string;
  patientName: string;
  patientMrn: string;
  thread: PatientMessageThread;
};

type InboxFilter = "all" | "unread" | "priority" | "refill";

function timestampValue(value: string) {
  const normalized = value.replace("·", "").replace(/\s+/g, " ").trim();
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moduleTitle(module: GlobalWorkspaceModule) {
  return {
    inbox: "Inbox",
    tasks: "Tasks",
    documents: "Documents",
    labs: "Labs",
    prescribing: "Prescribing Operations",
    billing: "Billing",
    reports: "Reports",
    settings: "Settings",
  }[module];
}

/**
 * A destination that does not exist yet.
 *
 * It is deliberately plain about that. The previous version described what the
 * screen would someday do and then announced that "the workspace shell is active",
 * which reads as progress rather than as an empty room — a clinician who clicked
 * Billing to check a claim learned nothing except that they had wasted the click.
 *
 * These are withheld from the launcher (see `status: "planned"` in the tool
 * registry), so this is only reached through a stale saved rail or a direct link.
 */
function ModuleNotBuilt({ module }: { module: Exclude<GlobalWorkspaceModule, "inbox" | "tasks" | "prescribing"> }) {
  const intent: Record<typeof module, string> = {
    documents: "collecting scanned records, forms and releases that still need review or chart placement",
    labs: "surfacing new, abnormal and unacknowledged results across the practice",
    billing: "staged claims, payer responses, denials, balances and reconciliation",
    reports: "practice, quality and utilization views over the existing record",
    settings: "preferences, integrations, security and organization configuration",
  };

  return (
    <section className="global-module-placeholder">
      <div className="global-module-placeholder-icon"><Icon name="construction" size="lg" /></div>
      <h2>{moduleTitle(module)} is not built yet</h2>
      <p>
        Nothing here works. When it exists it will cover {intent[module]}. Until then this
        destination is kept out of the launcher so it cannot be mistaken for a finished screen.
      </p>
    </section>
  );
}

/**
 * The practice task queue.
 *
 * This was previously read-only: rows rendered, the check glyph was decoration,
 * and clicking did nothing unless the task happened to carry a patient id — which
 * none of the seeded practice tasks do. A queue you cannot work is not a queue.
 * Completing, adding and removing all go through the authoritative task API, which
 * already supported them.
 */
function GlobalTasksWorkspace({ tasks, loading, onChanged, roster }: {
  tasks: ClinicalTask[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  roster: readonly RosterPatient[];
}) {
  const [filter, setFilter] = useState<"open" | "completed" | "all">("open");
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const openTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  const visible = filter === "open" ? openTasks : filter === "completed" ? completedTasks : tasks;

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That task change could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await run("new", () => api.tasks.create(text));
  }

  return (
    <div className="global-tasks-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{openTasks.length}</strong><span>Open</span></div>
        <div><strong>{completedTasks.length}</strong><span>Completed</span></div>
        <div><strong>{tasks.filter((task) => task.patientId).length}</strong><span>Patient-linked</span></div>
      </div>

      <form className="global-task-compose" onSubmit={addTask}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a practice task…"
          aria-label="Add a practice task"
        />
        {draft.trim() ? (
          <Button type="submit" variant="primary" loading={busyId === "new"} loadingLabel="Adding…">
            Add task
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled disabledReason="Type a task first.">
            Add task
          </Button>
        )}
      </form>

      <div className="global-task-filters" role="group" aria-label="Filter tasks">
        {(["open", "completed", "all"] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "open" ? `Open (${openTasks.length})`
              : value === "completed" ? `Completed (${completedTasks.length})`
              : `All (${tasks.length})`}
          </Button>
        ))}
      </div>

      <div className="global-task-list">
        <AsyncSection
          loading={loading}
          error={error || null}
          isEmpty={visible.length === 0}
          hasLoadedOnce={tasks.length > 0}
          loadingMessage="Loading tasks…"
          emptyMessage={
            filter === "open" ? "Nothing open. Every task in the queue is done."
              : filter === "completed" ? "No tasks have been completed yet."
              : "No tasks are currently in the authoritative task queue."
          }
          onRetry={() => { setError(""); void onChanged(); }}
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

function GlobalInboxWorkspace({ rows, loading, error, onRefresh, roster }: {
  rows: InboxRow[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  roster: readonly RosterPatient[];
}) {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | MessageCategory>("all");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      const { thread } = row;
      if (filter === "unread" && thread.unreadCount <= 0) return false;
      if (filter === "priority" && thread.urgency !== "urgent" && thread.urgency !== "high") return false;
      if (filter === "refill" && thread.category !== "refill") return false;
      if (category !== "all" && thread.category !== category) return false;
      if (!normalized) return true;
      const searchable = [
        row.patientName,
        row.patientMrn,
        thread.subject,
        thread.aiTriageSummary,
        thread.clinicalIntent,
        thread.category,
        thread.urgency,
      ].join(" ").toLowerCase();
      return searchable.includes(normalized);
    });
  }, [rows, filter, query, category]);

  const unread = rows.reduce((sum, row) => sum + row.thread.unreadCount, 0);
  const priority = rows.filter((row) => row.thread.urgency === "urgent" || row.thread.urgency === "high").length;

  return (
    <div className="global-inbox-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{unread}</strong><span>Unread</span></div>
        <div><strong>{priority}</strong><span>Priority</span></div>
        <div><strong>{rows.length}</strong><span>Threads</span></div>
      </div>

      <div className="global-inbox-toolbar">
        <div className="global-filter-group">
          {(["all", "unread", "priority", "refill"] as InboxFilter[]).map((value) => (
            <Button
              key={value}
              size="sm"
              pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "unread" ? "Unread" : value === "priority" ? "Priority" : "Refills"}
            </Button>
          ))}
        </div>
        <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} aria-label="Filter inbox by category">
          <option value="all">All categories</option>
          <option value="refill">Refills</option>
          <option value="symptom-check">Symptom checks</option>
          <option value="scheduling">Scheduling</option>
          <option value="general">General</option>
        </select>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search patient, subject, intent…"
          aria-label="Search global inbox"
        />
        <Button className="global-refresh-btn" icon="refresh" loading={loading} loadingLabel="Refreshing…" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      <div className="global-inbox-list">
        <AsyncSection
          loading={loading}
          error={error || null}
          isEmpty={filtered.length === 0}
          hasLoadedOnce={rows.length > 0}
          loadingMessage="Loading patient message threads…"
          emptyMessage={
            rows.length === 0
              ? "No patient message threads are waiting."
              : "No message threads match these filters."
          }
          onRetry={onRefresh}
        >
          {filtered.map(({ patientId, patientName, patientMrn, thread }) => (
            <button
              type="button"
              key={`${patientId}:${thread.id}`}
              className={`global-inbox-row ${thread.unreadCount > 0 ? "unread" : ""}`}
              onClick={async () => {
                await navigateToPatientLocation(patientId, "Messages", thread.subject);
                if (thread.unreadCount > 0) {
                  api.messages.markRead(thread.id, patientId).catch(() => {});
                }
              }}
            >
              <span className="global-inbox-avatar">{findRosterPatient(patientId, roster)?.initials || "•"}</span>
              <span className="global-inbox-main">
                <span className="global-inbox-row-top">
                  <strong>{patientName}</strong>
                  <small>{patientMrn}</small>
                  <span className={`global-urgency ${thread.urgency}`}>{thread.urgency}</span>
                  <time>{thread.lastMessageAt}</time>
                </span>
                <b>{thread.subject}</b>
                <p>{thread.messages[thread.messages.length - 1]?.content || thread.aiTriageSummary}</p>
                <span className="global-inbox-meta">{thread.category.replace("-", " ")} · {thread.messages[0]?.channel === "sms" ? "SMS" : "Portal"}{thread.unreadCount ? ` · ${thread.unreadCount} unread` : ""}</span>
              </span>
              <span className="global-row-arrow">→</span>
            </button>
          ))}
        </AsyncSection>
      </div>
    </div>
  );
}

async function readSavedModule(): Promise<GlobalWorkspaceModule | null> {
  try {
    const response = await fetch("/api/workspace-state", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.success === false) return null;
    const state = sanitizeWorkspaceState(payload.state);
    const view = state?.activeView;
    return view && GLOBAL_WORKSPACE_MODULES.has(view as GlobalWorkspaceModule)
      ? view as GlobalWorkspaceModule
      : null;
  } catch {
    return null;
  }
}

async function persistModuleView(module: GlobalWorkspaceModule) {
  try {
    const response = await fetch("/api/workspace-state", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || payload.success === false) return;
    const state = sanitizeWorkspaceState(payload.state);
    if (!state) return;
    await fetch("/api/workspace-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: { ...state, activeView: module, savedAt: new Date().toISOString() } }),
    });
  } catch {
    // Shell persistence is a progressive enhancement and must not interrupt clinical work.
  }
}

export default function GlobalWorkspaceShell() {
  // The practice queues span every chart this clinician can reach, so they are built
  // from the accessible roster rather than from a client-side patient list.
  const { patients: roster, status: rosterStatus } = usePatientRoster();
  const [activeModule, setActiveModule] = useState<GlobalWorkspaceModule | null>(null);
  const [inboxRows, setInboxRows] = useState<InboxRow[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [tasks, setTasks] = useState<ClinicalTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  async function loadInbox() {
    setInboxLoading(true);
    setInboxError("");
    try {
      const results = await Promise.allSettled(
        roster.map(async (patient) => ({ patient, threads: await api.messages.list(patient.id) })),
      );
      const rows: InboxRow[] = [];
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { patient, threads } = result.value;
        for (const thread of threads) {
          rows.push({ patientId: patient.id, patientName: patient.name, patientMrn: patient.mrn, thread });
        }
      }
      rows.sort((a, b) => timestampValue(b.thread.lastMessageAt) - timestampValue(a.thread.lastMessageAt));
      setInboxRows(rows);
      if (!rows.length && results.some((result) => result.status === "rejected")) {
        setInboxError("The global message queue could not be loaded from the backend.");
      }
      const unread = rows.reduce((sum, row) => sum + row.thread.unreadCount, 0);
      window.dispatchEvent(new CustomEvent("ehr-sidebar-badges", { detail: { inbox: unread } }));
    } finally {
      setInboxLoading(false);
    }
  }

  async function loadTasks() {
    setTasksLoading(true);
    try {
      const next = await api.tasks.list();
      setTasks(next);
      const openCount = next.filter((task) => !task.completed).length;
      window.dispatchEvent(new CustomEvent("ehr-sidebar-badges", { detail: { tasks: openCount } }));
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }

  // The inbox is one request per accessible chart, so it waits for the roster and
  // reloads if access changes rather than running against an empty list on mount.
  useEffect(() => {
    if (rosterStatus !== "ready") return;
    void loadInbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterStatus, roster]);

  useEffect(() => {
    void loadTasks();

    function handleSwitch(event: Event) {
      const view = (event as CustomEvent<{ view?: string }>).detail?.view;
      if (view === "documents" || view === "labs") {
        setActiveModule(null);
        return;
      }
      if (view && GLOBAL_WORKSPACE_MODULES.has(view as GlobalWorkspaceModule)) {
        const module = view as GlobalWorkspaceModule;
        setActiveModule(module);
        window.setTimeout(() => void persistModuleView(module), 1200);
        return;
      }
      if (view === "today" || view === "schedule" || view === "patient" || view === "patients") {
        setActiveModule(null);
      }
    }

    function handleClose() {
      setActiveModule(null);
    }

    window.addEventListener("ehr-switch-view", handleSwitch);
    window.addEventListener("ehr-global-module-close", handleClose);

    void readSavedModule().then((module) => {
      if (!module || module === "documents" || module === "labs") return;
      setActiveModule(module);
      window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: module } }));
    });

    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitch);
      window.removeEventListener("ehr-global-module-close", handleClose);
    };
  }, []);

  if (!activeModule) return null;

  return (
    <section className="global-module-shell" data-active-module={activeModule} aria-label={`${moduleTitle(activeModule)} workspace`}>
      <header className="global-module-header">
        <div>
          <span className="eyebrow">Practice Workspace</span>
          <h1>{moduleTitle(activeModule)}</h1>
        </div>
        <button
          type="button"
          className="global-module-close"
          onClick={() => {
            setActiveModule(null);
            window.dispatchEvent(new CustomEvent("ehr-sidebar-clear-active"));
          }}
          aria-label={`Close ${moduleTitle(activeModule)} workspace`}
        >
          ×
        </button>
      </header>

      <div className="global-module-content">
        {activeModule === "inbox" ? (
          <GlobalInboxWorkspace rows={inboxRows} loading={inboxLoading} error={inboxError} roster={roster} onRefresh={() => void loadInbox()} />
        ) : activeModule === "tasks" ? (
          <GlobalTasksWorkspace tasks={tasks} loading={tasksLoading} onChanged={loadTasks} roster={roster} />
        ) : activeModule === "prescribing" ? (
          <PrescriptionOperationsWorkspace />
        ) : activeModule === "settings" ? (
          <PracticeStaffWorkspace />
        ) : (
          <ModuleNotBuilt module={activeModule} />
        )}
      </div>
    </section>
  );
}
