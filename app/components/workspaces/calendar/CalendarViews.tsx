"use client";

import type { RefObject } from "react";
import {
  APPOINTMENT_STATUS_LABELS,
  formatDateHeading,
  getMonthCalendarGrid,
  minutesToTimeString,
  parseDateString,
  type ScheduleItem,
} from "../../../lib/schedule-data";
import { CALENDAR_EVENT_CARD_HEIGHT, type CalendarGridLayout } from "../../../lib/calendar-grid-layout";
import Icon from "../../ui/Icon";
import { getEventChipClass } from "./calendar-view-model";
import type { CalendarViewType } from "./calendar-types";

const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 20; // 8:00 PM
const HOURS_COUNT = CLINIC_END_HOUR - CLINIC_START_HOUR + 1;

const CLINIC_HOURS = Array.from({ length: HOURS_COUNT }, (_, i) => {
  const hour24 = CLINIC_START_HOUR + i;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  return {
    hour24,
    minutes: hour24 * 60,
    label: `${hour12} ${period}`,
  };
});

interface CalendarViewsProps {
  viewMode: CalendarViewType;
  activeDates: readonly string[];
  todayStr: string;
  currentDate: string;
  setCurrentDate: (date: string) => void;
  setViewMode: (view: CalendarViewType) => void;
  appointmentsByDate: ReadonlyMap<string, readonly ScheduleItem[]>;
  calendarGrid: CalendarGridLayout;
  currentTimeTopPx: number;
  timeGridScrollRef: RefObject<HTMLDivElement | null>;
  onSlotClick: (dateStr: string, timeSlot: string) => void;
  onSelectAppointment: (item: ScheduleItem) => void;
}

/**
 * Selects and renders the week/day/month/schedule view. Pure presentation:
 * every appointment it renders is already filtered/grouped/laid out by
 * calendar-view-model.ts (calendar-grid-layout.ts remains the geometry
 * authority) — this component fetches and persists nothing.
 */
