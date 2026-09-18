"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Icon from "../ui/Icon";
import type { Patient } from "../../domain/patient";
import { practiceToday } from "../../lib/practice-calendar";
import { api } from "../../lib/api-client";
import type { AppointmentRecord } from "../../server/repositories/appointment-repository";
import { applyConfirmedAppointment, refreshPracticeSchedule } from "../../lib/schedule-store";
import {
  formatShortDate,
  type VisitType,
  CLINICAL_INTERVAL_PRESETS,
  formatTargetDateDisplay,
  offsetDays,
} from "../../lib/schedule-data";

interface CalendarCompanionPanelProps {
  activePatient?: Patient | null;
  roster: readonly Patient[];
  initialDate?: string;
  onClose: () => void;
  onUnpin?: () => void;
  onOpenFullCalendar: () => void;
}

const DEFAULT_TIME_SLOTS = [
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
];

const VISIT_TYPES: { label: string; type: VisitType; duration: string }[] = [
  { label: "30-min Med Check", type: "30-min Med Check", duration: "30 min" },
  { label: "45-min Therapy", type: "45-min Therapy + Meds", duration: "45 min" },
  { label: "60-min Intake", type: "60-min Intake", duration: "60 min" },
  { label: "15-min Urgent Check", type: "Urgent Walk-in", duration: "15 min" },
];

const QUICK_REASONS = [
  "Follow-up & med renewal",
  "ADHD medication review",
  "Depression & anxiety check",
  "Initial psychiatric evaluation",
  "Sleep disturbance follow-up",
  "Therapy & cognitive check-in",
];

function offsetDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return target.toISOString().slice(0, 10);
}

