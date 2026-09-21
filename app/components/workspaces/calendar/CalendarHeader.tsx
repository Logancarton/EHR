"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  CLINICAL_INTERVAL_PRESETS,
  offsetDays,
  formatTargetDateDisplay,
} from "../../../lib/schedule-data";
import type { SyncStatus } from "../../../lib/schedule-store";
import Icon from "../../ui/Icon";
import type { CalendarNavigation } from "./calendar-navigation";
import {
  type CalendarSettingsHook,
  DENSITY_CONFIG,
  HOUR_PRESETS,
  formatHourLabel,
} from "./calendar-settings";

interface CalendarHeaderProps {
  nav: CalendarNavigation;
  headerTitle: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  syncStatus: SyncStatus;
  compact?: boolean;
  onExpand?: () => void;
  onNewEvent: () => void;
  calendarSettings?: CalendarSettingsHook;
}

const SYNC_LABELS: Record<SyncStatus, string> = {
  live: "Schedule synchronized",
  syncing: "Syncing schedule",
  stale: "Schedule may be stale",
  offline: "Schedule offline",
  error: "Schedule sync failed",
};

export default function CalendarHeader({
  nav,
  headerTitle,
  sidebarCollapsed,
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  syncStatus,
  compact = false,
  onExpand,
  onNewEvent,
  calendarSettings,
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

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
  const followUpAnchorRef = useRef<HTMLDivElement | null>(null);
  const filterAnchorRef = useRef<HTMLDivElement | null>(null);
  const viewOptionsAnchorRef = useRef<HTMLDivElement | null>(null);
  const followUpInputRef = useRef<HTMLInputElement | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!followUpOpen) return;
    const frame = window.requestAnimationFrame(() => followUpInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [followUpOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const frame = window.requestAnimationFrame(() => filterInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [filterOpen]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (followUpOpen && !followUpAnchorRef.current?.contains(target)) {
        setFollowUpOpen(false);
      }
      if (filterOpen && !filterAnchorRef.current?.contains(target)) {
        setFilterOpen(false);
      }
      if (viewOptionsOpen && !viewOptionsAnchorRef.current?.contains(target)) {
        setViewOptionsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [followUpOpen, filterOpen, viewOptionsOpen]);

  const closePopoverOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    setFollowUpOpen(false);
    setFilterOpen(false);
    setViewOptionsOpen(false);
  };

  return (
    <header className={`gcal-header ${compact ? "gcal-header-compact" : ""}`.trim()}>
      <div className="gcal-header-left">
        {!compact && (
          <button
            type="button"
            className="gcal-icon-btn"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              setFilterOpen(false);
              onToggleSidebar();
            }}
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" />
          </button>
        )}

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

      <div className="gcal-header-right">
        {compact && onExpand && (
          <button
            type="button"
            className="gcal-expand-full-btn"
            onClick={onExpand}
            aria-label="Expand to full view"
            title="Open this schedule in the main Calendar workspace"
          >
            <Icon name="open_in_full" size="sm" />
            <span>Expand to full view</span>
          </button>
        )}

        {sidebarCollapsed && (
          <div className="gcal-toolbar-menu-anchor" ref={filterAnchorRef}>
            <button
              type="button"
              className={`gcal-toolbar-action gcal-toolbar-icon-action ${filterOpen ? "active" : ""}`}
              aria-label="Filter calendar"
              aria-expanded={filterOpen}
              title="Filter calendar"
              onClick={() => setFilterOpen((open) => !open)}
            >
              <Icon name="search" />
            </button>
            {filterOpen && (
              <div
                className="gcal-toolbar-popover gcal-filter-popover"
                role="dialog"
                aria-label="Filter calendar"
                onKeyDown={closePopoverOnEscape}
              >
                <label className="gcal-popover-field">
                  <span>Patient or visit</span>
                  <div className="gcal-popover-search-row">
                    <Icon name="search" />
                    <input
                      ref={filterInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(event) => onSearchChange(event.target.value)}
                      placeholder="Filter patients, visits, or reasons"
                      aria-label="Filter patients, visits, or reasons"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="gcal-search-clear"
                        onClick={() => onSearchChange("")}
                        aria-label="Clear calendar filter"
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                </label>
              </div>
            )}
          </div>
        )}

        <div className="gcal-toolbar-menu-anchor" ref={followUpAnchorRef}>
          <button
            type="button"
            className={`gcal-toolbar-action ${followUpOpen ? "active" : ""}`}
            aria-label="Follow-up"
            aria-expanded={followUpOpen}
            title="Jump to a clinical follow-up interval"
            onClick={() => setFollowUpOpen((open) => !open)}
          >
            <Icon name="event_repeat" />
            <span className="gcal-toolbar-action-label">Follow-up</span>
          </button>

          {followUpOpen && (
            <div
              className="gcal-toolbar-popover gcal-followup-popover"
              role="dialog"
              aria-label="Clinical follow-up date"
              onKeyDown={closePopoverOnEscape}
            >
              <div className="gcal-popover-heading">
                <div>
                  <strong>Follow-up date</strong>
                  <span>Jump without counting calendar weeks.</span>
                </div>
                <button
                  type="button"
                  className="gcal-icon-btn gcal-popover-close"
                  aria-label="Close follow-up"
                  onClick={() => setFollowUpOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </div>

              <div className="gcal-jump-input-form">
                <label className="gcal-popover-field gcal-days-field">
                  <span>Days later</span>
                  <div className="gcal-days-input-row">
                    <span className="gcal-jump-prefix">+</span>
                    <input
                      ref={followUpInputRef}
                      type="number"
                      min="1"
                      max="730"
                      placeholder="28"
                      className="gcal-jump-days-input"
                      value={toolbarDaysInput}
                      onChange={(event) => setToolbarDaysInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && toolbarDaysAreValid) {
                          event.preventDefault();
                          handleJumpDays(parsedToolbarDays);
                        }
                      }}
                      aria-label="Type number of days later to jump"
                    />
                    <span className="gcal-jump-suffix">days</span>
                  </div>
                </label>

                <label className="gcal-popover-field">
                  <span>Calculate from</span>
                  <select
                    className="gcal-jump-base-select"
                    value={jumpBaseDate}
                    onChange={(event) =>
                      setJumpBaseDate(event.target.value as "today" | "current")
                    }
                    aria-label="Interval reference base date"
                  >
                    <option value="today">Today</option>
                    <option value="current">Current view</option>
                  </select>
                </label>
              </div>

              {liveTypedPreview && (
                <div
                  className="gcal-jump-preview-chip"
                  title={`Target date: ${liveTypedPreview.target}`}
                >
                  <span className="preview-label">Resolves to</span>
                  <strong>{liveTypedPreview.display}</strong>
                  <span className="preview-hint">({liveTypedPreview.weeksHint})</span>
                </div>
              )}

              <button
                type="button"
                className="gcal-jump-submit-btn"
                disabled={!toolbarDaysAreValid}
                onClick={() => {
                  if (toolbarDaysAreValid) handleJumpDays(parsedToolbarDays);
                }}
                title={
                  liveTypedPreview
                    ? `Jump calendar to ${liveTypedPreview.display}`
                    : "Type any number of days and jump"
                }
              >
                Jump to Date
              </button>

              <div
                className="gcal-jump-presets"
                role="group"
                aria-label="Clinical prescription interval presets"
              >
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
                      <span className="preset-pill-weeks">
                        ({Math.round(preset.days / 7)}w)
                      </span>
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
          )}
        </div>

        <div
          className={`gcal-sync-status ${syncStatus}`}
          role="status"
          aria-label={SYNC_LABELS[syncStatus]}
          title={SYNC_LABELS[syncStatus]}
        >
          <span className="gcal-sync-dot" />
          {syncStatus !== "live" && (
            <span className="gcal-sync-status-label">{SYNC_LABELS[syncStatus]}</span>
          )}
        </div>

        <div className="gcal-view-selector" role="tablist">
          {(["day", "week", "month", "schedule"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              className={`gcal-view-tab ${viewMode === mode ? "active" : ""}`}
              onClick={() => setViewMode(mode)}
            >
              {mode === "schedule"
                ? "Schedule"
                : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {calendarSettings && (
          <div className="gcal-toolbar-menu-anchor" ref={viewOptionsAnchorRef}>
            <button
              type="button"
              className={`gcal-toolbar-action gcal-toolbar-icon-action ${viewOptionsOpen ? "active" : ""}`}
              aria-label="Calendar view options"
              aria-expanded={viewOptionsOpen}
              title="Calendar view options (density & visible hours)"
              onClick={() => setViewOptionsOpen((open) => !open)}
            >
              <Icon name="tune" />
            </button>

            {viewOptionsOpen && (
              <div
                className="gcal-toolbar-popover gcal-view-options-popover"
                role="dialog"
                aria-label="Calendar view options"
                onKeyDown={closePopoverOnEscape}
              >
                <div className="gcal-popover-heading">
                  <div>
                    <strong>View Options</strong>
                    <span>Density, scale, and visible hours</span>
                  </div>
                  <button
                    type="button"
                    className="gcal-icon-btn gcal-popover-close"
                    aria-label="Close view options"
                    onClick={() => setViewOptionsOpen(false)}
                  >
                    <Icon name="close" />
                  </button>
                </div>

                {/* Density (Lengthening and Thinning) */}
                <div className="gcal-options-section">
                  <span className="gcal-options-section-title">Row Height & Density</span>
                  <div className="gcal-options-pill-group" role="radiogroup" aria-label="Calendar row density">
                    {(["compact", "standard", "spacious"] as const).map((densityKey) => {
                      const isSelected = calendarSettings.settings.density === densityKey;
                      const config = DENSITY_CONFIG[densityKey];
                      return (
                        <button
                          key={densityKey}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`gcal-option-pill ${isSelected ? "active" : ""}`}
                          title={config.description}
                          onClick={() => calendarSettings.setDensity(densityKey)}
                        >
                          <span className="gcal-option-pill-label">{config.label}</span>
                          <span className="gcal-option-pill-hint">{config.slotHeight * 4}px/hr</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Continuous Slider for Fine-Tuning */}
                  <div className="gcal-options-slider-row">
                    <label htmlFor="gcal-height-slider" className="gcal-options-slider-label">
                      <span>Fine-tune height:</span>
                      <strong>{calendarSettings.settings.slotHeight * 4}px/hr ({calendarSettings.settings.slotHeight}px/slot)</strong>
                    </label>
                    <input
                      id="gcal-height-slider"
                      type="range"
                      min="12"
                      max="36"
                      step="2"
                      value={calendarSettings.settings.slotHeight}
                      onChange={(e) => calendarSettings.setSlotHeight(Number(e.target.value))}
                      className="gcal-options-slider"
                      aria-label="Fine-tune slot height slider"
                    />
                  </div>
                </div>

                {/* Visible Hours */}
                <div className="gcal-options-section">
                  <span className="gcal-options-section-title">Visible Hours</span>
                  <div className="gcal-options-pill-group" role="radiogroup" aria-label="Visible hours preset">
                    {(["full-day", "clinic", "work", "custom"] as const).map((presetKey) => {
                      const isSelected = calendarSettings.settings.hourPreset === presetKey;
                      const config = HOUR_PRESETS[presetKey];
                      return (
                        <button
                          key={presetKey}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          className={`gcal-option-pill ${isSelected ? "active" : ""}`}
                          title={config.description}
                          onClick={() => calendarSettings.setHourPreset(presetKey)}
                        >
                          <span className="gcal-option-pill-label">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Start & End Hour Pickers */}
                  <div className="gcal-options-hours-picker">
                    <label className="gcal-popover-field">
                      <span>Start Time</span>
                      <select
                        className="gcal-hours-select"
                        value={calendarSettings.settings.startHour}
                        onChange={(e) => {
                          const newStart = Number(e.target.value);
                          calendarSettings.setHoursRange(newStart, Math.max(newStart + 1, calendarSettings.settings.endHour));
                        }}
                        aria-label="Calendar day start hour"
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>
                            {formatHourLabel(i)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="gcal-popover-field">
                      <span>End Time</span>
                      <select
                        className="gcal-hours-select"
                        value={calendarSettings.settings.endHour}
                        onChange={(e) => {
                          const newEnd = Number(e.target.value);
                          calendarSettings.setHoursRange(Math.min(calendarSettings.settings.startHour, newEnd - 1), newEnd);
                        }}
                        aria-label="Calendar day end hour"
                      >
                        {Array.from({ length: 24 }, (_, i) => {
                          const hour = i + 1;
                          return (
                            <option key={hour} value={hour} disabled={hour <= calendarSettings.settings.startHour}>
                              {hour === 24 ? "12 AM (Midnight)" : formatHourLabel(hour)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>
                </div>

                {/* Reset button */}
                <div className="gcal-options-footer">
                  <button
                    type="button"
                    className="gcal-jump-reset-btn"
                    onClick={calendarSettings.resetSettings}
                    title="Reset to standard clinic hours and height"
                  >
                    <Icon name="replay" />
                    <span>Reset to Defaults</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="gcal-btn-schedule-quick"
          onClick={onNewEvent}
          title="New Event"
          aria-label="New Event"
        >
          <Icon name="add" />
          <span className="gcal-btn-schedule-text">New Event</span>
        </button>
      </div>
    </header>
  );
}
