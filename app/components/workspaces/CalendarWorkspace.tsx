"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ScheduleItem,
  type VisitType,
  formatDateHeading,
  formatShortDate,
  minutesToTimeString,
} from "../../lib/schedule-data";
import { tentativeIntakeError } from "../../domain/patient-administration";
import type { BookingPatientSummary } from "../../domain/patient-administration";
import { usePracticeSchedule, applyConfirmedAppointment } from "../../lib/schedule-store";
import { refreshPatientRoster } from "../../lib/patient-roster";
import { api } from "../../lib/api-client";
import { useAuthSession } from "../auth/AuthSessionGate";
import Icon from "../ui/Icon";
import PatientInformationDrawer from "../patient/PatientInformationDrawer";
import { useCalendarFilters } from "./calendar/calendar-filters";
import { useCalendarViewModel } from "./calendar/calendar-view-model";
import { useCalendarNavigation } from "./calendar/calendar-navigation";
import { useCalendarToast } from "./calendar/calendar-toast";
import CalendarHeader from "./calendar/CalendarHeader";
import CalendarSidebar from "./calendar/CalendarSidebar";
import CalendarViews from "./calendar/CalendarViews";
import CalendarEventDetails from "./calendar/CalendarEventDetails";
import { useCalendarAppointmentActions } from "./calendar/calendar-actions";

export type { CalendarViewType } from "./calendar/calendar-types";

interface CalendarWorkspaceProps {
  onClose?: () => void;
}

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

  const { toastMessage, setToastMessage } = useCalendarToast();
  const navigation = useCalendarNavigation(setToastMessage);
  const {
    todayStr,
    currentDate,
    setCurrentDate,
    practiceNowMinutes,
    viewMode,
    setViewMode,
  } = navigation;
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Category filters (Google Calendar checkboxes) and search
  const filters = useCalendarFilters();
  const { searchQuery, setSearchQuery } = filters;

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
  const [intakePatient, setIntakePatient] = useState<{ id: string; name: string } | null>(null);

  // Time grid scroll container
  const timeGridScrollRef = useRef<HTMLDivElement | null>(null);

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

  const {
    activeDates,
    appointmentsByDate,
    calendarGrid,
    headerTitle,
  } = useCalendarViewModel(appointments, filters, viewMode, currentDate);

  // Keep the initial working hours in view when changing grid modes.
  useEffect(() => {
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = calendarGrid.minuteTop(8 * 60 + 30);
    }
  }, [viewMode]);

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
        ? `The person record was saved, but the appointment was not. Your retry will reuse that same record rather than create another one. ${msg}`
        : msg);
    } finally {
      bookingSubmitRef.current = false;
      setIsSubmittingBooking(false);
    }
  }

  const { handleUpdateStatus, handleCancelAppointment, handleOpenChart, handleStartVisit } =
    useCalendarAppointmentActions(refresh, setSelectedAppointment, setToastMessage, onClose);

  const currentTimeTopPx = calendarGrid.minuteTop(practiceNowMinutes);

  return (
    <div className="gcal-root">
      <CalendarHeader
        nav={navigation}
        headerTitle={headerTitle}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        syncStatus={syncStatus}
        onNewEvent={() => handleOpenBooking(currentDate, "10:30 AM", "appointment")}
        onClose={onClose}
      />

      {/* 2. BODY LAYOUT */}
      <div className="gcal-body">
        <CalendarSidebar
          collapsed={sidebarCollapsed}
          nav={navigation}
          filters={filters}
          appointmentsByDate={appointmentsByDate}
          appointments={appointments}
          rosterCount={roster.length}
        />

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

          <CalendarViews
            viewMode={viewMode}
            activeDates={activeDates}
            todayStr={todayStr}
            currentDate={currentDate}
            setCurrentDate={setCurrentDate}
            setViewMode={setViewMode}
            appointmentsByDate={appointmentsByDate}
            calendarGrid={calendarGrid}
            currentTimeTopPx={currentTimeTopPx}
            timeGridScrollRef={timeGridScrollRef}
            onSlotClick={handleOpenBooking}
            onSelectAppointment={setSelectedAppointment}
          />
        </main>
      </div>

      {/* 3. EVENT DETAIL POPOVER */}
      {selectedAppointment && (
        <CalendarEventDetails
          appointment={selectedAppointment}
          canEditPatient={hasPermission("edit_patient")}
          onClose={() => setSelectedAppointment(null)}
          onUpdateStatus={handleUpdateStatus}
          onCancel={handleCancelAppointment}
          onOpenChart={handleOpenChart}
          onStartVisit={handleStartVisit}
          onContinueIntake={(patientId, patientName) => {
            setIntakePatient({ id: patientId, name: patientName });
            setSelectedAppointment(null);
          }}
        />
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
