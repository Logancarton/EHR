"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import StatusBadge from "../ui/StatusBadge";
import {
  PREVIEW_VISIT_STATUS_LABEL,
  type PreviewVisit,
  type PreviewVisitStatus,
} from "../../lib/preview/dashboard-preview-fixtures";
import type { PreviewRosterFieldId, PreviewScheduleView } from "../../lib/preview/dashboard-preview-model";

/**
 * The clinic day, as a roster of appointments.
 *
 * Two targets per row, which is the point of DASH-05 and the reason this is worth
 * showing rather than describing:
 *
 * - **the visit target** (the time and visit type) opens *that appointment's*
 *   information. It is navigation. It does not change status, start anything, or
 *   create a draft.
 * - **the patient's name** opens the longitudinal chart.
 *
 * A patient with two visits today therefore has two visit targets and one chart,
 * and the row carries the appointment's own identity so the two cannot be confused.
 */

const STATUS_TONE: Record<PreviewVisitStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  scheduled: "neutral",
  confirmed: "info",
  arrived: "warning",
  "in-visit": "info",
  completed: "success",
  "no-show": "danger",
  cancelled: "neutral",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export type PreviewRosterProps = {
  visits: readonly PreviewVisit[];
  fields: readonly PreviewRosterFieldId[];
  view: PreviewScheduleView;
  rowActions: readonly string[];
  selectedVisitId?: string;
  onOpenVisit: (visit: PreviewVisit) => void;
  onOpenChart: (visit: PreviewVisit) => void;
};

