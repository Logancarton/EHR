"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ActionQueueItem,
  type AppointmentStatus,
  type ScheduleItem,
  type VisitType,
  defaultPracticeDate,
  formatDateHeading,
  getRelativeDateBadge,
  initialActionQueue,
  initialSchedule,
  stepDate,
  timeStringToMinutes,
  durationStringToMinutes,
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
type ScheduleViewMode = "roster" | "timeline";

export default function TodayDashboard({
  onStartVisit,
  onOpenChart,
  onDraftLabOrder,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  initialViewMode = "roster",
}: {
  onStartVisit: (patientId: string, patientName: string) => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onDraftLabOrder?: (patientName: string, labName: string) => void;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  initialViewMode?: ScheduleViewMode;
}) {
  const [schedule, setSchedule] = useState<ScheduleItem[]>(initialSchedule);
  const [actionQueue, setActionQueue] = useState<ActionQueueItem[]>(initialActionQueue);
  const [currentDate, setCurrentDate] = useState<string>(defaultPracticeDate);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(initialViewMode);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [briefingCollapsed, setBriefingCollapsed] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // New Appointment Form State
  const [newDate, setNewDate] = useState(defaultPracticeDate);
  const [patientChoice, setPatientChoice] = useState("jordan-reed");
  const [customName, setCustomName] = useState("");
  const [newTime, setNewTime] = useState("06:00 PM");
  const [newDuration, setNewDuration] = useState("30 min");
  const [newType, setNewType] = useState<VisitType>("30-min Med Check");
  const [newRoom, setNewRoom] = useState("Room 2");
  const [newComplaint, setNewComplaint] = useState("");

  // Listen for navigation events from the sidebar
  useEffect(() => {
    function handleSwitchView(e: Event) {
      const customEvent = e as CustomEvent<{ view: string }>;
      if (customEvent.detail?.view === "schedule") {
        setViewMode("timeline");
      } else if (customEvent.detail?.view === "today") {
        setViewMode("roster");
        setCurrentDate(defaultPracticeDate);
      }
    }

    function handleEncounterSigned(e: Event) {
      const customEvent = e as CustomEvent<{ patientId: string }>;
      const pId = customEvent.detail?.patientId;
      if (pId) {
        setSchedule((prev) =>
          prev.map((item) => (item.patientId === pId ? { ...item, status: "completed" } : item))
        );
        setActionQueue((prev) => prev.filter((q) => q.patientId !== pId || q.type !== "unsigned-note"));
      }
    }

    window.addEventListener("ehr-switch-view", handleSwitchView);
    window.addEventListener("ehr-encounter-signed", handleEncounterSigned);
    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitchView);
      window.removeEventListener("ehr-encounter-signed", handleEncounterSigned);
    };
  }, []);

  // Sync new appointment date with currentDate
  useEffect(() => {
    setNewDate(currentDate);
  }, [currentDate]);

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

  function openQuickBooking(timeSlot: string) {
    setNewTime(timeSlot);
    setNewDate(currentDate);
    setModalOpen(true);
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
      date: newDate,
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
    triggerToast(`Added ${patientName} to schedule for ${newDate}`);
  }

  // Filter schedule by selected date
  const daySchedule = useMemo(() => {
    return schedule.filter((s) => s.date === currentDate);
  }, [schedule, currentDate]);

  // Dynamic status groupings for the active date
  const waitingPatients = useMemo(() => daySchedule.filter((s) => s.status === "waiting"), [daySchedule]);
  const inVisitPatients = useMemo(() => daySchedule.filter((s) => s.status === "in-visit"), [daySchedule]);
  const upcomingPatients = useMemo(() => daySchedule.filter((s) => s.status === "scheduled"), [daySchedule]);
  const completedPatients = useMemo(() => daySchedule.filter((s) => s.status === "completed"), [daySchedule]);

  const counts = useMemo(() => {
    return {
      all: daySchedule.length,
      waiting: waitingPatients.length,
      inVisit: inVisitPatients.length,
      upcoming: upcomingPatients.length,
      completed: completedPatients.length,
    };
  }, [daySchedule, waitingPatients, inVisitPatients, upcomingPatients, completedPatients]);

  // Check for patients with overdue monitoring labs on the schedule
  const overdueLabPatient = useMemo(() => {
    for (const apt of daySchedule) {
      const labs = patientLabHistory[apt.patientId] || [];
      const meds =
        apt.patientId === "jordan-reed"
          ? ["Lamotrigine 150 mg daily", "Quetiapine 100 mg nightly"]
          : apt.patientId === "maya-chen"
          ? ["Sertraline 100 mg daily", "Guanfacine ER 2 mg nightly"]
          : [];
      const items = calculateMonitoringStatus(meds, labs);
      const overdue = items.find((i) => i.status === "overdue");
      if (overdue) {
        return {
          patientName: apt.patientName,
          patientId: apt.patientId,
          labName: overdue.requiredLab,
          med: overdue.medication,
        };
      }
    }
    return null;
  }, [daySchedule]);

  // Filtered schedule list for roster view
  const filteredSchedule = useMemo(() => {
    let list = daySchedule;
    if (activeFilter === "waiting") list = list.filter((i) => i.status === "waiting");
    else if (activeFilter === "in-visit") list = list.filter((i) => i.status === "in-visit");
    else if (activeFilter === "upcoming") list = list.filter((i) => i.status === "scheduled");
    else if (activeFilter === "completed") list = list.filter((i) => i.status === "completed");

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.patientName.toLowerCase().includes(q) ||
          i.chiefComplaint.toLowerCase().includes(q) ||
          i.mrn.toLowerCase().includes(q)
      );
    }

    return list;
  }, [daySchedule, activeFilter, searchQuery]);

  // Timeline slots (8:00 AM to 6:00 PM)
  const timelineHours = useMemo(() => {
    return [
      { label: "08:00 AM", minutes: 480 },
      { label: "09:00 AM", minutes: 540 },
      { label: "10:00 AM", minutes: 600 },
      { label: "11:00 AM", minutes: 660 },
      { label: "12:00 PM", minutes: 720 },
      { label: "01:00 PM", minutes: 780 },
      { label: "02:00 PM", minutes: 840 },
      { label: "03:00 PM", minutes: 900 },
      { label: "04:00 PM", minutes: 960 },
      { label: "05:00 PM", minutes: 1020 },
      { label: "06:00 PM", minutes: 1080 },
    ];
  }, []);

  // Compute metric subtitles
  const totalSub = useMemo(() => {
    if (counts.all === 0) return "No visits booked";
    const nextUpcoming = upcomingPatients[0];
    return nextUpcoming ? `Next: ${nextUpcoming.time}` : "All visits concluded";
  }, [counts.all, upcomingPatients]);

  const waitingSub = useMemo(() => {
    if (counts.waiting === 0) return "Lobby empty";
    const first = waitingPatients[0];
    return `${first.patientName} (${first.time})`;
  }, [counts.waiting, waitingPatients]);

  const inVisitSub = useMemo(() => {
    if (counts.inVisit === 0) return "No active session";
    const active = inVisitPatients[0];
    return `${active.patientName} · ${active.room || "Room"}`;
  }, [counts.inVisit, inVisitPatients]);

  const upcomingSub = useMemo(() => {
    if (counts.upcoming === 0) return "Schedule clear";
    return `${counts.upcoming} visits remaining`;
  }, [counts.upcoming]);

  const activePresetLabel = useMemo(() => {
    const found = builtInPresets[preferences.activePresetId];
    return found ? found.name : "Custom Preset";
  }, [preferences.activePresetId]);

  const hasSidebarWidgets = preferences.today.showActionQueue || preferences.today.showQuickReferences;

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
          <div className="today-date-badge">{getRelativeDateBadge(currentDate)}</div>
          <h1>{formatDateHeading(currentDate)}</h1>
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
            onClick={() => {
              setNewDate(currentDate);
              setModalOpen(true);
            }}
          >
            ＋ Add Walk-in / Appointment
          </button>
        </div>
      </header>

      {/* INTERACTIVE CALENDAR & DATE NAVIGATION BAR */}
      <div className="date-nav-bar">
        <div className="date-nav-controls">
          <button
            type="button"
            className="date-nav-btn"
            onClick={() => setCurrentDate(stepDate(currentDate, "prev"))}
            title="Previous Day"
          >
            ◄ Prev
          </button>
          <div className="date-nav-center">
            <span className="date-nav-badge-pill">{getRelativeDateBadge(currentDate)}</span>
            <strong className="date-nav-current-label">{formatDateHeading(currentDate)}</strong>
          </div>
          <button
            type="button"
            className="date-nav-btn"
            onClick={() => setCurrentDate(stepDate(currentDate, "next"))}
            title="Next Day"
          >
            Next ►
          </button>
          {currentDate !== defaultPracticeDate && (
            <button
              type="button"
              className="date-nav-today-btn"
              onClick={() => setCurrentDate(defaultPracticeDate)}
            >
              Jump to Today
            </button>
          )}
        </div>

        {/* Schedule View Toggle: Roster vs Timeline */}
        <div className="schedule-view-toggle">
          <button
            type="button"
            className={viewMode === "roster" ? "active" : ""}
            onClick={() => setViewMode("roster")}
          >
            📋 Roster Stream
          </button>
          <button
            type="button"
            className={viewMode === "timeline" ? "active" : ""}
            onClick={() => setViewMode("timeline")}
          >
            📅 Calendar Timeline
          </button>
        </div>
      </div>

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
                  <strong>
                    {currentDate === defaultPracticeDate
                      ? "Clinical AI Morning Briefing"
                      : `Clinical AI Daily Summary · ${formatDateHeading(currentDate)}`}
                  </strong>
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
                    {currentDate === defaultPracticeDate ? "Good morning, Dr. Carton. " : ""}
                    You have <strong>{counts.all} encounters scheduled</strong> for this date (
                    {counts.completed} completed, {counts.waiting} waiting in lobby).{" "}
                    {waitingPatients.length > 0 ? (
                      <>
                        <strong style={{ color: "#b3261e" }}>
                          {waitingPatients[0].patientName} ({waitingPatients[0].time})
                        </strong>{" "}
                        is arrived and waiting in {waitingPatients[0].room || "the lobby"} —{" "}
                        {overdueLabPatient?.patientId === waitingPatients[0].patientId ? (
                          <span style={{ textDecoration: "underline" }}>
                            annual metabolic surveillance labs (Fasting Lipids &amp; HbA1c) are overdue
                          </span>
                        ) : (
                          "ready to begin visit"
                        )}
                        .
                      </>
                    ) : inVisitPatients.length > 0 ? (
                      <>
                        Active session currently in progress with{" "}
                        <strong>{inVisitPatients[0].patientName}</strong> in {inVisitPatients[0].room}.
                      </>
                    ) : upcomingPatients.length > 0 ? (
                      <>
                        Next scheduled arrival is <strong>{upcomingPatients[0].patientName}</strong> at{" "}
                        {upcomingPatients[0].time}.
                      </>
                    ) : (
                      "All visits concluded for this date."
                    )}
                  </p>
                  <div className="briefing-quick-actions">
                    {waitingPatients.length > 0 ? (
                      <button
                        type="button"
                        className="briefing-quick-btn primary-quick-btn"
                        onClick={() =>
                          onStartVisit(waitingPatients[0].patientId, waitingPatients[0].patientName)
                        }
                      >
                        ▶ Start Visit: {waitingPatients[0].patientName} ({waitingPatients[0].time})
                      </button>
                    ) : inVisitPatients.length > 0 ? (
                      <button
                        type="button"
                        className="briefing-quick-btn primary-quick-btn"
                        onClick={() => onOpenChart(inVisitPatients[0].patientId, "Encounter")}
                      >
                        ▶ Resume Visit: {inVisitPatients[0].patientName}
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

        // 3. MAIN CONTENT GRID (Roster or Timeline + Dynamic Sidebar)
        if (sectionId === "contentGrid") {
          const rIdx = preferences.today.widgetOrder.indexOf("roster");
          return (
            <div
              key="contentGrid"
              className={`today-content-grid ${!hasSidebarWidgets ? "no-sidebar" : ""}`}
            >
              {/* Left Schedule Area */}
              <section className="schedule-main-card">
                <div className="schedule-card-header">
                  <div>
                    <span className="eyebrow">Patient Flow</span>
                    <h2>{viewMode === "roster" ? "Daily Encounter Roster" : "Hourly Calendar Timeline"}</h2>
                  </div>
                  <div className="card-header-tools">
                    <button
                      type="button"
                      className="card-tool-btn"
                      disabled={rIdx === 0}
                      onClick={() => moveWidget("roster", "up")}
                      title="Move schedule up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="card-tool-btn"
                      disabled={rIdx === preferences.today.widgetOrder.length - 1}
                      onClick={() => moveWidget("roster", "down")}
                      title="Move schedule down"
                    >
                      ▼
                    </button>
                  </div>
                  {viewMode === "roster" && preferences.today.showScheduleSearch && (
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
                        placeholder="Search patients or reasons..."
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

                {/* Filter Pills for Roster view */}
                {viewMode === "roster" && preferences.today.showScheduleSearch && (
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

                {/* VIEW MODE 1: ROSTER LIST */}
                {viewMode === "roster" && (
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
                        No appointments found matching this filter on {formatDateHeading(currentDate)}.
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW MODE 2: CALENDAR TIMELINE GRID */}
                {viewMode === "timeline" && (
                  <div className="calendar-timeline-container">
                    <div className="calendar-timeline-grid">
                      {timelineHours.map((slot) => {
                        const slotAppointments = daySchedule.filter((apt) => {
                          const min = timeStringToMinutes(apt.time);
                          return min >= slot.minutes && min < slot.minutes + 60;
                        });

                        return (
                          <div key={slot.minutes} className="timeline-hour-row">
                            <div className="timeline-time-axis">
                              <span>{slot.label}</span>
                            </div>
                            <div className="timeline-slot-track">
                              {slotAppointments.length > 0 ? (
                                slotAppointments.map((apt) => {
                                  const startMin = timeStringToMinutes(apt.time);
                                  const offsetMin = Math.max(0, startMin - slot.minutes);
                                  const topPercent = (offsetMin / 60) * 100;
                                  const durationMin = durationStringToMinutes(apt.duration);
                                  const heightPx = Math.max(48, (durationMin / 60) * 80 - 4);

                                  return (
                                    <div
                                      key={apt.id}
                                      className={`timeline-card status-${apt.status}`}
                                      style={{
                                        top: `${topPercent}%`,
                                        minHeight: `${heightPx}px`,
                                      }}
                                    >
                                      <div className="timeline-card-header">
                                        <div className="timeline-card-title-group">
                                          <button
                                            type="button"
                                            className="timeline-patient-name"
                                            onClick={() => onOpenChart(apt.patientId)}
                                          >
                                            {apt.patientName}
                                          </button>
                                          <span className="timeline-time-badge">
                                            {apt.time} ({apt.duration})
                                          </span>
                                        </div>
                                        <span className={`status-pill status-${apt.status}`}>
                                          {apt.status}
                                        </span>
                                      </div>

                                      <div className="timeline-card-details">
                                        <span className="timeline-visit-type">{apt.type}</span>
                                        {apt.room && <span className="timeline-room-tag">{apt.room}</span>}
                                        <span className="timeline-cc-text">{apt.chiefComplaint}</span>
                                      </div>

                                      {apt.alert && (
                                        <div className="timeline-alert-tag">
                                          ⚠️ {apt.alert}
                                        </div>
                                      )}

                                      <div className="timeline-card-actions">
                                        {apt.status === "waiting" || apt.status === "in-visit" || apt.status === "scheduled" ? (
                                          <button
                                            type="button"
                                            className="action-btn start-visit-btn"
                                            onClick={() => onStartVisit(apt.patientId, apt.patientName)}
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
                                        >
                                          Rx
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <button
                                  type="button"
                                  className="timeline-empty-slot"
                                  onClick={() => openQuickBooking(slot.label)}
                                >
                                  <span>＋ Schedule at {slot.label}</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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

                          <div className="action-queue-list">
                            {actionQueue.map((item) => (
                              <div key={item.id} className={`queue-item queue-${item.type}`}>
                                <div className="queue-item-header">
                                  <strong>{item.title}</strong>
                                  <span className="queue-date">{item.date}</span>
                                </div>
                                <div className="queue-patient-link">
                                  <button
                                    type="button"
                                    onClick={() => onOpenChart(item.patientId, item.targetSection)}
                                  >
                                    {item.patientName}
                                  </button>
                                </div>
                                <p className="queue-summary">{item.summary}</p>
                                <div className="queue-actions">
                                  <button
                                    type="button"
                                    className="queue-action-btn"
                                    onClick={() => onOpenChart(item.patientId, item.targetSection)}
                                  >
                                    {item.actionLabel}
                                  </button>
                                  <button
                                    type="button"
                                    className="queue-dismiss-btn"
                                    title="Dismiss / Resolve"
                                    onClick={() => {
                                      setActionQueue((prev) => prev.filter((q) => q.id !== item.id));
                                      triggerToast(`Resolved “${item.title}”`);
                                    }}
                                  >
                                    ✓
                                  </button>
                                </div>
                              </div>
                            ))}
                            {actionQueue.length === 0 && (
                              <div className="queue-empty-message">
                                <span>✓</span> All clinical attention items cleared.
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // SHORTCUTS CARD
                    if (cardId === "shortcuts") {
                      if (!preferences.today.showQuickReferences) return null;
                      const sIdx = preferences.today.widgetOrder.indexOf("shortcuts");
                      return (
                        <div key="shortcuts" className="shortcuts-card">
                          <div className="shortcuts-heading">
                            <div>
                              <span className="eyebrow">Quick Navigation</span>
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

                          <div className="shortcuts-list">
                            <button
                              type="button"
                              className="shortcut-item"
                              onClick={() => {
                                setCurrentDate(defaultPracticeDate);
                                setViewMode("timeline");
                              }}
                            >
                              <span className="shortcut-icon">📅</span>
                              <div>
                                <strong>Today&apos;s Calendar Grid</strong>
                                <small>Interactive hour timeline</small>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="shortcut-item"
                              onClick={() => onOpenChart("jordan-reed", "Labs")}
                            >
                              <span className="shortcut-icon">⌁</span>
                              <div>
                                <strong>Surveillance Lab Flowsheet</strong>
                                <small>Overdue metabolic panel check</small>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="shortcut-item"
                              onClick={() => onOpenChart("maya-chen", "Encounter")}
                            >
                              <span className="shortcut-icon">✎</span>
                              <div>
                                <strong>Maya Chen Active Note</strong>
                                <small>ADHD / Guanfacine titration draft</small>
                              </div>
                            </button>
                            <button
                              type="button"
                              className="shortcut-item"
                              onClick={() => onOpenChart("sofia-martinez", "Encounter")}
                            >
                              <span className="shortcut-icon">✦</span>
                              <div>
                                <strong>Sofia Martinez Intake</strong>
                                <small>Adolescent mood baseline</small>
                              </div>
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
          <div className="walkin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>＋ Add Walk-in / Appointment</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleAddAppointment}>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Select Patient</label>
                <select
                  value={patientChoice}
                  onChange={(e) => setPatientChoice(e.target.value)}
                >
                  <option value="jordan-reed">Jordan Reed (39y · P-10917)</option>
                  <option value="maya-chen">Maya Chen (34y · P-10482)</option>
                  <option value="sofia-martinez">Sofia Martinez (18y · P-11104)</option>
                  <option value="custom">Other / New Walk-in Patient</option>
                </select>
              </div>

              {patientChoice === "custom" && (
                <div className="form-group">
                  <label>Full Patient Name</label>
                  <input
                    placeholder="e.g. Alex Taylor"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Time Slot</label>
                  <select
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  >
                    <option value="08:00 AM">08:00 AM</option>
                    <option value="08:30 AM">08:30 AM</option>
                    <option value="09:00 AM">09:00 AM</option>
                    <option value="09:30 AM">09:30 AM</option>
                    <option value="10:00 AM">10:00 AM</option>
                    <option value="10:30 AM">10:30 AM</option>
                    <option value="11:00 AM">11:00 AM</option>
                    <option value="11:30 AM">11:30 AM</option>
                    <option value="01:00 PM">01:00 PM</option>
                    <option value="01:30 PM">01:30 PM</option>
                    <option value="02:00 PM">02:00 PM</option>
                    <option value="02:30 PM">02:30 PM</option>
                    <option value="03:00 PM">03:00 PM</option>
                    <option value="03:30 PM">03:30 PM</option>
                    <option value="04:00 PM">04:00 PM</option>
                    <option value="04:30 PM">04:30 PM</option>
                    <option value="05:00 PM">05:00 PM</option>
                    <option value="05:30 PM">05:30 PM</option>
                    <option value="06:00 PM">06:00 PM</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Duration</label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  >
                    <option value="30 min">30 min</option>
                    <option value="45 min">45 min</option>
                    <option value="60 min">60 min</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Visit Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as VisitType)}
                  >
                    <option value="30-min Med Check">30-min Med Check</option>
                    <option value="45-min Therapy + Meds">45-min Therapy + Meds</option>
                    <option value="60-min Intake">60-min Intake</option>
                    <option value="Urgent Walk-in">Urgent Walk-in</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Room / Mode</label>
                  <select
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                  >
                    <option value="Room 1">Room 1</option>
                    <option value="Room 2">Room 2</option>
                    <option value="Room 3">Room 3</option>
                    <option value="Telehealth Room A">Telehealth Room A</option>
                    <option value="Telehealth Room B">Telehealth Room B</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Chief Complaint / Notes</label>
                <input
                  placeholder="e.g. Urgent med review, acute anxiety..."
                  value={newComplaint}
                  onChange={(e) => setNewComplaint(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="modal-submit-btn">
                  Add to Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast feedback */}
      {toastMessage && <div className="schedule-toast">{toastMessage}</div>}
    </div>
  );
}
