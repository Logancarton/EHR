"use client";

import { useState, type ReactNode } from "react";
import {
  RECORD_GROUP_LABELS,
  RECORD_SORT_LABELS,
  RECORD_WINDOW_LABELS,
  type RecordGroup,
  type RecordGrouping,
  type RecordOrganization,
  type RecordSort,
  type RecordWindow,
} from "../../lib/record-organization";
import Icon from "./Icon";

/**
 * The row of labeled controls that organizes a long chart list: sort, group,
 * date window and (optionally) density. Plain labeled selects rather than icon
 * menus, so the current organization is readable at a glance.
 */
export function RecordOrganizerBar({
  label,
  organization,
  onChange,
  showDensity = false,
  compact = false,
}: {
  /** What is being organized, for the group's accessible name ("documents"). */
  label: string;
  organization: RecordOrganization;
  onChange: (patch: Partial<RecordOrganization>) => void;
  showDensity?: boolean;
  /** Stack the controls for a narrow pane. */
  compact?: boolean;
}) {
  return (
    <div className={`record-organizer ${compact ? "is-compact" : ""}`} role="group" aria-label={`Organize ${label}`}>
      <label>
        <span>Sort</span>
        <select value={organization.sort} onChange={(event) => onChange({ sort: event.target.value as RecordSort })}>
          {(Object.keys(RECORD_SORT_LABELS) as RecordSort[]).map((value) => (
            <option key={value} value={value}>{RECORD_SORT_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Group</span>
        <select value={organization.group} onChange={(event) => onChange({ group: event.target.value as RecordGrouping })}>
          {(Object.keys(RECORD_GROUP_LABELS) as RecordGrouping[]).map((value) => (
            <option key={value} value={value}>{RECORD_GROUP_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Dates</span>
        <select value={organization.window} onChange={(event) => onChange({ window: event.target.value as RecordWindow })}>
          {(Object.keys(RECORD_WINDOW_LABELS) as RecordWindow[]).map((value) => (
            <option key={value} value={value}>{RECORD_WINDOW_LABELS[value]}</option>
          ))}
        </select>
      </label>
      {showDensity ? (
        <div className="record-organizer-density" role="group" aria-label="Detail level">
          <button
            type="button"
            aria-pressed={organization.density === "detailed"}
            onClick={() => onChange({ density: "detailed" })}
          >
            Detailed
          </button>
          <button
            type="button"
            aria-pressed={organization.density === "compact"}
            onClick={() => onChange({ density: "compact" })}
          >
            Compact
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders organized groups. With grouping off it is just the items; with it on,
 * each group has a header with its count that collapses the group. Collapsing
 * is local to this view — it never hides a record without saying how many.
 */
export function RecordGroups<T>({
  groups,
  renderItem,
  hiddenByWindow,
  onShowAll,
  emptyMessage,
}: {
  groups: RecordGroup<T>[];
  renderItem: (item: T) => ReactNode;
  hiddenByWindow: number;
  onShowAll: () => void;
  emptyMessage: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const windowNote = hiddenByWindow > 0 ? (
    <p className="record-window-note">
      {hiddenByWindow} {hiddenByWindow === 1 ? "entry is" : "entries are"} outside this date range.{" "}
      <button type="button" onClick={onShowAll}>Show all dates</button>
    </p>
  ) : null;

  if (total === 0) {
    return (
      <>
        <div className="record-empty">{emptyMessage}</div>
        {windowNote}
      </>
    );
  }

  return (
    <>
      {groups.map((group) =>
        group.label ? (
          <section key={group.key} className="record-group" data-record-group={group.label}>
            <button
              type="button"
              className="record-group-header"
              aria-expanded={!collapsed.has(group.key)}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.key)) next.delete(group.key);
                  else next.add(group.key);
                  return next;
                })
              }
            >
              <Icon name={collapsed.has(group.key) ? "chevron_right" : "expand_more"} size="sm" />
              <span>{group.label}</span>
              <small>{group.items.length}</small>
            </button>
            {collapsed.has(group.key) ? null : <div className="record-group-items">{group.items.map(renderItem)}</div>}
          </section>
        ) : (
          group.items.map(renderItem)
        ),
      )}
      {windowNote}
    </>
  );
}
