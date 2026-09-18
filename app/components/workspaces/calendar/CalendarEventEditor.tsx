"use client";

import { minutesToTimeString, formatDateHeading } from "../../../lib/schedule-data";
import Icon from "../../ui/Icon";
import AppointmentEditorPanel from "./AppointmentEditorPanel";
import type { CalendarEventEditor as CalendarEventEditorModel } from "./calendar-event-editor";
import type { ClinicalPermission } from "../../../server/auth/provider-context";

interface CalendarEventEditorProps {
  editor: CalendarEventEditorModel;
  hasPermission: (permission: ClinicalPermission) => boolean;
  providerDisplayName: string;
}

/**
 * The contextual "New Event" editor: five categories (appointment,
 * non-patient, schedule, break, time off) in one form, docked below the
 * Calendar's own toolbar rather than a full-screen modal — canvas-preserving
 * by design (see .gcal-modal-* in app/google-calendar.css). All form state
 * and submission logic is owned by calendar-event-editor.ts.
 */
export default function CalendarEventEditor({ editor, hasPermission, providerDisplayName }: CalendarEventEditorProps) {
  const {
    isBookingModalOpen,
    setIsBookingModalOpen,
    isSubmittingBooking,
    eventTab,
    setEventTab,
    bookingError,
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
    nonPatientTitle,
    setNonPatientTitle,
    nonPatientType,
    setNonPatientType,
    bookingModality,
    setBookingModality,
    serviceLocation,
    setServiceLocation,
    bookingRoom,
    setBookingRoom,
    scheduleTitle,
    setScheduleTitle,
    breakType,
    setBreakType,
    timeOffReason,
    setTimeOffReason,
    isAllDay,
    setIsAllDay,
    isCustomPatient,
    bookingStatus,
    handleSubmitBooking,
  } = editor;

  if (!isBookingModalOpen) return null;

  return (
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
              <span className="gcal-provider-name">{providerDisplayName}</span>
            </div>

            {/* TAB 1: APPOINTMENT */}
            {eventTab === "appointment" && (
              <AppointmentEditorPanel editor={editor} hasPermission={hasPermission} providerDisplayName={providerDisplayName} />
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
                    <span>{providerDisplayName} (Host)</span>
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
  );
}
