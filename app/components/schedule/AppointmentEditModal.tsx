"use client";

import { useEffect, useId, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import {
  CANCELLATION_REASONS,
  type CancellationReason,
  type ScheduleItem,
  type VisitType,
  checkAppointmentOverlap,
  minutesToTimeString,
} from "../../lib/schedule-data";

export interface AppointmentEditModalProps {
  isOpen: boolean;
  appointment: ScheduleItem | null;
  mode?: "edit" | "cancel";
  existingSchedule: readonly ScheduleItem[];
  onClose: () => void;
  onSave: (
    appointmentId: string,
    updates: Partial<ScheduleItem>,
  ) => Promise<void>;
  onCancelVisit: (
    appointmentId: string,
    reason: string,
    note?: string,
  ) => Promise<void>;
}

const DURATION_OPTIONS = ["15 min", "30 min", "45 min", "60 min", "90 min"];
const VISIT_TYPES: VisitType[] = [
  "30-min Med Check",
  "45-min Therapy + Meds",
  "60-min Intake",
  "Psychotherapy + Meds",
  "Urgent Walk-in",
];

const ROOM_OPTIONS = ["Room 1", "Room 2", "Room 3", "Consult Room A", "Virtual Room"];

export default function AppointmentEditModal({
  isOpen,
  appointment,
  mode = "edit",
  existingSchedule,
  onClose,
  onSave,
  onCancelVisit,
}: AppointmentEditModalProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30 min");
  const [type, setType] = useState<VisitType>("30-min Med Check");
  const [modality, setModality] = useState<"in-person" | "video">("in-person");
  const [room, setRoom] = useState("Room 1");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancellation state
  const [cancellationReason, setCancellationReason] = useState<CancellationReason>(
    CANCELLATION_REASONS[0],
  );
  const [cancellationNote, setCancellationNote] = useState("");

  const modalId = useId();

  useEffect(() => {
    if (!appointment) return;
    setDate(appointment.date);
    setTime(appointment.time);
    setDuration(appointment.duration || "30 min");
    setType(appointment.type || "30-min Med Check");
    setModality(appointment.modality || "in-person");
    setRoom(appointment.room || (appointment.modality === "video" ? "Virtual Room" : "Room 1"));
    setChiefComplaint(appointment.chiefComplaint || "");
    setCancellationReason(
      (appointment.cancellationReason as CancellationReason) || CANCELLATION_REASONS[0],
    );
    setCancellationNote(appointment.cancellationNote || "");
    setError(null);
  }, [appointment, mode]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !appointment) return null;

  // Collision / overlap detection
  const conflict = checkAppointmentOverlap(existingSchedule, {
    date,
    time,
    duration,
    room: modality === "video" ? undefined : room,
    excludeAppointmentId: appointment.id,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appointment) return;
    setSubmitting(true);
    setError(null);

    try {
      if (mode === "cancel") {
        await onCancelVisit(appointment.id, cancellationReason, cancellationNote);
      } else {
        await onSave(appointment.id, {
          date,
          time,
          duration,
          type,
          modality,
          room: modality === "video" ? "Virtual Room" : room,
          chiefComplaint,
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save appointment changes.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="appointment-edit-modal">
        <header className="appointment-edit-header">
          <div className="edit-modal-title">
            <Icon name={mode === "cancel" ? "cancel" : "edit_calendar"} size="md" />
            <h2 id={modalId}>
              {mode === "cancel"
                ? `Cancel Visit — ${appointment.patientName}`
                : `Reschedule / Edit Visit — ${appointment.patientName}`}
            </h2>
          </div>
          <Button
            variant="icon"
            size="sm"
            icon="close"
            aria-label="Close dialog"
            busy={submitting}
            onClick={onClose}
          />
        </header>

        <form onSubmit={handleSubmit} className="appointment-edit-form">
          {error && (
            <div className="edit-modal-error" role="alert">
              <Icon name="error" size="sm" />
              <span>{error}</span>
            </div>
          )}

          {mode === "cancel" ? (
            <div className="cancellation-form-fields">
              <div className="cancellation-notice">
                <Icon name="info" size="sm" />
                <p>
                  Cancelling will remove this appointment from the active roster while preserving
                  its audit trail and scheduling history.
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="cancel-reason">Operational Cancellation Reason</label>
                <select
                  id="cancel-reason"
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value as CancellationReason)}
                  disabled={submitting}
                  required
                >
                  {CANCELLATION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="cancel-note">Staff Note (Optional)</label>
                <textarea
                  id="cancel-note"
                  rows={3}
                  value={cancellationNote}
                  placeholder="Additional context from phone call or patient message..."
                  onChange={(e) => setCancellationNote(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          ) : (
            <div className="edit-form-grid">
              {/* Overlap Collision Warning */}
              {conflict && (
                <div className="edit-collision-warning" role="alert">
                  <Icon name="warning" size="sm" />
                  <div>
                    <strong>Schedule Overlap Warning</strong>
                    <p>
                      This time collides with {conflict.appointment.patientName}'s appointment at{" "}
                      {conflict.appointment.time} ({conflict.appointment.room || "same slot"}).
                    </p>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="edit-date">Date</label>
                <input
                  id="edit-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-time">Time</label>
                <input
                  id="edit-time"
                  type="text"
                  value={time}
                  placeholder="e.g. 09:30 AM"
                  onChange={(e) => setTime(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="edit-duration">Duration</label>
                <select
                  id="edit-duration"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={submitting}
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-type">Visit Type</label>
                <select
                  id="edit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as VisitType)}
                  disabled={submitting}
                >
                  {VISIT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-modality">Modality</label>
                <select
                  id="edit-modality"
                  value={modality}
                  onChange={(e) => {
                    const next = e.target.value as "in-person" | "video";
                    setModality(next);
                    if (next === "video") setRoom("Virtual Room");
                  }}
                  disabled={submitting}
                >
                  <option value="in-person">In-Person</option>
                  <option value="video">Telehealth (Video)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="edit-room">Room</label>
                <select
                  id="edit-room"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  disabled={submitting || modality === "video"}
                >
                  {ROOM_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group full-width">
                <label htmlFor="edit-complaint">Reason / Chief Complaint</label>
                <input
                  id="edit-complaint"
                  type="text"
                  value={chiefComplaint}
                  placeholder="Reason for consultation or psychiatric medication review"
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          <footer className="appointment-edit-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              busy={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={mode === "cancel" ? "destructive" : "primary"}
              loading={submitting}
              loadingLabel="Saving…"
            >
              {mode === "cancel"
                ? "Confirm Cancellation"
                : "Save Changes"}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