export default function CalendarCompanionPanel({
  activePatient,
  roster,
  initialDate,
  onClose,
  onUnpin,
  onOpenFullCalendar,
}: CalendarCompanionPanelProps) {
  const today = useMemo(() => practiceToday(), []);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || today);
  const [panelTab, setPanelTab] = useState<"schedule" | "agenda">("schedule");
  const [activeIntervalDays, setActiveIntervalDays] = useState<number | null>(null);
  const [daysLaterInput, setDaysLaterInput] = useState<string>("28");
  const [daysLaterBase, setDaysLaterBase] = useState<"today" | "selected">("today");

  // Sync initialDate prop changes
  useEffect(() => {
    if (initialDate) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Listen for external calendar jump events (omnibox, voice, chart actions)
  useEffect(() => {
    function handleJumpDate(e: Event) {
      const ce = e as CustomEvent<{ date?: string; daysLater?: number }>;
      if (ce.detail?.date) {
        setSelectedDate(ce.detail.date);
        if (typeof ce.detail.daysLater === "number") {
          setActiveIntervalDays(ce.detail.daysLater);
        }
      }
    }
    window.addEventListener("ehr-calendar-jump-date", handleJumpDate);
    return () => window.removeEventListener("ehr-calendar-jump-date", handleJumpDate);
  }, []);

  const parsedInputDays = parseInt(daysLaterInput, 10);
  const previewTarget = useMemo(() => {
    if (isNaN(parsedInputDays) || parsedInputDays <= 0) return null;
    const base = daysLaterBase === "today" ? today : selectedDate;
    const target = offsetDays(base, parsedInputDays);
    const display = formatTargetDateDisplay(target);
    const weeks = Math.round((parsedInputDays / 7) * 10) / 10;
    const weeksHint = weeks === Math.floor(weeks) ? `${weeks}w` : `${weeks.toFixed(1)}w`;
    return { target, display, weeksHint };
  }, [parsedInputDays, daysLaterBase, today, selectedDate]);

  const handleJumpDays = (days: number, fromBase: "today" | "selected" = daysLaterBase) => {
    const base = fromBase === "today" ? today : selectedDate;
    const target = offsetDays(base, days);
    setSelectedDate(target);
    setActiveIntervalDays(days);
  };

  // Selected patient
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(activePatient ?? null);
  const [isSearchingPatient, setIsSearchingPatient] = useState<boolean>(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState<string>("");

  // New caller / prospect mode
  const [isNewCaller, setIsNewCaller] = useState<boolean>(false);
  const [callerName, setCallerName] = useState<string>("");
  const [callerDob, setCallerDob] = useState<string>("");
  const [callerPhone, setCallerPhone] = useState<string>("");
  const [callerEmail, setCallerEmail] = useState<string>("");

  // Visit details
  const [selectedTime, setSelectedTime] = useState<string>("10:00 AM");
  const [customTime, setCustomTime] = useState<string>("");
  const [visitTypeIdx, setVisitTypeIdx] = useState<number>(0);
  const [modality, setModality] = useState<"video" | "in-person">("video");
  const [chiefComplaint, setChiefComplaint] = useState<string>("");

  // Booking async status
  const [dayAppointments, setDayAppointments] = useState<AppointmentRecord[]>([]);
  const [isLoadingDay, setIsLoadingDay] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorBanner, setErrorBanner] = useState<string>("");
  const [successBooking, setSuccessBooking] = useState<AppointmentRecord | null>(null);

  // Sync activePatient when switching charts unless user manually picked a different patient or new caller
  useEffect(() => {
    if (activePatient && !isNewCaller) {
      setSelectedPatient(activePatient);
    }
  }, [activePatient, isNewCaller]);

  // Load appointments for selectedDate to determine occupied slots
  const loadDaySchedule = useCallback(async (date: string) => {
    setIsLoadingDay(true);
    try {
      const list = await api.appointments.list({ date });
      setDayAppointments(list);
    } catch {
      // Keep previous list on transient failure
    } finally {
      setIsLoadingDay(false);
    }
  }, []);

  useEffect(() => {
    void loadDaySchedule(selectedDate);
  }, [selectedDate, loadDaySchedule]);

  // Check occupied slots
  const occupiedTimes = useMemo(() => {
    const set = new Set<string>();
    for (const apt of dayAppointments) {
      if (apt.status !== "cancelled") {
        set.add(apt.time);
      }
    }
    return set;
  }, [dayAppointments]);

  // Autocomplete patient search
  const filteredPatients = useMemo(() => {
    const q = patientSearchQuery.trim().toLowerCase();
    if (!q) return roster.slice(0, 5);
    return roster
      .filter((p) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          (p.dob && p.dob.includes(q))
        );
      })
      .slice(0, 6);
  }, [roster, patientSearchQuery]);

  const effectiveTime = customTime.trim() || selectedTime;
  const currentVisitType = VISIT_TYPES[visitTypeIdx];

  const handleBookAppointment = async (isTentative = false) => {
    setErrorBanner("");
    let targetPatientId = "";
    let targetPatientName = "";

    if (isNewCaller) {
      if (!callerName.trim()) {
        setErrorBanner("Caller name is required.");
        return;
      }
      if (!callerPhone.trim()) {
        setErrorBanner("Phone number is required for new caller.");
        return;
      }
    } else if (!selectedPatient) {
      setErrorBanner("Please select a patient to schedule.");
      return;
    }

    if (!effectiveTime) {
      setErrorBanner("Please choose an appointment time.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isNewCaller) {
        // Create prospective patient
        const newProspect = await api.prospectivePersons.create({
          name: callerName.trim(),
          dob: callerDob.trim() || "1990-01-01",
          mobilePhone: callerPhone.trim(),
          email: callerEmail.trim() || undefined,
        });
        targetPatientId = newProspect.id;
        targetPatientName = newProspect.name;
      } else if (selectedPatient) {
        targetPatientId = selectedPatient.id;
        targetPatientName = selectedPatient.name;
      }

      const booked = await api.appointments.create({
        patientId: targetPatientId,
        patientName: targetPatientName,
        date: selectedDate,
        time: effectiveTime,
        duration: currentVisitType.duration,
        type: currentVisitType.type,
        status: isTentative ? "tentative" : "scheduled",
        modality,
        chiefComplaint:
          chiefComplaint.trim() || `${currentVisitType.label} visit`,
        insurance: "Not recorded",
      });

      applyConfirmedAppointment(booked);
      await refreshPracticeSchedule();
      setSuccessBooking(booked);
      void loadDaySchedule(selectedDate);
    } catch (err: unknown) {
      setErrorBanner(
        err instanceof Error ? err.message : "Failed to book appointment. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForAnother = () => {
    setSuccessBooking(null);
    setErrorBanner("");
    setChiefComplaint("");
    setCustomTime("");
    if (isNewCaller) {
      setCallerName("");
      setCallerPhone("");
      setCallerEmail("");
      setCallerDob("");
      setIsNewCaller(false);
    }
  };

  return (
    <aside className="companion-panel companion-calendar-panel" aria-label="Calendar and Quick Scheduling">
      {/* Panel Header */}
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#e8f0fe", color: "#1a73e8" }}>
            <Icon name="calendar_month" />
          </span>
          <div>
            <strong>Calendar &amp; Schedule</strong>
            <small>Quick book from any chart or screen</small>
          </div>
        </div>
        <div className="companion-header-actions">
          <button
            type="button"
            className="companion-unpin-btn"
            title="Open Full Calendar Workspace"
            aria-label="Open Full Calendar"
            onClick={onOpenFullCalendar}
          >
            <Icon name="open_in_new" size="sm" />
          </button>
          {onUnpin && (
            <button
              type="button"
              className="companion-unpin-btn"
              title="Unpin Calendar from companion rail"
              aria-label="Unpin Calendar"
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

      {/* Tabs: Quick Schedule vs Day Agenda */}
      <div className="companion-calendar-tabs">
        <button
          type="button"
          className={`companion-calendar-tab-btn ${panelTab === "schedule" ? "active" : ""}`}
          onClick={() => setPanelTab("schedule")}
        >
          <Icon name="edit_calendar" size="sm" />
          <span>Quick Schedule</span>
        </button>
        <button
          type="button"
          className={`companion-calendar-tab-btn ${panelTab === "agenda" ? "active" : ""}`}
          onClick={() => setPanelTab("agenda")}
        >
          <Icon name="event" size="sm" />
          <span>Day Schedule ({dayAppointments.filter((a) => a.status !== "cancelled").length})</span>
        </button>
      </div>

      {/* Panel Body */}
      <div className="companion-calendar-body">
        {/* Date Selector Banner */}
        <div className="companion-calendar-datebar">
          <div className="datebar-controls">
            <button
              type="button"
              className="date-nav-btn"
              title="Previous Day"
              aria-label="Previous Day"
              onClick={() => {
                setSelectedDate((d) => offsetDate(d, -1));
                setActiveIntervalDays(null);
              }}
            >
              ‹
            </button>
            <input
              type="date"
              className="date-native-input"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setActiveIntervalDays(null);
              }}
              aria-label="Select appointment date"
            />
            <button
              type="button"
              className="date-nav-btn"
              title="Next Day"
              aria-label="Next Day"
              onClick={() => {
                setSelectedDate((d) => offsetDate(d, 1));
                setActiveIntervalDays(null);
              }}
            >
              ›
            </button>
          </div>

          <div className="datebar-quick-chips">
            <button
              type="button"
              className={`date-chip ${selectedDate === today ? "active" : ""}`}
              onClick={() => {
                setSelectedDate(today);
                setActiveIntervalDays(null);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={`date-chip ${selectedDate === offsetDate(today, 1) ? "active" : ""}`}
              onClick={() => {
                setSelectedDate(offsetDate(today, 1));
                setActiveIntervalDays(null);
              }}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={`date-chip ${selectedDate === offsetDate(today, 7) ? "active" : ""}`}
              onClick={() => handleJumpDays(7, "today")}
            >
              +7d (1w)
            </button>
          </div>

          {/* Clinical Follow-Up & Refill Interval Chips */}
          <div className="companion-interval-section">
            <div className="interval-section-label">
              <span>Prescription &amp; Refill Intervals</span>
              <small>Jump without week-counting</small>
            </div>
            <div className="companion-interval-chips" role="group" aria-label="Clinical prescription intervals">
              {CLINICAL_INTERVAL_PRESETS.map((preset) => {
                const targetDate = offsetDays(today, preset.days);
                const isCurrentMatch = selectedDate === targetDate;
                return (
                  <button
                    key={preset.days}
                    type="button"
                    className={`interval-chip ${isCurrentMatch ? "active" : ""}`}
                    title={`${preset.label} (${preset.hint}) → ${formatTargetDateDisplay(targetDate)}`}
                    onClick={() => handleJumpDays(preset.days, "today")}
                  >
                    <span className="interval-chip-label">{preset.label}</span>
                    <span className="interval-chip-hint">{preset.hint.split("·")[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive "+N Days Later" Calculator & Jump */}
          <div className="companion-days-later-calc">
            <div className="calc-input-row">
              <span className="calc-prefix">+</span>
              <input
                type="number"
                min="1"
                max="365"
                className="calc-days-input"
                value={daysLaterInput}
                onChange={(e) => setDaysLaterInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && previewTarget) {
                    e.preventDefault();
                    handleJumpDays(parsedInputDays);
                  }
                }}
                aria-label="Number of days later to jump"
                placeholder="28"
              />
              <span className="calc-suffix">days later</span>

              <select
                className="calc-base-select"
                value={daysLaterBase}
                onChange={(e) => setDaysLaterBase(e.target.value as "today" | "selected")}
                aria-label="Base date for jump calculation"
                title="Calculate days from today or from currently selected date"
              >
                <option value="today">from Today</option>
                <option value="selected">from Selected</option>
              </select>

              <button
                type="button"
                className="calc-jump-btn"
                disabled={!previewTarget}
                onClick={() => previewTarget && handleJumpDays(parsedInputDays)}
                title={previewTarget ? `Jump to ${previewTarget.display}` : "Enter days"}
              >
                Jump
              </button>
            </div>

            {previewTarget && (
              <div className="calc-preview-row">
                <Icon name="event" size="sm" />
                <span>
                  Resolves to: <strong>{previewTarget.display}</strong> ({previewTarget.weeksHint})
                </span>
              </div>
            )}
          </div>

          {/* Active Interval Provenance Banner */}
          {selectedDate !== today && (
            <div className="companion-active-interval-banner">
              <span className="banner-text">
                <Icon name="schedule" size="sm" />
                <span>
                  Viewing: <strong>{formatTargetDateDisplay(selectedDate)}</strong>
                  {activeIntervalDays ? ` (+${activeIntervalDays}d)` : ""}
                </span>
              </span>
              <button
                type="button"
                className="banner-reset-link"
                onClick={() => {
                  setSelectedDate(today);
                  setActiveIntervalDays(null);
                }}
              >
                Reset to Today
              </button>
            </div>
          )}
        </div>

        {/* Success Booking State */}
        {successBooking && (
          <div className="companion-calendar-success">
            <div className="success-icon-wrap">
              <Icon name="check_circle" />
            </div>
            <h4>Appointment Confirmed!</h4>
            <div className="success-details-card">
              <div className="success-row">
                <span className="success-label">Patient:</span>
                <strong>{successBooking.patientName}</strong>
              </div>
              <div className="success-row">
                <span className="success-label">When:</span>
                <span>
                  {formatShortDate(successBooking.date)} @ {successBooking.time} ({successBooking.duration})
                </span>
              </div>
              <div className="success-row">
                <span className="success-label">Type:</span>
                <span>{successBooking.type} • {successBooking.modality}</span>
              </div>
              {successBooking.chiefComplaint && (
                <div className="success-row">
                  <span className="success-label">Reason:</span>
                  <span>{successBooking.chiefComplaint}</span>
                </div>
              )}
            </div>

            <div className="success-actions">
              <button
                type="button"
                className="calendar-btn-primary"
                onClick={handleResetForAnother}
              >
                Schedule Another Appointment
              </button>
              <button
                type="button"
                className="calendar-btn-secondary"
                onClick={onOpenFullCalendar}
              >
                View in Full Calendar ↗
              </button>
            </div>
          </div>
        )}

        {/* Quick Schedule Mode */}
        {!successBooking && panelTab === "schedule" && (
          <div className="companion-schedule-form">
            {errorBanner && (
              <div className="companion-error-banner" role="alert">
                <Icon name="warning" size="sm" />
                <span>{errorBanner}</span>
              </div>
            )}

            {/* Patient Selector */}
            <div className="form-section">
              <div className="form-section-head">
                <label>Patient</label>
                {!isNewCaller && (
                  <button
                    type="button"
                    className="text-action-btn"
                    onClick={() => {
                      setIsNewCaller(true);
                      setIsSearchingPatient(false);
                    }}
                  >
                    + New Caller / Prospect
                  </button>
                )}
              </div>

              {isNewCaller ? (
                <div className="new-caller-box">
                  <div className="new-caller-head">
                    <span className="badge-prospect">New Inquiring Caller</span>
                    <button
                      type="button"
                      className="text-action-btn"
                      onClick={() => setIsNewCaller(false)}
                    >
                      Cancel &amp; Search Roster
                    </button>
                  </div>
                  <div className="input-group">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Amanda Cole"
                      value={callerName}
                      onChange={(e) => setCallerName(e.target.value)}
                    />
                  </div>
                  <div className="input-row-half">
                    <div className="input-group">
                      <label>Phone *</label>
                      <input
                        type="tel"
                        placeholder="555-0192"
                        value={callerPhone}
                        onChange={(e) => setCallerPhone(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label>DOB</label>
                      <input
                        type="date"
                        value={callerDob}
                        onChange={(e) => setCallerDob(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="input-group">
                    <label>Email (Optional)</label>
                    <input
                      type="email"
                      placeholder="amanda@example.com"
                      value={callerEmail}
                      onChange={(e) => setCallerEmail(e.target.value)}
                    />
                  </div>
                </div>
              ) : selectedPatient && !isSearchingPatient ? (
                <div className="patient-selected-card">
                  <div className="patient-card-identity">
                    <div className="patient-avatar-mini">
                      {selectedPatient.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <strong>{selectedPatient.name}</strong>
                      <small>MRN: {selectedPatient.mrn} • DOB: {selectedPatient.dob || "—"}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="patient-change-btn"
                    onClick={() => {
                      setIsSearchingPatient(true);
                      setPatientSearchQuery("");
                    }}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="patient-search-dropdown-box">
                  <div className="patient-search-input-wrap">
                    <Icon name="search" size="sm" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search patient roster by name, MRN, DOB..."
                      value={patientSearchQuery}
                      onChange={(e) => setPatientSearchQuery(e.target.value)}
                    />
                    {selectedPatient && (
                      <button
                        type="button"
                        className="search-cancel-btn"
                        onClick={() => setIsSearchingPatient(false)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <div className="patient-dropdown-list">
                    {filteredPatients.length === 0 ? (
                      <div className="dropdown-empty-row">
                        No patients matching &ldquo;{patientSearchQuery}&rdquo;
                      </div>
                    ) : (
                      filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="patient-dropdown-row"
                          onClick={() => {
                            setSelectedPatient(p);
                            setIsSearchingPatient(false);
                          }}
                        >
                          <span className="dropdown-name">{p.name}</span>
                          <span className="dropdown-meta">
                            {p.mrn} • {p.dob || "DOB n/a"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Visit Type & Duration */}
            <div className="form-section">
              <label>Visit Type &amp; Duration</label>
              <div className="chips-grid-2x2">
                {VISIT_TYPES.map((vt, idx) => (
                  <button
                    key={vt.label}
                    type="button"
                    className={`visit-chip ${visitTypeIdx === idx ? "active" : ""}`}
                    onClick={() => setVisitTypeIdx(idx)}
                  >
                    <strong>{vt.label}</strong>
                    <small>{vt.type}</small>
                  </button>
                ))}
              </div>
            </div>

            {/* Modality */}
            <div className="form-section">
              <label>Modality</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${modality === "video" ? "active" : ""}`}
                  onClick={() => setModality("video")}
                >
                  <Icon name="videocam" size="sm" />
                  <span>Telehealth (Video)</span>
                </button>
                <button
                  type="button"
                  className={`segment-btn ${modality === "in-person" ? "active" : ""}`}
                  onClick={() => setModality("in-person")}
                >
                  <Icon name="location_on" size="sm" />
                  <span>In-Person Clinic</span>
                </button>
              </div>
            </div>

            {/* Available Time Slots */}
            <div className="form-section">
              <div className="form-section-head">
                <label>Select Time Slot</label>
                {isLoadingDay && <small className="loading-tag">Updating slots…</small>}
              </div>
              <div className="slots-grid">
                {DEFAULT_TIME_SLOTS.map((slot) => {
                  const isOccupied = occupiedTimes.has(slot);
                  const isSelected = effectiveTime === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isOccupied}
                      className={`slot-chip ${isSelected ? "selected" : ""} ${isOccupied ? "occupied" : ""}`}
                      onClick={() => {
                        setSelectedTime(slot);
                        setCustomTime("");
                      }}
                      title={isOccupied ? `${slot} (Booked)` : `Select ${slot}`}
                    >
                      <span>{slot}</span>
                      {isOccupied && <span className="booked-dot" title="Booked">●</span>}
                    </button>
                  );
                })}
              </div>

              {/* Custom time entry */}
              <div className="custom-time-row">
                <small>Or enter custom time:</small>
                <input
                  type="text"
                  placeholder="e.g. 11:15 AM"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="custom-time-input"
                />
              </div>
            </div>

            {/* Chief Complaint / Notes */}
            <div className="form-section">
              <label>Chief Complaint / Clinical Reason</label>
              <div className="quick-reason-pills">
                {QUICK_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className="reason-pill"
                    onClick={() => setChiefComplaint(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Specific reason for visit or clinical note..."
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="complaint-input"
              />
            </div>

            {/* Action Buttons */}
            <div className="form-actions-area">
              <button
                type="button"
                className="calendar-btn-primary"
                disabled={isSubmitting}
                onClick={() => handleBookAppointment(false)}
              >
                {isSubmitting ? "Booking Appointment…" : "Confirm & Book Appointment"}
              </button>
              <button
                type="button"
                className="calendar-btn-secondary"
                disabled={isSubmitting}
                onClick={() => handleBookAppointment(true)}
                title="Hold tentative visit while intake or intake payment is completed"
              >
                Hold Tentative Slot
              </button>
            </div>
          </div>
        )}

        {/* Day Agenda Mode */}
        {!successBooking && panelTab === "agenda" && (
          <div className="companion-agenda-view">
            <div className="agenda-header-summary">
              <strong>{formatShortDate(selectedDate)} Schedule</strong>
              <small>
                {dayAppointments.filter((a) => a.status !== "cancelled").length} scheduled appointments
              </small>
            </div>

            {isLoadingDay ? (
              <div className="agenda-empty-state">
                <p>Loading schedule…</p>
              </div>
            ) : dayAppointments.length === 0 ? (
              <div className="agenda-empty-state">
                <Icon name="event" />
                <p>No appointments booked yet on this date.</p>
                <button
                  type="button"
                  className="calendar-btn-primary"
                  onClick={() => setPanelTab("schedule")}
                >
                  Book First Appointment
                </button>
              </div>
            ) : (
              <div className="agenda-timeline-list">
                {dayAppointments
                  .slice()
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((apt) => (
                    <div
                      key={apt.id}
                      className={`agenda-card status-${apt.status}`}
                    >
                      <div className="agenda-card-time">
                        <strong>{apt.time}</strong>
                        <small>{apt.duration}</small>
                      </div>
                      <div className="agenda-card-main">
                        <div className="agenda-card-top">
                          <strong className="agenda-patient-name">{apt.patientName}</strong>
                          <span className={`agenda-status-pill status-${apt.status}`}>
                            {apt.status}
                          </span>
                        </div>
                        <div className="agenda-card-details">
                          <span>{apt.type}</span>
                          <span>•</span>
                          <span>{apt.modality || "telehealth"}</span>
                        </div>
                        {apt.chiefComplaint && (
                          <div className="agenda-complaint-snippet">
                            {apt.chiefComplaint}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            <div className="agenda-footer-action">
              <button
                type="button"
                className="calendar-btn-primary"
                onClick={() => setPanelTab("schedule")}
              >
                + Schedule Another Patient
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
