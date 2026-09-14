"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  FRONT_DESK_STATUSES,
  type AppointmentStatus,
  type ScheduleItem,
} from "../../lib/schedule-data";
import { DEFAULT_ROSTER_FIELDS, type RosterFieldId } from "../../domain/roster-fields";
import type { SaveStatus } from "../../lib/ui-system";
import SaveStateIndicator from "../ui/SaveStateIndicator";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { useAuthSession } from "../auth/AuthSessionGate";

/**
 * DB-4: One appointment on the daily roster with distinct visit & chart targets.
 *
 * Distinct targets per row (DASH-05, DB-4):
 * 1. **Patient name target**: Opens the patient's longitudinal chart (`onOpenChart`).
 *    Pure navigation; does not start a visit or change status.
 * 2. **Visit target** (Time block, visit badge, or info icon): Opens the dedicated
 *    visit detail drawer (`onOpenVisit`). Pure inspection; produces zero clinical writes.
 * 3. **Start / Resume button**: Explicit permitted action that sets "in-visit" and binds
 *    the upcoming encounter to this specific appointment ID.
 */

export interface RosterRowProps {
  appointment: ScheduleItem;
  photo?: { photoUrl?: string; photoType?: "license" | "custom" | "headshot" };
  visibleFields?: readonly RosterFieldId[];
  saveStatus?: SaveStatus;
  saveError?: string;
  onRetrySave?: () => void;
  onStatusChange: (id: string, next: AppointmentStatus) => void;
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onOpenChart: (patientId: string, section?: string) => void;
  onOpenVisit?: (appointment: ScheduleItem) => void;
  onEditAppointment?: (appointment: ScheduleItem) => void;
  onCancelAppointment?: (appointment: ScheduleItem) => void;
}

