"use client";

import { useEffect, useRef } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import StatusBadge from "../ui/StatusBadge";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type ScheduleItem,
} from "../../lib/schedule-data";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import { useAuthSession } from "../auth/AuthSessionGate";

const STATUS_TONE: Record<
  AppointmentStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  tentative: "warning",
  scheduled: "neutral",
  confirmed: "info",
  waiting: "warning",
  "in-visit": "info",
  completed: "success",
  "no-show": "danger",
  cancelled: "neutral",
};

export interface VisitDetailDrawerProps {
  appointment: ScheduleItem | null;
  onClose: () => void;
  onOpenChart: (patientId: string) => void;
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onEditAppointment: (appointment: ScheduleItem) => void;
  onCancelAppointment: (appointment: ScheduleItem) => void;
  onStatusChange: (id: string, newStatus: AppointmentStatus) => void;
  onOpenHandoff?: (appointment: ScheduleItem) => void;
  onScheduleFollowUp?: (appointment: ScheduleItem) => void;
  photo?: { photoUrl?: string; photoType?: "license" | "custom" | "headshot" };
}

/**
 * DB-4: Dedicated Visit Detail Panel / Drawer
 *
 * Distinct visit target (DASH-05, DB-4).
 * Clicking the appointment target inspects this visit's facts without mutating
 * anything. It does NOT mark the patient "in-visit", create an encounter, or open
 * an unsaved note.
 */
