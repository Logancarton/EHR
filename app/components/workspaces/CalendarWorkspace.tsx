"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type ScheduleItem,
  type VisitType,
  formatDateHeading,
  formatShortDate,
  stepDate,
  getWeekDates,
  getMonthCalendarGrid,
  minutesToTimeString,
  parseDateString,
  formatToIsoDate,
  offsetDays,
  formatTargetDateDisplay,
} from "../../lib/schedule-data";
import { practiceMinutesNow, practiceToday } from "../../lib/practice-calendar";
import { tentativeIntakeError } from "../../domain/patient-administration";
import type { BookingPatientSummary } from "../../domain/patient-administration";
import {
  buildCalendarGridLayout,
  CALENDAR_EVENT_CARD_HEIGHT,
} from "../../lib/calendar-grid-layout";
import { usePracticeSchedule, applyConfirmedAppointment } from "../../lib/schedule-store";
import { refreshPatientRoster } from "../../lib/patient-roster";
import { api } from "../../lib/api-client";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import { useAuthSession } from "../auth/AuthSessionGate";
import Icon from "../ui/Icon";
import PatientInformationDrawer from "../patient/PatientInformationDrawer";

export type CalendarViewType = "week" | "day" | "month" | "schedule";

interface CalendarWorkspaceProps {
  onClose?: () => void;
}

const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 20; // 8:00 PM
const HOURS_COUNT = CLINIC_END_HOUR - CLINIC_START_HOUR + 1;

const CLINIC_HOURS = Array.from({ length: HOURS_COUNT }, (_, i) => {
  const hour24 = CLINIC_START_HOUR + i;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  return {
    hour24,
    minutes: hour24 * 60,
    label: `${hour12} ${period}`,
  };
});

const VISIT_TYPES: VisitType[] = [
  "30-min Med Check",
  "45-min Therapy + Meds",
  "60-min Intake",
  "Psychotherapy + Meds",
  "Urgent Walk-in",
];

const ROOM_OPTIONS = ["Room 1 (Consult)", "Room 2 (Therapy)", "Exam Room 1", "Main Office"];

const DURATION_OPTIONS = [
  { label: "15 min", value: "15 min" },
  { label: "30 min", value: "30 min" },
  { label: "45 min", value: "45 min" },
  { label: "60 min", value: "60 min" },
  { label: "90 min", value: "90 min" },
];

