"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CompanionPanelHeader from "./CompanionPanelHeader";
import Icon from "../ui/Icon";
import { api } from "../../lib/api-client";
import type { HrRecord } from "../../server/repositories/hr-repository";

/**
 * HR as a companion (D-086).
 *
 * The companion answers one question — what of mine is coming due — without leaving
 * whatever the clinician was doing. It shows the viewer's **own** record only. Other
 * people's records are the workspace's job, and the server refuses them here anyway;
 * a rail panel is not where someone should be reading a colleague's coaching history
 * over their shoulder.
 *
 * Same records, same service as the HR workspace. Two presentations of one capability,
 * not two HR implementations.
 */

const CATEGORY_LABELS: Record<string, string> = {
  insurance: "Insurance",
  license: "Licensing",
  coaching: "Coaching",
  goal: "Goal",
  other: "Other",
};

function daysUntil(dueOn: string | null): number | null {
  if (!dueOn) return null;
  const due = new Date(`${dueOn}T00:00:00Z`).getTime();
  if (Number.isNaN(due)) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((due - start) / 86_400_000);
}

function deadlineTone(days: number | null): { tone: string; label: string } {
  if (days === null) return { tone: "none", label: "No deadline" };
  if (days < 0) return { tone: "overdue", label: `Overdue by ${Math.abs(days)}d` };
  if (days === 0) return { tone: "overdue", label: "Due today" };
  if (days <= 30) return { tone: "soon", label: `Due in ${days}d` };
  return { tone: "ok", label: `Due in ${days}d` };
}

export default function HrCompanionPanel({
  isExpanded,
  onExpand,
  onRedock,
  onClose,
  onUnpin,
  onOpenWorkspace,
}: {
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
  onClose: () => void;
  onUnpin: () => void;
  onOpenWorkspace?: () => void;
}) {
  const [record, setRecord] = useState<HrRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.hr.mine();
      setRecord(result.record);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your HR record.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Soonest first, undated last. The companion is a deadline view: an item with no
   * date is context, not something to act on today.
   */
  const sorted = useMemo(() => {
    const items = [...(record?.items ?? [])];
    items.sort((a, b) => {
      const left = daysUntil(a.dueOn);
      const right = daysUntil(b.dueOn);
      if (left === null && right === null) return a.title.localeCompare(b.title);
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
    return items;
  }, [record]);

  const attention = sorted.filter((item) => {
    const days = daysUntil(item.dueOn);
    return days !== null && days <= 30;
  }).length;

  return (
    <aside
      className={`companion-panel hr-companion-panel ${isExpanded ? "companion-expanded-canvas" : ""}`}
      data-companion-panel="hr"
      data-companion-presentation={isExpanded ? "expanded" : "docked"}
      aria-label="HR"
    >
      <CompanionPanelHeader
        title="HR"
        context={attention > 0 ? `${attention} coming due` : "Your record"}
        icon="badge"
        iconStyle={{ background: "#eef2ff", color: "#4338ca" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin HR"
        isExpanded={isExpanded}
        onExpand={onExpand}
        onRedock={onRedock}
      />

      <div className="hr-companion-body">
        {loading ? (
          <div className="hr-loading-state">Loading your HR record…</div>
        ) : error ? (
          <div className="practice-banner-error" role="alert">
            <Icon name="error" /> {error}
            <button type="button" className="hr-retry" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : !record || sorted.length === 0 ? (
          <div className="hr-empty-state">
            Nothing has been assigned to your HR record yet. The office manager or owner
            assigns what it holds.
          </div>
        ) : (
          <ul className="hr-item-list" data-hr-companion-items="">
            {sorted.map((item) => {
              const deadline = deadlineTone(daysUntil(item.dueOn));
              return (
                <li
                  key={item.id}
                  className="hr-item"
                  data-hr-category={item.category}
                  data-hr-deadline={deadline.tone}
                >
                  <div className="hr-item-main">
                    <strong>{item.title}</strong>
                    <p>{CATEGORY_LABELS[item.category] ?? item.category}</p>
                  </div>
                  <div className="hr-item-meta">
                    <span className="hr-item-deadline">{deadline.label}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {onOpenWorkspace && (
          <button type="button" className="comm-launch-workspace-btn" onClick={onOpenWorkspace}>
            <Icon name="fullscreen" size="sm" />
            <span>Open Full HR Workspace</span>
          </button>
        )}
      </div>
    </aside>
  );
}
