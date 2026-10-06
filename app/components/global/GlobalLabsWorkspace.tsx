"use client";

import { useMemo, useState, useRef } from "react";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import { practiceQueueApi, type PracticeLabQueueRow } from "../../lib/practice-queue-api";
import { api } from "../../lib/api-client";
import { WORKSPACE_TASKS_UPDATED_EVENT, dispatchWorkspaceEvent } from "../../lib/workspace-events";
import { useDismissible } from "../../lib/use-dismissible";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import { formatLabValue } from "../../lib/lab-value-presentation";

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
  hasLoadedOnce,
  onRefresh,
}: {
  rows: PracticeLabQueueRow[];
  loading: boolean;
  error: string;
  hasLoadedOnce: boolean;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<LabFilter>("unacknowledged");
  const [query, setQuery] = useState("");
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [taskModalRow, setTaskModalRow] = useState<PracticeLabQueueRow | null>(null);
  const [taskText, setTaskText] = useState("");
  const [taskDue, setTaskDue] = useState("Tomorrow");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSuccess, setTaskSuccess] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useDismissible({
    active: taskModalRow !== null,
    onDismiss: () => {
      if (!taskSubmitting) setTaskModalRow(null);
    },
    surface: modalRef,
    dismissOnOutsideClick: true,
  });

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

  /**
   * One count per filter, on the filter. The tiles above this row said the same
   * three numbers the filters select for, plus a total the "All" filter already
   * carries, so the review queue opened with a summary of itself instead of the
   * results (DASH-13). Search narrows inside the pressed filter and so is not
   * folded into these counts.
   */
  const filterCounts = useMemo(
    () => ({
      all: rows.length,
      unacknowledged: rows.filter((row) => !row.acknowledgedAt).length,
      abnormal: rows.filter(isAbnormal).length,
      critical: rows.filter((row) => interpretationClass(row.interpretation) === "critical").length,
    }),
    [rows],
  );

  // A queue that has not answered yet, or that failed, has no counts to show.
  // An empty queue that did answer is a true zero and says so.
  const countsKnown = hasLoadedOnce && !error;
  const label = (text: string, value: number) => (countsKnown ? `${text} (${value})` : text);

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

  function openFollowUpTaskModal(row: PracticeLabQueueRow) {
    setTaskModalRow(row);
    const valuePart = row.valueText ? ` (${formatLabValue(row.valueText, row.unit)})` : "";
    setTaskText(`Follow up on ${row.testName}${valuePart} - ${row.interpretation || "Review result"}`);
    setTaskDue("Tomorrow");
    setTaskSuccess("");
    setActionError("");
  }

  async function handleCreateFollowUpTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskModalRow || !taskText.trim() || taskSubmitting) return;
    setTaskSubmitting(true);
    setActionError("");
    try {
      await api.tasks.create(taskText.trim(), taskModalRow.patientId, taskDue);
      dispatchWorkspaceEvent(WORKSPACE_TASKS_UPDATED_EVENT);
      setTaskSuccess(`Follow-up task created for ${taskModalRow.patientName}.`);
      setTaskModalRow(null);
      setTimeout(() => setTaskSuccess(""), 4000);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to create follow-up task");
    } finally {
      setTaskSubmitting(false);
    }
  }

  return (
    <div className="global-labs-workspace">
      <div className="global-queue-toolbar">
        <div className="global-filter-group">
          {(["all", "unacknowledged", "abnormal", "critical"] as LabFilter[]).map((value) => (
            <Button key={value} size="sm" pressed={filter === value} onClick={() => setFilter(value)}>
              {label(
                value === "all" ? "All"
                  : value === "unacknowledged" ? "Needs review"
                  : value[0].toUpperCase() + value.slice(1),
                filterCounts[value],
              )}
            </Button>
          ))}
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, test, result, source…" aria-label="Search practice lab queue" />
        <Button className="global-refresh-btn" icon="refresh" loading={loading} loadingLabel="Refreshing…" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {actionError ? <InlineError message={actionError} /> : null}
      {taskSuccess && (
        <div
          className="global-queue-success"
          style={{
            padding: "8px 12px",
            background: "var(--success-bg, #e8f5e9)",
            color: "var(--success-text, #2e7d32)",
            borderRadius: 4,
            marginBottom: 12,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="check_circle" size="sm" />
          <span>{taskSuccess}</span>
        </div>
      )}

      <div className="global-lab-list">
        <AsyncSection
          loading={loading}
          error={error || null}
          isEmpty={filtered.length === 0}
          hasLoadedOnce={hasLoadedOnce}
          loadingMessage="Loading authoritative lab results…"
          emptyMessage={
            rows.length === 0
              ? "No lab results are in the practice queue."
              : "No lab results match these filters."
          }
          onRetry={onRefresh}
        >
          {filtered.map((row) => {
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
                    <span className="global-result-value">{formatLabValue(row.valueText, row.unit)}</span>
                    <span className="global-inbox-meta">
                      {row.referenceRange ? `Ref: ${row.referenceRange} · ` : ""}
                      {row.sourceSystem || "EHR"}{row.acknowledgedAt ? ` · Reviewed by ${row.acknowledgedBy || "clinician"}` : " · Awaiting acknowledgement"}
                    </span>
                  </span>
                  <span className="global-row-arrow">→</span>
                </button>
                <div className="global-lab-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <Button
                    className="global-task-btn"
                    variant="secondary"
                    size="sm"
                    onClick={() => openFollowUpTaskModal(row)}
                    title="Create follow-up clinical task for this result"
                  >
                    + Task
                  </Button>
                  {!row.acknowledgedAt ? (
                    <Button
                      className="global-ack-btn"
                      variant="primary"
                      size="sm"
                      loading={acknowledgingId === row.observationId}
                      loadingLabel="Saving…"
                      onClick={() => void acknowledge(row)}
                    >
                      Acknowledge
                    </Button>
                  ) : (
                    <span className="global-ack-complete"><Icon name="check" /> Reviewed</span>
                  )}
                </div>
              </article>
            );
          })}
        </AsyncSection>
      </div>

      {taskModalRow && (
        <div className="modal-backdrop" role="presentation">
          <div
            ref={modalRef}
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-task-dialog-title"
            style={{ maxWidth: 520 }}
          >
            <div className="modal-header">
              <h2 id="lab-task-dialog-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                Create Follow-up Task
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close dialog"
                onClick={() => setTaskModalRow(null)}
                disabled={taskSubmitting}
              >
                ×
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateFollowUpTask(e)}>
              <div style={{ background: "var(--neutral-50, #f8f9fa)", padding: "10px 12px", borderRadius: 4, marginBottom: 16, fontSize: 13 }}>
                <div><strong>Patient:</strong> {taskModalRow.patientName} ({taskModalRow.patientMrn})</div>
                <div><strong>Test:</strong> {taskModalRow.testName} — {formatLabValue(taskModalRow.valueText, taskModalRow.unit) || "No value"} ({taskModalRow.interpretation || "normal"})</div>
              </div>

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label htmlFor="lab-task-text" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Task Description
                </label>
                <input
                  id="lab-task-text"
                  type="text"
                  required
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)" }}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <label htmlFor="lab-task-due" style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  Due Date
                </label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {["Today", "Tomorrow", "In 1 week", "In 2 weeks", "In 1 month"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`comm-filter-chip ${taskDue === opt ? "active" : ""}`}
                      onClick={() => setTaskDue(opt)}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        borderRadius: 4,
                        border: "1px solid var(--border-color, #ccc)",
                        background: taskDue === opt ? "var(--primary-color, #0284c7)" : "#fff",
                        color: taskDue === opt ? "#fff" : "inherit",
                        cursor: "pointer",
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  id="lab-task-due"
                  type="text"
                  value={taskDue}
                  onChange={(e) => setTaskDue(e.target.value)}
                  placeholder="e.g. Tomorrow, In 2 weeks, 2026-10-15"
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)", fontSize: 13 }}
                />
              </div>

              <div className="modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                {taskSubmitting ? (
                  <Button
                    className="modal-cancel-btn"
                    onClick={() => setTaskModalRow(null)}
                    disabled
                    disabledReason="Task is being created."
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    className="modal-cancel-btn"
                    onClick={() => setTaskModalRow(null)}
                  >
                    Cancel
                  </Button>
                )}
                {!taskText.trim() ? (
                  <Button
                    variant="primary"
                    type="submit"
                    disabled
                    disabledReason="Task description is required."
                  >
                    Create Task
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    type="submit"
                    loading={taskSubmitting}
                    loadingLabel="Creating…"
                  >
                    Create Task
                  </Button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
