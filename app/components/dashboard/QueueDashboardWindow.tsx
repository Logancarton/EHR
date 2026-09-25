"use client";

import { useMemo, useState } from "react";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type QueueItemType = "unsigned-note" | "lab-alert" | "refill-request" | "handoff";

export type AttentionItem = {
  id: string;
  type: QueueItemType;
  title: string;
  patientId: string;
  patientName: string;
  patientMrn?: string;
  date: string;
  summary: string;
  actionLabel: string;
  targetSection: "Encounter" | "Labs" | "Medications" | "Schedule";
  appointmentId?: string;
  encounterId?: string;
  observationId?: string;
  labOrderId?: string;
  labResults?: Array<{
    observationId: string;
    testName: string;
    value: string;
    interpretation?: string;
  }>;
  requestId?: string;
  handoffId?: string;
};

export type QueueDashboardWindowProps = {
  items: readonly AttentionItem[];
  status: "loading" | "ready" | "error";
  error?: string;
  onRetry: () => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
  onOpenHandoff?: (item: AttentionItem) => void;
};

type QueueFilterTab = "all" | "unsigned" | "labs" | "refills" | "handoffs";

const DASHBOARD_FOCUS_LIMIT = 8;

function selectFocusedItems(items: readonly AttentionItem[]): AttentionItem[] {
  if (items.length <= DASHBOARD_FOCUS_LIMIT) return [...items];

  // Keep the dashboard useful instead of letting one noisy category consume it.
  // Each pass takes one item from every category, preserving each queue's own
  // ordering (recent drafts, abnormal labs first, etc.) and filling unused slots
  // from the categories that still have work.
  const priorityOrder: QueueItemType[] = [
    "lab-alert",
    "refill-request",
    "handoff",
    "unsigned-note",
  ];
  const buckets = new Map<QueueItemType, AttentionItem[]>(
    priorityOrder.map((type) => [type, items.filter((item) => item.type === type)]),
  );
  const focused: AttentionItem[] = [];
  let round = 0;

  while (focused.length < DASHBOARD_FOCUS_LIMIT) {
    let addedThisRound = false;
    for (const type of priorityOrder) {
      const candidate = buckets.get(type)?.[round];
      if (!candidate) continue;
      focused.push(candidate);
      addedThisRound = true;
      if (focused.length === DASHBOARD_FOCUS_LIMIT) break;
    }
    if (!addedThisRound) break;
    round += 1;
  }

  return focused;
}

const TYPE_TO_TAB: Record<QueueItemType, QueueFilterTab> = {
  "unsigned-note": "unsigned",
  "lab-alert": "labs",
  "refill-request": "refills",
  handoff: "handoffs",
};

const GLYPH_CONFIG: Record<
  QueueItemType,
  { icon: string; tone: string; ariaLabel: string }
> = {
  "unsigned-note": { icon: "edit_note", tone: "amber", ariaLabel: "Unsigned draft" },
  "lab-alert": { icon: "biotech", tone: "red", ariaLabel: "Lab result" },
  "refill-request": { icon: "medication", tone: "purple", ariaLabel: "Refill request" },
  handoff: { icon: "sync_alt", tone: "blue", ariaLabel: "Care handoff" },
};