export default function CalendarWorkspace({ onClose }: CalendarWorkspaceProps) {
  const { appointments, syncStatus, refresh } = usePracticeSchedule();
  const { user, hasPermission } = useAuthSession();
  const [roster, setRoster] = useState<BookingPatientSummary[]>([]);
  const [rosterError, setRosterError] = useState("");

  const todayStr = practiceToday();
  const [currentDate, setCurrentDate] = useState<string>(todayStr);
  const [practiceNowMinutes, setPracticeNowMinutes] = useState(() => practiceMinutesNow());
  const [viewMode, setViewMode] = useState<CalendarViewType>("week");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Category filters (Google Calendar checkboxes)
  const [showInPerson, setShowInPerson] = useState(true);
  const [showTelehealth, setShowTelehealth] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [showBreaks, setShowBreaks] = useState(true);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showWaiting, setShowWaiting] = useState(true);

  // Detail Popover
  const [selectedAppointment, setSelectedAppointment] = useState<ScheduleItem | null>(null);

  // The event editor stays inside the calendar canvas, below its toolbar.
  type EventCategoryTab = "appointment" | "non-patient" | "schedule" | "break" | "time-off";
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [eventTab, setEventTab] = useState<EventCategoryTab>("appointment");

  // Form Fields
  const [bookingDate, setBookingDate] = useState(todayStr);
  const [bookingTime, setBookingTime] = useState("10:30 AM");
  const [bookingDuration, setBookingDuration] = useState("30"); // numeric text like "30"
  const [bookingType, setBookingType] = useState<VisitType>("30-min Med Check");
  const [bookingModality, setBookingModality] = useState<"in-person" | "video">("in-person");
  const [serviceLocation, setServiceLocation] = useState("Back to Life Mental Health");
  const [bookingRoom, setBookingRoom] = useState("Room 1 (Consult)");
  const [bookingComplaint, setBookingComplaint] = useState("");
  const [bookingStatus, setBookingStatus] = useState<"tentative" | "scheduled">("scheduled");
  const [bookingSearchQuery, setBookingSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<BookingPatientSummary | null>(null);
  const [isCustomPatient, setIsCustomPatient] = useState(false);
  const [customPatientName, setCustomPatientName] = useState("");
  const [customPatientDob, setCustomPatientDob] = useState("");
  const [customPatientPhone, setCustomPatientPhone] = useState("");
  const [customPatientEmail, setCustomPatientEmail] = useState("");
  const [recurrence, setRecurrence] = useState("Does not repeat");
  const [eventNotes, setEventNotes] = useState("");
  const [selectedStaff, setSelectedStaff] = useState("None");
  const [selectedEquipment, setSelectedEquipment] = useState("Rooms & Equipment");

  // Non-Patient specific
  const [nonPatientTitle, setNonPatientTitle] = useState("");
  const [nonPatientType, setNonPatientType] = useState("Team Case Conference");

  // Schedule specific
  const [scheduleTitle, setScheduleTitle] = useState("Clinic Working Hours");

  // Break specific
  const [breakType, setBreakType] = useState("Lunch Break");

  // Time Off specific
  const [timeOffReason, setTimeOffReason] = useState("Vacation");
  const [isAllDay, setIsAllDay] = useState(false);

  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const bookingSubmitRef = useRef(false);
  const [bookingError, setBookingError] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [intakePatient, setIntakePatient] = useState<{ id: string; name: string } | null>(null);

  // Mini Calendar Month Navigation
  const [miniCalMonth, setMiniCalMonth] = useState<Date>(() => parseDateString(todayStr));

  // Time grid scroll container
  const timeGridScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setPracticeNowMinutes(practiceMinutesNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setRoster([]);
    setRosterError("");
    void api.patients.bookingRoster()
      .then((patients) => { if (active) setRoster(patients); })
      .catch((error: unknown) => {
        if (active) setRosterError(error instanceof Error ? error.message : "Could not load the booking roster.");
      });
    return () => { active = false; };
  }, [user.userId]);

  function refreshBookingRoster() {
    void api.patients.bookingRoster().then(setRoster).catch((error: unknown) => {
      setRosterError(error instanceof Error ? error.message : "Could not refresh the booking roster.");
    });
  }

  // Sync mini calendar when currentDate changes drastically
  useEffect(() => {
    const cur = parseDateString(currentDate);
    if (cur.getMonth() !== miniCalMonth.getMonth() || cur.getFullYear() !== miniCalMonth.getFullYear()) {
      setMiniCalMonth(new Date(cur.getFullYear(), cur.getMonth(), 1));
    }
  }, [currentDate]);

  // Dismiss toast after 4s
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  const [toolbarDaysInput, setToolbarDaysInput] = useState<string>("");

  function handleJumpDays(days: number) {
    const target = offsetDays(todayStr, days);
    setCurrentDate(target);
    const [y, m] = target.split("-").map(Number);
    setMiniCalMonth(new Date(y, m - 1, 1));
    const formatted = formatTargetDateDisplay(target);
    setToastMessage(`Jumped calendar to ${formatted} (${days} days later)`);
  }

  // Listen for calendar jump events (omnibox, companion panel, or external triggers)
  useEffect(() => {
    function handleJumpEvent(e: Event) {
      const ce = e as CustomEvent<{ date?: string; daysLater?: number }>;
      if (ce.detail?.date) {
        const target = ce.detail.date;
        setCurrentDate(target);
        const [y, m] = target.split("-").map(Number);
        setMiniCalMonth(new Date(y, m - 1, 1));
        const formatted = formatTargetDateDisplay(target);
        const daysText = ce.detail.daysLater ? ` (${ce.detail.daysLater} days later)` : "";
        setToastMessage(`Jumped calendar to ${formatted}${daysText}`);
      }
    }
    window.addEventListener("ehr-calendar-jump-date", handleJumpEvent);
    return () => window.removeEventListener("ehr-calendar-jump-date", handleJumpEvent);
  }, []);

  // Filtered appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((apt) => {
      const isMeeting =
        apt.type === "Team Meeting" ||
        apt.type === "Case Conference" ||
        apt.type === "Supervision" ||
        apt.mrn === "MEETING" ||
        apt.patientId?.startsWith("event-meeting");

      const isBreakOrBlock =
        apt.type === "Break" ||
        apt.type === "Time Off" ||
        apt.type === "Schedule Block" ||
        apt.mrn === "BREAK" ||
        apt.mrn === "TIME-OFF" ||
        apt.mrn === "SCHEDULE" ||
        apt.patientId?.startsWith("event-break") ||
        apt.patientId?.startsWith("event-block") ||
        apt.patientId?.startsWith("event-timeoff");

      if (isMeeting && !showMeetings) return false;
      if (isBreakOrBlock && !showBreaks) return false;

      // Clinical visit filters
      if (!isMeeting && !isBreakOrBlock) {
        if (apt.modality === "video" && !showTelehealth) return false;
        if (apt.modality !== "video" && !showInPerson) return false;
        if (apt.status === "completed" && !showCompleted) return false;
        if (apt.status === "waiting" && !showWaiting) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = apt.patientName.toLowerCase().includes(q);
        const matchComplaint = apt.chiefComplaint?.toLowerCase().includes(q);
        const matchType = apt.type.toLowerCase().includes(q);
        if (!matchName && !matchComplaint && !matchType) return false;
      }
      return true;
    });
  }, [appointments, showInPerson, showTelehealth, showMeetings, showBreaks, showCompleted, showWaiting, searchQuery]);

  // Active dates for the main view
  const activeDates = useMemo(() => {
    if (viewMode === "day") return [currentDate];
    if (viewMode === "week") return getWeekDates(currentDate);
    return [currentDate];
  }, [viewMode, currentDate]);

  // Appointments grouped by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const apt of filteredAppointments) {
      const list = map.get(apt.date) || [];
      list.push(apt);
      map.set(apt.date, list);
    }
    return map;
  }, [filteredAppointments]);

  const calendarGrid = useMemo(
    () => buildCalendarGridLayout(activeDates, appointmentsByDate, CLINIC_START_HOUR, CLINIC_END_HOUR),
    [activeDates, appointmentsByDate],
  );

  // Keep the initial working hours in view when changing grid modes.
  useEffect(() => {
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = calendarGrid.minuteTop(8 * 60 + 30);
    }
  }, [viewMode]);

  // Header Title
  const headerTitle = useMemo(() => {
    if (viewMode === "day") {
      return formatDateHeading(currentDate);
    }
    if (viewMode === "week") {
      const week = getWeekDates(currentDate);
      const start = parseDateString(week[0]);
      const end = parseDateString(week[6]);
      if (start.getMonth() === end.getMonth()) {
        const monthName = start.toLocaleDateString("en-US", { month: "long" });
        return `${monthName} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${formatShortDate(week[0])} – ${formatShortDate(week[6])}, ${end.getFullYear()}`;
    }
    if (viewMode === "month") {
      const d = parseDateString(currentDate);
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return `Schedule (${filteredAppointments.length} visits)`;
  }, [viewMode, currentDate, filteredAppointments.length]);

  // Step period: prev/next
  function handleStep(direction: "prev" | "next") {
    if (viewMode === "day") {
      setCurrentDate(stepDate(currentDate, direction));
    } else if (viewMode === "week") {
      const d = parseDateString(currentDate);
      d.setDate(d.getDate() + (direction === "next" ? 7 : -7));
      setCurrentDate(formatToIsoDate(d));
    } else if (viewMode === "month") {
      const d = parseDateString(currentDate);
      d.setMonth(d.getMonth() + (direction === "next" ? 1 : -1));
      setCurrentDate(formatToIsoDate(d));
    }
  }

  // Mini Calendar grid
  const miniGridCells = useMemo(() => {
    const year = miniCalMonth.getFullYear();
    const month = miniCalMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday

    const cells: { dateStr: string; dayNum: number; inMonth: boolean }[] = [];

    // Preceding days
    for (let i = startDayOfWeek; i > 0; i--) {
      const d = new Date(year, month, 1 - i);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: d.getDate(), inMonth: false });
    }
    // Days in month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: day, inMonth: true });
    }
    // Trailing days to fill 35 or 42 grid
    const total = cells.length > 35 ? 42 : 35;
    const remaining = total - cells.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      cells.push({ dateStr: formatToIsoDate(d), dayNum: d.getDate(), inMonth: false });
    }

    return cells;
  }, [miniCalMonth]);

  // Filtered patients for booking autocomplete
  const bookingPatientSuggestions = useMemo(() => {
    if (!bookingSearchQuery.trim()) return roster.slice(0, 8);
    const q = bookingSearchQuery.toLowerCase();
    return roster
      .filter((p) => {
        const full = `${p.name} ${p.mrn} ${p.dob} ${p.contact.mobilePhone || ""} ${p.contact.email || ""}`.toLowerCase();
        return full.includes(q);
      })
      .slice(0, 8);
  }, [bookingSearchQuery, roster]);

  // Open quick booking modal pre-filled
  function handleOpenBooking(
    dateStr: string,
    timeSlot?: string,
    defaultTab: EventCategoryTab = "appointment",
  ) {
    setBookingDate(dateStr);
    if (timeSlot) {
      setBookingTime(timeSlot);
    }
    setEventTab(defaultTab);
    setSelectedPatient(null);
    setBookingSearchQuery("");
    setIsCustomPatient(false);
    setCustomPatientName("");
    setCustomPatientDob("");
    setCustomPatientPhone("");
    setCustomPatientEmail("");
    setBookingStatus("scheduled");
    setBookingComplaint("");
    setEventNotes("");
    setNonPatientTitle("");
    setBookingError("");
    setIsBookingModalOpen(true);
  }

  // Submit new booking
  async function handleSubmitBooking(e: React.FormEvent) {
    e.preventDefault();
    if (bookingSubmitRef.current) return;
    bookingSubmitRef.current = true;
    setIsSubmittingBooking(true);
    setBookingError("");
    let createdPatientThisAttempt = false;

    const formattedDuration = bookingDuration.includes("min")
      ? bookingDuration
      : `${bookingDuration} min`;

    try {
      if (eventTab === "appointment") {
        let patient = selectedPatient;
        if (isCustomPatient) {
          const name = customPatientName.trim();
          const dob = customPatientDob.trim();
          const intakeError = tentativeIntakeError({
            name, dob, phone: customPatientPhone, email: customPatientEmail,
          });
          if (intakeError) {
            setBookingError(intakeError);
            return;
          }
          if (bookingStatus === "tentative") {
            // The front door (D-076): a first inquiry gets a prospective
            // administrative identity, not a clinical chart. Promotion to a
            // real patient — or linking to an existing one — happens
            // explicitly later from the Intake workspace.
            patient = await api.prospectivePersons.create({
              name,
              dob,
              mobilePhone: customPatientPhone.trim(),
              email: customPatientEmail.trim(),
            });
          } else {
            // Save the chart first. On a booking failure, keep its real ID selected so
            // retrying the appointment cannot create a second patient record.
            patient = await api.patients.create({
              name,
              dob,
              contact: {
                mobilePhone: customPatientPhone.trim(),
                email: customPatientEmail.trim(),
              },
            });
          }
          createdPatientThisAttempt = true;
          setSelectedPatient(patient);
          setIsCustomPatient(false);
          void refreshPatientRoster();
          refreshBookingRoster();
        }
        if (!patient) {
          setBookingError("Select a patient or create a new patient before booking.");
          return;
        }

        if (bookingStatus === "tentative") {
          const intakeError = tentativeIntakeError({
            name: patient.name,
            dob: patient.dob,
            phone: customPatientPhone,
            email: customPatientEmail,
          });
          if (intakeError) {
            setBookingError(intakeError);
            return;
          }
          const phone = customPatientPhone.trim();
          const email = customPatientEmail.trim();
          // A record just created this attempt (patient or prospect) already
          // carries exactly this contact info — nothing to sync, and a
          // prospect has no chart for `api.patients.update` to reach anyway.
          const contactDiffers = !createdPatientThisAttempt
            && (phone !== (patient.contact.mobilePhone || "") || email !== (patient.contact.email || ""));
          if (contactDiffers) {
            if (!hasPermission("edit_patient")) {
              setBookingError("Your role cannot update this patient's contact details. Ask a chart editor to complete phone and email before booking tentatively.");
              return;
            }
            patient = await api.patients.update(patient.id, { contact: { mobilePhone: phone, email } });
            setSelectedPatient(patient);
            void refreshPatientRoster();
            refreshBookingRoster();
          }
        }

        const newApt = await api.appointments.create({
          patientId: patient.id,
          patientName: patient.name,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: bookingType,
          status: bookingStatus,
          modality: bookingModality,
          room: bookingModality === "in-person" ? `${serviceLocation} • ${bookingRoom}` : undefined,
          chiefComplaint: bookingComplaint.trim() || eventNotes.trim() || `${bookingType} visit`,
          insurance: "Not recorded",
          intakeStatus: patient.status === "New Patient" ? "pending" : undefined,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        const isNewProspect = createdPatientThisAttempt && patient.status === "Prospective";
        setToastMessage(
          isNewProspect
            ? `Tentative hold for ${patient.name} on ${formatShortDate(bookingDate)} at ${bookingTime} — continue their intake from the Intake workspace.`
            : `${bookingStatus === "tentative" ? "Tentative hold" : "Unconfirmed appointment"} for ${patient.name} on ${formatShortDate(bookingDate)} at ${bookingTime}`,
        );
        // A prospect has no chart yet for the administrative drawer to open.
        if (createdPatientThisAttempt && !isNewProspect) setIntakePatient({ id: patient.id, name: patient.name });
      } else if (eventTab === "non-patient") {
        const title = nonPatientTitle.trim() || nonPatientType;
        const newApt = await api.appointments.create({
          patientId: `event-meeting-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Team Meeting",
          modality: bookingModality,
          room: bookingModality === "in-person" ? `${serviceLocation} • ${bookingRoom}` : "Virtual Video Conference",
          chiefComplaint: eventNotes.trim() || `${nonPatientType}: ${title}`,
          insurance: "Practice Event",
          dob: "N/A",
          mrn: "MEETING",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        setToastMessage(`Scheduled "${title}" on ${formatShortDate(bookingDate)} at ${bookingTime}`);
      } else if (eventTab === "schedule") {
        const title = scheduleTitle.trim() || "Practice Schedule Block";
        const newApt = await api.appointments.create({
          patientId: `event-block-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Schedule Block",
          modality: "in-person",
          room: serviceLocation,
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "SCHEDULE",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        setToastMessage(`Added schedule block "${title}" on ${formatShortDate(bookingDate)}`);
      } else if (eventTab === "break") {
        const title = breakType;
        const newApt = await api.appointments.create({
          patientId: `event-break-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: bookingTime,
          duration: formattedDuration,
          type: "Break",
          modality: "in-person",
          room: "Break Room / Personal",
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "BREAK",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        setToastMessage(`Scheduled ${title} on ${formatShortDate(bookingDate)} at ${bookingTime}`);
      } else if (eventTab === "time-off") {
        const title = `${timeOffReason} (Time Off)`;
        const newApt = await api.appointments.create({
          patientId: `event-timeoff-${Date.now()}`,
          patientName: title,
          date: bookingDate,
          time: isAllDay ? "08:00 AM" : bookingTime,
          duration: isAllDay ? "480 min" : formattedDuration,
          type: "Time Off",
          modality: "in-person",
          room: "Out of Office",
          chiefComplaint: eventNotes.trim() || title,
          insurance: "Internal",
          dob: "N/A",
          mrn: "TIME-OFF",
          age: 0,
        });

        applyConfirmedAppointment(newApt);
        await refresh();
        setToastMessage(`Recorded ${title} on ${formatShortDate(bookingDate)}`);
      }

      setIsBookingModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save event.";
      setBookingError(createdPatientThisAttempt
        ? `The patient chart was created, but the appointment was not saved. Retry the appointment without creating another chart. ${msg}`
        : msg);
    } finally {
      bookingSubmitRef.current = false;
      setIsSubmittingBooking(false);
    }
  }

  // Update appointment status
  async function handleUpdateStatus(apt: ScheduleItem, newStatus: AppointmentStatus) {
    try {
      await api.appointments.updateStatus(apt.id, newStatus, apt.patientId, apt.version);
      await refresh();
      setSelectedAppointment((prev) => (prev && prev.id === apt.id ? { ...prev, status: newStatus } : prev));
      setToastMessage(`Status updated to ${newStatus}`);
    } catch {
      setToastMessage("Failed to update status");
    }
  }

  // Cancel appointment
  async function handleCancelAppointment(apt: ScheduleItem) {
    if (!confirm(`Are you sure you want to cancel the appointment for ${apt.patientName}?`)) return;
    try {
      await api.appointments.cancel(apt.id, "Patient cancelled", undefined, apt.patientId, apt.version);
      await refresh();
      setSelectedAppointment(null);
      setToastMessage(`Cancelled appointment for ${apt.patientName}`);
    } catch {
      setToastMessage("Failed to cancel appointment");
    }
  }

  // Navigate to patient chart
  async function handleOpenChart(patientId: string) {
    setSelectedAppointment(null);
    if (onClose) onClose();
    await navigateToPatientLocation(patientId, "Overview");
  }

  // Start encounter visit
  async function handleStartVisit(apt: ScheduleItem) {
    try {
      await api.appointments.startVisit(apt.id, apt.version);
      await refresh();
    } catch {
      // Best effort
    }
    setSelectedAppointment(null);
    if (onClose) onClose();
    await navigateToPatientLocation(apt.patientId, "Encounter");
  }

  const currentTimeTopPx = calendarGrid.minuteTop(practiceNowMinutes);

  // Helper for event chip class
  function getEventChipClass(item: ScheduleItem) {
    let typeClass = "type-med-check";
    if (item.type.includes("Therapy")) typeClass = "type-therapy";
    else if (item.type.includes("Intake")) typeClass = "type-intake";
    else if (item.type.includes("Urgent")) typeClass = "type-urgent";
    else if (
      item.type === "Team Meeting" ||
      item.type === "Case Conference" ||
      item.type === "Supervision" ||
      item.mrn === "MEETING" ||
      item.patientId?.startsWith("event-meeting")
    ) {
      typeClass = "type-meeting";
    } else if (
      item.type === "Schedule Block" ||
      item.mrn === "SCHEDULE" ||
      item.patientId?.startsWith("event-block")
    ) {
      typeClass = "type-schedule";
    } else if (
      item.type === "Break" ||
      item.mrn === "BREAK" ||
      item.patientId?.startsWith("event-break")
    ) {
      typeClass = "type-break";
    } else if (
      item.type === "Time Off" ||
      item.mrn === "TIME-OFF" ||
      item.patientId?.startsWith("event-timeoff")
    ) {
      typeClass = "type-time-off";
    }

    const statusClass = `status-${item.status}`;
    return `gcal-event-chip ${typeClass} ${statusClass}`;
  }

  return (
    <div className="gcal-root">
      {/* 1. TOP HEADER TOOLBAR */}
      <header className="gcal-header">
        <div className="gcal-header-left">
          <button
            type="button"
            className="gcal-icon-btn"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" />
          </button>

          <div className="gcal-brand">
            <div className="gcal-brand-logo">
              <span className="gcal-brand-logo-top">
                {parseDateString(todayStr).toLocaleDateString("en-US", { month: "short" })}
              </span>
              <span className="gcal-brand-logo-day">
                {parseDateString(todayStr).getDate()}
              </span>
            </div>
            <span className="gcal-brand-title">Calendar</span>
          </div>

          <button
            type="button"
            className="gcal-btn-today"
            onClick={() => setCurrentDate(todayStr)}
          >
            Today
          </button>

          <div className="gcal-nav-steppers">
            <button
              type="button"
              className="gcal-icon-btn"
              title="Previous period"
              onClick={() => handleStep("prev")}
              aria-label="Previous period"
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              className="gcal-icon-btn"
              title="Next period"
              onClick={() => handleStep("next")}
              aria-label="Next period"
            >
              <Icon name="chevron_right" />
            </button>
          </div>

          <div className="gcal-interval-jump-group" role="group" aria-label="Clinical prescription interval jumps">
            <button
              type="button"
              className={`gcal-interval-chip ${currentDate === offsetDays(todayStr, 28) ? "active" : ""}`}
              onClick={() => handleJumpDays(28)}
              title="Jump 28 days later (4 weeks · 1-month refill supply)"
            >
              +28d
            </button>
            <button
              type="button"
              className={`gcal-interval-chip ${currentDate === offsetDays(todayStr, 56) ? "active" : ""}`}
              onClick={() => handleJumpDays(56)}
              title="Jump 56 days later (8 weeks · 2-month check)"
            >
              +56d
            </button>
            <button
              type="button"
              className={`gcal-interval-chip ${currentDate === offsetDays(todayStr, 84) ? "active" : ""}`}
              onClick={() => handleJumpDays(84)}
              title="Jump 84 days later (12 weeks · 3-month renewal)"
            >
              +84d
            </button>
            <div className="gcal-inline-jump-box">
              <span className="inline-jump-prefix">+</span>
              <input
                type="number"
                min="1"
                max="365"
                placeholder="Days"
                className="gcal-inline-jump-input"
                value={toolbarDaysInput}
                onChange={(e) => setToolbarDaysInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const days = parseInt(toolbarDaysInput, 10);
                    if (days > 0) handleJumpDays(days);
                  }
                }}
                aria-label="Custom days later"
                title="Jump custom days later"
              />
              <button
                type="button"
                className="gcal-inline-jump-btn"
                onClick={() => {
                  const days = parseInt(toolbarDaysInput, 10);
                  if (days > 0) handleJumpDays(days);
                }}
                title="Jump days"
              >
                Go
              </button>
            </div>
          </div>

          <h1 className="gcal-heading-date">{headerTitle}</h1>
        </div>

        {/* Center Search Bar */}
        <div className="gcal-header-center">
          <div className="gcal-search-box">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Search patients, visits, or reasons…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="gcal-search-clear"
                onClick={() => setSearchQuery("")}
                title="Clear search"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="gcal-header-right">
          <div className="gcal-sync-pill" title="Live sync active">
            <span className="gcal-sync-dot" />
            <span>{syncStatus === "live" ? "Live" : "Syncing"}</span>
          </div>

          <div className="gcal-view-selector" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "day"}
              className={`gcal-view-tab ${viewMode === "day" ? "active" : ""}`}
              onClick={() => setViewMode("day")}
            >
              Day
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "week"}
              className={`gcal-view-tab ${viewMode === "week" ? "active" : ""}`}
              onClick={() => setViewMode("week")}
            >
              Week
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "month"}
              className={`gcal-view-tab ${viewMode === "month" ? "active" : ""}`}
              onClick={() => setViewMode("month")}
            >
              Month
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "schedule"}
              className={`gcal-view-tab ${viewMode === "schedule" ? "active" : ""}`}
              onClick={() => setViewMode("schedule")}
            >
              Schedule
            </button>
          </div>

          <button
            type="button"
            className="gcal-btn-schedule-quick"
            onClick={() => handleOpenBooking(currentDate, "10:30 AM", "appointment")}
            title="New Event"
          >
            <Icon name="add" />
            <span className="gcal-btn-schedule-text">New Event</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="gcal-btn-close"
              title="Close Calendar"
              onClick={onClose}
              aria-label="Close Calendar"
            >
              ×
            </button>
          )}
        </div>
      </header>

      {/* 2. BODY LAYOUT */}
      <div className="gcal-body">
        {/* LEFT SIDEBAR */}
        <aside className={`gcal-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          {/* Mini Month Calendar Picker */}
          <div className="gcal-mini-calendar">
            <div className="gcal-mini-cal-header">
              <span className="gcal-mini-cal-title">
                {miniCalMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <div className="gcal-mini-cal-nav">
                <button
                  type="button"
                  className="gcal-mini-step-btn"
                  title="Previous month"
                  onClick={() => {
                    const prev = new Date(miniCalMonth);
                    prev.setMonth(prev.getMonth() - 1);
                    setMiniCalMonth(prev);
                  }}
                >
                  <Icon name="chevron_left" />
                </button>
                <button
                  type="button"
                  className="gcal-mini-step-btn"
                  title="Next month"
                  onClick={() => {
                    const next = new Date(miniCalMonth);
                    next.setMonth(next.getMonth() + 1);
                    setMiniCalMonth(next);
                  }}
                >
                  <Icon name="chevron_right" />
                </button>
              </div>
            </div>

            <div className="gcal-mini-grid">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i} className="gcal-mini-day-name">
                  {d}
                </div>
              ))}
              {miniGridCells.map((cell) => {
                const isSelected = cell.dateStr === currentDate;
                const isToday = cell.dateStr === todayStr;
                const hasAppts = (appointmentsByDate.get(cell.dateStr) || []).length > 0;
                return (
                  <div
                    key={cell.dateStr}
                    className={`gcal-mini-cell ${!cell.inMonth ? "other-month" : ""} ${
                      isToday ? "is-today" : ""
                    } ${isSelected ? "is-selected" : ""} ${hasAppts ? "has-appts" : ""}`}
                    onClick={() => {
                      setCurrentDate(cell.dateStr);
                    }}
                  >
                    {cell.dayNum}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Search Patients Filter */}
          <div className="gcal-sidebar-section">
            <span className="gcal-sidebar-section-title">Filter by Patient</span>
            <div className="gcal-filter-input-wrap">
              <input
                type="text"
                placeholder="Search patient name…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* "My Calendars" / Category Filters */}
          <div className="gcal-sidebar-section">
            <span className="gcal-sidebar-section-title">My Calendars</span>
            <div className="gcal-category-list">
              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showInPerson}
                  onChange={(e) => setShowInPerson(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showInPerson ? "var(--gcal-green)" : "transparent",
                    border: showInPerson ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showInPerson && "✓"}
                </span>
                <span>In-Person Consults</span>
              </label>

              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showTelehealth}
                  onChange={(e) => setShowTelehealth(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showTelehealth ? "var(--gcal-purple)" : "transparent",
                    border: showTelehealth ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showTelehealth && "✓"}
                </span>
                <span>Telehealth Video</span>
              </label>

              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showWaiting}
                  onChange={(e) => setShowWaiting(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showWaiting ? "var(--gcal-amber)" : "transparent",
                    border: showWaiting ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showWaiting && "✓"}
                </span>
                <span>In Office / Waiting</span>
              </label>

              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showMeetings}
                  onChange={(e) => setShowMeetings(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showMeetings ? "#5e35b1" : "transparent",
                    border: showMeetings ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showMeetings && "✓"}
                </span>
                <span>Team Meetings</span>
              </label>

              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showBreaks}
                  onChange={(e) => setShowBreaks(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showBreaks ? "#d97706" : "transparent",
                    border: showBreaks ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showBreaks && "✓"}
                </span>
                <span>Breaks & Blocks</span>
              </label>

              <label className="gcal-category-item">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  style={{ display: "none" }}
                />
                <span
                  className="gcal-checkbox"
                  style={{
                    backgroundColor: showCompleted ? "#5f6368" : "transparent",
                    border: showCompleted ? "none" : "2px solid #5f6368",
                  }}
                >
                  {showCompleted && "✓"}
                </span>
                <span>Completed Visits</span>
              </label>
            </div>
          </div>

          {/* Daily Stats Card */}
          <div className="gcal-sidebar-stats">
            <div className="gcal-stats-row">
              <span>Today&apos;s Appointments:</span>
              <strong>{(appointmentsByDate.get(todayStr) || []).length}</strong>
            </div>
            <div className="gcal-stats-row gcal-tentative-stat">
              <span>Tentative Holds:</span>
              <strong>{appointments.filter((item) => item.date === todayStr && item.status === "tentative").length}</strong>
            </div>
            <div className="gcal-stats-row">
              <span>Active Patients:</span>
              <strong>{roster.length}</strong>
            </div>
            <div className="gcal-stats-row">
              <span>Clinic Hours:</span>
              <strong>7 AM – 8 PM</strong>
            </div>
          </div>
        </aside>

        {/* MAIN VIEWPORT */}
        <main className="gcal-main-viewport">
          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                right: 24,
                background: "#323232",
                color: "#ffffff",
                padding: "10px 18px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 500,
                boxShadow: "var(--gcal-shadow-md)",
                zIndex: 200,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="check_circle" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* WEEK VIEW */}
          {viewMode === "week" && (
            <div className="gcal-week-view">
              {/* Header Row with Day Names & Large Date Circles */}
              <div className="gcal-week-header-row">
                {activeDates.map((dateStr) => {
                  const d = parseDateString(dateStr);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === currentDate;
                  return (
                    <div
                      key={dateStr}
                      className={`gcal-week-header-col ${isToday ? "is-today" : ""} ${
                        isSelected ? "is-selected" : ""
                      }`}
                      onClick={() => {
                        setCurrentDate(dateStr);
                        setViewMode("day");
                      }}
                    >
                      <span className="gcal-week-day-name">
                        {d.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="gcal-week-day-num">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>

              {/* All-Day / Summary Row */}
              <div className="gcal-all-day-row">
                <div className="gcal-all-day-gutter">GMT-07</div>
                <div className="gcal-all-day-cols">
                  {activeDates.map((dateStr) => {
                    const count = (appointmentsByDate.get(dateStr) || []).length;
                    return (
                      <div key={dateStr} className="gcal-all-day-col">
                        {count > 0 && (
                          <span className="gcal-all-day-chip">
                            {count} {count === 1 ? "visit" : "visits"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Grid with Red Live Line & Event Blocks */}
              <div className="gcal-scroll-grid" ref={timeGridScrollRef}>
                {/* Left Time Gutter */}
                <div className="gcal-time-gutter">
                  {CLINIC_HOURS.map((h, idx) => (
                    <div
                      key={h.hour24}
                      className="gcal-time-label"
                      style={{ top: `${calendarGrid.slotOffsets[idx * 4]}px` }}
                    >
                      {idx > 0 && h.label}
                    </div>
                  ))}
                </div>

                {/* Day Columns */}
                <div className="gcal-columns-container">
                  {activeDates.map((dateStr) => {
                    const isToday = dateStr === todayStr;
                    const eventRows = calendarGrid.eventsByDate.get(dateStr) || [];

                    return (
                      <div key={dateStr} className="gcal-day-col">
                        {/* Red Current Time Marker */}
                        {isToday && (
                          <div
                            className="gcal-now-line"
                            style={{ top: `${currentTimeTopPx}px` }}
                          >
                            <div className="gcal-now-dot" />
                          </div>
                        )}

                        {/* Background Hour Slots & Interactive Quarters */}
                        {CLINIC_HOURS.slice(0, -1).map((h, hourIndex) => (
                          <div
                            key={h.hour24}
                            className="gcal-hour-slot"
                            style={{ height: `${calendarGrid.slotOffsets[(hourIndex + 1) * 4] - calendarGrid.slotOffsets[hourIndex * 4]}px` }}
                          >
                            {[0, 15, 30, 45].map((min) => {
                              const slotTime = minutesToTimeString(h.minutes + min);
                              const slotIndex = hourIndex * 4 + min / 15;
                              return (
                                <div
                                  key={min}
                                  className="gcal-slot-quarter"
                                  style={{
                                    top: `${calendarGrid.slotOffsets[slotIndex] - calendarGrid.slotOffsets[hourIndex * 4]}px`,
                                    height: `${calendarGrid.slotHeights[slotIndex]}px`,
                                  }}
                                  title={`Click to schedule at ${slotTime}`}
                                  onClick={() => handleOpenBooking(dateStr, slotTime)}
                                />
                              );
                            })}
                          </div>
                        ))}

                        {/* Full-width start-time rows keep every name readable. */}
                        {eventRows.map(({ item, topPx }) => (
                          <button
                            type="button"
                            key={item.id}
                            className={`${getEventChipClass(item)} gcal-event-row`}
                            style={{
                              top: `${topPx}px`,
                              height: `${CALENDAR_EVENT_CARD_HEIGHT}px`,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment(item);
                            }}
                            title={`${item.time}: ${item.patientName} (${item.type}, ${item.duration}${item.status === "tentative" ? ", tentative" : ""})`}
                            aria-label={`${item.patientName}, ${item.time}, ${item.duration}, ${item.type}${item.status === "tentative" ? ", tentative" : ""}`}
                          >
                            <div className="gcal-event-header">
                              <span className="gcal-event-time">{item.time}</span>
                              {item.status === "tentative" && <span className="gcal-tentative-label">Tentative</span>}
                              {item.modality === "video" && (
                                <Icon name="videocam" size="sm" />
                              )}
                            </div>
                            <div className="gcal-event-title">{item.patientName}</div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* DAY VIEW */}
          {viewMode === "day" && (
            <div className="gcal-day-view">
              <div className="gcal-day-header">
                <div className="gcal-day-header-circle">
                  {parseDateString(currentDate).getDate()}
                </div>
                <div className="gcal-day-header-info">
                  <h2>{formatDateHeading(currentDate)}</h2>
                  <p>
                    {(appointmentsByDate.get(currentDate) || []).length} patient visits scheduled for today
                  </p>
                </div>
              </div>

              <div className="gcal-scroll-grid" ref={timeGridScrollRef}>
                <div className="gcal-time-gutter">
                  {CLINIC_HOURS.map((h, idx) => (
                    <div
                      key={h.hour24}
                      className="gcal-time-label"
                      style={{ top: `${calendarGrid.slotOffsets[idx * 4]}px` }}
                    >
                      {idx > 0 && h.label}
                    </div>
                  ))}
                </div>

                <div className="gcal-columns-container">
                  <div className="gcal-day-col" style={{ width: "100%" }}>
                    {currentDate === todayStr && (
                      <div className="gcal-now-line" style={{ top: `${currentTimeTopPx}px` }}>
                        <div className="gcal-now-dot" />
                      </div>
                    )}

                    {CLINIC_HOURS.slice(0, -1).map((h, hourIndex) => (
                      <div
                        key={h.hour24}
                        className="gcal-hour-slot"
                        style={{ height: `${calendarGrid.slotOffsets[(hourIndex + 1) * 4] - calendarGrid.slotOffsets[hourIndex * 4]}px` }}
                      >
                        {[0, 15, 30, 45].map((min) => {
                          const slotTime = minutesToTimeString(h.minutes + min);
                          const slotIndex = hourIndex * 4 + min / 15;
                          return (
                            <div
                              key={min}
                              className="gcal-slot-quarter"
                              style={{
                                top: `${calendarGrid.slotOffsets[slotIndex] - calendarGrid.slotOffsets[hourIndex * 4]}px`,
                                height: `${calendarGrid.slotHeights[slotIndex]}px`,
                              }}
                              title={`Click to schedule at ${slotTime}`}
                              onClick={() => handleOpenBooking(currentDate, slotTime)}
                            />
                          );
                        })}
                      </div>
                    ))}

                    {(calendarGrid.eventsByDate.get(currentDate) || []).map(({ item, topPx }) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`${getEventChipClass(item)} gcal-event-row`}
                        style={{
                          top: `${topPx}px`,
                          height: `${CALENDAR_EVENT_CARD_HEIGHT}px`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAppointment(item);
                        }}
                        title={`${item.time}: ${item.patientName} (${item.type}, ${item.duration}${item.status === "tentative" ? ", tentative" : ""})`}
                        aria-label={`${item.patientName}, ${item.time}, ${item.duration}, ${item.type}${item.status === "tentative" ? ", tentative" : ""}`}
                      >
                        <div className="gcal-event-header">
                          <span className="gcal-event-time">{item.time} · {item.duration}</span>
                          {item.status === "tentative" && <span className="gcal-tentative-label">Tentative</span>}
                          {item.modality === "video" && <Icon name="videocam" size="sm" />}
                        </div>
                        <div className="gcal-event-title">{item.patientName}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MONTH VIEW */}
          {viewMode === "month" && (
            <div className="gcal-month-view">
              <div className="gcal-month-header">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="gcal-month-header-day">
                    {day}
                  </div>
                ))}
              </div>

              <div className="gcal-month-grid">
                {getMonthCalendarGrid(currentDate).map((cell) => {
                  const dayApts = appointmentsByDate.get(cell.date) || [];
                  return (
                    <div
                      key={cell.date}
                      className={`gcal-month-cell ${!cell.isCurrentMonth ? "not-current-month" : ""} ${
                        cell.isToday ? "is-today" : ""
                      }`}
                      onClick={() => {
                        setCurrentDate(cell.date);
                        setViewMode("day");
                      }}
                    >
                      <div className="gcal-month-cell-top">
                        <span className="gcal-month-cell-num">{cell.dayNumber}</span>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {dayApts.slice(0, 3).map((apt) => (
                          <div
                            key={apt.id}
                            className={`gcal-month-event-pill status-${apt.status} type-${
                              apt.type.includes("Therapy") ? "therapy" : "med-check"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAppointment(apt);
                            }}
                            title={`${apt.time}: ${apt.patientName}`}
                          >
                            <span style={{ fontWeight: 700 }}>{apt.time.split(" ")[0]}</span>
                            <span>{apt.patientName}</span>
                            {apt.status === "tentative" && <span className="gcal-month-tentative-label">Tentative</span>}
                          </div>
                        ))}
                        {dayApts.length > 3 && (
                          <span className="gcal-month-more">+{dayApts.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AGENDA / SCHEDULE VIEW */}
          {viewMode === "schedule" && (
            <div className="gcal-agenda-view">
              {Array.from(appointmentsByDate.entries())
                .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                .map(([dateStr, items]) => (
                  <div key={dateStr} className="gcal-agenda-group">
                    <div className="gcal-agenda-date-heading">
                      <span>{formatDateHeading(dateStr)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--gcal-text-secondary)" }}>
                        {items.length} {items.length === 1 ? "visit" : "visits"}
                      </span>
                    </div>

                    {items.map((apt) => (
                      <div
                        key={apt.id}
                        className="gcal-agenda-row"
                        onClick={() => setSelectedAppointment(apt)}
                      >
                        <div className="gcal-agenda-time">
                          {apt.time}
                          <div style={{ fontSize: 11, color: "var(--gcal-text-muted)" }}>
                            {apt.duration}
                          </div>
                        </div>

                        <div className="gcal-agenda-patient">
                          <span className="gcal-agenda-name">{apt.patientName}</span>
                          <span className="gcal-agenda-sub">
                            {apt.type} • {apt.modality === "video" ? "Telehealth Video" : apt.room || "In-Person"}
                          </span>
                          {apt.chiefComplaint && (
                            <span style={{ fontSize: 12, color: "var(--gcal-text-muted)", fontStyle: "italic" }}>
                              &ldquo;{apt.chiefComplaint}&rdquo;
                            </span>
                          )}
                        </div>

                        <span
                          className={`gcal-agenda-status status-${apt.status}`}
                          style={{
                            padding: "4px 10px",
                            borderRadius: "12px",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {APPOINTMENT_STATUS_LABELS[apt.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </main>
      </div>

      {/* 3. EVENT DETAIL POPOVER */}
      {selectedAppointment && (
        <div
          className="gcal-event-popover-backdrop"
          onClick={() => setSelectedAppointment(null)}
        >
          <div
            className="gcal-event-popover"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="gcal-popover-banner"
              style={{
                backgroundColor: selectedAppointment.status === "tentative"
                  ? "#d97706"
                  : selectedAppointment.type.includes("Therapy")
                  ? "var(--gcal-purple)"
                  : "var(--gcal-primary)",
              }}
            />
            <div className="gcal-popover-header">
              <button
                type="button"
                className="gcal-icon-btn"
                title="Delete appointment"
                onClick={() => handleCancelAppointment(selectedAppointment)}
              >
                <Icon name="delete" />
              </button>
              <button
                type="button"
                className="gcal-icon-btn"
                title="Close"
                onClick={() => setSelectedAppointment(null)}
              >
                <Icon name="close" />
              </button>
            </div>

            {(() => {
              const isNonPatient =
                selectedAppointment.mrn === "MEETING" ||
                selectedAppointment.mrn === "BREAK" ||
                selectedAppointment.mrn === "TIME-OFF" ||
                selectedAppointment.mrn === "SCHEDULE" ||
                selectedAppointment.patientId?.startsWith("event-");

              const categoryBadge =
                selectedAppointment.mrn === "MEETING"
                  ? "Practice Meeting"
                  : selectedAppointment.mrn === "BREAK"
                  ? "Break / Personal"
                  : selectedAppointment.mrn === "TIME-OFF"
                  ? "Time Off"
                  : selectedAppointment.mrn === "SCHEDULE"
                  ? "Schedule Block"
                  : null;

              return (
                <>
                  <div className="gcal-popover-body">
                    <div className="gcal-popover-title-row">
                      <div
                        className="gcal-popover-color-box"
                        style={{
                          backgroundColor:
                            selectedAppointment.mrn === "MEETING"
                              ? "#5e35b1"
                              : selectedAppointment.mrn === "BREAK"
                              ? "#d97706"
                              : selectedAppointment.mrn === "TIME-OFF"
                              ? "#be123c"
                              : selectedAppointment.mrn === "SCHEDULE"
                              ? "#00695c"
                              : selectedAppointment.type.includes("Therapy")
                              ? "var(--gcal-purple)"
                              : "var(--gcal-primary)",
                        }}
                      />
                      <div>
                        <h3 className="gcal-popover-patient-name">
                          {selectedAppointment.patientName}
                        </h3>
                        {isNonPatient ? (
                          <div style={{ fontSize: 12, color: "#0f4c47", fontWeight: 600, marginTop: 2 }}>
                            {categoryBadge || selectedAppointment.type}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--gcal-text-secondary)", marginTop: 2 }}>
                            MRN: {selectedAppointment.mrn} • Age: {selectedAppointment.age}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="gcal-popover-time-row">
                      <Icon name="schedule" />
                      <span>
                        {formatDateHeading(selectedAppointment.date)} • {selectedAppointment.time} (
                        {selectedAppointment.duration})
                      </span>
                    </div>

                    <div className="gcal-popover-meta-row">
                      <Icon name={isNonPatient ? "event_note" : "medical_services"} />
                      <div>
                        <strong>{selectedAppointment.type}</strong>
                        <div>{selectedAppointment.chiefComplaint || "Routine event"}</div>
                      </div>
                    </div>

                    {selectedAppointment.room && (
                      <div className="gcal-popover-meta-row">
                        <Icon name={selectedAppointment.modality === "video" ? "videocam" : "room"} />
                        <span>
                          {selectedAppointment.modality === "video"
                            ? "Telehealth Secure Video"
                            : selectedAppointment.room}
                        </span>
                      </div>
                    )}

                    {!isNonPatient && (
                      <div className="gcal-popover-meta-row" style={{ alignItems: "center" }}>
                        <Icon name="info" />
                        <span style={{ marginRight: 8 }}>Status:</span>
                        <select
                          value={selectedAppointment.status}
                          onChange={(e) =>
                            handleUpdateStatus(selectedAppointment, e.target.value as AppointmentStatus)
                          }
                          className="gcal-select-field"
                          style={{ height: 32, fontSize: 12 }}
                        >
                          <option value="tentative">Tentative</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="confirmed">Confirmed</option>
                          <option value="waiting">In Office / Waiting</option>
                          <option value="in-visit">In Visit</option>
                          <option value="completed">Completed</option>
                          <option value="no-show">No Show</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="gcal-popover-actions">
                    {isNonPatient ? (
                      <button
                        type="button"
                        className="gcal-btn-text"
                        style={{ color: "#d93025" }}
                        onClick={() => handleCancelAppointment(selectedAppointment)}
                      >
                        Cancel Event
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="gcal-btn-text"
                          onClick={() => handleOpenChart(selectedAppointment.patientId)}
                        >
                          Open Chart
                        </button>
                        {hasPermission("edit_patient") && (
                          <button
                            type="button"
                            className="gcal-btn-text"
                            onClick={() => {
                              setIntakePatient({ id: selectedAppointment.patientId, name: selectedAppointment.patientName });
                              setSelectedAppointment(null);
                            }}
                          >
                            Continue Intake
                          </button>
                        )}
                        <button
                          type="button"
                          className="gcal-btn-submit"
                          onClick={() => handleStartVisit(selectedAppointment)}
                        >
                          Start Visit
                        </button>
                      </>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Contextual event editor keeps the calendar visible while scheduling. */}
      {isBookingModalOpen && (
        <div
          className="gcal-modal-backdrop"
          onClick={() => { if (!isSubmittingBooking) setIsBookingModalOpen(false); }}
        >
          <div
            className="gcal-modal-window gcal-modal-card"
            role="dialog"
            aria-label="New event"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Editor Header */}
            <div className="gcal-modal-header">
              <h3>New Event</h3>
              <div className="gcal-modal-header-actions">
                <button
                  type="button"
                  className="gcal-icon-btn"
                  title="Close"
                  aria-label="Close event editor"
                  disabled={isSubmittingBooking}
                  onClick={() => setIsBookingModalOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>

            {/* 5-Tab Segmented Bar */}
            <div className="gcal-event-tabs-bar">
              <div className="gcal-event-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === "appointment"}
                  className={`gcal-event-tab ${eventTab === "appointment" ? "active" : ""}`}
                  onClick={() => setEventTab("appointment")}
                >
                  {eventTab === "appointment" && "✓ "}Appointment
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === "non-patient"}
                  className={`gcal-event-tab ${eventTab === "non-patient" ? "active" : ""}`}
                  onClick={() => setEventTab("non-patient")}
                >
                  {eventTab === "non-patient" && "✓ "}Non-Patient
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === "schedule"}
                  className={`gcal-event-tab ${eventTab === "schedule" ? "active" : ""}`}
                  onClick={() => setEventTab("schedule")}
                >
                  {eventTab === "schedule" && "✓ "}Schedule
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === "break"}
                  className={`gcal-event-tab ${eventTab === "break" ? "active" : ""}`}
                  onClick={() => setEventTab("break")}
                >
                  {eventTab === "break" && "✓ "}Break
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventTab === "time-off"}
                  className={`gcal-event-tab ${eventTab === "time-off" ? "active" : ""}`}
                  onClick={() => setEventTab("time-off")}
                >
                  {eventTab === "time-off" && "✓ "}Time Off
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmitBooking}>
              <div className="gcal-modal-body">
                {bookingError && (
                  <div className="gcal-editor-error" role="alert">
                    {bookingError}
                  </div>
                )}

                {/* Date & Provider Banner */}
                <h2 className="gcal-event-date-heading">{formatDateHeading(bookingDate)}</h2>
                <div className="gcal-provider-badge">
                  <div className="gcal-provider-avatar">
                    <Icon name="badge" size="sm" />
                  </div>
                  <span className="gcal-provider-name">{user.displayName}</span>
                </div>

                {/* TAB 1: APPOINTMENT */}
                {eventTab === "appointment" && (
                  <>
                    {/* Patient Field */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {!isCustomPatient ? (
                        <div>
                          {selectedPatient ? (
                            <div className="gcal-patient-selected-card">
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div className="gcal-patient-avatar">
                                  {selectedPatient.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <strong style={{ fontSize: 14 }}>{selectedPatient.name}</strong>
                                  <div style={{ fontSize: 12, color: "var(--gcal-text-secondary)" }}>
                                    MRN: {selectedPatient.mrn} • DOB: {selectedPatient.dob}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="gcal-icon-btn"
                                onClick={() => setSelectedPatient(null)}
                                title="Change patient"
                              >
                                <Icon name="close" />
                              </button>
                            </div>
                          ) : (
                            <div className="gcal-patient-search-input-wrap">
                              <div className="gcal-field-fieldset" style={{ width: "100%" }}>
                                <span className="gcal-field-fieldset-label">Patient *</span>
                                <input
                                  type="text"
                                  placeholder="Search by name, phone, email, MRN, or birth date"
                                  aria-label="Search patients"
                                  value={bookingSearchQuery}
                                  onChange={(e) => setBookingSearchQuery(e.target.value)}
                                  autoFocus
                                />
                                <Icon name="arrow_drop_down" />
                              </div>
                              {bookingSearchQuery.trim().length >= 2 && (
                                <div className="gcal-patient-dropdown">
                                  {hasPermission("edit_patient") && (
                                    <button
                                      type="button"
                                      className="gcal-patient-item gcal-patient-custom"
                                      onClick={() => {
                                        setCustomPatientName(bookingSearchQuery.trim());
                                        setIsCustomPatient(true);
                                        setBookingStatus("tentative");
                                      }}
                                    >
                                      <Icon name="person_add" size="sm" />
                                      <span>Create new patient</span>
                                    </button>
                                  )}
                                  {bookingPatientSuggestions.length === 0 && (
                                    <div className="gcal-patient-empty">No matching patient in the roster.</div>
                                  )}
                                  {bookingPatientSuggestions.map((p) => (
                                    <button
                                      type="button"
                                      key={p.id}
                                      className="gcal-patient-item"
                                      onClick={() => {
                                        setSelectedPatient(p);
                                        setBookingSearchQuery("");
                                        setCustomPatientPhone(p.contact.mobilePhone || "");
                                        setCustomPatientEmail(p.contact.email || "");
                                      }}
                                    >
                                      <div className="gcal-patient-avatar">
                                        {p.name.slice(0, 2).toUpperCase()}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: "var(--gcal-text-muted)" }}>
                                          MRN: {p.mrn} • Age: {p.age} • {p.dob}
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {!selectedPatient && (
                            <div className="gcal-field-helper">{rosterError || "Enter at least 2 characters to search the patient roster."}</div>
                          )}
                          {!selectedPatient && bookingSearchQuery.trim().length < 2 && hasPermission("edit_patient") && (
                            <button
                              type="button"
                              className="gcal-create-patient-link"
                              onClick={() => {
                                setCustomPatientName(bookingSearchQuery.trim());
                                setIsCustomPatient(true);
                                setBookingStatus("tentative");
                              }}
                            >
                              <Icon name="person_add" size="sm" />
                              Create new patient
                            </button>
                          )}
                          {!selectedPatient && !hasPermission("edit_patient") && (
                            <div className="gcal-field-helper">Your role cannot create a patient chart; select an existing patient.</div>
                          )}
                          {selectedPatient && (
                            <div className="gcal-field-helper">Choose Tentative while you finish intake, or Scheduled for an unconfirmed appointment.</div>
                          )}
                        </div>
                      ) : (
                        <div className="gcal-new-patient-fields">
                          <div className="gcal-new-patient-heading">
                            <strong>New patient</strong>
                            <button
                              type="button"
                              className="gcal-btn-text"
                              onClick={() => setIsCustomPatient(false)}
                            >
                              Back to roster
                            </button>
                          </div>
                          <label className="gcal-new-patient-field">
                            Full name *
                            <input
                              type="text"
                              value={customPatientName}
                              onChange={(e) => setCustomPatientName(e.target.value)}
                              autoFocus
                              required
                            />
                          </label>
                          <div className="gcal-new-patient-row">
                            <label className="gcal-new-patient-field">
                              Date of birth *
                              <input
                                type="date"
                                value={customPatientDob}
                                onChange={(e) => setCustomPatientDob(e.target.value)}
                                required
                              />
                            </label>
                            <label className="gcal-new-patient-field">
                              Callback phone *
                              <input
                                type="tel"
                                value={customPatientPhone}
                                onChange={(e) => setCustomPatientPhone(e.target.value)}
                                autoComplete="tel"
                                required
                              />
                            </label>
                          </div>
                          <label className="gcal-new-patient-field">
                            Email *
                            <input
                              type="email"
                              value={customPatientEmail}
                              onChange={(e) => setCustomPatientEmail(e.target.value)}
                              autoComplete="email"
                              required
                            />
                          </label>
                          <p className="gcal-field-helper">
                            {bookingStatus === "tentative"
                              ? "Held as a prospective record, not a clinical chart yet — no message is sent. Continue their intake from the Intake workspace to confirm identity and create or link the chart."
                              : "The chart receives an MRN automatically. Contact details are saved to the patient chart; no message is sent."}
                          </p>
                        </div>
                      )}
                    </div>

                    <fieldset className="gcal-booking-status-choice">
                      <legend>Booking status</legend>
                      <label>
                        <input
                          type="radio"
                          name="booking-status"
                          checked={bookingStatus === "tentative"}
                          onChange={() => setBookingStatus("tentative")}
                        />
                        <span><strong>Tentative hold</strong><small>Intake or confirmation pending</small></span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="booking-status"
                          checked={bookingStatus === "scheduled"}
                          onChange={() => setBookingStatus("scheduled")}
                        />
                        <span><strong>Scheduled</strong><small>On the books, unconfirmed</small></span>
                      </label>
                    </fieldset>

                    {selectedPatient && bookingStatus === "tentative" && (
                      <div className="gcal-new-patient-fields">
                        <strong>Callback details for this hold</strong>
                        <div className="gcal-new-patient-row">
                          <label className="gcal-new-patient-field">
                            Callback phone *
                            <input
                              type="tel"
                              value={customPatientPhone}
                              onChange={(e) => setCustomPatientPhone(e.target.value)}
                              required
                              disabled={!hasPermission("edit_patient")}
                            />
                          </label>
                          <label className="gcal-new-patient-field">
                            Email *
                            <input
                              type="email"
                              value={customPatientEmail}
                              onChange={(e) => setCustomPatientEmail(e.target.value)}
                              required
                              disabled={!hasPermission("edit_patient")}
                            />
                          </label>
                        </div>
                        <p className="gcal-field-helper">Changes here update the patient chart before the hold is saved.</p>
                      </div>
                    )}

                    {/* Visit Reason */}
                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Visit Reason *</span>
                      <select
                        value={bookingType}
                        onChange={(e) => setBookingType(e.target.value as VisitType)}
                      >
                        {VISIT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mode & Location */}
                    <div>
                      <div className="gcal-form-section-title">Appointment Mode & Location</div>
                      <div className="gcal-mode-radios">
                        <label className="gcal-mode-radio-label">
                          <input
                            type="radio"
                            name="modality"
                            checked={bookingModality === "in-person"}
                            onChange={() => setBookingModality("in-person")}
                          />
                          <span>In Office</span>
                        </label>
                        <label className="gcal-mode-radio-label">
                          <input
                            type="radio"
                            name="modality"
                            checked={bookingModality === "video"}
                            onChange={() => setBookingModality("video")}
                          />
                          <span>Telehealth</span>
                          <span title="HIPAA-compliant video encounter">ⓘ</span>
                        </label>
                      </div>

                      <div className="gcal-field-fieldset" style={{ marginTop: 8 }}>
                        <span className="gcal-field-fieldset-label">Service Location *</span>
                        <select
                          value={serviceLocation}
                          onChange={(e) => setServiceLocation(e.target.value)}
                        >
                          <option value="Back to Life Mental Health">Back to Life Mental Health</option>
                          <option value="Downtown Practice Suite 400">Downtown Practice Suite 400</option>
                          <option value="Telehealth Virtual Office">Telehealth Virtual Office</option>
                        </select>
                      </div>
                    </div>

                    {/* Date & Time */}
                    <div>
                      <div className="gcal-form-section-title">Date & Time</div>
                      <div className="gcal-time-zone-hint">
                        Mountain Standard Time Zone
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Date *</span>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>

                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Time *</span>
                          <select
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                          >
                            {Array.from({ length: 48 }, (_, i) => {
                              const totalMins = 7 * 60 + i * 15;
                              if (totalMins > 20 * 60) return null;
                              const timeStr = minutesToTimeString(totalMins);
                              return (
                                <option key={timeStr} value={timeStr}>
                                  {timeStr}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, marginTop: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Duration * (min)</span>
                          <input
                            type="number"
                            min="5"
                            max="240"
                            step="5"
                            value={bookingDuration}
                            onChange={(e) => setBookingDuration(e.target.value)}
                          />
                        </div>

                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Recurrence</span>
                          <select
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value)}
                          >
                            <option value="Does not repeat">Does not repeat</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Every 2 weeks">Every 2 weeks</option>
                            <option value="Monthly">Monthly</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="gcal-notes-box">
                      <textarea
                        placeholder="Notes"
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                      />
                    </div>

                    {/* Resources */}
                    <div>
                      <div className="gcal-form-section-title">Resources</div>
                      <div className="gcal-resource-status-box">
                        <span>{user.displayName}</span>
                        <span className="gcal-resource-available-tag">Available</span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Staff</span>
                          <select
                            value={selectedStaff}
                            onChange={(e) => setSelectedStaff(e.target.value)}
                          >
                            <option value="None">None</option>
                            <option value="Dr. Sarah Lin, MD">Dr. Sarah Lin, MD</option>
                            <option value="Clinical Coordinator">Clinical Coordinator</option>
                            <option value="Nurse Practitioner">Nurse Practitioner</option>
                          </select>
                        </div>

                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Rooms & Equipment</span>
                          <select
                            value={bookingRoom}
                            onChange={(e) => setBookingRoom(e.target.value)}
                          >
                            {ROOM_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 2: NON-PATIENT */}
                {eventTab === "non-patient" && (
                  <>
                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Event Title *</span>
                      <input
                        type="text"
                        placeholder="e.g. Multidisciplinary Case Conference, Team Huddle"
                        value={nonPatientTitle}
                        onChange={(e) => setNonPatientTitle(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Event Type *</span>
                      <select
                        value={nonPatientType}
                        onChange={(e) => setNonPatientType(e.target.value)}
                      >
                        <option value="Team Case Conference">Team Case Conference</option>
                        <option value="Multidisciplinary Huddle">Multidisciplinary Huddle</option>
                        <option value="Peer Supervision">Peer Supervision</option>
                        <option value="Grand Rounds / CME">Grand Rounds / CME</option>
                        <option value="Staff Meeting">Staff Meeting</option>
                        <option value="Admin & Charting">Admin & Charting</option>
                      </select>
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Mode & Location</div>
                      <div className="gcal-mode-radios">
                        <label className="gcal-mode-radio-label">
                          <input
                            type="radio"
                            name="nonPatientModality"
                            checked={bookingModality === "in-person"}
                            onChange={() => setBookingModality("in-person")}
                          />
                          <span>In Office / Conference Room</span>
                        </label>
                        <label className="gcal-mode-radio-label">
                          <input
                            type="radio"
                            name="nonPatientModality"
                            checked={bookingModality === "video"}
                            onChange={() => setBookingModality("video")}
                          />
                          <span>Video Conference</span>
                        </label>
                      </div>

                      <div className="gcal-field-fieldset" style={{ marginTop: 8 }}>
                        <span className="gcal-field-fieldset-label">Location / Room *</span>
                        <select
                          value={bookingRoom}
                          onChange={(e) => setBookingRoom(e.target.value)}
                        >
                          <option value="Conference Room A">Conference Room A</option>
                          <option value="Consult Room 1">Consult Room 1</option>
                          <option value="Staff Lounge">Staff Lounge</option>
                          <option value="Virtual Meeting Room">Virtual Meeting Room</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Date & Time</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Date *</span>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Time *</span>
                          <select
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                          >
                            {Array.from({ length: 48 }, (_, i) => {
                              const totalMins = 7 * 60 + i * 15;
                              if (totalMins > 20 * 60) return null;
                              const timeStr = minutesToTimeString(totalMins);
                              return (
                                <option key={timeStr} value={timeStr}>
                                  {timeStr}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, marginTop: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Duration * (min)</span>
                          <input
                            type="number"
                            min="15"
                            max="240"
                            step="15"
                            value={bookingDuration}
                            onChange={(e) => setBookingDuration(e.target.value)}
                          />
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Recurrence</span>
                          <select
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value)}
                          >
                            <option value="Does not repeat">Does not repeat</option>
                            <option value="Weekly">Weekly</option>
                            <option value="Every 2 weeks">Every 2 weeks</option>
                            <option value="Monthly">Monthly</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="gcal-notes-box">
                      <textarea
                        placeholder="Agenda, discussion topics, or meeting notes…"
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                      />
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Resources</div>
                      <div className="gcal-resource-status-box">
                        <span>{user.displayName} (Host)</span>
                        <span className="gcal-resource-available-tag">Confirmed</span>
                      </div>
                    </div>
                  </>
                )}

                {/* TAB 3: SCHEDULE */}
                {eventTab === "schedule" && (
                  <>
                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Schedule Block Title *</span>
                      <input
                        type="text"
                        placeholder="e.g. Morning Clinical Hours, Afternoon Open Walk-ins"
                        value={scheduleTitle}
                        onChange={(e) => setScheduleTitle(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>

                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Service Location *</span>
                      <select
                        value={serviceLocation}
                        onChange={(e) => setServiceLocation(e.target.value)}
                      >
                        <option value="Back to Life Mental Health">Back to Life Mental Health</option>
                        <option value="Downtown Practice Suite 400">Downtown Practice Suite 400</option>
                        <option value="Telehealth Virtual Office">Telehealth Virtual Office</option>
                      </select>
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Date & Hours</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Date *</span>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Start Time *</span>
                          <select
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                          >
                            {Array.from({ length: 48 }, (_, i) => {
                              const totalMins = 7 * 60 + i * 15;
                              if (totalMins > 20 * 60) return null;
                              const timeStr = minutesToTimeString(totalMins);
                              return (
                                <option key={timeStr} value={timeStr}>
                                  {timeStr}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12, marginTop: 12 }}>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Duration * (min)</span>
                          <input
                            type="number"
                            min="30"
                            max="600"
                            step="30"
                            value={bookingDuration}
                            onChange={(e) => setBookingDuration(e.target.value)}
                          />
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Recurrence</span>
                          <select
                            value={recurrence}
                            onChange={(e) => setRecurrence(e.target.value)}
                          >
                            <option value="Does not repeat">Does not repeat</option>
                            <option value="Every weekday">Every weekday (Mon - Fri)</option>
                            <option value="Weekly">Weekly</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="gcal-notes-box">
                      <textarea
                        placeholder="Schedule notes (e.g. In-person only, emergency slots reserved)…"
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* TAB 4: BREAK */}
                {eventTab === "break" && (
                  <>
                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Break Type *</span>
                      <select
                        value={breakType}
                        onChange={(e) => setBreakType(e.target.value)}
                      >
                        <option value="Lunch Break">Lunch Break</option>
                        <option value="Coffee / Rest Break">Coffee / Rest Break</option>
                        <option value="Personal Time">Personal Time</option>
                        <option value="Administrative Catch-Up">Administrative Catch-Up</option>
                      </select>
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Date & Time</div>
                      <div className="gcal-time-grid">
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Date *</span>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Time *</span>
                          <select
                            value={bookingTime}
                            onChange={(e) => setBookingTime(e.target.value)}
                          >
                            {Array.from({ length: 48 }, (_, i) => {
                              const totalMins = 7 * 60 + i * 15;
                              if (totalMins > 20 * 60) return null;
                              const timeStr = minutesToTimeString(totalMins);
                              return (
                                <option key={timeStr} value={timeStr}>
                                  {timeStr}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Duration * (min)</span>
                          <input
                            type="number"
                            min="10"
                            max="120"
                            step="5"
                            value={bookingDuration}
                            onChange={(e) => setBookingDuration(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="gcal-notes-box">
                      <textarea
                        placeholder="Notes or coverage details…"
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* TAB 5: TIME OFF */}
                {eventTab === "time-off" && (
                  <>
                    <div className="gcal-field-fieldset">
                      <span className="gcal-field-fieldset-label">Reason *</span>
                      <select
                        value={timeOffReason}
                        onChange={(e) => setTimeOffReason(e.target.value)}
                      >
                        <option value="Vacation">Vacation</option>
                        <option value="CME / Conference">CME / Medical Conference</option>
                        <option value="Personal Time Off">Personal Time Off</option>
                        <option value="Sick Leave">Sick Leave</option>
                        <option value="Clinic Closure">Clinic Closure</option>
                      </select>
                    </div>

                    <div style={{ margin: "4px 0" }}>
                      <label className="gcal-mode-radio-label">
                        <input
                          type="checkbox"
                          checked={isAllDay}
                          onChange={(e) => setIsAllDay(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: "var(--gcal-primary)" }}
                        />
                        <span>All-day time off</span>
                      </label>
                    </div>

                    <div>
                      <div className="gcal-form-section-title">Date & Time</div>
                      <div className="gcal-time-grid">
                        <div className="gcal-field-fieldset">
                          <span className="gcal-field-fieldset-label">Date *</span>
                          <input
                            type="date"
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            required
                          />
                        </div>
                        {!isAllDay && (
                          <>
                            <div className="gcal-field-fieldset">
                              <span className="gcal-field-fieldset-label">Time *</span>
                              <select
                                value={bookingTime}
                                onChange={(e) => setBookingTime(e.target.value)}
                              >
                                {Array.from({ length: 48 }, (_, i) => {
                                  const totalMins = 7 * 60 + i * 15;
                                  if (totalMins > 20 * 60) return null;
                                  const timeStr = minutesToTimeString(totalMins);
                                  return (
                                    <option key={timeStr} value={timeStr}>
                                      {timeStr}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <div className="gcal-field-fieldset">
                              <span className="gcal-field-fieldset-label">Duration * (min)</span>
                              <input
                                type="number"
                                min="30"
                                max="480"
                                step="30"
                                value={bookingDuration}
                                onChange={(e) => setBookingDuration(e.target.value)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="gcal-notes-box">
                      <textarea
                        placeholder="Coverage arrangements, out of office notes, or instructions…"
                        value={eventNotes}
                        onChange={(e) => setEventNotes(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="gcal-modal-footer">
                <button
                  type="button"
                  className="gcal-btn-text"
                  disabled={isSubmittingBooking}
                  onClick={() => setIsBookingModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="gcal-btn-submit"
                  disabled={isSubmittingBooking}
                >
                  {isSubmittingBooking
                    ? "Saving…"
                    : eventTab === "appointment"
                    ? isCustomPatient
                      ? (bookingStatus === "tentative" ? "Hold & Start Intake" : "Create Patient & Hold")
                      : bookingStatus === "tentative" ? "Save Tentative Hold" : "Create Appointment"
                    : eventTab === "non-patient"
                    ? "Create Event"
                    : eventTab === "schedule"
                    ? "Save Schedule Block"
                    : eventTab === "break"
                    ? "Schedule Break"
                    : "Record Time Off"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {intakePatient && (
        <PatientInformationDrawer
          patientId={intakePatient.id}
          patientName={intakePatient.name}
          onClose={() => setIntakePatient(null)}
        />
      )}
    </div>
  );
}
