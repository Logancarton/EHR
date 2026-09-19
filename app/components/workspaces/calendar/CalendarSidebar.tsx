"use client";

import type { ScheduleItem } from "../../../lib/schedule-data";
import Icon from "../../ui/Icon";
import type { CalendarNavigation } from "./calendar-navigation";
import type { CalendarFilters } from "./calendar-filters";

interface CalendarSidebarProps {
  collapsed: boolean;
  nav: CalendarNavigation;
  filters: CalendarFilters;
  appointmentsByDate: ReadonlyMap<string, readonly ScheduleItem[]>;
}

/** Quiet reference rail for the mini calendar and patient/category filtering. */
export default function CalendarSidebar({
  collapsed,
  nav,
  filters,
  appointmentsByDate,
}: CalendarSidebarProps) {
  const { miniCalMonth, setMiniCalMonth, miniGridCells, currentDate, setCurrentDate, todayStr } = nav;
  const {
    searchQuery,
    setSearchQuery,
    showInPerson,
    setShowInPerson,
    showTelehealth,
    setShowTelehealth,
    showWaiting,
    setShowWaiting,
    showMeetings,
    setShowMeetings,
    showBreaks,
    setShowBreaks,
    showCompleted,
    setShowCompleted,
  } = filters;

  return (
    <aside className={`gcal-sidebar ${collapsed ? "collapsed" : ""}`}>
      {/* Mini Month Calendar Picker */}
      <div className="gcal-mini-calendar">
        <div className="gcal-mini-cal-header">
          <span className="gcal-mini-cal-title">
            {miniCalMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <div className="gcal-mini-cal-nav">
            <button
              type="button"
              className="gcal-mini-step-btn"
              title="Previous month"
              onClick={() => {
                const prev = new Date(miniCalMonth);
                prev.setMonth(prev.getMonth() - 1);
                setMiniCalMonth(prev);
              }}
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              className="gcal-mini-step-btn"
              title="Next month"
              onClick={() => {
                const next = new Date(miniCalMonth);
                next.setMonth(next.getMonth() + 1);
                setMiniCalMonth(next);
              }}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        </div>

        <div className="gcal-mini-grid">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="gcal-mini-day-name">
              {d}
            </div>
          ))}
          {miniGridCells.map((cell) => {
            const isSelected = cell.dateStr === currentDate;
            const isToday = cell.dateStr === todayStr;
            const hasAppts = (appointmentsByDate.get(cell.dateStr) || []).length > 0;
            return (
              <div
                key={cell.dateStr}
                className={`gcal-mini-cell ${!cell.inMonth ? "other-month" : ""} ${
                  isToday ? "is-today" : ""
                } ${isSelected ? "is-selected" : ""} ${hasAppts ? "has-appts" : ""}`}
                onClick={() => {
                  setCurrentDate(cell.dateStr);
                }}
              >
                {cell.dayNum}
              </div>
            );
          })}
        </div>
      </div>

      {/* Search Patients Filter */}
      <div className="gcal-sidebar-section">
        <span className="gcal-sidebar-section-title">Filter by Patient</span>
        <div className="gcal-filter-input-wrap">
          <input
            type="text"
            placeholder="Search patient name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* "My Calendars" / Category Filters */}
      <div className="gcal-sidebar-section">
        <span className="gcal-sidebar-section-title">My Calendars</span>
        <div className="gcal-category-list">
          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showInPerson}
              onChange={(e) => setShowInPerson(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showInPerson ? "var(--gcal-green)" : "transparent",
                border: showInPerson ? "none" : "2px solid #5f6368",
              }}
            >
              {showInPerson && "✓"}
            </span>
            <span>In-Person Consults</span>
          </label>

          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showTelehealth}
              onChange={(e) => setShowTelehealth(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showTelehealth ? "var(--gcal-purple)" : "transparent",
                border: showTelehealth ? "none" : "2px solid #5f6368",
              }}
            >
              {showTelehealth && "✓"}
            </span>
            <span>Telehealth Video</span>
          </label>

          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showWaiting}
              onChange={(e) => setShowWaiting(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showWaiting ? "var(--gcal-amber)" : "transparent",
                border: showWaiting ? "none" : "2px solid #5f6368",
              }}
            >
              {showWaiting && "✓"}
            </span>
            <span>In Office / Waiting</span>
          </label>

          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showMeetings}
              onChange={(e) => setShowMeetings(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showMeetings ? "#5e35b1" : "transparent",
                border: showMeetings ? "none" : "2px solid #5f6368",
              }}
            >
              {showMeetings && "✓"}
            </span>
            <span>Team Meetings</span>
          </label>

          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showBreaks}
              onChange={(e) => setShowBreaks(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showBreaks ? "#d97706" : "transparent",
                border: showBreaks ? "none" : "2px solid #5f6368",
              }}
            >
              {showBreaks && "✓"}
            </span>
            <span>Breaks & Blocks</span>
          </label>

          <label className="gcal-category-item">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              style={{ display: "none" }}
            />
            <span
              className="gcal-checkbox"
              style={{
                backgroundColor: showCompleted ? "#5f6368" : "transparent",
                border: showCompleted ? "none" : "2px solid #5f6368",
              }}
            >
              {showCompleted && "✓"}
            </span>
            <span>Completed Visits</span>
          </label>
        </div>
      </div>

    </aside>
  );
}
