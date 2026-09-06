"use client";

import { useEffect, useMemo, useState } from "react";
import { patients } from "../domain/patient";
import type { PatientMessageThread, MessageCategory } from "../domain/messages";
import type { ClinicalTask } from "../domain/tasks";
import { api } from "../lib/api-client";
import {
  GLOBAL_WORKSPACE_MODULES,
  type GlobalWorkspaceModule,
  navigateToPatientLocation,
} from "../lib/workspace-navigation";
import { sanitizeWorkspaceState } from "../lib/workspace-state";

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
    billing: "Billing",
    reports: "Reports",
    settings: "Settings",
  }[module];
}

function ModulePlaceholder({ module }: { module: Exclude<GlobalWorkspaceModule, "inbox" | "tasks"> }) {
  const descriptions: Record<typeof module, string> = {
    documents: "A global document queue will collect scanned records, outside records, forms, releases, and files that still need review or chart placement.",
    labs: "A global results queue will surface new, abnormal, overdue, and unacknowledged labs across the practice from the authoritative clinical record.",
    billing: "Billing will become the operational claim workspace for staged claims, payer responses, denials, patient balances, and reconciliation.",
    reports: "Reports will provide practice, clinical quality, utilization, and revenue views without changing the underlying chart data.",
    settings: "Settings will manage provider preferences, integrations, security, workspace layouts, and organization configuration.",
  };

  return (
    <section className="global-module-placeholder">
      <div className="global-module-placeholder-icon">◇</div>
      <h2>{moduleTitle(module)}</h2>
      <p>{descriptions[module]}</p>
      <div className="global-module-status-card">
        <strong>Workspace shell is active.</strong>
        <span>This destination now opens as a real application workspace instead of a sidebar toast. Its authoritative backend queue is the next layer to connect.</span>
      </div>
    </section>
  );
}

function GlobalTasksWorkspace({ tasks, loading }: { tasks: ClinicalTask[]; loading: boolean }) {
  const openTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);

  return (
    <div className="global-tasks-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{openTasks.length}</strong><span>Open</span></div>
        <div><strong>{completedTasks.length}</strong><span>Completed</span></div>
        <div><strong>{tasks.filter((task) => task.patientId).length}</strong><span>Patient-linked</span></div>
      </div>
      <div className="global-task-list">
        {loading ? (
          <div className="global-empty-state">Loading tasks…</div>
        ) : tasks.length === 0 ? (
          <div className="global-empty-state">No tasks are currently in the authoritative task queue.</div>
        ) : (
          tasks.map((task) => {
            const patient = task.patientId ? patients.find((item) => item.id === task.patientId) : undefined;
            return (
              <button
                type="button"
                key={task.id}
                className={`global-task-row ${task.completed ? "completed" : ""}`}
                onClick={() => {
                  if (patient) void navigateToPatientLocation(patient.id, "Overview");
                }}
              >
                <span className="global-task-check">{task.completed ? "✓" : "○"}</span>
                <span className="global-task-copy">
                  <strong>{task.text}</strong>
                  <small>{patient ? `${patient.name} · ${patient.mrn}` : "Practice task"}{task.due ? ` · ${task.due}` : ""}</small>
                </span>
                {patient ? <span className="global-row-arrow">→</span> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function GlobalInboxWorkspace({ rows, loading, error, onRefresh }: {
  rows: InboxRow[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
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
            <button
              type="button"
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All" : value === "unread" ? "Unread" : value === "priority" ? "Priority" : "Refills"}
            </button>
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
        <button type="button" className="global-refresh-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {error ? <div className="global-inline-error">{error}</div> : null}
      <div className="global-inbox-list">
        {loading ? (
          <div className="global-empty-state">Loading patient message threads…</div>
        ) : filtered.length === 0 ? (
          <div className="global-empty-state">No message threads match these filters.</div>
        ) : (
          filtered.map(({ patientId, patientName, patientMrn, thread }) => (
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
              <span className="global-inbox-avatar">{patients.find((patient) => patient.id === patientId)?.initials || "•"}</span>
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
          ))
        )}
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
        patients.map(async (patient) => ({ patient, threads: await api.messages.list(patient.id) })),
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

  useEffect(() => {
    void loadInbox();
    void loadTasks();

    function handleSwitch(event: Event) {
      const view = (event as CustomEvent<{ view?: string }>).detail?.view;
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
      if (!module) return;
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
          <GlobalInboxWorkspace rows={inboxRows} loading={inboxLoading} error={inboxError} onRefresh={() => void loadInbox()} />
        ) : activeModule === "tasks" ? (
          <GlobalTasksWorkspace tasks={tasks} loading={tasksLoading} />
        ) : (
          <ModulePlaceholder module={activeModule} />
        )}
      </div>
    </section>
  );
}
