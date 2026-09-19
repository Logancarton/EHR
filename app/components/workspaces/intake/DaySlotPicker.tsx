"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../lib/api-client";
import {
  minutesToTimeString,
  timeStringToMinutes,
  durationStringToMinutes,
  formatDateHeading,
  formatShortDate,
  stepDate,
  offsetDays,
  type VisitType,
} from "../../../lib/schedule-data";
import { practiceMinutesNow, practiceToday } from "../../../lib/practice-calendar";
import { useWorkspaceNavigation } from "../../../lib/workspace-navigation-context";
import Button from "../../ui/Button";
import Icon from "../../ui/Icon";

/**
 * An interactive, visual Calendar Canvas for practice scheduling.
 *
 * Rather than an opaque vertical list of text pills, this renders the practice's
 * real day schedule as a timeline grid canvas — showing the time gutter, hour
 * gridlines, existing booked appointment blocks with patient names & visit types,
 * interactive open time slots, duration-accurate hover/selection previews, and a
 * live practice clock marker.
 *
 * It also provides a direct bridge to the full Calendar workspace tab if the
 * clinician prefers multi-day or full-screen scheduling.
 */

const SLOT_START_MINUTES = 8 * 60; // 8:00 AM
const SLOT_END_MINUTES = 18 * 60; // 6:00 PM
const SLOT_STEP_MINUTES = 30; // 30-minute intervals
const HALF_HOUR_HEIGHT_PX = 36; // 36px per 30 minutes (72px per hour)
const HOUR_HEIGHT_PX = HALF_HOUR_HEIGHT_PX * 2;
const TOTAL_HOURS = (SLOT_END_MINUTES - SLOT_START_MINUTES) / 60; // 10 hours

export const VISIT_TYPE_OPTIONS: readonly VisitType[] = [
  "60-min Intake",
  "45-min Therapy + Meds",
  "30-min Med Check",
];

export function visitTypeDurationMinutes(type: VisitType): number {
  const match = /^(\d+)-min/.exec(type);
  return match ? Number(match[1]) : 30;
}

export function visitTypeDurationLabel(type: VisitType): string {
  return `${visitTypeDurationMinutes(type)} min`;
}

function disabledWhile(
  condition: boolean,
  reason = "Unavailable"
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return condition ? { disabled: true, disabledReason: reason } : {};
}

type DayAppointment = {
  time: string;
  duration: string;
  patientName: string;
  type: string;
  status: string;
};

