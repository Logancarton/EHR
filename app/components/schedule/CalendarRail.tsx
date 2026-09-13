"use client";

import { useMemo, useState } from "react";
import {
  defaultPracticeDate,
  formatShortDate,
  getMonthCalendarGrid,
  parseDateString,
  type ScheduleItem,
} from "../../lib/schedule-data";
import Icon from "../ui/Icon";

/**
 * The month calendar that sits to the left of the day.
 *
 * It answers "what does the rest of the month look like, and where am I in it"
 * without the clinician leaving the day they are working. Each cell carries one to
 * three dots rather than a count, because the useful question while scanning a
 * month is how heavy a day is, not its exact number — which is on the cell's
 * accessible name for anyone who does want it.
 *
 * Browsing months does not move the working day — looking ahead is not the same
 * act as changing what you are working on, and conflating them is how you lose your
 * place. The working day only moves when a cell is clicked. The reverse does hold:
 * if the day is changed elsewhere, the rail follows it to that month, so the
 * selection is never off-screen.
 */

export interface CalendarRailProps {
  appointments: ScheduleItem[];
  currentDate: string;
  onDateChange: (date: string) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CalendarRail({
  appointments,
  currentDate,
  onDateChange,
  collapsed = false,
  onToggleCollapsed,
}: CalendarRailProps) {
  // The month being browsed. Browsing it does not move the working day, but the
  // working day moving does pull the rail to that month — otherwise stepping the
  // date past a month boundary leaves the rail showing a month with no selection
  // in it.
  const [monthAnchor, setMonthAnchor] = useState(currentDate);
  const [lastSeenDate, setLastSeenDate] = useState(currentDate);

  if (currentDate !== lastSeenDate) {
    setLastSeenDate(currentDate);
    if (currentDate.slice(0, 7) !== monthAnchor.slice(0, 7)) {
      setMonthAnchor(currentDate);
    }
  }

  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const apt of appointments) {
      if (apt.status === "no-show") continue;
      map.set(apt.date, (map.get(apt.date) ?? 0) + 1);
    }
    return map;
  }, [appointments]);

  const cells = useMemo(() => getMonthCalendarGrid(monthAnchor), [monthAnchor]);

  const monthLabel = useMemo(
    () =>
      parseDateString(monthAnchor).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
    [monthAnchor],
  );

  function stepMonth(direction: -1 | 1) {
    const d = parseDateString(monthAnchor);
    d.setDate(1);
    d.setMonth(d.getMonth() + direction);
    setMonthAnchor(toDateString(d));
  }

  const selectedDayAppointments = useMemo(
    () =>
      appointments
        .filter((apt) => apt.date === currentDate)
        .sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, currentDate],
  );

  if (collapsed) {
    return (
      <aside className="calendar-rail is-collapsed" aria-label="Calendar">
        <button
          type="button"
          className="calendar-rail-expand"
          onClick={onToggleCollapsed}
          title="Show the calendar"
          aria-label="Show the calendar"
        >
          <Icon name="calendar_month" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="calendar-rail" aria-label="Calendar">
      <div className="calendar-rail-head">
        <button
          type="button"
          className="rail-month-step"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          title="Previous month"
        >
          <Icon name="chevron_left" size="sm" />
        </button>
        <strong className="rail-month-label">{monthLabel}</strong>
        <button
          type="button"
          className="rail-month-step"
          onClick={() => stepMonth(1)}
          aria-label="Next month"
          title="Next month"
        >
          <Icon name="chevron_right" size="sm" />
        </button>
        {onToggleCollapsed && (
          <button
            type="button"
            className="rail-collapse-btn"
            onClick={onToggleCollapsed}
            aria-label="Hide the calendar"
            title="Hide the calendar"
          >
            <Icon name="left_panel_close" size="sm" />
          </button>
        )}
      </div>

      <div className="calendar-rail-weekdays" aria-hidden="true">
        <span>M</span>
        <span>T</span>
        <span>W</span>
        <span>T</span>
        <span>F</span>
        <span>S</span>
        <span>S</span>
      </div>

      <div className="calendar-rail-grid" role="grid" aria-label={monthLabel}>
        {cells.map((cell) => {
          const count = countsByDate.get(cell.date) ?? 0;
          // Three bands, one dot each. The exact number lives on the accessible
          // name; the dots only have to answer "light, busy, or packed".
          const loadDots = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : 3;
          const load = ["none", "light", "medium", "heavy"][loadDots];
          const isSelected = cell.date === currentDate;

          return (
            <button
              key={cell.date}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={`${formatShortDate(cell.date)}, ${count} ${count === 1 ? "appointment" : "appointments"}`}
              className={[
                "calendar-rail-day",
                cell.isCurrentMonth ? "in-month" : "out-month",
                cell.isToday ? "is-today" : "",
                isSelected ? "is-selected" : "",
                `load-${load}`,
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onDateChange(cell.date)}
            >
              <span className="rail-day-num">{cell.dayNumber}</span>
              {loadDots > 0 && (
                <span className="rail-day-load" aria-hidden="true">
                  {Array.from({ length: loadDots }, (_, index) => (
                    <i key={index} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="calendar-rail-footer">
        <button
          type="button"
          className="rail-today-btn"
          onClick={() => {
            setMonthAnchor(defaultPracticeDate);
            onDateChange(defaultPracticeDate);
          }}
        >
          <Icon name="today" size="sm" /> Today
        </button>
        <span className="rail-day-summary">
          {selectedDayAppointments.length === 0
            ? "No visits"
            : `${selectedDayAppointments.length} ${selectedDayAppointments.length === 1 ? "visit" : "visits"}`}
        </span>
      </div>
    </aside>
  );
}
