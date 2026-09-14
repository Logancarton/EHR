"use client";

import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

export type AttentionItem = {
  id: string;
  type: "unsigned-note" | "lab-alert";
  title: string;
  patientId: string;
  patientName: string;
  date: string;
  summary: string;
  actionLabel: string;
  targetSection: "Encounter" | "Labs";
};

export type QueueDashboardWindowProps = {
  items: readonly AttentionItem[];
  status: "loading" | "ready" | "error";
  error?: string;
  onRetry: () => void;
  onOpenChart: (patientId: string, targetSection?: string) => void;
};

export default function QueueDashboardWindow({
  items,
  status,
  error,
  onRetry,
  onOpenChart,
}: QueueDashboardWindowProps) {
  return (
    <div className="action-queue-card-body">
      <AsyncSection
        className="action-queue-list"
        loading={status === "loading"}
        error={status === "error" ? error || "Failed to load outstanding work." : null}
        isEmpty={items.length === 0}
        hasLoadedOnce={status !== "loading"}
        loadingMessage="Reading outstanding work…"
        emptyMessage="No unsigned notes and no results waiting to be acknowledged."
        onRetry={onRetry}
      >
        {items.map((item) => (
          <div key={item.id} className={`queue-item queue-${item.type}`}>
            <div className="queue-item-header">
              <strong>{item.title}</strong>
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
              </button>
            </div>
            <p className="queue-summary">{item.summary}</p>
            <div className="queue-actions">
              <Button
                className="queue-action-btn"
                size="sm"
                onClick={() => onOpenChart(item.patientId, item.targetSection)}
              >
                {item.actionLabel}
              </Button>
            </div>
          </div>
        ))}
      </AsyncSection>
    </div>
  );
}
