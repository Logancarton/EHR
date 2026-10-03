"use client";

import { useRef } from "react";
import { type Section, sections } from "../../domain/patient";
import Icon from "../ui/Icon";

/**
 * The chart's section tabs.
 *
 * Can render either as a Google Workspace-style vertical sidebar (default in primary
 * patient chart) with light-blue pill active indicators and icons, or as a compact
 * horizontal tab bar (e.g. in detached comparison windows).
 *
 * A tablist rather than a row of toggle buttons: the sections are alternative views
 * of one chart, which is what `aria-selected` means and what arrow-key navigation
 * between them assumes. The `active` class is kept because the workspace restores a
 * chart by reading which tab carries it.
 */
export default function SectionTabs({
  value,
  onChange,
  orientation = "horizontal",
  collapsed = false,
  onToggleCollapse,
  compact = false,
  columnsOpen,
  onToggleColumns,
  onOpenOrderCart,
  stagedOrdersCount = 0,
  onOpenPatientInformation,
  pinned,
  pinBusy,
  onTogglePin,
}: {
  value: Section;
  onChange: (section: Section) => void;
  orientation?: "horizontal" | "vertical";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  compact?: boolean;
  columnsOpen?: boolean;
  onToggleColumns?: () => void;
  onOpenOrderCart?: () => void;
  stagedOrdersCount?: number;
  onOpenPatientInformation?: () => void;
  pinned?: boolean | null;
  pinBusy?: boolean;
  onTogglePin?: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * Arrow keys move between sections (horizontal or vertical), Home/End jump to ends.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const isVertical = orientation === "vertical";
    const nextKey = isVertical ? "ArrowDown" : "ArrowRight";
    const prevKey = isVertical ? "ArrowUp" : "ArrowLeft";

    const offset =
      event.key === nextKey || event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === prevKey || event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    let nextIndex: number | null = null;

    if (offset !== 0) {
      const current = sections.indexOf(value);
      nextIndex = (current + offset + sections.length) % sections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sections.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const next = sections[nextIndex];
    onChange(next);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      ?.[nextIndex]?.focus();
  }

  if (orientation === "vertical") {
    return (
      <aside
        className={`patient-chart-sidebar section-nav-sidebar ${collapsed ? "is-collapsed" : ""}`}
        aria-label="Chart navigation"
      >
        <div className="section-nav-header">
          {!collapsed && <span className="section-nav-title">Sections</span>}
          {onToggleCollapse && (
            <button
              type="button"
              className="section-nav-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand chart navigation" : "Collapse chart navigation"}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <Icon name={collapsed ? "menu" : "menu_open"} size="sm" />
            </button>
          )}
        </div>

        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
        <div
          ref={listRef}
          className={`section-tabs section-tabs-vertical ${collapsed ? "is-collapsed" : ""}`}
          role="tablist"
          aria-label="Chart sections"
          aria-orientation="vertical"
          onKeyDown={handleKeyDown}
        >
          {sections.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              data-section={item}
              aria-label={item}
              aria-selected={value === item}
              tabIndex={value === item ? 0 : -1}
              className={`section-tab-item ${value === item ? "active" : ""}`}
              onClick={() => onChange(item)}
              title={collapsed ? item : undefined}
            >
              <span className="section-tab-label">{item}</span>
            </button>
          ))}
        </div>

        {(onOpenOrderCart || onOpenPatientInformation || onTogglePin) && (
          <div className="section-nav-tools" role="group" aria-label="Patient tools">
            <div className="section-nav-divider" />
            {!collapsed && <span className="section-nav-subtitle">Patient Tools</span>}

            {onOpenOrderCart && (
              <button
                type="button"
                className="section-tool-item tool-orders"
                onClick={onOpenOrderCart}
                title={collapsed ? `Orders (${stagedOrdersCount})` : undefined}
                aria-label={`Orders (${stagedOrdersCount})`}
              >
                <Icon name="shopping_bag" size="sm" />
                {!collapsed && <span className="section-tool-label">Orders</span>}
                <span className={`section-tool-badge ${stagedOrdersCount > 0 ? "has-count" : ""}`}>
                  {stagedOrdersCount}
                </span>
              </button>
            )}

            {onOpenPatientInformation && (
              <button
                type="button"
                className="section-tool-item tool-patient-info"
                onClick={onOpenPatientInformation}
                title={collapsed ? "Patient info" : undefined}
                aria-label="Patient info"
              >
                <Icon name="badge" size="sm" />
                {!collapsed && <span className="section-tool-label">Patient info</span>}
              </button>
            )}

            {onTogglePin && (
              <button
                type="button"
                className={`section-tool-item tool-worklist ${pinned ? "is-pinned" : ""}`}
                onClick={onTogglePin}
                disabled={pinBusy}
                title={
                  pinned
                    ? "On your care-completion worklist. Clearing it changes only your own board."
                    : "Keep this patient on your personal care-completion worklist."
                }
                aria-label={pinned ? "On worklist" : "Worklist"}
                aria-pressed={pinned === true}
              >
                <Icon name="push_pin" size="sm" />
                {!collapsed && (
                  <span className="section-tool-label">
                    {pinned ? "On worklist" : "Worklist"}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {onToggleColumns && (
          <div className="section-nav-footer">
            <button
              type="button"
              className={`section-columns-toggle ${columnsOpen ? "is-open active" : ""}`}
              aria-pressed={columnsOpen ?? false}
              onClick={onToggleColumns}
              title={
                columnsOpen
                  ? "Close the columns and return to one section"
                  : "Open the other sections side by side"
              }
            >
              <Icon name={columnsOpen ? "close_fullscreen" : "view_column"} size="sm" />
              {!collapsed && <span>{columnsOpen ? "Close columns" : "Columns"}</span>}
            </button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <div className={`section-tabs-bar ${compact ? "compact" : ""}`}>
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        ref={listRef}
        className={`section-tabs ${compact ? "compact-section-tabs" : ""}`}
        role="tablist"
        aria-label="Chart sections"
        onKeyDown={handleKeyDown}
      >
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            data-section={item}
            aria-selected={value === item}
            tabIndex={value === item ? 0 : -1}
            className={value === item ? "active" : ""}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {onToggleColumns && (
        <button
          type="button"
          className={`section-columns-toggle ${columnsOpen ? "is-open" : ""}`}
          aria-pressed={columnsOpen ?? false}
          onClick={onToggleColumns}
          title={
            columnsOpen
              ? "Close the columns and return to one section"
              : "Open the other sections side by side"
          }
        >
          <Icon name={columnsOpen ? "close_fullscreen" : "view_column"} size="sm" />
          <span>{columnsOpen ? "Close columns" : "Columns"}</span>
        </button>
      )}
    </div>
  );
}
