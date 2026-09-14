"use client";

import Icon from "../ui/Icon";
import StatusBadge from "../ui/StatusBadge";
import { EmptyState } from "../ui/AsyncSection";
import type { PreviewDemoFigure, PreviewWorkItem } from "../../lib/preview/dashboard-preview-fixtures";

/**
 * The two body shapes the optional windows use.
 *
 * A work list is a view over whatever record holds the item — it is never a store of
 * its own, which is why the prototype shows the item and where it came from rather
 * than offering to resolve it here. Nothing on a dashboard should be the place a
 * clinical decision is recorded.
 */

export function PreviewWorkList({
  items,
  emptyMessage,
}: {
  items: readonly PreviewWorkItem[];
  emptyMessage: string;
}) {
  if (items.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <ul className="dp-worklist">
      {items.map((item) => (
        <li key={item.id} className="dp-workitem">
          <div className="dp-workitem-main">
            <div className="dp-workitem-head">
              <StatusBadge tone={item.tone} shape="pill">
                {item.title}
              </StatusBadge>
              {item.offSchedule && (
                <span className="dp-workitem-off" title="This person is not on the day being shown">
                  <Icon name="event_busy" size="sm" /> Not on this day
                </span>
              )}
            </div>
            <p className="dp-workitem-detail">{item.detail}</p>
            <p className="dp-workitem-meta">
              {item.patientName && <strong>{item.patientName}</strong>}
              {item.patientName && " · "}
              {item.meta}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Sample money.
 *
 * Every figure carries the Demo mark on the window header *and* the word "Demo" in
 * its own caption, so a cropped screenshot of a single tile still cannot be mistaken
 * for this practice's actual finances.
 */
export function PreviewDemoFigures({ figures }: { figures: readonly PreviewDemoFigure[] }) {
  return (
    <ul className="dp-figures">
      {figures.map((figure) => (
        <li key={figure.id} className="dp-figure">
          <span className="dp-figure-label">{figure.label}</span>
          <strong className="dp-figure-value">{figure.value}</strong>
          <span className="dp-figure-note">Demo · {figure.note}</span>
        </li>
      ))}
    </ul>
  );
}
