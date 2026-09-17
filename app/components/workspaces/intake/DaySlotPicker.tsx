"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api-client";
import { minutesToTimeString, timeStringToMinutes, durationStringToMinutes, type VisitType } from "../../../lib/schedule-data";

/**
 * The practice's real day schedule, for picking a genuinely open slot rather
 * than a blind dropdown — an appointment created without seeing the day
 * risks landing on top of one that is already booked, since neither Intake's
 * own scheduling action nor Calendar's own "New Event" flow currently check
 * for overlapping times on a brand-new appointment (only editing/rescheduling
 * an existing one does, via `checkAppointmentOverlap`). This reads the same
 * `/api/appointments` data Calendar itself renders and disables any slot a
 * currently-active appointment already occupies, so a blank spot is the only
 * kind of spot that can be chosen here.
 */

const SLOT_START_MINUTES = 8 * 60;
const SLOT_END_MINUTES = 18 * 60;
const SLOT_STEP_MINUTES = 30;

export const VISIT_TYPE_OPTIONS: readonly VisitType[] = ["60-min Intake", "45-min Therapy + Meds", "30-min Med Check"];

export function visitTypeDurationMinutes(type: VisitType): number {
  const match = /^(\d+)-min/.exec(type);
  return match ? Number(match[1]) : 30;
}

export function visitTypeDurationLabel(type: VisitType): string {
  return `${visitTypeDurationMinutes(type)} min`;
}

type DayAppointment = { time: string; duration: string; patientName: string; type: string; status: string };

export default function DaySlotPicker({
  date,
  onDateChange,
  visitType,
  onVisitTypeChange,
  selectedTime,
  onSelectTime,
  busy,
}: {
  date: string;
  onDateChange: (date: string) => void;
  visitType: VisitType;
  onVisitTypeChange: (type: VisitType) => void;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
  busy?: boolean;
}) {
  const [dayAppointments, setDayAppointments] = useState<DayAppointment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDayAppointments(null);
    setLoadError(null);
    api.appointments.list({ date })
      .then((rows) => {
        if (cancelled) return;
        setDayAppointments(rows.map((r) => ({ time: r.time, duration: r.duration, patientName: r.patientName, type: r.type, status: r.status })));
      })
      .catch((cause) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : "Could not load the schedule for this day.");
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const durationMinutes = visitTypeDurationMinutes(visitType);

  const slots = useMemo(() => {
    const result: Array<{ minutes: number; label: string; occupiedBy: string | null }> = [];
    for (let m = SLOT_START_MINUTES; m < SLOT_END_MINUTES; m += SLOT_STEP_MINUTES) {
      const slotEnd = m + durationMinutes;
      const occupant = (dayAppointments ?? []).find((apt) => {
        if (apt.status === "cancelled" || apt.status === "no-show") return false;
        const aptStart = timeStringToMinutes(apt.time);
        const aptEnd = aptStart + durationStringToMinutes(apt.duration);
        return m < aptEnd && slotEnd > aptStart;
      });
      result.push({
        minutes: m,
        label: minutesToTimeString(m),
        occupiedBy: occupant ? `${occupant.patientName} · ${occupant.type}` : null,
      });
    }
    return result;
  }, [dayAppointments, durationMinutes]);

  return (
    <div className="intake-day-slot-picker">
      <div className="intake-new-modal-row">
        <div className="iqd-field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} disabled={busy} />
        </div>
        <div className="iqd-field">
          <label>Visit type</label>
          <select value={visitType} onChange={(e) => onVisitTypeChange(e.target.value as VisitType)} disabled={busy}>
            {VISIT_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {loadError ? <div className="intake-new-modal-error" role="alert">{loadError}</div> : null}

      <p className="iqd-step-detail">The practice's real schedule for this day — booked slots are blocked.</p>

      <div className="intake-day-slot-list" aria-label={`Schedule for ${date}`}>
        {dayAppointments === null && !loadError ? (
          <p className="iqd-step-detail">Loading the schedule…</p>
        ) : (
          slots.map((slot) => (
            <button
              key={slot.minutes}
              type="button"
              className={`intake-day-slot ${slot.occupiedBy ? "occupied" : selectedTime === slot.label ? "selected" : "open"}`}
              disabled={Boolean(slot.occupiedBy) || busy}
              onClick={() => onSelectTime(slot.label)}
              title={slot.occupiedBy ?? "Open"}
            >
              <span className="intake-day-slot-time">{slot.label}</span>
              <span className="intake-day-slot-status">{slot.occupiedBy ?? "Open"}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
