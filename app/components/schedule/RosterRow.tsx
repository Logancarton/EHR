"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  FRONT_DESK_STATUSES,
  type AppointmentStatus,
  type ScheduleItem,
} from "../../lib/schedule-data";
import type { SaveStatus } from "../../lib/ui-system";
import SaveStateIndicator from "../ui/SaveStateIndicator";
import PatientPhotoSpot from "../patient/PatientPhotoSpot";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

/**
 * One appointment on the daily roster.
 *
 * The row is deliberately near-empty at rest: time, face, name, state. A full day
 * of appointments is a list a clinician scans, and the demographics that used to sit
 * inline (age, DOB, MRN, complaint, insurance) turned every scan into a reading
 * task. They are not gone — they open on the name, which is the thing the eye is
 * already on when it wants them.
 *
 * The detail opens as a hovercard rather than by expanding the row, because a list
 * whose rows change height under the pointer moves the target the clinician is
 * reaching for.
 */

export interface RosterRowProps {
  appointment: ScheduleItem;
  photo?: { photoUrl?: string; photoType?: "license" | "custom" | "headshot" };
  /**
   * Whether this row's last status change reached the server.
   *
   * The row used to move the moment it was clicked and only log a rejection, so a
   * refused change sat on screen looking saved. `saving` and `failed` are the two
   * states that were missing.
   */
  saveStatus?: SaveStatus;
  saveError?: string;
  onRetrySave?: () => void;
  onStatusChange: (id: string, next: AppointmentStatus) => void;
  onStartVisit: (patientId: string, patientName: string, appointmentId: string) => void;
  onOpenChart: (patientId: string, section?: string) => void;
}

export default function RosterRow({
  appointment: apt,
  photo,
  saveStatus,
  saveError,
  onRetrySave,
  onStatusChange,
  onStartVisit,
  onOpenChart,
}: RosterRowProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const detailId = useId();

  // Closing is deferred a beat so that travelling between the name and the row's
  // own controls does not flicker the card.
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

  // Escape closes the detail without moving focus off the name.
  useEffect(() => {
    if (!detailOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDetailOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailOpen]);

  const isArrived = apt.status === "waiting";
  const isActive = apt.status === "in-visit";
  const isClosed = apt.status === "completed" || apt.status === "no-show";

  return (
    <div
      className={`roster-row status-${apt.status} ${detailOpen ? "detail-open" : ""}`}
      data-appointment-id={apt.id}
      data-save-status={saveStatus || undefined}
    >
      {/* Time — the one thing that is always readable without interaction. */}
      <div className="roster-time">
        <strong>{apt.time}</strong>
        <small>{apt.duration}</small>
      </div>

      {/* The picture spot. */}
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

      {/* Name — the hover target that carries everything else. */}
      <div className="roster-identity">
        <button
          type="button"
          className="roster-name"
          aria-describedby={detailOpen ? detailId : undefined}
          onClick={() => onOpenChart(apt.patientId)}
          onMouseEnter={openDetail}
          onMouseLeave={closeDetail}
          onFocus={openDetail}
          onBlur={closeDetail}
        >
          {apt.patientName}
        </button>

        {apt.alert && (
          <span className="roster-alert-dot" title={apt.alert} aria-label={`Alert: ${apt.alert}`}>
            <Icon name="warning" size="sm" />
          </span>
        )}

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
                <dt>Reason</dt>
                <dd>{apt.chiefComplaint}</dd>
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

      {/* Front-desk state: out of the way, one click, no menu. */}
      <div
        className="roster-frontdesk"
        role="group"
        aria-label={`Arrival status for ${apt.patientName}`}
      >
        {saveStatus === "saving" || saveStatus === "failed" ? (
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

      {/* Actions occupy a reserved column so revealing them cannot shift the row. */}
      <div className="roster-actions">
        {!isClosed ? (
          <Button
            className="roster-start-btn"
            variant="primary"
            size="sm"
            icon="play_arrow"
            onClick={() => {
              if (!isActive) onStatusChange(apt.id, "in-visit");
              // The appointment travels with the start, so the note this produces
              // records which visit it belongs to.
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
        <Button
          className="roster-rx-btn"
          size="sm"
          variant="icon"
          icon="medication"
          aria-label={`Medications for ${apt.patientName}`}
          title="Open medications"
          onClick={() => onOpenChart(apt.patientId, "Meds")}
        />
        <select
          className="roster-more-status"
          value={apt.status}
          aria-label={`Full status for ${apt.patientName}`}
          onChange={(event) => onStatusChange(apt.id, event.target.value as AppointmentStatus)}
        >
          {(Object.keys(APPOINTMENT_STATUS_LABELS) as AppointmentStatus[]).map((value) => (
            <option key={value} value={value}>
              {APPOINTMENT_STATUS_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
