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
    if (activeTab === "all") return items;
    return items.filter((item) => TYPE_TO_TAB[item.type] === activeTab);
  }, [items, activeTab]);

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
        {filteredItems.map((item) => {
          const glyph = GLYPH_CONFIG[item.type];
          return (
            <div key={item.id} className={`queue-item queue-${item.type}`}>
              <div className="queue-item-header">
                <div className="queue-item-title-wrap">
                  <span className={`queue-type-glyph glyph-${glyph.tone}`} title={glyph.ariaLabel}>
                    <Icon name={glyph.icon} size="sm" />
                  </span>
                  <strong>{item.title}</strong>
                </div>
                <span className="queue-date">{item.date}</span>
              </div>
              <div className="queue-patient-link">
                <button
                  type="button"
                  onClick={() => onOpenChart(item.patientId, item.targetSection)}
                  title={`Open chart for ${item.patientName}`}
                >
                  <span className="patient-chip-avatar">
                    <Icon name="person" size="sm" />
                  </span>
                  <span>{item.patientName}</span>
                  {item.patientMrn ? <small className="queue-mrn">({item.patientMrn})</small> : null}
                </button>
              </div>
              <p className="queue-summary">{item.summary}</p>
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
              <div className="queue-actions">
                <Button
                  className="queue-action-btn"
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    if (item.type === "handoff" && onOpenHandoff) {
                      onOpenHandoff(item);
                    } else {
                      onOpenChart(item.patientId, item.targetSection);
                    }
                  }}
                >
                  {item.actionLabel}
                </Button>
              </div>
            </div>
          );
        })}
      </AsyncSection>
    </div>
  );
}
