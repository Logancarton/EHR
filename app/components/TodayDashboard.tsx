"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionTools } from "./schedule/SectionTools";
import CockpitMenu from "./schedule/CockpitMenu";
import {
  type CockpitMetricId,
  hideCockpitMetric,
  visibleCockpitMetrics,
} from "../lib/cockpit-metrics";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type FollowUpInterval,
  FOLLOW_UP_INTERVALS,
  type ScheduleItem,
  type VisitType,
  calculateFollowUpDate,
  formatDateHeading,
  getRelativeDateBadge,
  minutesToTimeString,
  stepDate,
} from "../lib/schedule-data";
import { practiceMinutesNow, practiceToday } from "../lib/practice-calendar";
import {
  applyConfirmedAppointment,
  usePracticeSchedule,
} from "../lib/schedule-store";
import { usePatientRoster } from "../lib/patient-roster";
import { useAuthSession } from "./auth/AuthSessionGate";
import { providerDisplayLabel } from "../lib/auth-client";
import {
  type ProviderPreferences,
  type TodayWidgetId,
  defaultPreferences,
  savePreferences,
} from "../lib/preference-engine";
import { api } from "../lib/api-client";
import {
  practiceQueueApi,
  type PracticeLabQueueRow,
  type PracticeUnsignedEncounterRow,
  type PracticeRefillQueueRow,
  type PracticeHandoffQueueRow,
} from "../lib/practice-queue-api";
import { formatClinicalDate } from "../lib/clinical-date";
import ZoomableCalendarSchedule from "./schedule/ZoomableCalendarSchedule";
import CalendarRail from "./schedule/CalendarRail";
import RosterRow from "./schedule/RosterRow";
import { getSyntheticPatientProfile } from "../lib/patient-id-card-generator";
import { useTodayLayout, TODAY_SECTION_META } from "../lib/use-today-layout";
import DashboardWindowFrame from "./dashboard/DashboardWindowFrame";
import TeamDashboardWindow from "./dashboard/TeamDashboardWindow";
import QueueDashboardWindow, { type AttentionItem } from "./dashboard/QueueDashboardWindow";
import ArrivalsDashboardWindow from "./dashboard/ArrivalsDashboardWindow";
import VisitPrepDashboardWindow from "./dashboard/VisitPrepDashboardWindow";
import CareCompletionDashboardWindow from "./dashboard/CareCompletionDashboardWindow";
import {
  DASHBOARD_MODULES,
  type DashboardModuleId,
  filterModulesByCapabilities,
  getDashboardModule,
} from "../domain/dashboard-modules";
import AsyncSection, { InlineError } from "./ui/AsyncSection";
import type { SaveStatus } from "../lib/ui-system";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import VisitDetailDrawer from "./schedule/VisitDetailDrawer";
import AppointmentEditModal from "./schedule/AppointmentEditModal";
import RosterFieldChooser from "./schedule/RosterFieldChooser";
import { DEFAULT_ROSTER_FIELDS, type RosterFieldId } from "../domain/roster-fields";
import { useDashboardAutosave } from "../lib/useDashboardAutosave";
import PresetManagementModal from "./schedule/PresetManagementModal";
import VisitHandoffModal from "./schedule/VisitHandoffModal";
import { usePresenceHeartbeat } from "../lib/usePresenceHeartbeat";
import { useAdaptiveLayout } from "../lib/useAdaptiveLayout";

const CALENDAR_RAIL_KEY = "ehr_today_calendar_rail";

type FilterTab = "all" | "waiting" | "confirmed" | "in-visit" | "upcoming" | "completed" | "cancelled";
type ScheduleViewMode = "roster" | "timeline";

/**
 * The bookable times of a clinic day, every half hour from 7am to 7pm.
 *
 * The hand-written list this replaces ran 08:00–11:30 and then jumped to 01:00 PM,
 * so there was no way to book anything at noon at all. Generated in the same
 * `hh:mm AM` shape the appointment record stores.
 */
const BOOKING_SLOT_MINUTES: readonly number[] = Array.from(
  { length: 25 },
  (_, index) => 7 * 60 + index * 30,
);

// Padded to `hh:mm`, which is how appointments are already stored — an unpadded
// "7:00 AM" beside a seeded "09:00 AM" reads as two different systems on one roster.
const BOOKING_TIME_SLOTS: readonly string[] = BOOKING_SLOT_MINUTES.map((minutes) =>
  minutesToTimeString(minutes).padStart(8, "0"),
);

/** The Today header favors quick scanning over legal-document date density. */
function formatDashboardHeading(dateStr: string): string {
  return formatDateHeading(dateStr).replace(/,\s+\d{4}$/, "");
}

/** The next slot that has not started yet, so booking a same-day visit starts near now. */
function nextBookableSlot(forDate: string, today: string): string {
  if (forDate !== today) return BOOKING_TIME_SLOTS[0];
  const minutesNow = practiceMinutesNow();
  const index = BOOKING_SLOT_MINUTES.findIndex((minutes) => minutes > minutesNow);
  // After the last slot of the day, offer the first one — the clinician is booking
  // for tomorrow at that point and will change the date anyway.
  return BOOKING_TIME_SLOTS[index === -1 ? 0 : index];
}

/**
 * One outstanding item, normalised from whichever record holds it.
 *
 * A view over its source, never a store of its own: resolving it happens in the
 * chart, and this card re-reads afterwards rather than editing its own copy.
 */
function buildAttentionQueue(
  drafts: readonly PracticeUnsignedEncounterRow[],
  labs: readonly PracticeLabQueueRow[],
  refills: readonly PracticeRefillQueueRow[] = [],
  handoffs: readonly PracticeHandoffQueueRow[] = [],
): AttentionItem[] {
  const unsigned: AttentionItem[] = drafts.map((draft) => ({
    id: `unsigned-${draft.encounterId}`,
    type: "unsigned-note",
    title: "Unsigned encounter draft",
    patientId: draft.patientId,
    patientName: draft.patientName,
    patientMrn: draft.patientMrn,
    date: draft.date || formatClinicalDate(draft.updatedAt),
    summary: draft.chiefComplaint
      ? `${draft.encounterType} — ${draft.chiefComplaint}`
      : `${draft.encounterType} awaiting review and signature.`,
    actionLabel: "Review & sign",
    targetSection: "Encounter",
    encounterId: draft.encounterId,
    appointmentId: draft.appointmentId || undefined,
  }));

  // Unacknowledged first, and only those: an acknowledged result is read work, not
  // pending work. Reading a result is not the same as acting on it, so the label
  // says acknowledge rather than resolve.
  const unacknowledged: AttentionItem[] = labs
    .filter((lab) => !lab.acknowledgedAt)
    .map((lab) => ({
      id: `lab-${lab.observationId}`,
      type: "lab-alert",
      title: lab.interpretation && lab.interpretation.toLowerCase() !== "normal"
        ? `Result to review — ${lab.interpretation}`
        : "Result to acknowledge",
      patientId: lab.patientId,
      patientName: lab.patientName,
      patientMrn: lab.patientMrn,
      date: formatClinicalDate(lab.effectiveAt),
      summary: `${lab.testName}: ${lab.valueText}${lab.unit ? ` ${lab.unit}` : ""}`.trim(),
      actionLabel: "Open result",
      targetSection: "Labs",
      observationId: lab.observationId,
    }));

  const pendingRefills: AttentionItem[] = refills.map((refill) => ({
    id: `refill-${refill.requestId}`,
    type: "refill-request",
    title: `Refill Request — ${refill.medicationName}`,
    patientId: refill.patientId,
    patientName: refill.patientName,
    patientMrn: refill.patientMrn,
    date: formatClinicalDate(refill.requestedAt),
    summary: `Requested via ${refill.requestSource}${refill.note ? `: "${refill.note}"` : ""}`,
    actionLabel: "Review refill",
    targetSection: "Medications",
    requestId: refill.requestId,
  }));

  const pendingHandoffItems: AttentionItem[] = handoffs.map((h) => ({
    id: `handoff-${h.handoffId}`,
    type: "handoff",
    title: `Care Handoff from ${h.fromUserName}`,
    patientId: h.patientId,
    patientName: h.patientName,
    patientMrn: h.patientMrn,
    date: formatClinicalDate(h.createdAt),
    summary: `${h.reason}: ${h.clinicalSummary}`,
    actionLabel: "Review handoff",
    targetSection: "Schedule",
    handoffId: h.handoffId,
    appointmentId: h.appointmentId,
  }));

  return [...unsigned, ...unacknowledged, ...pendingRefills, ...pendingHandoffItems];
}

