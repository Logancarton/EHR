"use client";

import { minutesToTimeString, type VisitType } from "../../../lib/schedule-data";
import Icon from "../../ui/Icon";
import type { CalendarEventEditor } from "./calendar-event-editor";
import type { ClinicalPermission } from "../../../server/auth/provider-context";

const VISIT_TYPES: VisitType[] = [
  "30-min Med Check",
  "45-min Therapy + Meds",
  "60-min Intake",
  "Psychotherapy + Meds",
  "Urgent Walk-in",
];

const ROOM_OPTIONS = ["Room 1 (Consult)", "Room 2 (Therapy)", "Exam Room 1", "Main Office"];

interface AppointmentEditorPanelProps {
  editor: CalendarEventEditor;
  hasPermission: (permission: ClinicalPermission) => boolean;
  providerDisplayName: string;
}

/**
 * The "Appointment" tab of the New Event editor: patient search/creation,
 * the tentative/scheduled booking-status choice, and visit details. The
 * most complex tab because of patient search and the D-076
 * prospective-person intake flow — split out on its own for that reason.
 * All state is owned by calendar-event-editor.ts; this only renders it.
 */
export default function AppointmentEditorPanel({ editor, hasPermission, providerDisplayName }: AppointmentEditorPanelProps) {
  const {
    selectedPatient,
    setSelectedPatient,
    isCustomPatient,
    setIsCustomPatient,
    bookingSearchQuery,
    setBookingSearchQuery,
    bookingPatientSuggestions,
    rosterError,
    customPatientName,
    setCustomPatientName,
    customPatientDob,
    setCustomPatientDob,
    customPatientPhone,
    setCustomPatientPhone,
    customPatientEmail,
    setCustomPatientEmail,
    bookingStatus,
    setBookingStatus,
    bookingType,
    setBookingType,
    bookingModality,
    setBookingModality,
    serviceLocation,
    setServiceLocation,
    bookingDate,
    setBookingDate,
    bookingTime,
    setBookingTime,
    bookingDuration,
    setBookingDuration,
    recurrence,
    setRecurrence,
    eventNotes,
    setEventNotes,
    selectedStaff,
    setSelectedStaff,
    bookingRoom,
    setBookingRoom,
  } = editor;

  return (
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
          <span>{providerDisplayName}</span>
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
  );
}
