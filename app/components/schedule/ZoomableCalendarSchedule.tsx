"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AppointmentStatus,
  type ScheduleItem,
  type VisitType,
  defaultPracticeDate,
  formatDateHeading,
  formatShortDate,
  stepDate,
  timeStringToMinutes,
  durationStringToMinutes,
  getWeekDates,
  get3DayDates,
  getMonthCalendarGrid,
  minutesToTimeString,
  parseDateString,
} from "../../lib/schedule-data";

export type CalendarViewType = "day" | "3day" | "week" | "month";

interface ZoomableCalendarScheduleProps {
  appointments: ScheduleItem[];
  currentDate: string;
  onDateChange: (date: string) => void;
  onStatusChange: (id: string, newStatus: AppointmentStatus) => void;
  onStartVisit: (patientId: string, patientName: string) => void;
  onOpenChart: (patientId: string, section?: string) => void;
  onBookSlot: (date: string, timeSlot: string) => void;
  initialView?: CalendarViewType;
}

const ZOOM_STORAGE_KEY = "ehr_calendar_zoom_level";
const VIEW_STORAGE_KEY = "ehr_calendar_view_mode";

// Hours from 07:00 AM to 07:00 PM (12 hours)
const CLINIC_START_HOUR = 7;
const CLINIC_END_HOUR = 19;
const CLINIC_HOURS = Array.from({ length: CLINIC_END_HOUR - CLINIC_START_HOUR + 1 }, (_, i) => {
  const hour24 = CLINIC_START_HOUR + i;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  return {
    hour24,
    minutes: hour24 * 60,
    label: `${hour12}:00 ${period}`,
    shortLabel: `${hour12} ${period}`,
  };
});