export default function CalendarViews({
  viewMode,
  activeDates,
  todayStr,
  currentDate,
  setCurrentDate,
  setViewMode,
  appointmentsByDate,
  calendarGrid,
  currentTimeTopPx,
  timeGridScrollRef,
  onSlotClick,
  onSelectAppointment,
}: CalendarViewsProps) {
  if (viewMode === "week") {
    return (
      <div className="gcal-week-view">
        {/* Header Row with Day Names & Large Date Circles */}
        <div className="gcal-week-header-row">
          {activeDates.map((dateStr) => {
            const d = parseDateString(dateStr);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === currentDate;
            return (
              <div
                key={dateStr}
                className={`gcal-week-header-col ${isToday ? "is-today" : ""} ${
                  isSelected ? "is-selected" : ""
                }`}
                onClick={() => {
                  setCurrentDate(dateStr);
                  setViewMode("day");
                }}
              >
                <span className="gcal-week-day-name">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="gcal-week-day-num">{d.getDate()}</span>
              </div>
            );
          })}
        </div>

        {/* All-Day / Summary Row */}
        <div className="gcal-all-day-row">
          <div className="gcal-all-day-gutter">GMT-07</div>
          <div className="gcal-all-day-cols">
            {activeDates.map((dateStr) => {
              const count = (appointmentsByDate.get(dateStr) || []).length;
              return (
                <div key={dateStr} className="gcal-all-day-col">
                  {count > 0 && (
                    <span className="gcal-all-day-chip">
                      {count} {count === 1 ? "visit" : "visits"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Time Grid with Red Live Line & Event Blocks */}
        <div className="gcal-scroll-grid" ref={timeGridScrollRef}>
          {/* Left Time Gutter */}
          <div className="gcal-time-gutter">
            {CLINIC_HOURS.map((h, idx) => (
              <div
                key={h.hour24}
                className="gcal-time-label"
                style={{ top: `${calendarGrid.slotOffsets[idx * 4]}px` }}
              >
                {idx > 0 && h.label}
              </div>
            ))}
          </div>

          {/* Day Columns */}
          <div className="gcal-columns-container">
            {activeDates.map((dateStr) => {
              const isToday = dateStr === todayStr;
              const eventRows = calendarGrid.eventsByDate.get(dateStr) || [];

              return (
                <div key={dateStr} className="gcal-day-col">
                  {/* Red Current Time Marker */}
                  {isToday && (
                    <div
                      className="gcal-now-line"
                      style={{ top: `${currentTimeTopPx}px` }}
                    >
                      <div className="gcal-now-dot" />
                    </div>
                  )}

                  {/* Background Hour Slots & Interactive Quarters */}
                  {CLINIC_HOURS.slice(0, -1).map((h, hourIndex) => (
                    <div
                      key={h.hour24}
                      className="gcal-hour-slot"
                      style={{ height: `${calendarGrid.slotOffsets[(hourIndex + 1) * 4] - calendarGrid.slotOffsets[hourIndex * 4]}px` }}
                    >
                      {[0, 15, 30, 45].map((min) => {
                        const slotTime = minutesToTimeString(h.minutes + min);
                        const slotIndex = hourIndex * 4 + min / 15;
                        return (
                          <div
                            key={min}
                            className="gcal-slot-quarter"
                            style={{
                              top: `${calendarGrid.slotOffsets[slotIndex] - calendarGrid.slotOffsets[hourIndex * 4]}px`,
                              height: `${calendarGrid.slotHeights[slotIndex]}px`,
                            }}
                            title={`Click to schedule at ${slotTime}`}
                            onClick={() => onSlotClick(dateStr, slotTime)}
                          />
                        );
                      })}
                    </div>
                  ))}

                  {/* Full-width start-time rows keep every name readable. */}
                  {eventRows.map(({ item, topPx }) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`${getEventChipClass(item)} gcal-event-row`}
                      style={{
                        top: `${topPx}px`,
                        height: `${CALENDAR_EVENT_CARD_HEIGHT}px`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAppointment(item);
                      }}
                      title={`${item.time}: ${item.patientName} (${item.type}, ${item.duration}${item.status === "tentative" ? ", tentative" : ""})`}
                      aria-label={`${item.patientName}, ${item.time}, ${item.duration}, ${item.type}${item.status === "tentative" ? ", tentative" : ""}`}
                    >
                      <div className="gcal-event-header">
                        <span className="gcal-event-time">{item.time}</span>
                        {item.status === "tentative" && <span className="gcal-tentative-label">Tentative</span>}
                        {item.modality === "video" && (
                          <Icon name="videocam" size="sm" />
                        )}
                      </div>
                      <div className="gcal-event-title">{item.patientName}</div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "day") {
    return (
      <div className="gcal-day-view">
        <div className="gcal-day-header">
          <div className="gcal-day-header-circle">
            {parseDateString(currentDate).getDate()}
          </div>
          <div className="gcal-day-header-info">
            <h2>{formatDateHeading(currentDate)}</h2>
            <p>
              {(appointmentsByDate.get(currentDate) || []).length} patient visits scheduled for today
            </p>
          </div>
        </div>

        <div className="gcal-scroll-grid" ref={timeGridScrollRef}>
          <div className="gcal-time-gutter">
            {CLINIC_HOURS.map((h, idx) => (
              <div
                key={h.hour24}
                className="gcal-time-label"
                style={{ top: `${calendarGrid.slotOffsets[idx * 4]}px` }}
              >
                {idx > 0 && h.label}
              </div>
            ))}
          </div>

          <div className="gcal-columns-container">
            <div className="gcal-day-col" style={{ width: "100%" }}>
              {currentDate === todayStr && (
                <div className="gcal-now-line" style={{ top: `${currentTimeTopPx}px` }}>
                  <div className="gcal-now-dot" />
                </div>
              )}

              {CLINIC_HOURS.slice(0, -1).map((h, hourIndex) => (
                <div
                  key={h.hour24}
                  className="gcal-hour-slot"
                  style={{ height: `${calendarGrid.slotOffsets[(hourIndex + 1) * 4] - calendarGrid.slotOffsets[hourIndex * 4]}px` }}
                >
                  {[0, 15, 30, 45].map((min) => {
                    const slotTime = minutesToTimeString(h.minutes + min);
                    const slotIndex = hourIndex * 4 + min / 15;
                    return (
                      <div
                        key={min}
                        className="gcal-slot-quarter"
                        style={{
                          top: `${calendarGrid.slotOffsets[slotIndex] - calendarGrid.slotOffsets[hourIndex * 4]}px`,
                          height: `${calendarGrid.slotHeights[slotIndex]}px`,
                        }}
                        title={`Click to schedule at ${slotTime}`}
                        onClick={() => onSlotClick(currentDate, slotTime)}
                      />
                    );
                  })}
                </div>
              ))}

              {(calendarGrid.eventsByDate.get(currentDate) || []).map(({ item, topPx }) => (
                <button
                  type="button"
                  key={item.id}
                  className={`${getEventChipClass(item)} gcal-event-row`}
                  style={{
                    top: `${topPx}px`,
                    height: `${CALENDAR_EVENT_CARD_HEIGHT}px`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectAppointment(item);
                  }}
                  title={`${item.time}: ${item.patientName} (${item.type}, ${item.duration}${item.status === "tentative" ? ", tentative" : ""})`}
                  aria-label={`${item.patientName}, ${item.time}, ${item.duration}, ${item.type}${item.status === "tentative" ? ", tentative" : ""}`}
                >
                  <div className="gcal-event-header">
                    <span className="gcal-event-time">{item.time} · {item.duration}</span>
                    {item.status === "tentative" && <span className="gcal-tentative-label">Tentative</span>}
                    {item.modality === "video" && <Icon name="videocam" size="sm" />}
                  </div>
                  <div className="gcal-event-title">{item.patientName}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === "month") {
    return (
      <div className="gcal-month-view">
        <div className="gcal-month-header">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="gcal-month-header-day">
              {day}
            </div>
          ))}
        </div>

        <div className="gcal-month-grid">
          {getMonthCalendarGrid(currentDate).map((cell) => {
            const dayApts = appointmentsByDate.get(cell.date) || [];
            return (
              <div
                key={cell.date}
                className={`gcal-month-cell ${!cell.isCurrentMonth ? "not-current-month" : ""} ${
                  cell.isToday ? "is-today" : ""
                }`}
                onClick={() => {
                  setCurrentDate(cell.date);
                  setViewMode("day");
                }}
              >
                <div className="gcal-month-cell-top">
                  <span className="gcal-month-cell-num">{cell.dayNumber}</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {dayApts.slice(0, 3).map((apt) => (
                    <div
                      key={apt.id}
                      className={`gcal-month-event-pill status-${apt.status} type-${
                        apt.type.includes("Therapy") ? "therapy" : "med-check"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAppointment(apt);
                      }}
                      title={`${apt.time}: ${apt.patientName}`}
                    >
                      <span style={{ fontWeight: 700 }}>{apt.time.split(" ")[0]}</span>
                      <span>{apt.patientName}</span>
                      {apt.status === "tentative" && <span className="gcal-month-tentative-label">Tentative</span>}
                    </div>
                  ))}
                  {dayApts.length > 3 && (
                    <span className="gcal-month-more">+{dayApts.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // "schedule" / agenda view
  return (
    <div className="gcal-agenda-view">
      {Array.from(appointmentsByDate.entries())
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([dateStr, items]) => (
          <div key={dateStr} className="gcal-agenda-group">
            <div className="gcal-agenda-date-heading">
              <span>{formatDateHeading(dateStr)}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--gcal-text-secondary)" }}>
                {items.length} {items.length === 1 ? "visit" : "visits"}
              </span>
            </div>

            {items.map((apt) => (
              <div
                key={apt.id}
                className="gcal-agenda-row"
                onClick={() => onSelectAppointment(apt)}
              >
                <div className="gcal-agenda-time">
                  {apt.time}
                  <div style={{ fontSize: 11, color: "var(--gcal-text-muted)" }}>
                    {apt.duration}
                  </div>
                </div>

                <div className="gcal-agenda-patient">
                  <span className="gcal-agenda-name">{apt.patientName}</span>
                  <span className="gcal-agenda-sub">
                    {apt.type} • {apt.modality === "video" ? "Telehealth Video" : apt.room || "In-Person"}
                  </span>
                  {apt.chiefComplaint && (
                    <span style={{ fontSize: 12, color: "var(--gcal-text-muted)", fontStyle: "italic" }}>
                      &ldquo;{apt.chiefComplaint}&rdquo;
                    </span>
                  )}
                </div>

                <span
                  className={`gcal-agenda-status status-${apt.status}`}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "12px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {APPOINTMENT_STATUS_LABELS[apt.status]}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
