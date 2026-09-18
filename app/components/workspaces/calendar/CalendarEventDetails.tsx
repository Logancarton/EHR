"use client";

import { formatDateHeading, type AppointmentStatus, type ScheduleItem } from "../../../lib/schedule-data";
import Icon from "../../ui/Icon";

interface CalendarEventDetailsProps {
  appointment: ScheduleItem;
  canEditPatient: boolean;
  onClose: () => void;
  onUpdateStatus: (apt: ScheduleItem, status: AppointmentStatus) => void;
  onCancel: (apt: ScheduleItem) => void;
  onOpenChart: (patientId: string) => void;
  onStartVisit: (apt: ScheduleItem) => void;
  onContinueIntake: (patientId: string, patientName: string) => void;
}

/**
 * The selected-appointment detail popover. Persistence actions (status
 * update, cancel, start visit) are owned by calendar-actions.ts and only
 * invoked here — this component never calls the appointment API directly.
 */
export default function CalendarEventDetails({
  appointment,
  canEditPatient,
  onClose,
  onUpdateStatus,
  onCancel,
  onOpenChart,
  onStartVisit,
  onContinueIntake,
}: CalendarEventDetailsProps) {
  const isNonPatient =
    appointment.mrn === "MEETING" ||
    appointment.mrn === "BREAK" ||
    appointment.mrn === "TIME-OFF" ||
    appointment.mrn === "SCHEDULE" ||
    appointment.patientId?.startsWith("event-");

  const categoryBadge =
    appointment.mrn === "MEETING"
      ? "Practice Meeting"
      : appointment.mrn === "BREAK"
      ? "Break / Personal"
      : appointment.mrn === "TIME-OFF"
      ? "Time Off"
      : appointment.mrn === "SCHEDULE"
      ? "Schedule Block"
      : null;

  return (
    <div className="gcal-event-popover-backdrop" onClick={onClose}>
      <div className="gcal-event-popover" onClick={(e) => e.stopPropagation()}>
        <div
          className="gcal-popover-banner"
          style={{
            backgroundColor: appointment.status === "tentative"
              ? "#d97706"
              : appointment.type.includes("Therapy")
              ? "var(--gcal-purple)"
              : "var(--gcal-primary)",
          }}
        />
        <div className="gcal-popover-header">
          <button
            type="button"
            className="gcal-icon-btn"
            title="Delete appointment"
            onClick={() => onCancel(appointment)}
          >
            <Icon name="delete" />
          </button>
          <button
            type="button"
            className="gcal-icon-btn"
            title="Close"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="gcal-popover-body">
          <div className="gcal-popover-title-row">
            <div
              className="gcal-popover-color-box"
              style={{
                backgroundColor:
                  appointment.mrn === "MEETING"
                    ? "#5e35b1"
                    : appointment.mrn === "BREAK"
                    ? "#d97706"
                    : appointment.mrn === "TIME-OFF"
                    ? "#be123c"
                    : appointment.mrn === "SCHEDULE"
                    ? "#00695c"
                    : appointment.type.includes("Therapy")
                    ? "var(--gcal-purple)"
                    : "var(--gcal-primary)",
              }}
            />
            <div>
              <h3 className="gcal-popover-patient-name">
                {appointment.patientName}
              </h3>
              {isNonPatient ? (
                <div style={{ fontSize: 12, color: "#0f4c47", fontWeight: 600, marginTop: 2 }}>
                  {categoryBadge || appointment.type}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--gcal-text-secondary)", marginTop: 2 }}>
                  MRN: {appointment.mrn} • Age: {appointment.age}
                </div>
              )}
            </div>
          </div>

          <div className="gcal-popover-time-row">
            <Icon name="schedule" />
            <span>
              {formatDateHeading(appointment.date)} • {appointment.time} (
              {appointment.duration})
            </span>
          </div>

          <div className="gcal-popover-meta-row">
            <Icon name={isNonPatient ? "event_note" : "medical_services"} />
            <div>
              <strong>{appointment.type}</strong>
              <div>{appointment.chiefComplaint || "Routine event"}</div>
            </div>
          </div>

          {appointment.room && (
            <div className="gcal-popover-meta-row">
              <Icon name={appointment.modality === "video" ? "videocam" : "room"} />
              <span>
                {appointment.modality === "video"
                  ? "Telehealth Secure Video"
                  : appointment.room}
              </span>
            </div>
          )}

          {!isNonPatient && (
            <div className="gcal-popover-meta-row" style={{ alignItems: "center" }}>
              <Icon name="info" />
              <span style={{ marginRight: 8 }}>Status:</span>
              <select
                value={appointment.status}
                onChange={(e) =>
                  onUpdateStatus(appointment, e.target.value as AppointmentStatus)
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
              onClick={() => onCancel(appointment)}
            >
              Cancel Event
            </button>
          ) : (
            <>
              <button
                type="button"
                className="gcal-btn-text"
                onClick={() => onOpenChart(appointment.patientId)}
              >
                Open Chart
              </button>
              {canEditPatient && (
                <button
                  type="button"
                  className="gcal-btn-text"
                  onClick={() => onContinueIntake(appointment.patientId, appointment.patientName)}
                >
                  Continue Intake
                </button>
              )}
              <button
                type="button"
                className="gcal-btn-submit"
                onClick={() => onStartVisit(appointment)}
              >
                Start Visit
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