export default function ZoomableCalendarSchedule({
  appointments,
  currentDate,
  onDateChange,
  onStatusChange,
  onStartVisit,
  onOpenChart,
  onBookSlot,
  initialView = "day",
}: ZoomableCalendarScheduleProps) {
  // Zoom level in percentage: 50% (44px/hr) to 200% (176px/hr). Default: 100% (88px/hr)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    if (typeof window === "undefined") return 100;
    const saved = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    return saved ? Number(saved) : 100;
  });

  const [calendarView, setCalendarView] = useState<CalendarViewType>(() => {
    if (typeof window === "undefined") return initialView;
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as CalendarViewType;
    return saved || initialView;
  });

  const [hoverSlot, setHoverSlot] = useState<{ date: string; time: string } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Save zoom level and view mode to localStorage
  useEffect(() => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomLevel));
  }, [zoomLevel]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, calendarView);
  }, [calendarView]);

  // Base hour height scaled by zoom percentage
  const hourHeightPx = useMemo(() => {
    return Math.round((zoomLevel / 100) * 88);
  }, [zoomLevel]);

  // Handle zoom in and zoom out
  function handleZoomIn() {
    setZoomLevel((prev) => Math.min(200, Math.round(prev + 20)));
  }

  function handleZoomOut() {
    setZoomLevel((prev) => Math.max(50, Math.round(prev - 20)));
  }

  function handleZoomReset() {
    setZoomLevel(100);
  }

  // Active columns based on current view
  const activeDates = useMemo(() => {
    if (calendarView === "day") {
      return [currentDate];
    }
    if (calendarView === "3day") {
      return get3DayDates(currentDate);
    }
    if (calendarView === "week") {
      return getWeekDates(currentDate);
    }
    return [currentDate];
  }, [calendarView, currentDate]);

  // Month grid cells if in month view
  const monthCells = useMemo(() => {
    if (calendarView !== "month") return [];
    return getMonthCalendarGrid(currentDate);
  }, [calendarView, currentDate]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const apt of appointments) {
      const list = map.get(apt.date) || [];
      list.push(apt);
      map.set(apt.date, list);
    }
    return map;
  }, [appointments]);

  // Format header title based on view
  const headerDateTitle = useMemo(() => {
    if (calendarView === "day") {
      return formatDateHeading(currentDate);
    }
    if (calendarView === "3day") {
      const dates = get3DayDates(currentDate);
      return `${formatShortDate(dates[0])} – ${formatShortDate(dates[2])}`;
    }
    if (calendarView === "week") {
      const dates = getWeekDates(currentDate);
      return `Week of ${formatShortDate(dates[0])} – ${formatShortDate(dates[6])}`;
    }
    if (calendarView === "month") {
      const d = parseDateString(currentDate);
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    return formatDateHeading(currentDate);
  }, [calendarView, currentDate]);

  // Step navigation (Day, 3-day, Week, Month)
  function handleStep(direction: "prev" | "next") {
    if (calendarView === "day") {
      onDateChange(stepDate(currentDate, direction));
    } else if (calendarView === "3day") {
      const d = parseDateString(currentDate);
      d.setDate(d.getDate() + (direction === "next" ? 3 : -3));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      onDateChange(`${y}-${m}-${day}`);
    } else if (calendarView === "week") {
      const d = parseDateString(currentDate);
      d.setDate(d.getDate() + (direction === "next" ? 7 : -7));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      onDateChange(`${y}-${m}-${day}`);
    } else if (calendarView === "month") {
      const d = parseDateString(currentDate);
      d.setMonth(d.getMonth() + (direction === "next" ? 1 : -1));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      onDateChange(`${y}-${m}-01`);
    }
  }

  // Simulated current time indicator: Friday Sep 4, 2026 at 10:15 AM (615 minutes from midnight)
  const simulatedCurrentMinutes = 10 * 60 + 15;
  const currentMinutesOffset = simulatedCurrentMinutes - CLINIC_START_HOUR * 60;
  const currentTimeTopPx = Math.max(0, (currentMinutesOffset / 60) * hourHeightPx);

  return (
    <div
      className="zoomable-calendar-root"
      style={
        {
          "--hour-height": `${hourHeightPx}px`,
          "--zoom-level": `${zoomLevel}%`,
        } as React.CSSProperties
      }
    >
      {/* 1. TOP CALENDAR TOOLBAR & CONTROLS */}
      <div className="zoomable-calendar-toolbar">
        {/* Left: Date Navigator */}
        <div className="calendar-nav-group">
          <button
            type="button"
            className="calendar-btn-today"
            onClick={() => onDateChange(defaultPracticeDate)}
          >
            Today
          </button>
          <div className="calendar-step-buttons">
            <button
              type="button"
              className="calendar-step-btn"
              onClick={() => handleStep("prev")}
              aria-label="Previous"
            >
              ‹
            </button>
            <button
              type="button"
              className="calendar-step-btn"
              onClick={() => handleStep("next")}
              aria-label="Next"
            >
              ›
            </button>
          </div>
          <h2 className="calendar-heading-title">{headerDateTitle}</h2>
        </div>

        {/* Center: Interactive Time Zoom Controls */}
        <div className="calendar-zoom-controller" aria-label="Schedule Time Zoom">
          <span className="zoom-label">🔍 Zoom:</span>
          <button
            type="button"
            className="zoom-btn"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 50}
            title="Zoom Out (Condense time axis)"
          >
            －
          </button>
          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="zoom-slider"
            aria-label="Time scale slider"
          />
          <button
            type="button"
            className="zoom-btn"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 200}
            title="Zoom In (Expand 15-minute detail)"
          >
            ＋
          </button>
          <button
            type="button"
            className="zoom-percentage-badge"
            onClick={handleZoomReset}
            title="Click to reset zoom to 100%"
          >
            {zoomLevel}%
          </button>
        </div>

        {/* Right: View Mode Selector */}
        <div className="calendar-view-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "day"}
            className={`calendar-view-tab ${calendarView === "day" ? "is-active" : ""}`}
            onClick={() => setCalendarView("day")}
          >
            Day
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "3day"}
            className={`calendar-view-tab ${calendarView === "3day" ? "is-active" : ""}`}
            onClick={() => setCalendarView("3day")}
          >
            3-Day
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "week"}
            className={`calendar-view-tab ${calendarView === "week" ? "is-active" : ""}`}
            onClick={() => setCalendarView("week")}
          >
            Week
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={calendarView === "month"}
            className={`calendar-view-tab ${calendarView === "month" ? "is-active" : ""}`}
            onClick={() => setCalendarView("month")}
          >
            Month
          </button>
        </div>
      </div>

      {/* 2. TIME-SCALE INFO BANNER AT HIGH/LOW ZOOM */}
      {zoomLevel >= 140 && (
        <div className="zoom-precision-banner">
          <span>✦ High Precision Mode ({zoomLevel}%):</span>
          <span>Showing 15-minute subdivisions. Click any quarter-hour slot to schedule.</span>
        </div>
      )}
      {zoomLevel <= 65 && (
        <div className="zoom-precision-banner zoom-compact">
          <span>✦ Bird&apos;s-Eye Mode ({zoomLevel}%):</span>
          <span>High-density overview fitting full practice day on screen.</span>
        </div>
      )}

      {/* 3. MONTH VIEW RENDERING */}
      {calendarView === "month" ? (
        <div className="calendar-month-grid-container">
          <div className="month-day-names-header">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>
          <div className="month-cells-grid">
            {monthCells.map((cell) => {
              const dayAppts = appointmentsByDate.get(cell.date) || [];
              return (
                <div
                  key={cell.date}
                  className={`month-cell ${cell.isCurrentMonth ? "in-month" : "out-month"} ${cell.isToday ? "is-today" : ""}`}
                  onClick={() => {
                    onDateChange(cell.date);
                    setCalendarView("day");
                  }}
                >
                  <div className="month-cell-top">
                    <span className="month-day-num">{cell.dayNumber}</span>
                    {dayAppts.length > 0 && (
                      <span className="month-appt-count">{dayAppts.length} visits</span>
                    )}
                  </div>
                  <div className="month-cell-events">
                    {dayAppts.slice(0, 3).map((apt) => (
                      <div
                        key={apt.id}
                        className={`month-event-pill status-${apt.status}`}
                        title={`${apt.time}: ${apt.patientName} (${apt.type})`}
                      >
                        <span className="time-sub">{apt.time.split(" ")[0]}</span>
                        <span className="name-sub">{apt.patientName.split(" ")[0]}</span>
                      </div>
                    ))}
                    {dayAppts.length > 3 && (
                      <span className="month-more-tag">+{dayAppts.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* 4. MULTI-COLUMN TIME-AXIS GRID (DAY / 3-DAY / WEEK) */
        <div className="calendar-scroll-viewport" ref={scrollContainerRef}>
          <div className="calendar-columns-container">
            {/* Leftmost Column: Fixed Time Axis Gutter */}
            <div className="calendar-time-gutter">
              <div className="gutter-corner-spacer" />
              <div className="time-labels-column">
                {CLINIC_HOURS.map((hour) => (
                  <div key={hour.hour24} className="time-label-slot">
                    <span className="time-primary-text">{hour.shortLabel}</span>
                    {zoomLevel >= 130 && (
                      <div className="subdivision-labels">
                        <span>:15</span>
                        <span>:30</span>
                        <span>:45</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Date Columns (1 Column for Day, 3 for 3-Day, 7 for Week) */}
            <div className={`calendar-day-columns-track count-${activeDates.length}`}>
              {activeDates.map((dateStr) => {
                const dayAppts = appointmentsByDate.get(dateStr) || [];
                const isToday = dateStr === defaultPracticeDate;
                const dateObj = parseDateString(dateStr);
                const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                const dayNum = dateObj.getDate();

                return (
                  <div key={dateStr} className={`calendar-day-column ${isToday ? "is-today" : ""}`}>
                    {/* Sticky Day Column Header */}
                    <div className="calendar-column-header">
                      <span className="col-weekday">{dayName}</span>
                      <span className={`col-daynumber ${isToday ? "badge-today" : ""}`}>
                        {dayNum}
                      </span>
                      <span className="col-count">{dayAppts.length} appointments</span>
                    </div>

                    {/* The Zoomable Timeline Track */}
                    <div
                      className="calendar-column-body"
                      style={{
                        height: `${(CLINIC_END_HOUR - CLINIC_START_HOUR + 1) * hourHeightPx}px`,
                      }}
                    >
                      {/* Horizontal Gridlines & 15-Minute Subdivisions */}
                      {CLINIC_HOURS.map((hour) => (
                        <div
                          key={hour.hour24}
                          className="hour-grid-row"
                          onClick={() => onBookSlot(dateStr, hour.label)}
                          onMouseEnter={() => setHoverSlot({ date: dateStr, time: hour.label })}
                          onMouseLeave={() => setHoverSlot(null)}
                        >
                          <div className="sub-slot slot-00" />
                          <div
                            className="sub-slot slot-15"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookSlot(dateStr, minutesToTimeString(hour.minutes + 15));
                            }}
                          />
                          <div
                            className="sub-slot slot-30"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookSlot(dateStr, minutesToTimeString(hour.minutes + 30));
                            }}
                          />
                          <div
                            className="sub-slot slot-45"
                            onClick={(e) => {
                              e.stopPropagation();
                              onBookSlot(dateStr, minutesToTimeString(hour.minutes + 45));
                            }}
                          />
                        </div>
                      ))}

                      {/* Current Time Red Beacon Line (if Today) */}
                      {isToday && (
                        <div
                          className="current-time-indicator"
                          style={{ top: `${currentTimeTopPx}px` }}
                          title="Current Time: 10:15 AM"
                        >
                          <div className="beacon-dot" />
                          <div className="beacon-line" />
                        </div>
                      )}

                      {/* Plotted Appointment Cards */}
                      {dayAppts.map((apt) => {
                        const startMinutes = timeStringToMinutes(apt.time);
                        const durationMinutes = durationStringToMinutes(apt.duration);
                        const topMinutes = startMinutes - CLINIC_START_HOUR * 60;
                        const topPx = Math.max(0, (topMinutes / 60) * hourHeightPx);
                        const cardHeightPx = Math.max(34, (durationMinutes / 60) * hourHeightPx - 3);

                        return (
                          <div
                            key={apt.id}
                            className={`zoom-appointment-card status-${apt.status} ${
                              zoomLevel >= 130 ? "is-detailed" : zoomLevel <= 70 ? "is-compact" : ""
                            }`}
                            style={{
                              top: `${topPx}px`,
                              height: `${cardHeightPx}px`,
                            }}
                          >
                            <div className="card-inner">
                              {/* Card Top Row */}
                              <div className="card-top-row">
                                <button
                                  type="button"
                                  className="patient-name-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenChart(apt.patientId);
                                  }}
                                >
                                  {apt.patientName}
                                </button>
                                <span className="time-badge">{apt.time}</span>
                                <span className={`status-pill status-${apt.status}`}>
                                  {apt.status}
                                </span>
                              </div>

                              {/* Intermediate Details (when zoom >= 80%) */}
                              {zoomLevel >= 75 && (
                                <div className="card-meta-row">
                                  <span className="type-badge">{apt.type}</span>
                                  {apt.room && <span className="room-badge">{apt.room}</span>}
                                  {apt.alert && <span className="alert-badge">⚠️</span>}
                                </div>
                              )}

                              {/* High-Precision Details (when zoom >= 130%) */}
                              {zoomLevel >= 120 && (
                                <div className="card-expanded-content">
                                  <p className="complaint-text">{apt.chiefComplaint}</p>
                                  <div className="status-selector-row">
                                    <label htmlFor={`status-sel-${apt.id}`}>Status:</label>
                                    <select
                                      id={`status-sel-${apt.id}`}
                                      value={apt.status}
                                      onChange={(e) =>
                                        onStatusChange(apt.id, e.target.value as AppointmentStatus)
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="scheduled">Scheduled</option>
                                      <option value="waiting">Waiting in lobby</option>
                                      <option value="in-visit">In visit</option>
                                      <option value="completed">Completed</option>
                                      <option value="no-show">No show</option>
                                    </select>
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons (when zoom >= 90%) */}
                              {zoomLevel >= 90 && (
                                <div className="card-actions-bar">
                                  {apt.status === "waiting" ||
                                  apt.status === "in-visit" ||
                                  apt.status === "scheduled" ? (
                                    <button
                                      type="button"
                                      className="btn-start"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStartVisit(apt.patientId, apt.patientName);
                                      }}
                                    >
                                      ▶ Start Visit
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn-view"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenChart(apt.patientId);
                                      }}
                                    >
                                      View Chart
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn-rx"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onOpenChart(apt.patientId, "Meds");
                                    }}
                                    title="Open medication cart"
                                  >
                                    Rx
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