export default function VisitDetailDrawer({
  appointment: apt,
  onClose,
  onOpenChart,
  onStartVisit,
  onEditAppointment,
  onCancelAppointment,
  onStatusChange,
  onOpenHandoff,
  onScheduleFollowUp,
  photo,
}: VisitDetailDrawerProps) {
  const { hasPermission } = useAuthSession();
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!apt) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [apt, onClose]);

  if (!apt) return null;

  const isCancelled = apt.status === "cancelled";
  const isCompleted = apt.status === "completed";
  const isNoShow = apt.status === "no-show";
  const isInVisit = apt.status === "in-visit";
  const isArrived = apt.status === "waiting";

  const canManageAppointments = hasPermission("manage_appointments");
  const canStart =
    (hasPermission("sign_encounter") || hasPermission("edit_draft")) &&
    !isCompleted &&
    !isCancelled &&
    !isNoShow;

  return (
    <div
      className="visit-drawer-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Visit details for ${apt.patientName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="visit-drawer-panel" ref={drawerRef}>
        <header className="visit-drawer-header">
          <div className="visit-drawer-title-group">
            <Icon name="event_note" size="md" />
            <div>
              <h2 className="visit-drawer-title">
                {isCancelled ? "Cancelled Visit Information" : "Visit Information"}
              </h2>
              <span className="visit-drawer-id">Appointment ID: {apt.id}</span>
            </div>
          </div>
          <Button
            variant="icon"
            size="sm"
            icon="close"
            aria-label="Close visit details"
            onClick={onClose}
          />
        </header>

        <div className="visit-drawer-body">
          {/* Reassurance banner: opening this visit produces zero clinical mutations */}
          <div className="visit-drawer-assurance" role="note">
            <Icon name="verified_user" size="sm" />
            <span>
              {isCancelled
                ? "This visit was cancelled and removed from the active schedule. Inspecting it changed nothing."
                : "Opening this visit changed nothing. No status moved, no encounter was created, and no draft was opened."}
            </span>
          </div>

          {/* Patient Card Header */}
          <div className="visit-drawer-patient-card">
            <PatientPhotoSpot
              patient={{
                id: apt.patientId,
                name: apt.patientName,
                dob: apt.dob,
                photoUrl: photo?.photoUrl,
                photoType: photo?.photoType,
              }}
              size="md"
              editable={false}
              showBadge={false}
            />
            <div className="visit-drawer-patient-meta">
              <button
                type="button"
                className="visit-drawer-patient-name-link"
                onClick={() => {
                  onClose();
                  onOpenChart(apt.patientId);
                }}
                title={`Open ${apt.patientName}'s full chart`}
              >
                {apt.patientName}
                <Icon name="open_in_new" size="sm" />
              </button>
              <div className="visit-drawer-demographics">
                <span>{apt.age}y · DOB {apt.dob}</span>
                <span>MRN {apt.mrn}</span>
              </div>
            </div>
          </div>

          {/* Visit Facts Grid */}
          <dl className="visit-drawer-facts">
            <div className="visit-fact-item">
              <dt>Date & Time</dt>
              <dd>
                <strong>{apt.time}</strong> ({apt.duration}) on {apt.date}
              </dd>
            </div>

            <div className="visit-fact-item">
              <dt>Visit Type</dt>
              <dd>{apt.type}</dd>
            </div>

            <div className="visit-fact-item">
              <dt>Modality</dt>
              <dd>
                <span className={`visit-modality-badge modality-${apt.modality || "in-person"}`}>
                  <Icon
                    name={apt.modality === "video" ? "videocam" : "meeting_room"}
                    size="sm"
                  />
                  {apt.modality === "video" ? "Telehealth (Video)" : "In-Person"}
                </span>
              </dd>
            </div>

            <div className="visit-fact-item">
              <dt>Current Status</dt>
              <dd>
                <StatusBadge tone={STATUS_TONE[apt.status]} shape="pill">
                  {APPOINTMENT_STATUS_LABELS[apt.status]}
                </StatusBadge>
              </dd>
            </div>

            <div className="visit-fact-item">
              <dt>Location / Room</dt>
              <dd>{apt.room ? apt.room : apt.modality === "video" ? "Virtual Room" : "Not assigned"}</dd>
            </div>

            {apt.providerName && (
              <div className="visit-fact-item">
                <dt>Provider</dt>
                <dd>{apt.providerName}</dd>
              </div>
            )}

            {apt.assignedStaffName && (
              <div className="visit-fact-item">
                <dt>Assigned Staff</dt>
                <dd>{apt.assignedStaffName}</dd>
              </div>
            )}

            <div className="visit-fact-item">
              <dt>Coverage / Insurance</dt>
              <dd>{apt.insurance}</dd>
            </div>

            {apt.intakeStatus && apt.intakeStatus !== "exempt" && (
              <div className="visit-fact-item">
                <dt>Intake Readiness</dt>
                <dd className={`intake-status status-${apt.intakeStatus}`}>
                  <Icon
                    name={apt.intakeStatus === "completed" ? "check_circle" : "pending"}
                    size="sm"
                  />
                  {apt.intakeStatus === "completed" ? "Intake marked complete (forms unverified)" : "Intake pending"}
                </dd>
              </div>
            )}

            <div className="visit-fact-item full-width">
              <dt>Chief Complaint / Reason</dt>
              <dd className="visit-fact-complaint">
                {apt.chiefComplaint || "Routine follow-up."}
              </dd>
            </div>

            {apt.notes && (
              <div className="visit-fact-item full-width">
                <dt>Operational Scheduling Notes</dt>
                <dd className="visit-fact-notes">{apt.notes}</dd>
              </div>
            )}

            {(apt.arrivedAt || apt.startedAt || apt.completedAt) && (
              <div className="visit-fact-item full-width">
                <dt>Visit Lifecycle Timestamps</dt>
                <dd style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "12px", color: "var(--m3-text-secondary, #64748b)" }}>
                  {apt.arrivedAt && <span><strong>Arrived:</strong> {new Date(apt.arrivedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
                  {apt.startedAt && <span><strong>Started:</strong> {new Date(apt.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
                  {apt.completedAt && <span><strong>Completed:</strong> {new Date(apt.completedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
                </dd>
              </div>
            )}

            {apt.followUpInterval && (
              <div className="visit-fact-item full-width">
                <dt>Documented Follow-up Interval</dt>
                <dd><strong>{apt.followUpInterval}</strong></dd>
              </div>
            )}

            {apt.alert && (
              <div className="visit-fact-item full-width visit-alert-box">
                <dt>Clinical / Safety Alert</dt>
                <dd>
                  <Icon name="warning" size="sm" /> {apt.alert}
                </dd>
              </div>
            )}

            {/* Cancellation Details if Cancelled */}
            {isCancelled && (
              <div className="visit-fact-item full-width visit-cancellation-box">
                <dt>Cancellation Information</dt>
                <dd>
                  <p>
                    <strong>Reason:</strong> {apt.cancellationReason || "Not recorded"}
                  </p>
                  {apt.cancellationNote && (
                    <p>
                      <strong>Note:</strong> {apt.cancellationNote}
                    </p>
                  )}
                  {apt.cancelledBy && (
                    <small>
                      Recorded by {apt.cancelledBy}
                      {apt.cancelledAt ? ` on ${new Date(apt.cancelledAt).toLocaleString()}` : ""}
                    </small>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Permitted Action Footer */}
        <footer className="visit-drawer-footer">
          <div className="visit-drawer-primary-actions">
            {canStart && (
              <Button
                variant="primary"
                icon="play_arrow"
                onClick={() => {
                  onClose();
                  onStartVisit(apt.patientId, apt.patientName, apt.id);
                }}
              >
                {isInVisit ? "Resume Encounter" : "Start Encounter"}
              </Button>
            )}

            <Button
              variant="secondary"
              icon="folder_shared"
              onClick={() => {
                onClose();
                onOpenChart(apt.patientId);
              }}
            >
              Open Full Chart
            </Button>
          </div>

          <div className="visit-drawer-secondary-actions">
            {canManageAppointments && !isCompleted && !isCancelled && (
              <>
                {!isArrived && !isInVisit && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon="how_to_reg"
                    onClick={() => onStatusChange(apt.id, "waiting")}
                  >
                    Check In
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="tertiary"
                  icon="edit_calendar"
                  onClick={() => {
                    onClose();
                    onEditAppointment(apt);
                  }}
                >
                  Reschedule / Edit
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon="cancel"
                  className="btn-danger-ghost"
                  onClick={() => {
                    onClose();
                    onCancelAppointment(apt);
                  }}
                >
                  Cancel Visit
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon="person_off"
                  onClick={() => onStatusChange(apt.id, "no-show")}
                >
                  Mark No-Show
                </Button>
                {onOpenHandoff && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon="swap_horiz"
                    onClick={() => {
                      onOpenHandoff(apt);
                    }}
                  >
                    Transfer / Handoff
                  </Button>
                )}
                {onScheduleFollowUp && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon="event_repeat"
                    onClick={() => {
                      onClose();
                      onScheduleFollowUp(apt);
                    }}
                  >
                    Schedule Follow-Up
                  </Button>
                )}
              </>
            )}
            {canManageAppointments && (isCompleted || isCancelled) && onScheduleFollowUp && (
              <Button
                size="sm"
                variant="tertiary"
                icon="event_repeat"
                onClick={() => {
                  onClose();
                  onScheduleFollowUp(apt);
                }}
              >
                Schedule Follow-Up
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
