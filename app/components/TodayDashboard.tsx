"use client";

import { useMemo, useState } from "react";
import {
  type ActionQueueItem,
  type AppointmentStatus,
  type ScheduleItem,
  type VisitType,
  initialActionQueue,
  initialSchedule,
} from "../lib/schedule-data";
import {
  type ProviderPreferences,
  type TodayWidgetId,
  defaultPreferences,
  builtInPresets,
  savePreferences,
} from "../lib/preference-engine";
import {
  patientLabHistory,
  calculateMonitoringStatus,
} from "../lib/clinical-protocols";

type FilterTab = "all" | "waiting" | "in-visit" | "upcoming" | "completed";

export default function TodayDashboard({
  onStartVisit,
  onOpenChart,
  onDraftLabOrder,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
}: {
  onStartVisit: (patientId: string, patientName: string) => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onDraftLabOrder?: (patientName: string, labName: string) => void;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
}) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);
  const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>(initialActionQueue);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [briefingCollapsed, setBriefingCollapsed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Appointment Form State
  const [patientChoice, setPatientChoice] = useState("jordan-reed");
  const [customName, setCustomName] = useState("");
  const [newTime, setNewTime] = useState("06:00 PM");
  const [newDuration, setNewDuration] = useState("30 min");
  const [newType, setNewType] = useState<VisitType>("30-min Med Check");
  const [newRoom, setNewRoom] = useState("Room 2");
  const [newComplaint, setNewComplaint] = useState("");

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }

  function handleStatusChange(id: string, newStatus: AppointmentStatus) {
    setSchedule((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
    const item = schedule.find((s) => s.id === id);
    if (item) {
      triggerToast(`Updated ${item.patientName} status to “${newStatus}”`);
    }
  }

  function hideWidget(key: keyof ProviderPreferences["today"], label: string) {
    if (!onUpdatePreferences) return;
    const next: ProviderPreferences = {
      ...preferences,
      today: {
        ...preferences.today,
        [key]: false,
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
    triggerToast(`Hidden ${label}. Re-enable anytime in Layout Customizer.`);
  }

  function moveWidget(widgetId: TodayWidgetId, direction: "up" | "down") {
    if (!onUpdatePreferences) return;
    const order = [...preferences.today.widgetOrder];
    const index = order.indexOf(widgetId);
    if (index === -1) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;
    const temp = order[index];
    order[index] = order[target];
    order[target] = temp;
    const next: ProviderPreferences = {
      ...preferences,
      today: {
        ...preferences.today,
        widgetOrder: order,
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
    const name =
      widgetId === "briefing"
        ? "AI Morning Briefing"
        : widgetId === "metrics"
        ? "Daily Metrics"
        : widgetId === "roster"
        ? "Encounter Roster"
        : widgetId === "queue"
        ? "Action Queue"
        : "Daily Shortcuts";
    triggerToast(`Moved ${name} ${direction}`);
  }

  function handleAddAppointment(e: React.FormEvent) {
    e.preventDefault();
    let patientId = patientChoice;
    let patientName = "Jordan Reed";
    let dob = "11/03/1986";
    let age = 39;
    let mrn = "P-10917";

    if (patientChoice === "maya-chen") {
      patientName = "Maya Chen";
      dob = "04/18/1992";
      age = 34;
      mrn = "P-10482";
    } else if (patientChoice === "jordan-reed") {
      patientName = "Jordan Reed";
      dob = "11/03/1986";
      age = 39;
      mrn = "P-10917";
    } else if (patientChoice === "sofia-martinez") {
      patientName = "Sofia Martinez";
      dob = "01/27/2008";
      age = 18;
      mrn = "P-11104";
    } else {
      patientId = (customName || "walk-in").toLowerCase().replace(/\s+/g, "-");
      patientName = customName || "Walk-in Patient";
    }

    const newItem: ScheduleItem = {
      id: `apt-${Date.now()}`,
      patientId,
      patientName,
      dob,
      age,
      mrn,
      time: newTime,
      duration: newDuration,
      type: newType,
      status: "waiting",
      chiefComplaint: newComplaint || "Walk-in psychiatric evaluation.",
      room: newRoom,
      insurance: "Commercial / Self-Pay",
    };

    setSchedule((prev) => [...prev, newItem]);
    setModalOpen(false);
    setNewComplaint("");
    triggerToast(`Added ${patientName} to today's schedule`);
  }

  // Dynamic status groupings
  const waitingPatients = useMemo(() => schedule.filter((s) => s.status === "waiting"), [schedule]);
  const inVisitPatients = useMemo(() => schedule.filter((s) => s.status === "in-visit"), [schedule]);
  const upcomingPatients = useMemo(() => schedule.filter((s) => s.status === "scheduled"), [schedule]);
  const completedPatients = useMemo(() => schedule.filter((s) => s.status === "completed"), [schedule]);

  const counts = useMemo(() => {
    return {
      all: schedule.length,
      waiting: waitingPatients.length,
      inVisit: inVisitPatients.length,
      upcoming: upcomingPatients.length,
      completed: completedPatients.length,
    };
  }, [schedule.length, waitingPatients.length, inVisitPatients.length, upcomingPatients.length, completedPatients.length]);

  // Dynamic Subtitles for 4 Metric Cards
  const totalSub = `${counts.completed} completed · ${counts.upcoming} pending`;
  const waitingSub =
    waitingPatients.length > 0
      ? `${waitingPatients[0].patientName} (${waitingPatients[0].room || waitingPatients[0].time})`
      : "No patients waiting in lobby";
  const inVisitSub =
    inVisitPatients.length > 0
      ? `${inVisitPatients[0].patientName} (${inVisitPatients[0].room || inVisitPatients[0].time})`
      : "No active encounters";
  const upcomingSub =
    upcomingPatients.length > 0
      ? `${upcomingPatients[0].patientName} (${upcomingPatients[0].time})`
      : "All scheduled visits concluded";

  // Dynamic Clinical Briefing context
  const overdueLabPatient = useMemo(() => {
    return schedule.find((item) => {
      const labs = patientLabHistory[item.patientId] || [];
      const itemMeds =
        item.patientId === "jordan-reed"
          ? ["Quetiapine (Seroquel) 100mg"]
          : item.patientId === "maya-chen"
          ? ["Guanfacine ER 2mg", "Sertraline 100mg"]
          : [];
      const status = calculateMonitoringStatus(itemMeds, labs);
      return status.some((s) => s.status === "overdue");
    });
  }, [schedule]);

  const intakePatient = useMemo(() => {
    return schedule.find((item) => item.type.toLowerCase().includes("intake"));
  }, [schedule]);

  const filteredSchedule = useMemo(() => {
    return schedule.filter((item) => {
      // Filter tab
      if (activeFilter === "waiting" && item.status !== "waiting") return false;
      if (activeFilter === "in-visit" && item.status !== "in-visit") return false;
      if (activeFilter === "upcoming" && item.status !== "scheduled") return false;
      if (activeFilter === "completed" && item.status !== "completed") return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${item.patientName} ${item.mrn} ${item.chiefComplaint} ${item.room ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [schedule, activeFilter, searchQuery]);

  const hasSidebarWidgets = preferences.today.showActionQueue || preferences.today.showQuickReferences;
  const activePresetMeta = builtInPresets[preferences.activePresetId];
  const activePresetLabel = activePresetMeta
    ? activePresetMeta.name
    : preferences.activePresetId.replace(/^custom-/, "").toUpperCase();

  // Dynamic ordering of top-level sections based on widgetOrder
  const topSections = useMemo(() => {
    const order = preferences.today.widgetOrder;
    const briefingIdx = order.indexOf("briefing");
    const metricsIdx = order.indexOf("metrics");
    const rosterIdx = order.indexOf("roster");

    const items: Array<{ id: "briefing" | "metrics" | "contentGrid"; index: number }> = [
      { id: "briefing", index: briefingIdx !== -1 ? briefingIdx : 0 },
      { id: "metrics", index: metricsIdx !== -1 ? metricsIdx : 1 },
      { id: "contentGrid", index: rosterIdx !== -1 ? rosterIdx : 2 },
    ];

    items.sort((a, b) => a.index - b.index);
    return items.map((i) => i.id);
  }, [preferences.today.widgetOrder]);

  // Dynamic ordering of sidebar cards based on widgetOrder
  const sidebarOrder = useMemo(() => {
    const order = preferences.today.widgetOrder;
    const queueIdx = order.indexOf("queue") !== -1 ? order.indexOf("queue") : 3;
    const shortcutsIdx = order.indexOf("shortcuts") !== -1 ? order.indexOf("shortcuts") : 4;
    return queueIdx <= shortcutsIdx ? (["queue", "shortcuts"] as const) : (["shortcuts", "queue"] as const);
  }, [preferences.today.widgetOrder]);

  return (
    <div className={`today-dashboard density-${preferences.density}`}>
      {/* Header Cockpit */}
      <header className="today-header">
        <div className="today-header-left">
          <div className="today-date-badge">TODAY&apos;S SCHEDULE</div>
          <h1>Friday, September 4, 2026</h1>
          <p>Dr. Logan Carton, MD · Outpatient Adult & Adolescent Psychiatry</p>
        </div>
        <div className="today-header-actions">
          {onOpenCustomizer && (
            <button
              type="button"
              className="today-btn secondary customizer-trigger-btn"
              onClick={onOpenCustomizer}
              title="Customize workspace layout and widgets"
            >
              <span className="btn-icon">⚙️</span>
              <span>
                Layout: <strong>{activePresetLabel}</strong>
              </span>
            </button>
          )}
          <button
            type="button"
            className="today-btn primary"
            onClick={() => setModalOpen(true)}
          >
            ＋ Add Walk-in / Appointment
          </button>
        </div>
      </header>

      {/* DYNAMIC TOP-LEVEL SECTIONS (Rendered in preferences.today.widgetOrder) */}
      {topSections.map((sectionId) => {
        // 1. BRIEFING SECTION
        if (sectionId === "briefing") {
          if (!preferences.today.showMorningBriefing) return null;
          const bIdx = preferences.today.widgetOrder.indexOf("briefing");
          return (
            <div
              key="briefing"
              className={`morning-briefing-card ${briefingCollapsed ? "is-collapsed" : ""}`}
            >
              <div className="morning-briefing-header">
                <div className="morning-briefing-title">
                  <span className="spark">✦</span>
                  <strong>Clinical AI Morning Briefing</strong>
                </div>
                <div className="card-header-tools">
                  <span className="morning-briefing-tag">Context Synthesized</span>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={bIdx === 0}
                    onClick={() => moveWidget("briefing", "up")}
                    title="Move briefing up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={bIdx === preferences.today.widgetOrder.length - 1}
                    onClick={() => moveWidget("briefing", "down")}
                    title="Move briefing down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    title={briefingCollapsed ? "Expand briefing" : "Collapse briefing"}
                    onClick={() => setBriefingCollapsed(!briefingCollapsed)}
                  >
                    {briefingCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    title="Hide morning briefing"
                    onClick={() => hideWidget("showMorningBriefing", "Morning briefing")}
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!briefingCollapsed && (
                <>
                  <p>
                    Good morning, Dr. Carton. You have{" "}
                    <strong>{counts.all} encounters scheduled today</strong> ({counts.completed} completed,{" "}
                    {counts.waiting} waiting in lobby).{" "}
                    {waitingPatients.length > 0 ? (
                      <>
                        <strong style={{ color: "#b3261e" }}>
                          {waitingPatients[0].patientName} ({waitingPatients[0].time})
                        </strong>{" "}
                        is arrived and waiting in {waitingPatients[0].room || "the lobby"} —{" "}
                        {overdueLabPatient?.patientId === waitingPatients[0].patientId ? (
                          <span style={{ textDecoration: "underline" }}>
                            fasting metabolic labs (Lipid panel &amp; HbA1c) are overdue by 446 days under Quetiapine protocol.
                          </span>
                        ) : (
                          <span>checked in for {waitingPatients[0].type.toLowerCase()}.</span>
                        )}{" "}
                      </>
                    ) : (
                      <>All arrived patients have been seen or are in visit.{" "}</>
                    )}
                    {intakePatient && (
                      <>
                        <strong>
                          {intakePatient.patientName} ({intakePatient.time})
                        </strong>{" "}
                        is scheduled for new psychiatric intake.{" "}
                      </>
                    )}
                    <strong>1 unsigned encounter note</strong> remains from Maya Chen&apos;s visit.
                  </p>
                  <div className="morning-briefing-actions">
                    {waitingPatients.length > 0 ? (
                      <button
                        type="button"
                        className="briefing-quick-btn"
                        onClick={() =>
                          onStartVisit(waitingPatients[0].patientId, waitingPatients[0].patientName)
                        }
                      >
                        ▶ Start {waitingPatients[0].patientName} Visit
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="briefing-quick-btn"
                        onClick={() => onOpenChart("jordan-reed", "Encounter")}
                      >
                        ▶ Open Active Chart
                      </button>
                    )}
                    {overdueLabPatient && (
                      <button
                        type="button"
                        className="briefing-quick-btn"
                        onClick={() => {
                          if (onDraftLabOrder)
                            onDraftLabOrder(overdueLabPatient.patientName, "Fasting Lipid Panel & HbA1c");
                          triggerToast(`Drafted overdue metabolic labs order for ${overdueLabPatient.patientName}`);
                        }}
                      >
                        ＋ Draft {overdueLabPatient.patientName.split(" ")[0]}&apos;s Overdue Labs
                      </button>
                    )}
                    <button
                      type="button"
                      className="briefing-quick-btn"
                      onClick={() => onOpenChart("maya-chen", "Encounter")}
                    >
                      ✎ Review Maya&apos;s Unsigned Draft
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        }

        // 2. METRICS SECTION (4 Dynamic Cards)
        if (sectionId === "metrics") {
          if (!preferences.today.showMetrics) return null;
          const mIdx = preferences.today.widgetOrder.indexOf("metrics");
          return (
            <div key="metrics" className="today-metrics-container">
              <div className="metrics-header-inline">
                <span className="eyebrow">Practice Cockpit</span>
                <div className="card-header-tools">
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={mIdx === 0}
                    onClick={() => moveWidget("metrics", "up")}
                    title="Move metrics up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={mIdx === preferences.today.widgetOrder.length - 1}
                    onClick={() => moveWidget("metrics", "down")}
                    title="Move metrics down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    title="Hide metrics row"
                    onClick={() => hideWidget("showMetrics", "Today metrics row")}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="today-metrics-grid">
                {/* 1. Total Scheduled */}
                <div className="today-metric-card" onClick={() => setActiveFilter("all")}>
                  <div className="metric-num">{counts.all}</div>
                  <div className="metric-label">Total Scheduled</div>
                  <div className="metric-sub">{totalSub}</div>
                </div>

                {/* 2. Waiting in Lobby */}
                <div
                  className={`today-metric-card ${counts.waiting > 0 ? "highlight-urgent" : ""}`}
                  onClick={() => setActiveFilter("waiting")}
                >
                  <div className="metric-num" style={{ color: "#b06000" }}>
                    {counts.waiting}
                  </div>
                  <div className="metric-label">Waiting in Lobby</div>
                  <div className="metric-sub">{waitingSub}</div>
                </div>

                {/* 3. In Visit */}
                <div className="today-metric-card" onClick={() => setActiveFilter("in-visit")}>
                  <div className="metric-num" style={{ color: "#0b57d0" }}>
                    {counts.inVisit}
                  </div>
                  <div className="metric-label">In Visit</div>
                  <div className="metric-sub">{inVisitSub}</div>
                </div>

                {/* 4. Upcoming Visits */}
                <div className="today-metric-card" onClick={() => setActiveFilter("upcoming")}>
                  <div className="metric-num">{counts.upcoming}</div>
                  <div className="metric-label">Upcoming Visits</div>
                  <div className="metric-sub">{upcomingSub}</div>
                </div>
              </div>
            </div>
          );
        }

        // 3. MAIN CONTENT GRID (Roster + Dynamic Sidebar)
        if (sectionId === "contentGrid") {
          const rIdx = preferences.today.widgetOrder.indexOf("roster");
          return (
            <div
              key="contentGrid"
              className={`today-content-grid ${!hasSidebarWidgets ? "no-sidebar" : ""}`}
            >
              {/* Left Schedule Stream */}
              <section className="schedule-main-card">
                <div className="schedule-card-header">
                  <div>
                    <span className="eyebrow">Patient Flow</span>
                    <h2>Daily Encounter Roster</h2>
                  </div>
                  <div className="card-header-tools">
                    <button
                      type="button"
                      className="card-tool-btn"
                      disabled={rIdx === 0}
                      onClick={() => moveWidget("roster", "up")}
                      title="Move roster up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="card-tool-btn"
                      disabled={rIdx === preferences.today.widgetOrder.length - 1}
                      onClick={() => moveWidget("roster", "down")}
                      title="Move roster down"
                    >
                      ▼
                    </button>
                  </div>
                  {preferences.today.showScheduleSearch && (
                    <div className="schedule-search-box">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        placeholder="Search today's patients or reasons..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery("")}>
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Filter Pills */}
                {preferences.today.showScheduleSearch && (
                  <div className="schedule-filter-bar">
                    <button
                      type="button"
                      className={activeFilter === "all" ? "active" : ""}
                      onClick={() => setActiveFilter("all")}
                    >
                      All ({counts.all})
                    </button>
                    <button
                      type="button"
                      className={activeFilter === "waiting" ? "active" : ""}
                      onClick={() => setActiveFilter("waiting")}
                    >
                      Waiting in Lobby ({counts.waiting})
                    </button>
                    <button
                      type="button"
                      className={activeFilter === "in-visit" ? "active" : ""}
                      onClick={() => setActiveFilter("in-visit")}
                    >
                      In Visit ({counts.inVisit})
                    </button>
                    <button
                      type="button"
                      className={activeFilter === "upcoming" ? "active" : ""}
                      onClick={() => setActiveFilter("upcoming")}
                    >
                      Upcoming ({counts.upcoming})
                    </button>
                    <button
                      type="button"
                      className={activeFilter === "completed" ? "active" : ""}
                      onClick={() => setActiveFilter("completed")}
                    >
                      Completed ({counts.completed})
                    </button>
                  </div>
                )}

                {/* Schedule List */}
                <div className="schedule-list">
                  {filteredSchedule.map((apt) => (
                    <div
                      key={apt.id}
                      className={`schedule-row ${apt.status === "waiting" ? "row-waiting" : ""} ${apt.status === "in-visit" ? "row-in-visit" : ""}`}
                    >
                      {/* Time & Room */}
                      <div className="schedule-time-col">
                        <strong>{apt.time}</strong>
                        <small>{apt.duration}</small>
                        {apt.room && <span className="room-badge">{apt.room}</span>}
                      </div>

                      {/* Patient Information */}
                      <div className="schedule-patient-col">
                        <div className="patient-line">
                          <button
                            type="button"
                            className="patient-name-link"
                            onClick={() => onOpenChart(apt.patientId)}
                          >
                            {apt.patientName}
                          </button>
                          <span className="patient-meta">
                            {apt.age}y · DOB {apt.dob} · MRN {apt.mrn}
                          </span>
                        </div>

                        <div className="complaint-line">
                          <span className="visit-type-badge">{apt.type}</span>
                          <span className="complaint-text">{apt.chiefComplaint}</span>
                        </div>

                        {apt.alert && (
                          <div className="schedule-alert-badge">
                            <span>⚠️</span> {apt.alert}
                          </div>
                        )}
                      </div>

                      {/* Status Dropdown */}
                      <div className="schedule-status-col">
                        <select
                          className={`status-dropdown status-${apt.status}`}
                          value={apt.status}
                          onChange={(e) => handleStatusChange(apt.id, e.target.value as AppointmentStatus)}
                          aria-label={`Status for ${apt.patientName}`}
                        >
                          <option value="scheduled">Scheduled</option>
                          <option value="waiting">Waiting in Lobby</option>
                          <option value="in-visit">In Visit</option>
                          <option value="completed">Completed</option>
                          <option value="no-show">No Show</option>
                        </select>
                      </div>

                      {/* Actions */}
                      <div className="schedule-actions-col">
                        {apt.status === "waiting" || apt.status === "in-visit" || apt.status === "scheduled" ? (
                          <button
                            type="button"
                            className="action-btn start-visit-btn"
                            onClick={() => onStartVisit(apt.patientId, apt.patientName)}
                            title="Open chart and start active encounter draft"
                          >
                            ▶ Start Visit
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="action-btn chart-btn"
                            onClick={() => onOpenChart(apt.patientId)}
                          >
                            View Chart
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn chart-btn"
                          onClick={() => onOpenChart(apt.patientId, "Meds")}
                          title="Open medications review"
                        >
                          Rx
                        </button>
                      </div>
                    </div>
                  ))}

                  {filteredSchedule.length === 0 && (
                    <div className="empty-schedule-msg">
                      No appointments found matching this filter.
                    </div>
                  )}
                </div>
              </section>

              {/* Right Sidebar Column with Dynamic Ordering */}
              {hasSidebarWidgets && (
                <aside className="today-sidebar-column">
                  {sidebarOrder.map((cardId) => {
                    // ACTION QUEUE CARD
                    if (cardId === "queue") {
                      if (!preferences.today.showActionQueue) return null;
                      const qIdx = preferences.today.widgetOrder.indexOf("queue");
                      return (
                        <div key="queue" className="action-queue-card">
                          <div className="action-queue-heading">
                            <div>
                              <span className="eyebrow">Attention Needed</span>
                              <h3>Action Queue ({actionQueue.length})</h3>
                            </div>
                            <div className="card-header-tools">
                              <button
                                type="button"
                                className="card-tool-btn"
                                disabled={qIdx === 0}
                                onClick={() => moveWidget("queue", "up")}
                                title="Move queue up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="card-tool-btn"
                                disabled={qIdx === preferences.today.widgetOrder.length - 1}
                                onClick={() => moveWidget("queue", "down")}
                                title="Move queue down"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                className="card-tool-btn close-tool"
                                title="Hide action queue"
                                onClick={() => hideWidget("showActionQueue", "Action queue")}
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <div className="queue-items-list">
                            {actionQueue.map((item) => (
                              <div key={item.id} className={`queue-item queue-${item.type}`}>
                                <div className="queue-item-header">
                                  <strong>{item.title}</strong>
                                  <time>{item.date}</time>
                                </div>
                                <div className="queue-item-patient">
                                  <button
                                    type="button"
                                    className="patient-name-link"
                                    onClick={() => onOpenChart(item.patientId, item.targetSection)}
                                  >
                                    {item.patientName}
                                  </button>
                                </div>
                                <p className="queue-item-summary">{item.summary}</p>
                                <button
                                  type="button"
                                  className="queue-action-btn"
                                  onClick={() => {
                                    if (item.type === "lab-alert" && onDraftLabOrder) {
                                      onDraftLabOrder(item.patientName, "Fasting Lipid Panel & HbA1c");
                                      triggerToast(`Drafted orders for ${item.patientName}`);
                                    } else {
                                      onOpenChart(item.patientId, item.targetSection ?? "Overview");
                                    }
                                  }}
                                >
                                  {item.actionLabel} →
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // DAILY SHORTCUTS CARD
                    if (cardId === "shortcuts") {
                      if (!preferences.today.showQuickReferences) return null;
                      const sIdx = preferences.today.widgetOrder.indexOf("shortcuts");
                      return (
                        <div key="shortcuts" className="quick-reference-card">
                          <div className="action-queue-heading">
                            <div>
                              <span className="eyebrow">Clinical Tools</span>
                              <h3>Daily Shortcuts</h3>
                            </div>
                            <div className="card-header-tools">
                              <button
                                type="button"
                                className="card-tool-btn"
                                disabled={sIdx === 0}
                                onClick={() => moveWidget("shortcuts", "up")}
                                title="Move shortcuts up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="card-tool-btn"
                                disabled={sIdx === preferences.today.widgetOrder.length - 1}
                                onClick={() => moveWidget("shortcuts", "down")}
                                title="Move shortcuts down"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                className="card-tool-btn close-tool"
                                title="Hide shortcuts"
                                onClick={() => hideWidget("showQuickReferences", "Daily shortcuts")}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                          <div className="reference-chips">
                            <button
                              type="button"
                              className="ref-chip"
                              onClick={() => onOpenChart("jordan-reed", "Labs")}
                            >
                              ⌁ Jordan Reed Surveillance Labs
                            </button>
                            <button
                              type="button"
                              className="ref-chip"
                              onClick={() => onOpenChart("maya-chen", "Meds")}
                            >
                              Rx Maya Chen Prescriptions
                            </button>
                            <button
                              type="button"
                              className="ref-chip"
                              onClick={() => onOpenChart("sofia-martinez", "Encounter")}
                            >
                              📝 Sofia Martinez Intake Note
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </aside>
              )}
            </div>
          );
        }

        return null;
      })}

      {/* Add Walk-in / Appointment Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div
            className="add-appointment-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="dialog-header">
              <div>
                <span className="eyebrow">Walk-in / Scheduling</span>
                <h3 id="modal-title">Add Patient to Today&apos;s Schedule</h3>
              </div>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAppointment} className="dialog-form">
              <label>
                Select Patient
                <select
                  value={patientChoice}
                  onChange={(e) => setPatientChoice(e.target.value)}
                >
                  <option value="jordan-reed">Jordan Reed (MRN P-10917 · DOB 11/03/1986)</option>
                  <option value="maya-chen">Maya Chen (MRN P-10482 · DOB 04/18/1992)</option>
                  <option value="sofia-martinez">Sofia Martinez (MRN P-11104 · DOB 01/27/2008)</option>
                  <option value="other">New / Walk-in Patient</option>
                </select>
              </label>

              {patientChoice === "other" && (
                <label>
                  Patient Full Name
                  <input
                    placeholder="e.g. Alex Morgan"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    required
                  />
                </label>
              )}

              <div className="two-col-inputs">
                <label>
                  Appointment Time
                  <input
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="e.g. 06:00 PM"
                    required
                  />
                </label>
                <label>
                  Duration
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  >
                    <option value="15 min">15 min (Brief Check)</option>
                    <option value="30 min">30 min (Med Check)</option>
                    <option value="45 min">45 min (Therapy + Meds)</option>
                    <option value="60 min">60 min (Full Intake)</option>
                  </select>
                </label>
              </div>

              <div className="two-col-inputs">
                <label>
                  Visit Type
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as VisitType)}
                  >
                    <option value="30-min Med Check">30-min Med Check</option>
                    <option value="60-min Intake">60-min Intake</option>
                    <option value="Psychotherapy + Meds">Psychotherapy + Meds</option>
                    <option value="Urgent Walk-in">Urgent Walk-in</option>
                  </select>
                </label>
                <label>
                  Room / Location
                  <select
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                  >
                    <option value="Room 1">Room 1</option>
                    <option value="Room 2">Room 2</option>
                    <option value="Room 3">Room 3</option>
                    <option value="Waiting Room · Lobby">Waiting Room · Lobby</option>
                    <option value="Telehealth Room">Telehealth Room</option>
                  </select>
                </label>
              </div>

              <label>
                Chief Complaint / Presenting Reason
                <textarea
                  placeholder="Reason for today's visit, symptom changes, or urgent request..."
                  value={newComplaint}
                  onChange={(e) => setNewComplaint(e.target.value)}
                  rows={3}
                />
              </label>

              <div className="dialog-actions">
                <button
                  type="button"
                  className="dialog-cancel-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="today-btn primary">
                  ＋ Add to Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && <div className="workspace-toast">{toastMessage}</div>}
    </div>
  );
}