export default function QueueDashboardWindow({
  items,
  status,
  error,
  onRetry,
  onOpenChart,
  onOpenHandoff,
}: QueueDashboardWindowProps) {
  const [activeTab, setActiveTab] = useState<QueueFilterTab>("all");
  const [showFullBacklog, setShowFullBacklog] = useState(false);

  const focusedItems = useMemo(() => selectFocusedItems(items), [items]);
  const visibleItems = showFullBacklog ? items : focusedItems;
  const hasHiddenBacklog = items.length > focusedItems.length;

  // Counts are the queue's real totals. They used to count only the capped
  // priority sample, so "Labs (5)" sat beside a rail badge of 11 for the same
  // practice. A category filter lists every item it counts; only the unfiltered
  // view is the priority sample, and it says so.
  const counts = useMemo(() => {
    const c = { all: items.length, unsigned: 0, labs: 0, refills: 0, handoffs: 0 };
    for (const item of items) {
      if (item.type === "unsigned-note") c.unsigned++;
      else if (item.type === "lab-alert") c.labs++;
      else if (item.type === "refill-request") c.refills++;
      else if (item.type === "handoff") c.handoffs++;
    }
    return c;
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeTab === "all") return visibleItems;
    return items.filter((item) => TYPE_TO_TAB[item.type] === activeTab);
  }, [items, visibleItems, activeTab]);

  const emptyMessage = useMemo(() => {
    if (activeTab === "unsigned") return "No unsigned encounter notes waiting for signature.";
    if (activeTab === "labs") return "No lab orders waiting to be acknowledged.";
    if (activeTab === "refills") return "No prescription refill requests pending review.";
    if (activeTab === "handoffs") return "No pending patient care handoffs.";
    return "No outstanding work in practice queues.";
  }, [activeTab]);

  return (
    <div className="action-queue-card-body">
      {/* Category Filter Tabs */}
      <div className="queue-filter-bar" role="tablist" aria-label="Filter queue items by category">
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === "all"}
          pressed={activeTab === "all"}
          onClick={() => setActiveTab("all")}
        >
          All ({counts.all})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === "unsigned"}
          pressed={activeTab === "unsigned"}
          onClick={() => setActiveTab("unsigned")}
        >
          Notes ({counts.unsigned})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === "labs"}
          pressed={activeTab === "labs"}
          onClick={() => setActiveTab("labs")}
        >
          Labs ({counts.labs})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === "refills"}
          pressed={activeTab === "refills"}
          onClick={() => setActiveTab("refills")}
        >
          Refills ({counts.refills})
        </Button>
        <Button
          size="sm"
          role="tab"
          aria-selected={activeTab === "handoffs"}
          pressed={activeTab === "handoffs"}
          onClick={() => setActiveTab("handoffs")}
        >
          Handoffs ({counts.handoffs})
        </Button>
      </div>

      {hasHiddenBacklog && activeTab === "all" ? (
        <div className="queue-focus-row" role="status">
          <span>
            {showFullBacklog ? "Full backlog" : `Priority view · ${focusedItems.length} of ${items.length} shown`}
          </span>
          <button
            type="button"
            className="queue-focus-toggle"
            onClick={() => setShowFullBacklog((current) => !current)}
          >
            {showFullBacklog ? "Show priority work" : "View full backlog"}
          </button>
        </div>
      ) : null}

      <AsyncSection
        className="action-queue-list"
        loading={status === "loading"}
        error={status === "error" ? error || "Failed to load outstanding work." : null}
        isEmpty={filteredItems.length === 0}
        hasLoadedOnce={status !== "loading"}
        loadingMessage="Reading outstanding work across practice queues…"
        emptyMessage={emptyMessage}
        onRetry={onRetry}
      >
        {/* One row per item: what it is and whose, one line of detail, then its
            date and action at the right edge. A queue reads as a list to scan,
            not a stack of cards each asking for attention with its own button. */}
        {filteredItems.map((item) => {
          const glyph = GLYPH_CONFIG[item.type];
          const runAction = () => {
            if (item.type === "handoff" && onOpenHandoff) {
              onOpenHandoff(item);
            } else {
              onOpenChart(item.patientId, item.targetSection);
            }
          };
          return (
            <div key={item.id} className={`queue-item queue-row queue-${item.type}`}>
              <span className={`queue-type-glyph glyph-${glyph.tone}`} title={glyph.ariaLabel}>
                <Icon name={glyph.icon} size="sm" />
              </span>
              <div className="queue-row-main">
                <div className="queue-row-line">
                  <strong>{item.title}</strong>
                  <span className="queue-patient-link">
                    <button
                      type="button"
                      onClick={() => onOpenChart(item.patientId, item.targetSection)}
                      title={`Open chart for ${item.patientName}`}
                    >
                      <span>{item.patientName}</span>
                      {item.patientMrn ? <small className="queue-mrn">{item.patientMrn}</small> : null}
                    </button>
                  </span>
                </div>
                <p className="queue-summary" title={item.summary}>{item.summary}</p>
                {item.type === "lab-alert" && item.labResults && item.labResults.length > 1 ? (
                  <ul className="queue-lab-results" aria-label="Results in this lab order">
                    {item.labResults.map((result) => {
                      const abnormal =
                        result.interpretation &&
                        result.interpretation.toLowerCase() !== "normal";
                      return (
                        <li key={result.observationId} className={abnormal ? "is-abnormal" : undefined}>
                          <span className="queue-lab-test">{result.testName}</span>
                          <span className="queue-lab-value">{result.value}</span>
                          {result.interpretation ? (
                            <small className="queue-lab-interpretation">{result.interpretation}</small>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
              <span className="queue-date">{item.date}</span>
              <button type="button" className="queue-row-action" onClick={runAction}>
                {item.actionLabel}
              </button>
            </div>
          );
        })}
      </AsyncSection>
    </div>
  );
}