export default function RosterRow({
  appointment: apt,
  photo,
  visibleFields = DEFAULT_ROSTER_FIELDS,
  saveStatus,
  saveError,
  onRetrySave,
  onStatusChange,
  onStartVisit,
  onOpenChart,
  onOpenVisit,
  onEditAppointment,
  onCancelAppointment,
}: RosterRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const detailId = useId();
  const { hasPermission } = useAuthSession();

  const shows = (field: RosterFieldId) => visibleFields.includes(field);

  function openDetail() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setDetailOpen(true);
  }

  function closeDetail() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setDetailOpen(false), 140);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!detailOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  const isCancelled = apt.status === "cancelled";
  const isArrived = apt.status === "waiting";
  const isActive = apt.status === "in-visit";
  const isClosed = apt.status === "completed" || apt.status === "no-show";

  return (
    <div
      className={`roster-row status-${apt.status} ${isCancelled ? "status-cancelled" : ""} ${detailOpen ? "detail-open" : ""}`}
      data-appointment-id={apt.id}
      data-save-status={saveStatus || undefined}
    >
      {/* Target 1 of Visit: Time block */}
      {shows("time") && (
        <div className="roster-time">
          {onOpenVisit ? (
            <button
              type="button"
              className="roster-time-btn"
              onClick={() => onOpenVisit(apt)}
              title={`Inspect visit information for ${apt.time} — changes nothing`}
            >
              <strong>{apt.time}</strong>
              <small>{apt.duration}</small>
            </button>
          ) : (
            <>
              <strong>{apt.time}</strong>
              <small>{apt.duration}</small>
            </>
          )}
        </div>
      )}

      {/* Picture spot */}
      {shows("photo") && (
        <PatientPhotoSpot
          patient={{
            id: apt.patientId,
            name: apt.patientName,
            dob: apt.dob,
            photoUrl: photo?.photoUrl,
            photoType: photo?.photoType,
          }}
          size="sm"
          editable={false}
          showBadge={false}
          className="roster-photo"
        />
      )}

      {/* Patient Name & Metadata */}
      <div className="roster-identity">
        <div className="roster-identity-main">
          {/* Target of Chart: Patient Name */}
          <button
            type="button"
            className="roster-name"
            aria-describedby={detailOpen ? detailId : undefined}
            onClick={() => onOpenChart(apt.patientId)}
            onMouseEnter={openDetail}
            onMouseLeave={closeDetail}
            onFocus={openDetail}
            onBlur={closeDetail}
            title={`Open ${apt.patientName}'s chart`}
          >
            {apt.patientName}
          </button>

          {shows("mrn") && <span className="roster-meta-pill">MRN {apt.mrn}</span>}

          {shows("modality") && (
            <span
              className={`visit-modality-badge modality-${apt.modality || "in-person"}`}
              title={apt.modality === "video" ? "Telehealth (Video)" : "In-Person"}
            >
              <Icon name={apt.modality === "video" ? "videocam" : "meeting_room"} size="sm" />
              {apt.modality === "video" ? "Video" : "In-Person"}
            </span>
          )}

          {shows("room") && apt.room && (
            <span className="roster-meta-pill room-pill">{apt.room}</span>
          )}

          {shows("provider") && apt.providerName && (
            <span className="roster-meta-pill provider-pill">{apt.providerName}</span>
          )}

          {shows("coverage") && apt.insurance && (
            <span className="roster-meta-pill coverage-pill">{apt.insurance}</span>
          )}

          {shows("alerts") && apt.alert && (
            <span className="roster-alert-dot" title={apt.alert} aria-label={`Alert: ${apt.alert}`}>
              <Icon name="warning" size="sm" />
            </span>
          )}
        </div>

        {/* Target 2 of Visit: Visit Type / Reason badge */}
        {(shows("visitType") || shows("reason") || shows("intake")) && (
          <div className="roster-secondary-line">
            {shows("visitType") && (
              onOpenVisit ? (
                <button
                  type="button"
                  className="roster-visit-btn"
                  onClick={() => onOpenVisit(apt)}
                  title="Inspect visit information"
                >
                  <Icon name="event_note" size="sm" />
                  <span>{apt.type}</span>
                </button>
              ) : (
                <span className="roster-visit-btn">{apt.type}</span>
              )
            )}

            {shows("reason") && apt.chiefComplaint && (
              <span className="roster-reason-text" title={apt.chiefComplaint}>
                {apt.chiefComplaint}
              </span>
            )}

            {shows("intake") && apt.intakeStatus && (
              <span className={`intake-status status-${apt.intakeStatus}`}>
                <Icon
                  name={apt.intakeStatus === "completed" ? "check_circle" : "pending"}
                  size="sm"
                />
                {apt.intakeStatus === "completed" ? "Intake done" : "Intake pending"}
              </span>
            )}
          </div>
        )}

        {/* Hovercard for fast scan without navigation */}
        {detailOpen && (
          <div id={detailId} role="tooltip" className="roster-hovercard">
            <div className="hovercard-head">
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
              />
              <div>
                <strong>{apt.patientName}</strong>
                <span>
                  {apt.age}y · DOB {apt.dob}
                </span>
                <span>MRN {apt.mrn}</span>
              </div>
            </div>

            <dl className="hovercard-facts">
              <div>
                <dt>Visit</dt>
                <dd>{apt.type}</dd>
              </div>
              <div>
                <dt>Modality</dt>
                <dd>{apt.modality === "video" ? "Telehealth (Video)" : "In-Person"}</dd>
              </div>
              <div>
                <dt>Reason</dt>
                <dd>{apt.chiefComplaint || "Routine follow-up"}</dd>
              </div>
              <div>
                <dt>Insurance</dt>
                <dd>{apt.insurance}</dd>
              </div>
              {apt.room && (
                <div>
                  <dt>Room</dt>
                  <dd>{apt.room}</dd>
                </div>
              )}
              <div>
                <dt>Status</dt>
                <dd>{APPOINTMENT_STATUS_LABELS[apt.status]}</dd>
              </div>
            </dl>

            {apt.alert && (
              <p className="hovercard-alert">
                <Icon name="warning" size="sm" /> {apt.alert}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Front-desk state buttons */}
      {shows("status") && (
        <div
          className="roster-frontdesk"
          role="group"
          aria-label={`Arrival status for ${apt.patientName}`}
        >
          {isCancelled ? (
            <span
              className="roster-state-chip state-cancelled"
              title={apt.cancellationNote ? `Note: ${apt.cancellationNote}` : undefined}
            >
              Cancelled{apt.cancellationReason ? ` · ${apt.cancellationReason}` : ""}
            </span>
          ) : saveStatus === "saving" || saveStatus === "failed" ? (
            <SaveStateIndicator
              status={saveStatus}
              error={saveError}
              onRetry={onRetrySave}
              label={saveStatus === "saving" ? "Saving…" : "Not saved"}
            />
          ) : isClosed || isActive ? (
            <span className={`roster-state-chip state-${apt.status}`}>
              {APPOINTMENT_STATUS_LABELS[apt.status]}
            </span>
          ) : (
            FRONT_DESK_STATUSES.map((state) => (
              <button
                key={state.value}
                type="button"
                className={`frontdesk-btn ${apt.status === state.value ? "is-on" : ""}`}
                aria-pressed={apt.status === state.value}
                title={`${state.label} — ${state.hint}`}
                onClick={() => onStatusChange(apt.id, state.value)}
              >
                <Icon name={state.icon} size="sm" />
                <span className="frontdesk-label">{state.label}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Actions */}
      <div className="roster-actions">
        {!isClosed && !isCancelled ? (
          <Button
            className="roster-start-btn"
            variant="primary"
            size="sm"
            icon="play_arrow"
            onClick={() => {
              if (!isActive) onStatusChange(apt.id, "in-visit");
              onStartVisit(apt.patientId, apt.patientName, apt.id);
            }}
            title={isArrived ? "Patient is here — open the encounter" : "Open chart and start the encounter"}
          >
            Start
          </Button>
        ) : (
          <Button size="sm" onClick={() => onOpenChart(apt.patientId)}>
            Chart
          </Button>
        )}

        {onOpenVisit && (
          <Button
            size="sm"
            variant="icon"
            icon="info"
            aria-label={`Visit details for ${apt.patientName}`}
            title="Inspect visit information"
            onClick={() => onOpenVisit(apt)}
          />
        )}

        <Button
          className="roster-rx-btn"
          size="sm"
          variant="icon"
          icon="medication"
          aria-label={`Medications for ${apt.patientName}`}
          title="Open medications"
          onClick={() => onOpenChart(apt.patientId, "Meds")}
        />

        <RowActionMenu
          appointment={apt}
          canManageAppointments={hasPermission("manage_appointments")}
          onStatusChange={onStatusChange}
          onOpenVisit={onOpenVisit}
          onOpenChart={onOpenChart}
          onEditAppointment={onEditAppointment}
          onCancelAppointment={onCancelAppointment}
        />
      </div>
    </div>
  );
}

function RowActionMenu({
  appointment: apt,
  canManageAppointments,
  onStatusChange,
  onOpenVisit,
  onOpenChart,
  onEditAppointment,
  onCancelAppointment,
}: {
  appointment: ScheduleItem;
  canManageAppointments: boolean;
  onStatusChange: (id: string, next: AppointmentStatus) => void;
  onOpenVisit?: (appointment: ScheduleItem) => void;
  onOpenChart: (patientId: string) => void;
  onEditAppointment?: (appointment: ScheduleItem) => void;
  onCancelAppointment?: (appointment: ScheduleItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isCompleted = apt.status === "completed";
  const isCancelled = apt.status === "cancelled";

  return (
    <div className="roster-row-menu-wrapper" ref={menuRef} style={{ position: "relative" }}>
      <Button
        size="sm"
        variant="icon"
        icon="more_vert"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`More actions for ${apt.patientName}`}
        onClick={() => setOpen((prev) => !prev)}
      />

      {open && (
        <div
          className="roster-row-menu-popover"
          role="menu"
          aria-label={`Actions for ${apt.patientName}`}
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "var(--m3-surface-bright, #ffffff)",
            border: "1px solid var(--m3-border, #e2e8f0)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            zIndex: 1000,
            minWidth: "160px",
            padding: "4px 0",
          }}
        >
          {onOpenVisit && (
            <button
              type="button"
              className="roster-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenVisit(apt);
              }}
              style={menuItemStyle}
            >
              <Icon name="event_note" size="sm" />
              <span>Visit details</span>
            </button>
          )}

          <button
            type="button"
            className="roster-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onOpenChart(apt.patientId);
            }}
            style={menuItemStyle}
          >
            <Icon name="folder_shared" size="sm" />
            <span>Open chart</span>
          </button>

          {canManageAppointments && onEditAppointment && !isCompleted && (
            <button
              type="button"
              className="roster-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onEditAppointment(apt);
              }}
              style={menuItemStyle}
            >
              <Icon name="edit_calendar" size="sm" />
              <span>Reschedule / Edit</span>
            </button>
          )}

          {canManageAppointments && !isCompleted && !isCancelled && apt.status !== "waiting" && (
            <button
              type="button"
              className="roster-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onStatusChange(apt.id, "waiting");
              }}
              style={menuItemStyle}
            >
              <Icon name="how_to_reg" size="sm" />
              <span>Mark arrived</span>
            </button>
          )}

          {canManageAppointments && !isCompleted && !isCancelled && apt.status !== "no-show" && (
            <button
              type="button"
              className="roster-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onStatusChange(apt.id, "no-show");
              }}
              style={menuItemStyle}
            >
              <Icon name="person_off" size="sm" />
              <span>Mark no-show</span>
            </button>
          )}

          {canManageAppointments && onCancelAppointment && !isCompleted && !isCancelled && (
            <button
              type="button"
              className="roster-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onCancelAppointment(apt);
              }}
              style={{ ...menuItemStyle, color: "var(--m3-error, #ef4444)" }}
            >
              <Icon name="cancel" size="sm" />
              <span>Cancel visit</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
  padding: "7px 12px",
  background: "none",
  border: "none",
  font: "inherit",
  fontSize: "12.5px",
  color: "var(--m3-text-primary, #0f172a)",
  textAlign: "left",
  cursor: "pointer",
};