export default function TodayDashboard({
  onStartVisit,
  onOpenChart,
  onDraftLabOrder,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  initialViewMode = "roster",
}: {
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onDraftLabOrder?: (patientName: string, labName: string) => void;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  initialViewMode?: ScheduleViewMode;
}) {
  const {
    appointments: schedule,
    status: scheduleStatus,
    error: scheduleError,
    loadedAt: scheduleLoadedAt,
    refresh: refreshSchedule,
  } = usePracticeSchedule();
  const { patients: roster, status: rosterStatus } = usePatientRoster();
  const { user, permissions } = useAuthSession();
  const today = practiceToday();
  const [currentDate, setCurrentDate] = useState<string>(today);
  const [addOpen, setAddOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [fullScreenWidget, setFullScreenWidget] = useState<TodayWidgetId | null>(null);
  /**
   * Reported up from the Care Completion window so its frame can show the
   * open-loop count. The dashboard holds the number, never the patients: the
   * board's own data stays inside the window that is authorized to read it.
   */
  const [careCompletionCounts, setCareCompletionCounts] = useState<{
    patients: number;
    open: number;
    deferred: number;
  } | null>(null);

  useEffect(() => {
    if (!addOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAddOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!addMenuRef.current?.contains(e.target as Node)) setAddOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [addOpen]);

  useEffect(() => {
    if (!fullScreenWidget) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullScreenWidget(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullScreenWidget]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        onUpdatePreferences?.({ ...preferences, privacyMode: !preferences.privacyMode });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [preferences, onUpdatePreferences]);

  /**
   * Per-appointment save state.
   *
   * A status change used to paint the new state, toast a success and only log a
   * rejection, so a row the server refused sat there looking saved. Each row now
   * carries its own `saving | saved | failed`, and the row only moves once the
   * server returns the appointment it stored.
   */
  const [savingAppointments, setSavingAppointments] = useState<Record<string, SaveStatus>>({});
  const [appointmentErrors, setAppointmentErrors] = useState<Record<string, string>>({});
  const [bookingError, setBookingError] = useState("");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const bookingPatientRef = useRef<HTMLSelectElement | null>(null);
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(initialViewMode);
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [calendarRailCollapsed, setCalendarRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(CALENDAR_RAIL_KEY) === "collapsed";
  });

  // DB-4 Distinct Visit Target & Editing Modals State
  const [selectedVisitAppointment, setSelectedVisitAppointment] = useState<ScheduleItem | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<ScheduleItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalMode, setEditModalMode] = useState<"edit" | "cancel">("edit");

  // DB-6: Shared live scheduling, assignments, and handoffs
  usePresenceHeartbeat("schedule");
  const [pendingHandoffAptIds, setPendingHandoffAptIds] = useState<Set<string>>(new Set());
  const [handoffAppointment, setHandoffAppointment] = useState<ScheduleItem | null>(null);

  const refreshPendingHandoffs = useCallback(async () => {
    try {
      const list = await api.handoffs.list({ status: "pending" });
      const ids = new Set(list.map((h) => h.appointmentId));
      setPendingHandoffAptIds(ids);
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    void refreshPendingHandoffs();
  }, [refreshPendingHandoffs, schedule]);

  // New Appointment Form State
  const [newDate, setNewDate] = useState(today);
  // Empty until the clinician chooses from their own roster. The three hard-coded
  // ids that used to be here named charts an arbitrary signed-in user may not be
  // able to open at all.
  const [patientChoice, setPatientChoice] = useState("");
  const [newTime, setNewTime] = useState(() => nextBookableSlot(today, today));
  const [newDuration, setNewDuration] = useState("30 min");
  const [newType, setNewType] = useState<VisitType>("30-min Med Check");
  const [newRoom, setNewRoom] = useState("Room 2");
  const [newComplaint, setNewComplaint] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("all");
  const [bookingOriginAptId, setBookingOriginAptId] = useState<string | undefined>(undefined);
  const [bookingFollowUpInterval, setBookingFollowUpInterval] = useState<FollowUpInterval | undefined>(undefined);
  const [bookingNotes, setBookingNotes] = useState<string>("");

  useEffect(() => {
    window.localStorage.setItem(
      CALENDAR_RAIL_KEY,
      calendarRailCollapsed ? "collapsed" : "open",
    );
  }, [calendarRailCollapsed]);

  // Listen for navigation events from the sidebar
  useEffect(() => {
    function handleSwitchView(e: Event) {
      const customEvent = e as CustomEvent<{ view: string }>;
      if (customEvent.detail?.view === "schedule") {
        setViewMode("timeline");
      } else if (customEvent.detail?.view === "today") {
        setViewMode("roster");
        setCurrentDate(practiceToday());
        void refreshSchedule();
      }
    }

    /**
     * A signed note closes the visit it was written for — that one and no other.
     *
     * This used to match on patient id, so signing one note marked every
     * appointment that patient had completed: the second visit later the same day,
     * next week's follow-up, a cancelled slot. The event now carries the
     * appointment the encounter was started from, and an encounter with no
     * recorded appointment closes nothing. Re-reading the schedule afterwards keeps
     * the roster honest either way.
     */
    function handleEncounterSigned(e: Event) {
      const detail = (e as CustomEvent<{ patientId?: string; appointmentId?: string }>).detail;
      const appointmentId = detail?.appointmentId;
      if (!appointmentId) {
        void refreshSchedule();
        return;
      }
      void commitAppointmentStatus(appointmentId, "completed").finally(() => {
        void refreshSchedule();
      });
    }

    function handleAppointmentUpdated(e: Event) {
      const customEvent = e as CustomEvent<{ appointmentId?: string; status?: AppointmentStatus }>;
      if (customEvent.detail?.appointmentId) void refreshSchedule();
    }

    window.addEventListener("ehr-switch-view", handleSwitchView);
    window.addEventListener("ehr-encounter-signed", handleEncounterSigned);
    window.addEventListener("ehr-appointment-updated", handleAppointmentUpdated);
    return () => {
      window.removeEventListener("ehr-switch-view", handleSwitchView);
      window.removeEventListener("ehr-encounter-signed", handleEncounterSigned);
      window.removeEventListener("ehr-appointment-updated", handleAppointmentUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync new appointment date with currentDate
  useEffect(() => {
    setNewDate(currentDate);
  }, [currentDate]);

  /**
   * Work waiting on this clinician, read from the records that actually hold it.
   *
   * Two sources, both already permission-scoped on the server: drafts still to be
   * signed, and results nobody has acknowledged. Refill requests and portal
   * messages belong here too and are not represented at all yet rather than being
   * invented — they need the message and prescribing queues DB-7 covers.
   */
  const [attentionQueue, setAttentionQueue] = useState<AttentionItem[]>([]);
  const [attentionStatus, setAttentionStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attentionError, setAttentionError] = useState("");
  const [attentionReloads, setAttentionReloads] = useState(0);

  useEffect(() => {
    let active = true;
    setAttentionStatus("loading");
    setAttentionError("");

    Promise.all([
      practiceQueueApi.unsigned(),
      practiceQueueApi.labs(),
      practiceQueueApi.refills(),
      practiceQueueApi.handoffs(),
    ])
      .then(([drafts, labs, refills, handoffs]) => {
        if (!active) return;
        setAttentionQueue(buildAttentionQueue(drafts, labs, refills, handoffs));
        setAttentionStatus("ready");
      })
      .catch((cause: unknown) => {
        if (!active) return;
        // An unreadable queue is not an empty one. In a practice inbox those mean
        // opposite things, so the card says which.
        setAttentionQueue([]);
        setAttentionError(
          cause instanceof Error ? cause.message : "Outstanding work could not be loaded.",
        );
        setAttentionStatus("error");
      });

    return () => {
      active = false;
    };
  }, [attentionReloads]);

  // DB-5: Preferences still autosave; the Today header no longer exposes persistence
  // mechanics (sync state, timestamps, preset-dirty state, or revert controls).
  const { scheduleAutosave } = useDashboardAutosave({
    preferences,
    onUpdatePreferences,
    debounceMs: 600,
  });

  const [presetsModalOpen, setPresetsModalOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() => {
    return typeof window !== "undefined" ? window.innerWidth : 1200;
  });

  useEffect(() => {
    function handleResize() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // DB-8: Explicit Adaptive Layouts with Clinical Focus Protection
  const isAnyModalOpen = Boolean(
    modalOpen ||
    editModalOpen ||
    presetsModalOpen ||
    selectedVisitAppointment !== null ||
    handoffAppointment !== null ||
    addOpen
  );

  // Adaptive behaviour still honors the provider's saved preference; only the
  // always-visible badge/toggle was removed from the clinical header.
  useAdaptiveLayout({
    preferences,
    onUpdatePreferences: scheduleAutosave,
    appointments: schedule,
    attentionQueue,
    activeModalOpen: isAnyModalOpen,
    announce: (msg) => triggerToast(msg),
  });

  const layout = useTodayLayout({
    preferences,
    onUpdatePreferences: scheduleAutosave,
    announce: (message) => triggerToast(message),
  });
  const {
    applyTodayPreferences,
    isCollapsed,
    spanFor: rawSpanFor,
    cycleSpan,
    moveWidget,
    toggleCollapse,
    hideSection,
    sectionToolsFor,
  } = layout;

  // DB-5: Responsive viewport adaptation collapses half-spans to full-spans on mobile/narrow (< 768px)
  const spanFor = useCallback(
    (widgetId: TodayWidgetId): "half" | "full" => {
      if (viewportWidth < 768) return "full";
      return rawSpanFor(widgetId);
    },
    [rawSpanFor, viewportWidth],
  );

  /**
   * Dismisses the booking dialog and clears what it was holding.
   *
   * A refusal left on screen would reappear the next time the dialog opened,
   * attached to a form the clinician had not submitted yet.
   */
  function closeBooking() {
    if (bookingSubmitting) return;
    setModalOpen(false);
    setBookingError("");
    setBookingOriginAptId(undefined);
    setBookingFollowUpInterval(undefined);
    setBookingNotes("");
  }

  // Escape closes it, and the first field takes focus on open, so the dialog can be
  // worked and abandoned without reaching for the pointer.
  useEffect(() => {
    if (!modalOpen) return;
    bookingPatientRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeBooking();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, bookingSubmitting]);

  function triggerToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }

  /**
   * Moves one appointment, and says so only once the server has.
   *
   * Returns the persisted appointment or null, so a caller that needs to know
   * whether the transition actually happened — signing a note, for one — can.
   */
  async function commitAppointmentStatus(
    id: string,
    newStatus: AppointmentStatus,
  ): Promise<ScheduleItem | null> {
    // Duplicate protection: a second click while the first is still in flight
    // would race two writes to the same row for no gain.
    if (savingAppointments[id] === "saving") return null;

    setSavingAppointments((prev) => ({ ...prev, [id]: "saving" }));
    setAppointmentErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });

    try {
      const saved = await api.appointments.updateStatus(id, newStatus);
      // The row moves to what the server stored, not to what was requested.
      applyConfirmedAppointment(saved);
      setSavingAppointments((prev) => ({ ...prev, [id]: "saved" }));
      triggerToast(`${saved.patientName} — ${APPOINTMENT_STATUS_LABELS[saved.status]}`);
      return saved;
    } catch (cause) {
      void refreshSchedule();
      const message = cause instanceof Error
        ? cause.message
        : "The schedule change was not saved.";
      setSavingAppointments((prev) => ({ ...prev, [id]: "failed" }));
      setAppointmentErrors((prev) => ({ ...prev, [id]: message }));
      return null;
    }
  }

  function handleStatusChange(id: string, newStatus: AppointmentStatus) {
    void commitAppointmentStatus(id, newStatus);
  }

  /** Booking from the header: no slot was chosen, so start at the next one. */
  /** Booking from the header: no slot was chosen, so start at the next one. */
  function openBooking() {
    setNewDate(currentDate);
    setNewTime(nextBookableSlot(currentDate, today));
    setBookingError("");
    setBookingOriginAptId(undefined);
    setBookingFollowUpInterval(undefined);
    setBookingNotes("");
    setModalOpen(true);
  }

  function handleScheduleFollowUp(apt: ScheduleItem) {
    setSelectedVisitAppointment(null);
    setPatientChoice(apt.patientId);
    const defaultInterval: FollowUpInterval = (apt.followUpInterval as FollowUpInterval) || "2 weeks";
    const targetDate = calculateFollowUpDate(apt.date, defaultInterval);
    setNewDate(targetDate);
    setNewTime(apt.time || nextBookableSlot(targetDate, today));
    setNewType("30-min Med Check");
    setNewDuration("30 min");
    setNewRoom(apt.room || "Room 2");
    setNewComplaint(`Follow-up visit (${defaultInterval}) re: ${apt.chiefComplaint || "psychiatric care"}`);
    setBookingOriginAptId(apt.id);
    setBookingFollowUpInterval(defaultInterval);
    setBookingNotes(`Follow-up linked to visit on ${apt.date}`);
    setBookingError("");
    setModalOpen(true);
  }

  /**
   * Books a visit for a patient this clinician can actually reach.
   *
   * The old form offered three hard-coded charts and an "Other" option that built
   * a patient id out of the typed name. The server requires an existing patient,
   * so that row never persisted — but it appeared on the roster with a success
   * toast anyway. Identity comes from the authenticated roster now, and nothing
   * reaches the schedule until the server returns the appointment it stored.
   *
   * Booking a walk-in before their chart exists (D-015) needs an unlinked intake
   * record the backend does not yet have. Until it does, the honest answer is that
   * the patient has to exist first, not a fabricated id.
   */
  async function handleAddAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (bookingSubmitting) return;

    const patient = roster.find((candidate) => candidate.id === patientChoice);
    if (!patient) {
      setBookingError("Choose a patient from your roster before booking the visit.");
      return;
    }

    setBookingSubmitting(true);
    setBookingError("");
    try {
      const saved = await api.appointments.create({
        patientId: patient.id,
        patientName: patient.name,
        date: newDate,
        time: newTime,
        duration: newDuration,
        type: newType,
        status: "scheduled",
        chiefComplaint: newComplaint.trim() || "Scheduled psychiatric visit.",
        room: newRoom,
        providerId: selectedProviderId !== "all" ? selectedProviderId : user?.userId || undefined,
        providerName: user?.displayName || undefined,
        notes: bookingNotes.trim() || undefined,
        followUpInterval: bookingFollowUpInterval || undefined,
        originAppointmentId: bookingOriginAptId || undefined,
      });
      applyConfirmedAppointment(saved);
      closeBooking();
      setNewComplaint("");
      triggerToast(`Booked ${saved.patientName} for ${saved.date} at ${saved.time}`);
    } catch (cause) {
      setBookingError(
        cause instanceof Error ? cause.message : "The appointment could not be booked.",
      );
    } finally {
      setBookingSubmitting(false);
    }
  }

  const providersInSchedule = useMemo(() => {
    const map = new Map<string, string>();
    for (const apt of schedule) {
      if (apt.providerId) {
        map.set(apt.providerId, apt.providerName || `Provider ${apt.providerId}`);
      }
    }
    if (user?.userId) {
      map.set(user.userId, user.displayName || `Provider ${user.userId}`);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [schedule, user]);

  // Filter schedule by selected date and optional provider
  const daySchedule = useMemo(() => {
    let list = schedule.filter((s) => s.date === currentDate);
    if (selectedProviderId !== "all") {
      list = list.filter((s) => s.providerId === selectedProviderId);
    }
    return list;
  }, [schedule, currentDate, selectedProviderId]);

  // Dynamic status groupings for the active date
  const waitingPatients = useMemo(() => daySchedule.filter((s) => s.status === "waiting"), [daySchedule]);
  const inVisitPatients = useMemo(() => daySchedule.filter((s) => s.status === "in-visit"), [daySchedule]);
  const upcomingPatients = useMemo(
    () => daySchedule.filter((s) => s.status === "scheduled" || s.status === "confirmed"),
    [daySchedule],
  );
  const confirmedPatients = useMemo(
    () => daySchedule.filter((s) => s.status === "confirmed"),
    [daySchedule],
  );
  const completedPatients = useMemo(() => daySchedule.filter((s) => s.status === "completed"), [daySchedule]);
  const cancelledPatients = useMemo(() => daySchedule.filter((s) => s.status === "cancelled"), [daySchedule]);

  const counts = useMemo(() => {
    return {
      all: daySchedule.length,
      waiting: waitingPatients.length,
      confirmed: confirmedPatients.length,
      inVisit: inVisitPatients.length,
      upcoming: upcomingPatients.length,
      completed: completedPatients.length,
      cancelled: cancelledPatients.length,
    };
  }, [daySchedule, waitingPatients, inVisitPatients, upcomingPatients, completedPatients, cancelledPatients]);

  /**
   * The unfinished note the briefing and shortcuts offer.
   *
   * The whole attention queue used to be a fixture array, so it claimed the same
   * three items on a busy practice and an empty one. It reads the clinician's own
   * drafts now, and unfinished work is deliberately not limited to today's
   * schedule: the note most likely to be forgotten belongs to a patient who is not
   * coming back in today.
   */
  const unsignedNote = useMemo(
    () => attentionQueue.find((item) => item.type === "unsigned-note"),
    [attentionQueue],
  );

  /** The oldest result nobody has acknowledged, from the same authoritative queue. */
  const pendingResult = useMemo(
    () => attentionQueue.find((item) => item.type === "lab-alert"),
    [attentionQueue],
  );

  // Filtered schedule list for roster view
  const filteredSchedule = useMemo(() => {
    let list = daySchedule;
    if (activeFilter === "waiting") list = list.filter((i) => i.status === "waiting");
    else if (activeFilter === "in-visit") list = list.filter((i) => i.status === "in-visit");
    else if (activeFilter === "upcoming")
      list = list.filter((i) => i.status === "scheduled" || i.status === "confirmed");
    else if (activeFilter === "confirmed") list = list.filter((i) => i.status === "confirmed");
    else if (activeFilter === "completed") list = list.filter((i) => i.status === "completed");
    else if (activeFilter === "cancelled") list = list.filter((i) => i.status === "cancelled");
    else if (activeFilter === "all") {
      // By default in 'all', hide cancelled visits unless explicitly viewed, per DASH-06 / DB-4
      list = list.filter((i) => i.status !== "cancelled");
    }

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

  /** The day has been read. Until it has, a count is not a fact about the clinic. */
  const scheduleReady = scheduleStatus === "ready";

  const cockpitTiles = preferences.today.cockpitTiles ?? [];

  /** One lookup for every counter the cockpit can show, so the tiles stay a
   *  render of the registry rather than five hand-wired cards. */
  const cockpitValues = useMemo<Record<CockpitMetricId, { value: number; sub: string }>>(
    () => ({
      scheduled: { value: counts.all, sub: totalSub },
      waiting: { value: counts.waiting, sub: waitingSub },
      inVisit: { value: counts.inVisit, sub: inVisitSub },
      upcoming: { value: counts.upcoming, sub: upcomingSub },
      completed: {
        value: counts.completed,
        sub: counts.completed === 1 ? "1 visit closed" : `${counts.completed} visits closed`,
      },
    }),
    [counts, totalSub, waitingSub, inVisitSub, upcomingSub],
  );

  const isWidgetPermitted = useCallback(
    (id: TodayWidgetId) => {
      if (id === "queue" && !permissions.includes("read_clinical") && !permissions.includes("manage_tasks")) {
        return false;
      }
      if (id === "team" && !permissions.includes("collaborate_team")) {
        return false;
      }
      if (id === "roster" && !permissions.includes("read_schedule")) {
        return false;
      }
      if (id === "care-completion" && !permissions.includes("read_clinical")) {
        return false;
      }
      return true;
    },
    [permissions],
  );

  const isWidgetVisible = useCallback(
    (id: TodayWidgetId) => {
      if (!isWidgetPermitted(id)) return false;
      if (id === "briefing") return Boolean(preferences.today.showMorningBriefing);
      if (id === "metrics") return Boolean(preferences.today.showMetrics);
      if (id === "roster") return Boolean(preferences.today.showRoster);
      if (id === "queue") return Boolean(preferences.today.showActionQueue);
      if (id === "team") return preferences.today.showTeamWindow !== false;
      if (id === "shortcuts") return Boolean(preferences.today.showQuickReferences);
      if (id === "arrivals") return Boolean(preferences.today.showArrivals);
      if (id === "visit-prep") return Boolean(preferences.today.showVisitPrep);
      if (id === "care-completion") return Boolean(preferences.today.showCareCompletion);
      return false;
    },
    [preferences.today, isWidgetPermitted],
  );

  const visibleWidgets = useMemo(() => {
    return preferences.today.widgetOrder.filter((id) => isWidgetVisible(id));
  }, [preferences.today.widgetOrder, isWidgetVisible]);

  const availableAddModules = useMemo(() => {
    const permitted = filterModulesByCapabilities(DASHBOARD_MODULES, permissions);
    return permitted.filter((mod) => {
      if (mod.permanent) return false;
      const widgetId: TodayWidgetId = mod.id === "schedule" ? "roster" : (mod.id as TodayWidgetId);
      return !isWidgetVisible(widgetId);
    });
  }, [permissions, isWidgetVisible]);

  function handleAddModule(moduleId: DashboardModuleId) {
    const widgetId: TodayWidgetId = moduleId === "schedule" ? "roster" : (moduleId as TodayWidgetId);
    const meta = TODAY_SECTION_META[widgetId];
    if (meta?.visibilityKey) {
      const nextToday = { ...preferences.today, [meta.visibilityKey]: true };
      if (!nextToday.widgetOrder.includes(widgetId)) {
        nextToday.widgetOrder = [...nextToday.widgetOrder, widgetId];
      }
      applyTodayPreferences(nextToday);
      triggerToast(`Added ${meta.movedLabel} to dashboard`);
    }
    setAddOpen(false);
  }

  return (
    <div className={`today-dashboard density-${preferences.density}`}>
      {/* Header Cockpit */}
      <header className="today-header">
        <div className="today-header-left">
          <span className="today-header-eyebrow">
            {currentDate === today ? "TODAY" : getRelativeDateBadge(currentDate)}
          </span>
          <h1>{formatDashboardHeading(currentDate)}</h1>
          {/* Identity comes from the authenticated session; the practice description
              was redundant chrome on a page the clinician already knows they are in. */}
          <p>{providerDisplayLabel(user)}</p>
        </div>
        <div className="today-header-actions">
          <Button
            variant="secondary"
            size="sm"
            icon="dashboard_customize"
            onClick={() => setPresetsModalOpen(true)}
            title="Manage presets & workspace layouts"
          >
            Presets
          </Button>
          <div className="add-module-menu-anchor" ref={addMenuRef}>
            <Button
              size="sm"
              variant="secondary"
              icon="add"
              onClick={() => setAddOpen((o) => !o)}
              aria-label="Add or restore a dashboard window"
            >
              Add Window
            </Button>
            {addOpen && (
              <div className="add-module-menu" role="menu" aria-label="Available dashboard windows">
                <div className="add-module-menu-title">Available Windows</div>
                {availableAddModules.length === 0 ? (
                  <div className="add-module-menu-empty">All available windows are already visible.</div>
                ) : (
                  availableAddModules.map((mod) => (
                    <button
                      key={mod.id}
                      type="button"
                      className="add-module-menu-item"
                      onClick={() => handleAddModule(mod.id)}
                    >
                      <span className="add-module-menu-item-icon">
                        <Icon name={mod.icon} size="sm" />
                      </span>
                      <div className="add-module-menu-item-info">
                        <span className="add-module-menu-item-title">{mod.title}</span>
                        <span className="add-module-menu-item-summary">{mod.summary}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <Button
            className="today-btn"
            variant="primary"
            icon="add"
            onClick={openBooking}
          >
            Book a visit
          </Button>
        </div>
      </header>

      {preferences.privacyMode && (
        <div className="privacy-mode-banner" role="status">
          <Icon name="shield" size="sm" />
          <span>
            <strong>Privacy Display Mode Active:</strong> Patient identity and clinical narrative are masked on screen for shoulder-surfing protection. Hover over an item to inspect.
          </span>
          <span className="privacy-disclaimer">
            Does not replace server-side authorization or audit logging.
          </span>
          <button
            type="button"
            className="privacy-mode-dismiss"
            onClick={() => onUpdatePreferences?.({ ...preferences, privacyMode: false })}
            aria-label="Turn off privacy mode"
          >
            Turn off (Alt+P)
          </button>
        </div>
      )}

      {/* INTERACTIVE CALENDAR & DATE NAVIGATION BAR */}
      <div className="date-nav-bar">
        <div className="date-nav-controls">
          <Button
            className="date-nav-btn"
            size="sm"
            icon="chevron_left"
            onClick={() => setCurrentDate(stepDate(currentDate, "prev"))}
            title="Previous day"
          >
            Prev
          </Button>
          <div className="date-nav-center">
            <span className="date-nav-badge-pill">{getRelativeDateBadge(currentDate)}</span>
          </div>
          <Button
            className="date-nav-btn"
            size="sm"
            onClick={() => setCurrentDate(stepDate(currentDate, "next"))}
            title="Next day"
          >
            Next<Icon name="chevron_right" size="sm" />
          </Button>
          {currentDate !== today && (
            <button
              type="button"
              className="date-nav-today-btn"
              onClick={() => setCurrentDate(today)}
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
            <Icon name="content_paste" /> Roster Stream
          </button>
          <button
            type="button"
            className={viewMode === "timeline" ? "active" : ""}
            onClick={() => setViewMode("timeline")}
          >
            <Icon name="calendar_month" /> Zoomable Calendar
          </button>
        </div>
      </div>

      {fullScreenWidget && (
        <div className="dashboard-fullscreen-banner">
          <span>
            Focused view: {TODAY_SECTION_META[fullScreenWidget]?.movedLabel || "Window"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon="close_fullscreen"
            onClick={() => setFullScreenWidget(null)}
          >
            Return to Grid (Esc)
          </Button>
        </div>
      )}

      {/* MODULAR DASHBOARD GRID */}
      <div className={`dashboard-shell ${fullScreenWidget ? "is-fullscreen" : ""}`}>
        <div className="dashboard-shell-grid">
          {visibleWidgets.map((widgetId, index) => {
            const canMoveUp = index > 0;
            const canMoveDown = index < visibleWidgets.length - 1;
            const isFull = fullScreenWidget === widgetId;

            // 1. BRIEFING
            if (widgetId === "briefing") {
              const def = getDashboardModule("briefing")!;
              return (
                <DashboardWindowFrame
                  key="briefing"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.briefing.label}
                  containerClassName="morning-briefing-card"
                  span={spanFor("briefing")}
                  collapsed={isCollapsed("briefing")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("briefing", "up")}
                  onMoveDown={() => moveWidget("briefing", "down")}
                  onToggleCollapse={() => toggleCollapse("briefing")}
                  onCycleSpan={() => cycleSpan("briefing")}
                  onHide={() => hideSection("briefing")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "briefing")}
                >
                  <div className="morning-briefing-body">
                    {!scheduleReady ? (
                      <p>
                        {scheduleStatus === "error"
                          ? "This day could not be read, so there is nothing to summarise yet. Retry it from the roster below."
                          : "Reading this day…"}
                      </p>
                    ) : (
                      <p>
                        You have <strong>{counts.all} encounters scheduled</strong> for this date (
                        {counts.completed} completed, {counts.waiting} in office).{" "}
                        {waitingPatients.length > 0 ? (
                          <>
                            <strong className="briefing-attention">
                              {waitingPatients[0].patientName} ({waitingPatients[0].time})
                            </strong>{" "}
                            has arrived and is in {waitingPatients[0].room || "the lobby"} — ready to
                            begin the visit.
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
                    )}
                    <div className="briefing-quick-actions">
                      {waitingPatients.length > 0 ? (
                        <Button
                          className="briefing-quick-btn"
                          variant="primary"
                          size="sm"
                          icon="play_arrow"
                          onClick={() => {
                            handleStatusChange(waitingPatients[0].id, "in-visit");
                            onStartVisit(
                              waitingPatients[0].patientId,
                              waitingPatients[0].patientName,
                              waitingPatients[0].id,
                            );
                          }}
                        >
                          Start Visit: {waitingPatients[0].patientName} ({waitingPatients[0].time})
                        </Button>
                      ) : inVisitPatients.length > 0 ? (
                        <Button
                          className="briefing-quick-btn"
                          variant="primary"
                          size="sm"
                          icon="play_arrow"
                          onClick={() => onOpenChart(inVisitPatients[0].patientId, "Encounter")}
                        >
                          Resume Visit: {inVisitPatients[0].patientName}
                        </Button>
                      ) : upcomingPatients.length > 0 ? (
                        <Button
                          className="briefing-quick-btn"
                          size="sm"
                          icon="play_arrow"
                          onClick={() => onOpenChart(upcomingPatients[0].patientId, "Encounter")}
                        >
                          Open next chart: {upcomingPatients[0].patientName}
                        </Button>
                      ) : null}
                      {unsignedNote && (
                        <Button
                          className="briefing-quick-btn"
                          size="sm"
                          icon="edit"
                          onClick={() => onOpenChart(unsignedNote.patientId, "Encounter")}
                        >
                          Review {unsignedNote.patientName.split(" ")[0]}&apos;s unsigned draft
                        </Button>
                      )}
                    </div>
                  </div>
                </DashboardWindowFrame>
              );
            }

            // 2. METRICS
            if (widgetId === "metrics") {
              const def = getDashboardModule("metrics")!;
              return (
                <DashboardWindowFrame
                  key="metrics"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.metrics.label}
                  containerClassName="today-metrics-container"
                  span={spanFor("metrics")}
                  collapsed={isCollapsed("metrics")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("metrics", "up")}
                  onMoveDown={() => moveWidget("metrics", "down")}
                  onToggleCollapse={() => toggleCollapse("metrics")}
                  onCycleSpan={() => cycleSpan("metrics")}
                  onHide={() => hideSection("metrics")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "metrics")}
                  settings={
                    <CockpitMenu
                      tiles={cockpitTiles}
                      onChange={(next) => applyTodayPreferences({ ...preferences.today, cockpitTiles: next })}
                    />
                  }
                >
                  {cockpitTiles.length === 0 ? (
                    <p className="today-metrics-empty">
                      No counters selected. Add one from the metrics menu, or hide this
                      section entirely.
                    </p>
                  ) : (
                    <div className="today-metrics-grid">
                        {visibleCockpitMetrics(cockpitTiles).map((metric) => (
                          <div
                            key={metric.id}
                            className={`today-metric-card tone-${metric.tone} ${
                              metric.id === "waiting" && counts.waiting > 0 ? "highlight-urgent" : ""
                            }`}
                            onClick={() => setActiveFilter(metric.filter)}
                          >
                            <button
                              type="button"
                              className="metric-dismiss"
                              aria-label={`Remove ${metric.label} from the cockpit`}
                              title={`Remove ${metric.label}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                applyTodayPreferences({
                                  ...preferences.today,
                                  cockpitTiles: hideCockpitMetric(cockpitTiles, metric.id),
                                });
                              }}
                            >
                              <Icon name="close" size="sm" />
                            </button>
                            <div className="metric-num">
                              {scheduleReady ? cockpitValues[metric.id].value : "—"}
                            </div>
                            <div className="metric-label">{metric.label}</div>
                            <div className="metric-sub">
                              {scheduleReady
                                ? cockpitValues[metric.id].sub
                                : scheduleStatus === "error"
                                  ? "Could not be read"
                                  : "Loading…"}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </DashboardWindowFrame>
              );
            }

            // 3. ROSTER / SCHEDULE
            if (widgetId === "roster") {
              const def = getDashboardModule("schedule")!;
              return (
                <DashboardWindowFrame
                  key="roster"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.roster.label}
                  span={spanFor("roster")}
                  collapsed={isCollapsed("roster")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("roster", "up")}
                  onMoveDown={() => moveWidget("roster", "down")}
                  onToggleCollapse={() => toggleCollapse("roster")}
                  onCycleSpan={() => cycleSpan("roster")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "roster")}
                  headerNote={
                    <span className="dmf-head-note">
                      {scheduleReady
                        ? `${filteredSchedule.length} ${filteredSchedule.length === 1 ? "visit" : "visits"}`
                        : "Loading…"}
                    </span>
                  }
                >
                  <div
                    className={`today-content-grid no-sidebar ${calendarRailCollapsed ? "rail-collapsed" : ""}`}
                  >
                    <CalendarRail
                      appointments={schedule}
                      currentDate={currentDate}
                      onDateChange={setCurrentDate}
                      collapsed={calendarRailCollapsed}
                      onToggleCollapsed={() => setCalendarRailCollapsed((open) => !open)}
                    />

                    <section className="schedule-main-card">
                      <div className="schedule-card-header">
                        <div>
                          <span className="eyebrow">Patient Flow</span>
                          <h2>{viewMode === "roster" ? "Daily Encounter Roster" : "Interactive Calendar Schedule"}</h2>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {viewMode === "roster" && (
                            <RosterFieldChooser
                              selectedFields={preferences.today?.rosterFields ?? DEFAULT_ROSTER_FIELDS}
                              onChange={(nextFields) => {
                                scheduleAutosave({
                                  ...preferences,
                                  today: {
                                    ...preferences.today,
                                    rosterFields: nextFields,
                                  },
                                });
                              }}
                            />
                          )}
                          {providersInSchedule.length > 1 && (
                            <div className="provider-filter-select-wrapper" style={{ display: "flex", alignItems: "center" }}>
                              <select
                                id="roster-provider-filter"
                                className="provider-filter-select"
                                value={selectedProviderId}
                                onChange={(e) => setSelectedProviderId(e.target.value)}
                                aria-label="Filter schedule by provider"
                                style={{
                                  padding: "5px 8px",
                                  fontSize: "12px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--m3-outline-variant, #cbd5e1)",
                                  backgroundColor: "var(--m3-surface, #ffffff)",
                                  color: "var(--m3-on-surface, #1e293b)",
                                  cursor: "pointer",
                                }}
                              >
                                <option value="all">All Providers ({providersInSchedule.length})</option>
                                {providersInSchedule.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
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
                                  <Icon name="close" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {viewMode === "roster" && preferences.today.showScheduleSearch && (
                        <div className="schedule-filter-bar" role="group" aria-label="Filter the encounter roster">
                          {([
                            ["all", `All${scheduleReady ? ` (${counts.all - counts.cancelled})` : ""}`],
                            ["confirmed", `Confirmed${scheduleReady ? ` (${counts.confirmed})` : ""}`],
                            ["waiting", `In Office${scheduleReady ? ` (${counts.waiting})` : ""}`],
                            ["in-visit", `In Visit${scheduleReady ? ` (${counts.inVisit})` : ""}`],
                            ["upcoming", `Upcoming${scheduleReady ? ` (${counts.upcoming})` : ""}`],
                            ["completed", `Completed${scheduleReady ? ` (${counts.completed})` : ""}`],
                            ...(counts.cancelled > 0
                              ? ([["cancelled", `Cancelled (${counts.cancelled})`]] as const)
                              : []),
                          ] as const).map(([value, label]) => (
                            <Button
                              key={value}
                              size="sm"
                              pressed={activeFilter === value}
                              onClick={() => setActiveFilter(value as FilterTab)}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      )}

                      {viewMode === "roster" && (
                        <AsyncSection
                          className="schedule-list roster-list"
                          loading={scheduleStatus === "loading" || scheduleStatus === "idle"}
                          error={scheduleStatus === "error" ? scheduleError : null}
                          isEmpty={filteredSchedule.length === 0}
                          hasLoadedOnce={scheduleLoadedAt !== null}
                          loadingMessage="Loading the schedule…"
                          emptyMessage={
                            daySchedule.length === 0
                              ? `No visits are booked for ${formatDateHeading(currentDate)}.`
                              : `No visits match this filter on ${formatDateHeading(currentDate)}.`
                          }
                          onRetry={() => void refreshSchedule()}
                        >
                          {filteredSchedule.map((apt) => {
                            const profile = getSyntheticPatientProfile(apt.patientId);
                            return (
                              <RosterRow
                                key={apt.id}
                                appointment={apt}
                                photo={
                                  profile
                                    ? { photoUrl: profile.photoUrl, photoType: profile.photoType }
                                    : undefined
                                }
                                visibleFields={preferences.today?.rosterFields ?? DEFAULT_ROSTER_FIELDS}
                                saveStatus={savingAppointments[apt.id]}
                                saveError={appointmentErrors[apt.id]}
                                onRetrySave={() => void commitAppointmentStatus(apt.id, apt.status)}
                                onStatusChange={handleStatusChange}
                                onStartVisit={onStartVisit}
                                onOpenChart={onOpenChart}
                                onOpenVisit={(appointment) => setSelectedVisitAppointment(appointment)}
                                onEditAppointment={(appointment) => {
                                  setEditingAppointment(appointment);
                                  setEditModalMode("edit");
                                  setEditModalOpen(true);
                                }}
                                onCancelAppointment={(appointment) => {
                                  setEditingAppointment(appointment);
                                  setEditModalMode("cancel");
                                  setEditModalOpen(true);
                                }}
                                hasPendingHandoff={pendingHandoffAptIds.has(apt.id)}
                                onOpenHandoff={(appointment) => {
                                  setHandoffAppointment(appointment);
                                }}
                              />
                            );
                          })}
                        </AsyncSection>
                      )}

                      {viewMode === "timeline" && (
                        <ZoomableCalendarSchedule
                          appointments={schedule}
                          currentDate={currentDate}
                          onDateChange={setCurrentDate}
                          onStatusChange={handleStatusChange}
                          onStartVisit={onStartVisit}
                          onOpenChart={onOpenChart}
                          onBookSlot={(date, timeSlot) => {
                            setNewDate(date);
                            setNewTime(timeSlot);
                            setBookingError("");
                            setModalOpen(true);
                          }}
                        />
                      )}
                    </section>
                  </div>
                </DashboardWindowFrame>
              );
            }

            // 4. QUEUE
            if (widgetId === "queue") {
              const def = getDashboardModule("queue")!;
              return (
                <DashboardWindowFrame
                  key="queue"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.queue.label}
                  span={spanFor("queue")}
                  collapsed={isCollapsed("queue")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("queue", "up")}
                  onMoveDown={() => moveWidget("queue", "down")}
                  onToggleCollapse={() => toggleCollapse("queue")}
                  onCycleSpan={() => cycleSpan("queue")}
                  onHide={() => hideSection("queue")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "queue")}
                  headerNote={attentionStatus === "ready" ? `(${attentionQueue.length})` : undefined}
                >
                  <QueueDashboardWindow
                    items={attentionQueue}
                    status={attentionStatus}
                    error={attentionError}
                    onRetry={() => setAttentionReloads((c) => c + 1)}
                    onOpenChart={onOpenChart}
                    onOpenHandoff={(item) => {
                      if (item.appointmentId) {
                        const apt = schedule.find((a) => a.id === item.appointmentId);
                        if (apt) {
                          setHandoffAppointment(apt);
                          return;
                        }
                      }
                      onOpenChart(item.patientId, "Schedule");
                    }}
                  />
                </DashboardWindowFrame>
              );
            }

            // 5. TEAM
            if (widgetId === "team") {
              const def = getDashboardModule("team")!;
              return (
                <DashboardWindowFrame
                  key="team"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.team.label}
                  span={spanFor("team")}
                  collapsed={isCollapsed("team")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("team", "up")}
                  onMoveDown={() => moveWidget("team", "down")}
                  onToggleCollapse={() => toggleCollapse("team")}
                  onCycleSpan={() => cycleSpan("team")}
                  onHide={() => hideSection("team")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "team")}
                >
                  <TeamDashboardWindow onOpenChart={onOpenChart} />
                </DashboardWindowFrame>
              );
            }

            // 6. SHORTCUTS
            if (widgetId === "shortcuts") {
              const def = getDashboardModule("shortcuts")!;
              return (
                <DashboardWindowFrame
                  key="shortcuts"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.shortcuts.label}
                  span={spanFor("shortcuts")}
                  collapsed={isCollapsed("shortcuts")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("shortcuts", "up")}
                  onMoveDown={() => moveWidget("shortcuts", "down")}
                  onToggleCollapse={() => toggleCollapse("shortcuts")}
                  onCycleSpan={() => cycleSpan("shortcuts")}
                  onHide={() => hideSection("shortcuts")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "shortcuts")}
                >
                  <div className="shortcuts-list">
                    <button
                      type="button"
                      className="shortcut-item shortcut-calendar"
                      onClick={() => {
                        setCurrentDate(today);
                        setViewMode("timeline");
                      }}
                    >
                      <span className="shortcut-icon"><Icon name="calendar_month" /></span>
                      <div>
                        <strong>Today&apos;s Calendar Grid</strong>
                        <small>Interactive hour timeline</small>
                      </div>
                      <span className="shortcut-chevron"><Icon name="chevron_right" size="sm" /></span>
                    </button>
                    {pendingResult && (
                      <button
                        type="button"
                        className="shortcut-item shortcut-labs"
                        onClick={() => onOpenChart(pendingResult.patientId, "Labs")}
                      >
                        <span className="shortcut-icon"><Icon name="labs" /></span>
                        <div>
                          <strong>Result to acknowledge</strong>
                          <small>{pendingResult.patientName} · {pendingResult.date}</small>
                        </div>
                        <span className="shortcut-chevron"><Icon name="chevron_right" size="sm" /></span>
                      </button>
                    )}
                    {unsignedNote && (
                      <button
                        type="button"
                        className="shortcut-item shortcut-note"
                        onClick={() => onOpenChart(unsignedNote.patientId, "Encounter")}
                      >
                        <span className="shortcut-icon"><Icon name="edit" /></span>
                        <div>
                          <strong>Unsigned note</strong>
                          <small>{unsignedNote.patientName} · {unsignedNote.date}</small>
                        </div>
                        <span className="shortcut-chevron"><Icon name="chevron_right" size="sm" /></span>
                      </button>
                    )}
                    {upcomingPatients.length > 0 && (
                      <button
                        type="button"
                        className="shortcut-item shortcut-schedule"
                        onClick={() => onOpenChart(upcomingPatients[0].patientId)}
                      >
                        <span className="shortcut-icon"><Icon name="schedule" /></span>
                        <div>
                          <strong>Next arrival</strong>
                          <small>{upcomingPatients[0].patientName} · {upcomingPatients[0].time}</small>
                        </div>
                        <span className="shortcut-chevron"><Icon name="chevron_right" size="sm" /></span>
                      </button>
                    )}
                  </div>
                </DashboardWindowFrame>
              );
            }

            // 7. ARRIVALS / WAITING ROOM
            if (widgetId === "arrivals") {
              const def = getDashboardModule("arrivals")!;
              return (
                <DashboardWindowFrame
                  key="arrivals"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META.arrivals.label}
                  span={spanFor("arrivals")}
                  collapsed={isCollapsed("arrivals")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("arrivals", "up")}
                  onMoveDown={() => moveWidget("arrivals", "down")}
                  onToggleCollapse={() => toggleCollapse("arrivals")}
                  onCycleSpan={() => cycleSpan("arrivals")}
                  onHide={() => hideSection("arrivals")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "arrivals")}
                  headerNote={
                    scheduleReady
                      ? `(${waitingPatients.length + inVisitPatients.length})`
                      : undefined
                  }
                >
                  <ArrivalsDashboardWindow
                    appointments={schedule}
                    onStartVisit={onStartVisit}
                    onOpenChart={onOpenChart}
                    onStatusChange={handleStatusChange}
                  />
                </DashboardWindowFrame>
              );
            }

            // 8. VISIT PREP
            if (widgetId === "visit-prep") {
              const def = getDashboardModule("visit-prep")!;
              return (
                <DashboardWindowFrame
                  key="visit-prep"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META["visit-prep"].label}
                  span={spanFor("visit-prep")}
                  collapsed={isCollapsed("visit-prep")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("visit-prep", "up")}
                  onMoveDown={() => moveWidget("visit-prep", "down")}
                  onToggleCollapse={() => toggleCollapse("visit-prep")}
                  onCycleSpan={() => cycleSpan("visit-prep")}
                  onHide={() => hideSection("visit-prep")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "visit-prep")}
                >
                  <VisitPrepDashboardWindow
                    date={currentDate}
                    onOpenChart={onOpenChart}
                    onStartVisit={onStartVisit}
                  />
                </DashboardWindowFrame>
              );
            }

            // 9. CARE COMPLETION
            if (widgetId === "care-completion") {
              const def = getDashboardModule("care-completion")!;
              return (
                <DashboardWindowFrame
                  key="care-completion"
                  definition={def}
                  accessibleLabel={TODAY_SECTION_META["care-completion"].label}
                  span={spanFor("care-completion")}
                  collapsed={isCollapsed("care-completion")}
                  canMoveUp={canMoveUp}
                  canMoveDown={canMoveDown}
                  onMoveUp={() => moveWidget("care-completion", "up")}
                  onMoveDown={() => moveWidget("care-completion", "down")}
                  onToggleCollapse={() => toggleCollapse("care-completion")}
                  onCycleSpan={() => cycleSpan("care-completion")}
                  onHide={() => hideSection("care-completion")}
                  isFullScreen={isFull}
                  onToggleFullScreen={() => setFullScreenWidget(isFull ? null : "care-completion")}
                  headerNote={
                    careCompletionCounts
                      ? `(${careCompletionCounts.open} open)`
                      : undefined
                  }
                >
                  <CareCompletionDashboardWindow
                    onOpenChart={onOpenChart}
                    onCountsChange={setCareCompletionCounts}
                  />
                </DashboardWindowFrame>
              );
            }

            return null;
          })}
        </div>
      </div>

      {/* Add Walk-in / Appointment Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => closeBooking()}>
          <div
            className="walkin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              {/* "Walk-in" promised intake for somebody with no chart, which is not
                  a workflow the record supports (D-015 is still unimplemented). An
                  urgent same-day visit is a visit type, not a different dialog. */}
              <h3 id="booking-title">Book a visit</h3>
              <button
                type="button"
                className="modal-close"
                aria-label="Close without booking"
                onClick={() => closeBooking()}
              >
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={handleAddAppointment}>
              <div className="modal-body">
                <div className="form-group span-2">
                  <label htmlFor="booking-patient">Patient</label>
                  {/* Every option is a chart this clinician can already open. The
                      previous list named three fixed ids and offered an "Other" box
                      that built a patient id out of the typed name — a chart nothing
                      could open, on an appointment the server always refused. */}
                  <select
                    id="booking-patient"
                    ref={bookingPatientRef}
                    value={patientChoice}
                    onChange={(e) => setPatientChoice(e.target.value)}
                    required
                  >
                    <option value="">
                      {rosterStatus === "ready"
                        ? "Select a patient…"
                        : rosterStatus === "error"
                          ? "Your roster could not be loaded"
                          : "Loading your roster…"}
                    </option>
                    {roster.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name} · {patient.mrn}
                      </option>
                    ))}
                  </select>
                  {rosterStatus === "ready" && roster.length === 0 && (
                    <small className="form-hint">
                      No charts are in reach yet. A visit is booked against an existing
                      patient record, so the chart has to exist first.
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="booking-date">Date</label>
                  <input
                    id="booking-date"
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="booking-time">Start time</label>
                  <select
                    id="booking-time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                  >
                    {BOOKING_TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="booking-type">Visit type</label>
                  <select
                    id="booking-type"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as VisitType)}
                  >
                    <option value="30-min Med Check">30-min Med Check</option>
                    <option value="45-min Therapy + Meds">45-min Therapy + Meds</option>
                    <option value="60-min Intake">60-min Intake</option>
                    <option value="Psychotherapy + Meds">Psychotherapy + Meds</option>
                    <option value="Urgent Walk-in">Urgent Walk-in</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="booking-duration">Duration</label>
                  <select
                    id="booking-duration"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  >
                    <option value="30 min">30 min</option>
                    <option value="45 min">45 min</option>
                    <option value="60 min">60 min</option>
                  </select>
                </div>

                <div className="form-group span-2">
                  <label htmlFor="booking-room">Room or mode</label>
                  <select
                    id="booking-room"
                    value={newRoom}
                    onChange={(e) => setNewRoom(e.target.value)}
                  >
                    <option value="Room 1">Room 1</option>
                    <option value="Room 2">Room 2</option>
                    <option value="Room 3">Room 3</option>
                    <option value="Telehealth Room A">Telehealth · Room A</option>
                    <option value="Telehealth Room B">Telehealth · Room B</option>
                  </select>
                </div>

                <div className="form-group span-2">
                  <label htmlFor="booking-reason">Reason for visit</label>
                  <input
                    id="booking-reason"
                    placeholder="e.g. Urgent med review, acute anxiety"
                    value={newComplaint}
                    onChange={(e) => setNewComplaint(e.target.value)}
                  />
                  <small className="form-hint">
                    Optional. Recorded on the appointment, not in the chart.
                  </small>
                </div>

                <div className="form-group span-2">
                  <label htmlFor="booking-followup-interval">Follow-up Interval (Optional)</label>
                  <select
                    id="booking-followup-interval"
                    value={bookingFollowUpInterval || ""}
                    onChange={(e) => {
                      const val = (e.target.value as FollowUpInterval) || "";
                      setBookingFollowUpInterval(val ? val : undefined);
                      if (val) {
                        setNewDate(calculateFollowUpDate(currentDate, val));
                      }
                    }}
                  >
                    <option value="">No follow-up interval linked</option>
                    {FOLLOW_UP_INTERVALS.map((inv) => (
                      <option key={inv} value={inv}>
                        {inv}
                      </option>
                    ))}
                  </select>
                </div>

                {bookingOriginAptId && (
                  <div
                    className="form-group span-2"
                    style={{
                      padding: "8px 12px",
                      backgroundColor: "var(--m3-surface-variant, #f1f5f9)",
                      borderRadius: 6,
                      border: "1px solid var(--m3-outline-variant, #e2e8f0)",
                      fontSize: 12,
                      color: "var(--m3-on-surface, #1e293b)",
                    }}
                  >
                    <strong>Linked Follow-Up Visit:</strong> Origin appointment {bookingOriginAptId}
                  </div>
                )}

                {bookingError && <InlineError message={bookingError} />}
              </div>

              <div className="modal-actions">
                <Button type="button" onClick={() => closeBooking()}>
                  Cancel
                </Button>
                {/* The dialog stays open until the server confirms the booking, so a
                    refusal is visible where it happened instead of behind a toast
                    that already said it worked. */}
                <Button
                  type="submit"
                  variant="primary"
                  icon="event_available"
                  loading={bookingSubmitting}
                  loadingLabel="Booking…"
                >
                  Book visit
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast feedback */}
      {toastMessage && <div className="schedule-toast">{toastMessage}</div>}

      {/* DB-4: Visit Detail Drawer */}
      <VisitDetailDrawer
        appointment={selectedVisitAppointment}
        photo={
          selectedVisitAppointment
            ? getSyntheticPatientProfile(selectedVisitAppointment.patientId)
              ? {
                  photoUrl: getSyntheticPatientProfile(selectedVisitAppointment.patientId)!.photoUrl,
                  photoType: getSyntheticPatientProfile(selectedVisitAppointment.patientId)!.photoType,
                }
              : undefined
            : undefined
        }
        onClose={() => setSelectedVisitAppointment(null)}
        onOpenChart={(patientId) => {
          setSelectedVisitAppointment(null);
          onOpenChart(patientId);
        }}
        onStartVisit={(patientId, patientName, appointmentId) => {
          setSelectedVisitAppointment(null);
          onStartVisit(patientId, patientName, appointmentId);
        }}
        onEditAppointment={(appointment) => {
          setSelectedVisitAppointment(null);
          setEditingAppointment(appointment);
          setEditModalMode("edit");
          setEditModalOpen(true);
        }}
        onCancelAppointment={(appointment) => {
          setSelectedVisitAppointment(null);
          setEditingAppointment(appointment);
          setEditModalMode("cancel");
          setEditModalOpen(true);
        }}
        onStatusChange={handleStatusChange}
        onOpenHandoff={(appointment) => {
          setHandoffAppointment(appointment);
        }}
        onScheduleFollowUp={handleScheduleFollowUp}
      />

      {/* DB-4: Appointment Edit & Cancellation Modal */}
      <AppointmentEditModal
        isOpen={editModalOpen}
        appointment={editingAppointment}
        mode={editModalMode}
        existingSchedule={schedule}
        onClose={() => {
          setEditModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={async (appointmentId, updates) => {
          const updated = await api.appointments.update(appointmentId, updates, editingAppointment?.version);
          applyConfirmedAppointment(updated);
          void refreshSchedule();
          triggerToast("Appointment details updated.");
        }}
        onCancelVisit={async (appointmentId, reason, note) => {
          const updated = await api.appointments.cancel(appointmentId, reason, note, editingAppointment?.version);
          applyConfirmedAppointment(updated);
          void refreshSchedule();
          triggerToast("Visit cancelled.");
        }}
      />

      {/* DB-5: Workspace Preset & Layout Management Modal */}
      <PresetManagementModal
        isOpen={presetsModalOpen}
        preferences={preferences}
        onClose={() => setPresetsModalOpen(false)}
        onUpdatePreferences={(updated) => {
          scheduleAutosave(updated);
        }}
      />

      {/* DB-6: Mutual Agreement Visit Handoff Modal */}
      {handoffAppointment && (
        <VisitHandoffModal
          isOpen={handoffAppointment !== null}
          appointment={handoffAppointment}
          onClose={() => setHandoffAppointment(null)}
          onHandoffCompleted={() => {
            void refreshSchedule();
            void refreshPendingHandoffs();
            triggerToast("Visit handoff updated.");
          }}
        />
      )}

    </div>
  );
}
