"use client";

import { useId, useState, type ReactNode } from "react";
import type { ReadinessAction, ReadinessGroup, ReadinessItem } from "../../domain/visit-readiness";
import Icon from "../ui/Icon";

/**
 * Visit readiness, beside the note (NOTE-READY-1, D-100).
 *
 * The margin column a Google Docs reader would expect suggestions in: what the
 * note still needs, what billing and insurance need, and which labs, medication
 * and follow-up loops are open. Every row names where its fix lives and takes the
 * clinician there — into the section, the therapy-time control, the chart tab, the
 * schedule or Billing. Nothing here is checked off by hand; a row closes when the
 * record it reads changes.
 *
 * Collapsing is a view preference only. The count stays visible so a collapsed
 * panel cannot hide open work.
 */

const STATE_ICON: Record<ReadinessItem["state"], string> = {
  open: "radio_button_unchecked",
  complete: "check_circle",
  deferred: "schedule",
  unavailable: "block",
  info: "info",
};

const STATE_LABEL: Record<ReadinessItem["state"], string> = {
  open: "Needs attention",
  complete: "Done",
  deferred: "Deferred",
  unavailable: "Not available",
  info: "For your information",
};

export type EncounterReadinessPanelProps = {
  groups: ReadinessGroup[];
  openCount: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onAction: (action: ReadinessAction, item: ReadinessItem) => void;
  onRefresh: () => void;
  refreshing: boolean;
  resolvedAt: string | null;
  isLocked: boolean;
  /** The documentation-and-coding review, rendered inside the Billing group. */
  codingReview?: ReactNode;
};

function ItemRow({
  item,
  isLocked,
  onAction,
}: {
  item: ReadinessItem;
  isLocked: boolean;
  onAction: EncounterReadinessPanelProps["onAction"];
}) {
  // A signed note cannot be edited, so its note-editing actions are withheld
  // rather than offered and then refused.
  const actionable =
    item.action &&
    !(isLocked && (item.action.kind === "focus-section" || item.action.kind === "therapy-time"));
  return (
    <li className={`readiness-item state-${item.state}`} data-readiness-item={item.id} data-readiness-state={item.state}>
      <span className="readiness-item-icon" aria-hidden="true"><Icon name={STATE_ICON[item.state]} /></span>
      <div className="readiness-item-body">
        <span className="readiness-item-label">
          <span className="visually-hidden">{STATE_LABEL[item.state]}: </span>
          {item.label}
        </span>
        {item.detail && <span className="readiness-item-detail">{item.detail}</span>}
        {actionable && item.action && (
          <button type="button" className="readiness-item-action" onClick={() => onAction(item.action!, item)}>
            {item.action.label}
          </button>
        )}
      </div>
    </li>
  );
}

function Group({
  group,
  isLocked,
  onAction,
  children,
}: {
  group: ReadinessGroup;
  isLocked: boolean;
  onAction: EncounterReadinessPanelProps["onAction"];
  children?: ReactNode;
}) {
  const [showDone, setShowDone] = useState(false);
  const headingId = useId();
  const pending = group.items.filter((item) => item.state !== "complete");
  const done = group.items.filter((item) => item.state === "complete");

  return (
    <section className="readiness-group" aria-labelledby={headingId} data-readiness-group={group.id}>
      <header className="readiness-group-head">
        <h4 id={headingId}>{group.label}</h4>
        {group.error ? (
          <span className="readiness-group-count is-error">Unavailable</span>
        ) : group.loading ? (
          <span className="readiness-group-count">Checking…</span>
        ) : (
          <span className={`readiness-group-count ${group.open > 0 ? "has-open" : ""}`}>
            {group.open > 0 ? `${group.open} open` : "Clear"}
          </span>
        )}
      </header>

      {group.error ? (
        <p className="readiness-group-error" role="status">
          Could not be checked: {group.error}. This is not the same as nothing to do.
        </p>
      ) : group.loading ? (
        <p className="readiness-group-empty" role="status">Checking the chart…</p>
      ) : pending.length === 0 && done.length === 0 && !children ? (
        <p className="readiness-group-empty">Nothing on record for this visit.</p>
      ) : null}

      {pending.length > 0 && (
        <ul className="readiness-items">
          {pending.map((item) => <ItemRow key={item.id} item={item} isLocked={isLocked} onAction={onAction} />)}
        </ul>
      )}

      {children}

      {done.length > 0 && (
        <>
          <button
            type="button"
            className="readiness-done-toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone((current) => !current)}
          >
            {showDone ? "Hide" : "Show"} {done.length} done
          </button>
          {showDone && (
            <ul className="readiness-items is-done">
              {done.map((item) => <ItemRow key={item.id} item={item} isLocked={isLocked} onAction={onAction} />)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function EncounterReadinessPanel({
  groups,
  openCount,
  collapsed,
  onToggleCollapsed,
  onAction,
  onRefresh,
  refreshing,
  resolvedAt,
  isLocked,
  codingReview,
}: EncounterReadinessPanelProps) {
  const bodyId = useId();
  const nextOpen = groups.flatMap((group) => group.items).find(
    (item) => item.state === "open" && item.action?.kind === "focus-section",
  );

  return (
    <aside
      className={`encounter-readiness ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Visit readiness"
      data-readiness-open={openCount}
    >
      <div className="readiness-head">
        <button
          type="button"
          className="readiness-collapse"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={onToggleCollapsed}
          title={collapsed ? "Show visit readiness" : "Hide visit readiness"}
        >
          <Icon name="checklist" />
          <span className="readiness-title">Visit readiness</span>
          <span className={`readiness-count ${openCount > 0 ? "has-open" : ""}`} aria-label={`${openCount} open`}>
            {openCount}
          </span>
        </button>
        {!collapsed && (
          <button
            type="button"
            className="readiness-refresh"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Re-check the chart"
            title={resolvedAt ? `Checked ${new Date(resolvedAt).toLocaleTimeString()}` : "Re-check the chart"}
          >
            <Icon name="refresh" />
          </button>
        )}
      </div>

      <div className="readiness-body" id={bodyId} hidden={collapsed}>
        {nextOpen && !isLocked && (
          <button
            type="button"
            className="readiness-next-gap"
            onClick={() => onAction(nextOpen.action!, nextOpen)}
          >
            <Icon name="arrow_downward" /> Next gap: {nextOpen.label}
          </button>
        )}
        {groups.map((group) => (
          <Group key={group.id} group={group} isLocked={isLocked} onAction={onAction}>
            {group.id === "billing" ? codingReview : null}
          </Group>
        ))}
        <p className="readiness-footnote">
          Derived from the note and the chart each time either changes. Coverage is as recorded; no payer has been asked.
        </p>
      </div>
    </aside>
  );
}