export default function PreviewRoster({
  visits,
  fields,
  view,
  rowActions,
  selectedVisitId,
  onOpenVisit,
  onOpenChart,
}: PreviewRosterProps) {
  const shows = (field: PreviewRosterFieldId) => fields.includes(field);

  if (view === "timeline") {
    return <PreviewTimeline visits={visits} onOpenVisit={onOpenVisit} onOpenChart={onOpenChart} />;
  }

  return (
    <ul className="dp-roster" aria-label="Today's appointments">
      {visits.map((visit) => (
        <li
          key={visit.id}
          className={`dp-row status-${visit.status} ${selectedVisitId === visit.id ? "is-selected" : ""}`}
          data-visit-id={visit.id}
          data-patient-id={visit.patientId}
        >
          {shows("time") && (
            <div className="dp-row-time">
              <strong>{visit.time}</strong>
              <small>{visit.durationMinutes} min</small>
            </div>
          )}

          {shows("photo") && (
            <span className="dp-row-photo" aria-hidden="true">
              {initials(visit.patientName)}
            </span>
          )}

          <div className="dp-row-identity">
            <div className="dp-row-names">
              {/* Target 1 of 2: the chart. */}
              <button
                type="button"
                className="dp-row-name"
                onClick={() => onOpenChart(visit)}
                title={`Open ${visit.patientName}'s chart`}
              >
                {visit.patientName}
              </button>
              {shows("mrn") && <span className="dp-row-meta">MRN {visit.mrn}</span>}
              {shows("mrn") && <span className="dp-row-meta">DOB {visit.dob}</span>}
              {visit.telehealth && (
                <span className="dp-row-meta dp-row-tele">
                  <Icon name="videocam" size="sm" /> Telehealth
                </span>
              )}
            </div>

            {/* Target 2 of 2: this appointment. */}
            {(shows("visitType") || shows("reason")) && (
              <button
                type="button"
                className="dp-row-visit"
                onClick={() => onOpenVisit(visit)}
                title="Open this visit's information — does not change status or start the visit"
              >
                {shows("visitType") && <span className="dp-row-visit-type">{visit.visitType}</span>}
                {shows("reason") && <span className="dp-row-reason">{visit.reason}</span>}
              </button>
            )}

            {visit.flag && (
              <p className="dp-row-flag">
                <Icon name="info" size="sm" /> {visit.flag}
              </p>
            )}
          </div>

          {shows("room") && (
            <span className="dp-row-room">{visit.room ? `Room ${visit.room}` : visit.telehealth ? "Video" : "—"}</span>
          )}

          {shows("insurance") && <span className="dp-row-coverage">{visit.insurance}</span>}

          {shows("status") && (
            <span className="dp-row-status">
              <StatusBadge tone={STATUS_TONE[visit.status]} shape="pill">
                {PREVIEW_VISIT_STATUS_LABEL[visit.status]}
              </StatusBadge>
            </span>
          )}

          <div className="dp-row-actions">
            <Button size="sm" icon="event_note" onClick={() => onOpenVisit(visit)}>
              Visit
            </Button>
            <RowActionMenu visit={visit} actions={rowActions} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The row's action menu.
 *
 * Every item is deliberately inert. A prototype that could actually check a patient
 * in or mark a no-show would be a second write path into the schedule, which DB-1
 * rules out — so the menu shows *which* actions each role's menu would carry, says
 * plainly that it runs nothing, and leaves the permission question to DB-2 where the
 * server enforces it.
 */
function RowActionMenu({ visit, actions }: { visit: PreviewVisit; actions: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="dp-row-menu-anchor" ref={anchor}>
      <Button
        variant="icon"
        size="sm"
        icon="more_vert"
        aria-label={`Actions for ${visit.patientName} at ${visit.time}`}
        aria-expanded={open}
        pressed={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="dp-row-menu" role="menu" aria-label={`Actions for ${visit.patientName} at ${visit.time}`}>
          <p className="dp-row-menu-note">
            Preview only — no action runs. Permission is enforced on the server, not by this menu.
          </p>
          {actions.map((action) => (
            <button key={action} type="button" role="menuitem" className="dp-row-menu-item" disabled>
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The optional time-based view of the same day. The roster remains the default. */
function PreviewTimeline({
  visits,
  onOpenVisit,
  onOpenChart,
}: {
  visits: readonly PreviewVisit[];
  onOpenVisit: (visit: PreviewVisit) => void;
  onOpenChart: (visit: PreviewVisit) => void;
}) {
  const dayStart = 8 * 60;
  const dayEnd = 17 * 60;
  const span = dayEnd - dayStart;
  const hours = Array.from({ length: (dayEnd - dayStart) / 60 + 1 }, (_, index) => dayStart + index * 60);

  return (
    <div className="dp-timeline" aria-label="Today's appointments on a timeline">
      <div className="dp-timeline-hours" aria-hidden="true">
        {hours.map((minutes) => (
          <span key={minutes} style={{ top: `${((minutes - dayStart) / span) * 100}%` }}>
            {minutes % 720 === 0 ? 12 : Math.floor(minutes / 60) % 12}:00
          </span>
        ))}
      </div>
      <ol className="dp-timeline-track">
        {visits.map((visit) => (
          <li
            key={visit.id}
            className={`dp-timeline-visit status-${visit.status}`}
            data-visit-id={visit.id}
            style={{
              top: `${((visit.startMinutes - dayStart) / span) * 100}%`,
              height: `${(visit.durationMinutes / span) * 100}%`,
            }}
          >
            <button type="button" className="dp-timeline-visit-target" onClick={() => onOpenVisit(visit)}>
              <strong>{visit.time}</strong>
              <span>{visit.visitType}</span>
            </button>
            <button type="button" className="dp-timeline-name" onClick={() => onOpenChart(visit)}>
              {visit.patientName}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * What came off the day.
 *
 * Folded shut by default and carrying its own count, because a cancellation is not
 * work and should not compete with the visits that are. It stays reachable because
 * a released slot is still a fact about the day — and because the reason it was
 * released is usually the thing someone is actually looking for.
 */
export function PreviewCancelledStrip({
  visits,
  recordedReasons,
  selectedVisitId,
  onOpenVisit,
}: {
  visits: readonly PreviewVisit[];
  /**
   * Reasons entered in this preview session, by appointment id. The list reads
   * these over the fixture so a reason someone has just recorded does not keep
   * reading "No reason recorded" two feet away from where they typed it.
   */
  recordedReasons?: Record<string, { reason: string }>;
  selectedVisitId?: string;
  onOpenVisit: (visit: PreviewVisit) => void;
}) {
  const [open, setOpen] = useState(false);
  if (visits.length === 0) return null;

  return (
    <div className="dp-cancelled-strip" data-cancelled-count={visits.length}>
      <button
        type="button"
        className="dp-cancelled-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? "expand_less" : "expand_more"} size="sm" />
        {visits.length} cancelled
        <span>· off the roster, still on the day</span>
      </button>

      {open && (
        <ul className="dp-cancelled-list">
          {visits.map((visit) => (
            <li key={visit.id} className={selectedVisitId === visit.id ? "is-selected" : ""}>
              <button type="button" onClick={() => onOpenVisit(visit)} data-cancelled-visit={visit.id}>
                <strong>{visit.time}</strong>
                <span>{visit.patientName}</span>
                <em>
                  {recordedReasons?.[visit.id]?.reason ??
                    visit.cancellation?.reason ??
                    "No reason recorded"}
                </em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