export default function DaySlotPicker({
  date,
  onDateChange,
  visitType,
  onVisitTypeChange,
  selectedTime,
  onSelectTime,
  busy,
  onOpenFullCalendar,
}: {
  date: string;
  onDateChange: (date: string) => void;
  visitType: VisitType;
  onVisitTypeChange: (type: VisitType) => void;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  busy?: boolean;
  onOpenFullCalendar?: () => void;
}) {
  const nav = useWorkspaceNavigation();
  const [dayAppointments, setDayAppointments] = useState<DayAppointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredSlotMinutes, setHoveredSlotMinutes] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch appointments for the active date
  useEffect(() => {
    let cancelled = false;
    setDayAppointments(null);
    setLoadError(null);
    api.appointments
      .list({ date })
      .then((rows) => {
        if (cancelled) return;
        setDayAppointments(
          rows.map((r) => ({
            time: r.time,
            duration: r.duration,
            patientName: r.patientName,
            type: r.type,
            status: r.status,
          }))
        );
      })
      .catch((cause) => {
        if (!cancelled) {
          setLoadError(cause instanceof Error ? cause.message : "Could not load the schedule for this day.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Auto-scroll to current time (if today) or 8:30 AM on load
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const isToday = date === practiceToday();
    if (isToday) {
      const now = practiceMinutesNow();
      const offsetMin = Math.max(0, now - SLOT_START_MINUTES - 30);
      scrollContainerRef.current.scrollTop = (offsetMin / 30) * HALF_HOUR_HEIGHT_PX;
    } else {
      scrollContainerRef.current.scrollTop = HALF_HOUR_HEIGHT_PX; // ~8:30 AM
    }
  }, [date]);

  const durationMinutes = visitTypeDurationMinutes(visitType);

  // Filter active appointments
  const activeAppointments = useMemo(() => {
    if (!dayAppointments) return [];
    return dayAppointments.filter((apt) => apt.status !== "cancelled" && apt.status !== "no-show");
  }, [dayAppointments]);

  // Pre-calculate 30-min slots and check conflicts against the selected visit duration
  const slots = useMemo(() => {
    const result: Array<{
      minutes: number;
      label: string;
      occupiedBy: string | null;
      slotIndex: number;
    }> = [];

    let slotIndex = 0;
    for (let m = SLOT_START_MINUTES; m < SLOT_END_MINUTES; m += SLOT_STEP_MINUTES) {
      const slotEnd = m + durationMinutes;
      const occupant = activeAppointments.find((apt) => {
        const aptStart = timeStringToMinutes(apt.time);
        const aptEnd = aptStart + (durationStringToMinutes(apt.duration) || 30);
        return m < aptEnd && slotEnd > aptStart;
      });

      result.push({
        minutes: m,
        label: minutesToTimeString(m),
        occupiedBy: occupant ? `${occupant.patientName} · ${occupant.type}` : null,
        slotIndex,
      });
      slotIndex++;
    }
    return result;
  }, [activeAppointments, durationMinutes]);

  // Hours array for left gutter & gridlines
  const clinicHours = useMemo(() => {
    const hours: Array<{ hour24: number; label: string; offsetPx: number }> = [];
    for (let i = 0; i <= TOTAL_HOURS; i++) {
      const hour24 = 8 + i;
      const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
      const period = hour24 >= 12 ? "PM" : "AM";
      hours.push({
        hour24,
        label: `${hour12} ${period}`,
        offsetPx: i * HOUR_HEIGHT_PX,
      });
    }
    return hours;
  }, []);

  // Live time indicator calculation
  const isToday = date === practiceToday();
  const currentMinutes = practiceMinutesNow();
  const showLiveMarker = isToday && currentMinutes >= SLOT_START_MINUTES && currentMinutes <= SLOT_END_MINUTES;
  const liveMarkerTopPx = showLiveMarker
    ? ((currentMinutes - SLOT_START_MINUTES) / 30) * HALF_HOUR_HEIGHT_PX
    : 0;

  // Find selected slot object
  const selectedSlot = useMemo(() => {
    if (!selectedTime) return null;
    return slots.find((s) => s.label === selectedTime) || null;
  }, [selectedTime, slots]);

  return (
    <div className="intake-day-slot-picker">
      {/* 1. Canvas Toolbar: Date step controls, heading, date input, and Full Calendar bridge */}
      <div className="intake-canvas-toolbar">
        <div className="intake-canvas-date-controls">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon="chevron_left"
            aria-label="Previous day"
            {...disabledWhile(Boolean(busy), "Schedule is updating…")}
            onClick={() => onDateChange(stepDate(date, "prev"))}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            {...disabledWhile(Boolean(busy) || isToday, isToday ? "Already showing today" : "Schedule is updating…")}
            onClick={() => onDateChange(practiceToday())}
          >
            Today
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon="chevron_right"
            aria-label="Next day"
            {...disabledWhile(Boolean(busy), "Schedule is updating…")}
            onClick={() => onDateChange(stepDate(date, "next"))}
          />
          <div className="intake-canvas-date-text">
            <h3 className="intake-canvas-date-heading" title={formatDateHeading(date)}>
              {formatShortDate(date)}
            </h3>
          </div>
          <input
            type="date"
            className="intake-canvas-native-date-input"
            value={date}
            disabled={busy}
            onChange={(e) => onDateChange(e.target.value)}
            aria-label="Select appointment date"
          />
          <div className="intake-interval-chips" role="group" aria-label="Prescription interval jumps">
            <button
              type="button"
              className={`intake-interval-chip ${date === offsetDays(practiceToday(), 28) ? "active" : ""}`}
              disabled={busy}
              onClick={() => onDateChange(offsetDays(practiceToday(), 28))}
              title="Jump 28 days later (4 weeks · 1-month supply)"
            >
              +28d
            </button>
            <button
              type="button"
              className={`intake-interval-chip ${date === offsetDays(practiceToday(), 56) ? "active" : ""}`}
              disabled={busy}
              onClick={() => onDateChange(offsetDays(practiceToday(), 56))}
              title="Jump 56 days later (8 weeks · 2-month check)"
            >
              +56d
            </button>
            <button
              type="button"
              className={`intake-interval-chip ${date === offsetDays(practiceToday(), 84) ? "active" : ""}`}
              disabled={busy}
              onClick={() => onDateChange(offsetDays(practiceToday(), 84))}
              title="Jump 84 days later (12 weeks · 3-month renewal)"
            >
              +84d
            </button>
          </div>
        </div>

        <div className="intake-canvas-actions">
          <div className="intake-canvas-type-selector">
            <label htmlFor="intake-visit-type-select" className="visually-hidden">Visit Type</label>
            <select
              id="intake-visit-type-select"
              value={visitType}
              onChange={(e) => onVisitTypeChange(e.target.value as VisitType)}
              disabled={busy}
              className="intake-canvas-type-select"
            >
              {VISIT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            icon="calendar_month"
            onClick={() => {
              if (onOpenFullCalendar) {
                onOpenFullCalendar();
              } else {
                nav.openCalendar();
              }
            }}
            title="Open practice calendar workspace for this date"
          >
            Full Calendar ↗
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="intake-new-modal-error" role="alert">
          {loadError}
        </div>
      )}

      {/* 2. Visual Day Schedule Canvas */}
      <div className="intake-calendar-canvas-container">
        <div className="intake-calendar-canvas-header-row">
          <div className="intake-canvas-gutter-header">Time</div>
          <div className="intake-canvas-column-header">
            <span title={formatDateHeading(date)}>Daily Schedule · {formatShortDate(date)}</span>
            <span className="intake-canvas-sub-header">
              {activeAppointments.length} booked
            </span>
          </div>
        </div>

        <div
          className="intake-calendar-canvas-scroll"
          ref={scrollContainerRef}
          aria-label={`Schedule timeline for ${date}`}
        >
          {dayAppointments === null && !loadError ? (
            <div className="intake-canvas-loading">
              <Icon name="sync" size="sm" />
              <span>Loading practice schedule…</span>
            </div>
          ) : (
            <div
              className="intake-calendar-canvas-grid"
              style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT_PX}px` }}
            >
              {/* Left Time Gutter */}
              <div className="intake-canvas-time-gutter">
                {clinicHours.map((h, i) => (
                  <div
                    key={h.hour24}
                    className="intake-canvas-hour-label"
                    style={{ top: `${h.offsetPx}px` }}
                  >
                    {i < TOTAL_HOURS && h.label}
                  </div>
                ))}
              </div>

              {/* Day Column with Gridlines & Slots */}
              <div className="intake-canvas-day-column">
                {/* Horizontal Hour and Half-Hour lines */}
                {clinicHours.slice(0, -1).map((h) => (
                  <div key={h.hour24} className="intake-canvas-hour-row" style={{ top: `${h.offsetPx}px` }}>
                    <div className="intake-canvas-hour-line" />
                    <div className="intake-canvas-half-hour-line" style={{ top: `${HALF_HOUR_HEIGHT_PX}px` }} />
                  </div>
                ))}

                {/* Live Current Time Indicator */}
                {showLiveMarker && (
                  <div
                    className="intake-canvas-now-line"
                    style={{ top: `${liveMarkerTopPx}px` }}
                    title={`Current Practice Time: ${minutesToTimeString(currentMinutes)}`}
                  >
                    <div className="intake-canvas-now-dot" />
                    <span className="intake-canvas-now-badge">{minutesToTimeString(currentMinutes)}</span>
                  </div>
                )}

                {/* Booked Appointment Blocks */}
                {activeAppointments.map((apt, idx) => {
                  const aptStart = timeStringToMinutes(apt.time);
                  const aptDuration = durationStringToMinutes(apt.duration) || 30;
                  if (aptStart + aptDuration <= SLOT_START_MINUTES || aptStart >= SLOT_END_MINUTES) {
                    return null;
                  }
                  const clampedStart = Math.max(SLOT_START_MINUTES, aptStart);
                  const clampedEnd = Math.min(SLOT_END_MINUTES, aptStart + aptDuration);
                  const topPx = ((clampedStart - SLOT_START_MINUTES) / 30) * HALF_HOUR_HEIGHT_PX;
                  const heightPx = Math.max(28, ((clampedEnd - clampedStart) / 30) * HALF_HOUR_HEIGHT_PX - 2);

                  return (
                    <div
                      key={`${apt.time}-${apt.patientName}-${idx}`}
                      className="intake-canvas-booked-card"
                      style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                      title={`Booked: ${apt.patientName} (${apt.type}, ${apt.time}, ${apt.duration})`}
                    >
                      <div className="intake-canvas-booked-stripe" />
                      <div className="intake-canvas-booked-content">
                        <div className="intake-canvas-booked-top">
                          <span className="intake-canvas-booked-time">{apt.time}</span>
                          <span className="intake-canvas-booked-badge">Booked</span>
                        </div>
                        <div className="intake-canvas-booked-name">{apt.patientName}</div>
                        <div className="intake-canvas-booked-type">{apt.type}</div>
                      </div>
                    </div>
                  );
                })}

                {/* Clickable 30-min Slot Rows */}
                <div className="intake-day-slot-list">
                  {slots.map((slot) => {
                    const topPx = slot.slotIndex * HALF_HOUR_HEIGHT_PX;
                    const isOccupied = Boolean(slot.occupiedBy);
                    const isSelected = selectedTime === slot.label;
                    const isHovered = hoveredSlotMinutes === slot.minutes && !isOccupied;

                    return (
                      <button
                        key={slot.minutes}
                        type="button"
                        className={`intake-day-slot ${isOccupied ? "occupied" : "open"} ${isSelected ? "selected" : ""}`}
                        style={{
                          top: `${topPx}px`,
                          height: `${HALF_HOUR_HEIGHT_PX}px`,
                        }}
                        disabled={isOccupied || busy}
                        onClick={() => onSelectTime(slot.label)}
                        onMouseEnter={() => setHoveredSlotMinutes(slot.minutes)}
                        onMouseLeave={() => setHoveredSlotMinutes(null)}
                        title={
                          isOccupied
                            ? `Occupied: ${slot.occupiedBy}`
                            : `Click to hold ${slot.label} for ${visitTypeDurationLabel(visitType)}`
                        }
                      >
                        <span className="intake-day-slot-time">{slot.label}</span>
                        <span className="intake-day-slot-status">
                          {isOccupied ? slot.occupiedBy : isSelected ? "Selected Hold" : "Open"}
                        </span>

                        {isHovered && !isSelected && (
                          <div
                            className="intake-canvas-hover-preview"
                            style={{ height: `${(durationMinutes / 30) * HALF_HOUR_HEIGHT_PX - 2}px` }}
                          >
                            <span className="intake-canvas-hover-label">
                              + Hold {slot.label} ({visitTypeDurationLabel(visitType)})
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Tentative Hold Floating Overlay Card */}
                {selectedSlot && (
                  <div
                    className="intake-canvas-selected-overlay"
                    style={{
                      top: `${selectedSlot.slotIndex * HALF_HOUR_HEIGHT_PX}px`,
                      height: `${(durationMinutes / 30) * HALF_HOUR_HEIGHT_PX - 2}px`,
                    }}
                  >
                    <div className="intake-canvas-selected-inner">
                      <div className="intake-canvas-selected-header">
                        <span className="intake-canvas-selected-badge">
                          <Icon name="check_circle" size="sm" /> Tentative Intake Hold
                        </span>
                        <span className="intake-canvas-selected-duration">{durationMinutes} min</span>
                      </div>
                      <div className="intake-canvas-selected-time">
                        {selectedSlot.label} – {minutesToTimeString(selectedSlot.minutes + durationMinutes)}
                      </div>
                      <div className="intake-canvas-selected-subtitle">
                        {visitType} · Ready to hold
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Canvas Bottom Status Bar */}
        <div className="intake-canvas-status-bar">
          {selectedSlot ? (
            <div className="intake-canvas-status-selected">
              <Icon name="event_available" size="sm" />
              <span>
                <strong>{selectedSlot.label}</strong> –{" "}
                {minutesToTimeString(selectedSlot.minutes + durationMinutes)} on{" "}
                <strong>{formatDateHeading(date)}</strong> ({visitType})
              </span>
            </div>
          ) : (
            <div className="intake-canvas-status-prompt">
              <Icon name="info" size="sm" />
              <span>Click any open spot on the calendar canvas to place the tentative hold.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
