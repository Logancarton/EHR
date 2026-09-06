"use client";

import { useMemo, useState } from "react";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import { practiceQueueApi, type PracticeLabQueueRow } from "../../lib/practice-queue-api";

type LabFilter = "all" | "unacknowledged" | "abnormal" | "critical";

function interpretationClass(value: string | null) {
  const normalized = (value || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (["abnormal", "high", "low", "positive"].includes(normalized)) return "abnormal";
  return "normal";
}

function isAbnormal(row: PracticeLabQueueRow) {
  return interpretationClass(row.interpretation) !== "normal";
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export default function GlobalLabsWorkspace({
  rows,
  loading,
  error,
  onRefresh,
}: {
  rows: PracticeLabQueueRow[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<LabFilter>("unacknowledged");
  const [query, setQuery] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "unacknowledged" && row.acknowledgedAt) return false;
      if (filter === "abnormal" && !isAbnormal(row)) return false;
      if (filter === "critical" && interpretationClass(row.interpretation) !== "critical") return false;
      if (!normalized) return true;
      return [
        row.patientName,
        row.patientMrn,
        row.testName,
        row.valueText,
        row.referenceRange,
        row.interpretation,
        row.sourceSystem,
        row.sourceRef,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [rows, filter, query]);

  const unacknowledged = rows.filter((row) => !row.acknowledgedAt).length;
  const abnormal = rows.filter(isAbnormal).length;
  const critical = rows.filter((row) => interpretationClass(row.interpretation) === "critical").length;

  async function acknowledge(row: PracticeLabQueueRow) {
    if (row.acknowledgedAt || acknowledgingId) return;
    const confirmed = window.confirm(`Acknowledge ${row.testName} for ${row.patientName} as reviewed?`);
    if (!confirmed) return;
    setAcknowledgingId(row.observationId);
    setActionError("");
    try {
      await practiceQueueApi.acknowledgeLab({
        patientId: row.patientId,
        observationId: row.observationId,
        disposition: "reviewed",
      });
      onRefresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to acknowledge result");
    } finally {
      setAcknowledgingId(null);
    }
  }

  return (
    <div className="global-labs-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{unacknowledged}</strong><span>Unacknowledged</span></div>
        <div><strong>{abnormal}</strong><span>Abnormal</span></div>
        <div><strong>{critical}</strong><span>Critical</span></div>
        <div><strong>{rows.length}</strong><span>Total results</span></div>
      </div>

      <div className="global-queue-toolbar">
        <div className="global-filter-group">
          {(["all", "unacknowledged", "abnormal", "critical"] as LabFilter[]).map((value) => (
            <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : value === "unacknowledged" ? "Needs review" : value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, test, result, source…" aria-label="Search practice lab queue" />
        <button type="button" className="global-refresh-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {error ? <div className="global-inline-error">{error}</div> : null}
      {actionError ? <div className="global-inline-error">{actionError}</div> : null}

      <div className="global-lab-list">
        {loading ? (
          <div className="global-empty-state">Loading authoritative lab results…</div>
        ) : filtered.length === 0 ? (
          <div className="global-empty-state">No lab results match these filters.</div>
        ) : filtered.map((row) => {
          const interpretation = interpretationClass(row.interpretation);
          return (
            <article key={row.observationId} className={`global-lab-row ${row.acknowledgedAt ? "acknowledged" : "unacknowledged"} ${interpretation}`}>
              <button type="button" className="global-lab-open" onClick={() => void navigateToPatientLocation(row.patientId, "Labs")}>
                <span className="global-inbox-avatar">{row.patientInitials || "•"}</span>
                <span className="global-lab-main">
                  <span className="global-lab-row-top">
                    <strong>{row.patientName}</strong>
                    <small>{row.patientMrn}</small>
                    <span className={`global-result-flag ${interpretation}`}>{row.interpretation || "result"}</span>
                    <time>{formatDate(row.effectiveAt)}</time>
                  </span>
                  <b>{row.testName}</b>
                  <span className="global-result-value">{row.valueText}{row.unit ? ` ${row.unit}` : ""}</span>
                  <span className="global-inbox-meta">
                    {row.referenceRange ? `Ref: ${row.referenceRange} · ` : ""}
                    {row.sourceSystem || "EHR"}{row.acknowledgedAt ? ` · Reviewed by ${row.acknowledgedBy || "clinician"}` : " · Awaiting acknowledgement"}
                  </span>
                </span>
                <span className="global-row-arrow">→</span>
              </button>
              {!row.acknowledgedAt ? (
                <button type="button" className="global-ack-btn" disabled={acknowledgingId === row.observationId} onClick={() => void acknowledge(row)}>
                  {acknowledgingId === row.observationId ? "Saving…" : "✓ Acknowledge"}
                </button>
              ) : (
                <span className="global-ack-complete">✓ Reviewed</span>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
