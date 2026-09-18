"use client";

import {
  CLINICAL_INTERVAL_PRESETS,
  offsetDays,
  formatTargetDateDisplay,
  parseDateString,
} from "../../../lib/schedule-data";
import type { SyncStatus } from "../../../lib/schedule-store";
import Icon from "../../ui/Icon";
import type { CalendarNavigation } from "./calendar-navigation";

interface CalendarHeaderProps {
  nav: CalendarNavigation;
  headerTitle: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  syncStatus: SyncStatus;
  onNewEvent: () => void;
  onClose?: () => void;
}

/**
 * The top toolbar plus the clinical follow-up interval jump sub-bar.
 * Playwright (calendar-interval-jump.spec.ts) protects this DOM/class
 * structure directly, so it is preserved verbatim from CalendarWorkspace.tsx.
 */
export default function CalendarHeader({
  nav,
  headerTitle,
  sidebarCollapsed,
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  syncStatus,
  onNewEvent,
  onClose,
}: CalendarHeaderProps) {
  const {
    todayStr,
    currentDate,
    setCurrentDate,
    viewMode,
    setViewMode,
    handleStep,
    toolbarDaysInput,
    setToolbarDaysInput,
    jumpBaseDate,
    setJumpBaseDate,
    parsedToolbarDays,
    toolbarDaysAreValid,
    liveTypedPreview,
    handleJumpDays,
    resetToToday,
  } = nav;

  return (
    <>
      {/* 1. TOP HEADER TOOLBAR */}
      <header className="gcal-header">
        <div className="gcal-header-left">
          <button
            type="button"
            className="gcal-icon-btn"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggleSidebar}
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" />
          </button>

          <div className="gcal-brand">
            <div className="gcal-brand-logo">
              <span className="gcal-brand-logo-top">
                {parseDateString(todayStr).toLocaleDateString("en-US", { month: "short" })}
              </span>
              <span className="gcal-brand-logo-day">
                {parseDateString(todayStr).getDate()}
              </span>
            </div>
            <span className="gcal-brand-title">Calendar</span>
          </div>

          <button
            type="button"
            className="gcal-btn-today"
            onClick={() => setCurrentDate(todayStr)}
          >
            Today
          </button>

          <div className="gcal-nav-steppers">
            <button
              type="button"
              className="gcal-icon-btn"
              title="Previous period"
              onClick={() => handleStep("prev")}
              aria-label="Previous period"
            >
              <Icon name="chevron_left" />
            </button>
            <button
              type="button"
              className="gcal-icon-btn"
              title="Next period"
              onClick={() => handleStep("next")}
              aria-label="Next period"
            >
              <Icon name="chevron_right" />
            </button>
          </div>

          <h1 className="gcal-heading-date">{headerTitle}</h1>
        </div>

        {/* Center Search Bar */}
        <div className="gcal-header-center">
          <div className="gcal-search-box">
            <Icon name="search" />
            <input
              type="text"
              placeholder="Search patients, visits, or reasons…"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="gcal-search-clear"
                onClick={() => onSearchChange("")}
                title="Clear search"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="gcal-header-right">
          <div className="gcal-sync-pill" title="Live sync active">
            <span className="gcal-sync-dot" />
            <span>{syncStatus === "live" ? "Live" : "Syncing"}</span>
          </div>

          <div className="gcal-view-selector" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "day"}
              className={`gcal-view-tab ${viewMode === "day" ? "active" : ""}`}
              onClick={() => setViewMode("day")}
            >
              Day
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "week"}
              className={`gcal-view-tab ${viewMode === "week" ? "active" : ""}`}
              onClick={() => setViewMode("week")}
            >
              Week
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "month"}
              className={`gcal-view-tab ${viewMode === "month" ? "active" : ""}`}
              onClick={() => setViewMode("month")}
            >
              Month
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === "schedule"}
              className={`gcal-view-tab ${viewMode === "schedule" ? "active" : ""}`}
              onClick={() => setViewMode("schedule")}
            >
              Schedule
            </button>
          </div>

          <button
            type="button"
            className="gcal-btn-schedule-quick"
            onClick={onNewEvent}
            title="New Event"
          >
            <Icon name="add" />
            <span className="gcal-btn-schedule-text">New Event</span>
          </button>

          {onClose && (
            <button
              type="button"
              className="gcal-btn-close"
              title="Close Calendar"
              onClick={onClose}
              aria-label="Close Calendar"
            >
              ×
            </button>
          )}
        </div>
      </header>

      {/* Follow-Up & Refill Interval Navigation Sub-Bar */}
      <div className="gcal-interval-jump-bar" role="toolbar" aria-label="Clinical prescription interval navigation">
        <div className="gcal-jump-bar-left">
          <span className="gcal-jump-bar-title" title="Type any number of days later to jump calendar without week-counting">
            <Icon name="event_repeat" />
            <span>Follow-Up Jump:</span>
          </span>

          <div className="gcal-jump-input-form">
            <span className="gcal-jump-prefix">+</span>
            <input
              type="number"
              min="1"
              max="730"
              placeholder="Type days (e.g. 28, 56, 84)..."
              className="gcal-jump-days-input"
              value={toolbarDaysInput}
              onChange={(e) => setToolbarDaysInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && toolbarDaysAreValid) {
                  e.preventDefault();
                  handleJumpDays(parsedToolbarDays);
                }
              }}
              aria-label="Type number of days later to jump"
            />
            <span className="gcal-jump-suffix">days</span>

            <select
              className="gcal-jump-base-select"
              value={jumpBaseDate}
              onChange={(e) => setJumpBaseDate(e.target.value as "today" | "current")}
              aria-label="Interval reference base date"
              title="Calculate interval from today or from current view date"
            >
              <option value="today">from Today</option>
              <option value="current">from Current View</option>
            </select>

            <button
              type="button"
              className="gcal-jump-submit-btn"
              disabled={!toolbarDaysAreValid}
              onClick={() => {
                if (toolbarDaysAreValid) {
                  handleJumpDays(parsedToolbarDays);
                }
              }}
              title={
                liveTypedPreview
                  ? `Jump calendar to ${liveTypedPreview.display}`
                  : "Type any number of days and jump"
              }
            >
              Jump to Date
            </button>
          </div>

          {liveTypedPreview && (
            <div className="gcal-jump-preview-chip" title={`Target date: ${liveTypedPreview.target}`}>
              <span className="preview-label">Resolves to:</span>
              <strong>{liveTypedPreview.display}</strong>
              <span className="preview-hint">({liveTypedPreview.weeksHint})</span>
            </div>
          )}
        </div>

        <div className="gcal-jump-bar-right">
          <div className="gcal-jump-presets" role="group" aria-label="Clinical prescription interval presets">
            <span className="presets-label">Presets:</span>
            {CLINICAL_INTERVAL_PRESETS.map((preset) => {
              const base = jumpBaseDate === "today" ? todayStr : currentDate;
              const target = offsetDays(base, preset.days);
              const isMatch = currentDate === target;
              return (
                <button
                  key={preset.days}
                  type="button"
                  className={`gcal-preset-pill ${isMatch ? "active" : ""}`}
                  title={`${preset.label} (${preset.hint}) → ${formatTargetDateDisplay(target)}`}
                  onClick={() => handleJumpDays(preset.days)}
                >
                  <span className="preset-pill-label">{preset.label}</span>
                  <span className="preset-pill-weeks">({Math.round(preset.days / 7)}w)</span>
                </button>
              );
            })}
          </div>

          {currentDate !== todayStr && (
            <button
              type="button"
              className="gcal-jump-reset-btn"
              onClick={resetToToday}
              title="Reset calendar view to today"
            >
              <Icon name="replay" />
              <span>Reset to Today</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
