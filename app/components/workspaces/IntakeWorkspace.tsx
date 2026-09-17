"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api-client";
import { ensurePatientOpen } from "../../lib/workspace-navigation";
import { refreshPatientRoster } from "../../lib/patient-roster";
import AsyncSection from "../ui/AsyncSection";
import Icon from "../ui/Icon";
import IntakeDetailPanel from "./intake/IntakeDetailPanel";
import {
  INTAKE_STAGE_LABELS,
  checklistProgress,
  daysUntil,
  intakePriorityScore,
  isStepSatisfied,
  type IntakeQueueRow,
  type IntakeReadinessStep,
  type IntakeStage,
} from "../../domain/intake";

/**
 * Clinical Bond Intake — the operational front door between a tentative hold
 * and a first completed visit.
 *
 * This is a queue and workflow controller over records that already have an
 * authoritative home (appointments, the administrative record, documents,
 * consents, forms, eligibility, payment). It never becomes a second patient
 * truth — see D-075 and ARCHITECTURE.md.
 */

const STAGE_ORDER: IntakeStage[] = [
  "needs_staff_review",
  "insurance_issue",
  "waiting_on_patient",
  "tentative",
  "ready_to_confirm",
  "confirmed_awaiting_visit",
];

type SortMode = "priority" | "appointment_date" | "waiting_duration";

function blockerStep(steps: readonly IntakeReadinessStep[]): IntakeReadinessStep | undefined {
  return steps.find((step) => step.blocking && !isStepSatisfied(step));
}

function waitingDurationLabel(updatedAt: string, now: Date): string {
  const ms = now.getTime() - Date.parse(updatedAt);
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function IntakeWorkspace() {
  const [rows, setRows] = useState<IntakeQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [stageFilter, setStageFilter] = useState<IntakeStage | "all">("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.intake.queue());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The intake queue could not be loaded.");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), [rows]);

  const stageCounts = useMemo(() => {
    const counts = new Map<IntakeStage, number>();
    for (const row of rows) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (stageFilter !== "all" && row.stage !== stageFilter) return false;
      if (!needle) return true;
      return row.patientName.toLowerCase().includes(needle);
    });
  }, [rows, stageFilter, query]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sortMode === "appointment_date") {
      copy.sort((a, b) => (a.appointmentDate + a.appointmentTime).localeCompare(b.appointmentDate + b.appointmentTime));
    } else if (sortMode === "waiting_duration") {
      copy.sort((a, b) => Date.parse(a.episode.updatedAt) - Date.parse(b.episode.updatedAt));
    } else {
      copy.sort((a, b) => intakePriorityScore(b, now) - intakePriorityScore(a, now));
    }
    return copy;
  }, [filtered, sortMode, now]);

  async function openChart(patientId: string) {
    // A chart just promoted from a prospect (or one created moments ago by
    // another session) may not be in the client's roster snapshot yet —
    // navigation reads that snapshot rather than awaiting it (see
    // `workspace-navigation.ts`), so Intake refreshes it first here rather
    // than silently failing to open a chart it just created.
    await refreshPatientRoster();
    await ensurePatientOpen(patientId);
  }

  return (
    <section className="intake-workspace" aria-label="Patient intake workspace">
      <div className="intake-queue-pane">
        <div className="intake-queue-header">
          <h1>Intake</h1>
        </div>
        <p className="intake-queue-subtitle">
          Who is in intake, where each person is, and what to do next — from a tentative hold to a confirmed first visit.
        </p>

        <div className="intake-queue-toolbar">
          <div className="intake-stage-tabs">
            <button
              type="button"
              className={`intake-stage-tab ${stageFilter === "all" ? "active" : ""}`}
              onClick={() => setStageFilter("all")}
            >
              All <span className="count">{rows.length}</span>
            </button>
            {STAGE_ORDER.map((stage) => (
              <button
                key={stage}
                type="button"
                className={`intake-stage-tab ${stageFilter === stage ? "active" : ""}`}
                onClick={() => setStageFilter(stage)}
              >
                {INTAKE_STAGE_LABELS[stage]} <span className="count">{stageCounts.get(stage) ?? 0}</span>
              </button>
            ))}
          </div>
          <select className="intake-sort-select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
            <option value="priority">Sort: Practice priority</option>
            <option value="appointment_date">Sort: Days until appointment</option>
            <option value="waiting_duration">Sort: Waiting duration</option>
          </select>
          <div className="intake-search">
            <input
              type="search"
              placeholder="Search patient name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search intake queue"
            />
          </div>
        </div>

        <AsyncSection
          loading={loading}
          error={error}
          isEmpty={sorted.length === 0}
          hasLoadedOnce={hasLoadedOnce}
          loadingMessage="Loading intake queue…"
          emptyMessage={rows.length === 0 ? "No one is currently in intake." : "No intake matches this filter."}
          onRetry={() => void load()}
        >
          <ul className="intake-card-list">
            {sorted.map((row) => {
              const rowId = row.patientId ?? row.prospectivePersonId!;
              return (
                <IntakeCard
                  key={row.episode.id}
                  row={row}
                  now={now}
                  selected={selectedId === rowId}
                  onSelect={() => setSelectedId(rowId)}
                />
              );
            })}
          </ul>
        </AsyncSection>
      </div>

      {selectedId ? (
        <IntakeDetailPanel
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
          onOpenChart={(patientId) => void openChart(patientId)}
          onPromoted={(newPatientId) => {
            setSelectedId(newPatientId);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function IntakeCard({
  row,
  now,
  selected,
  onSelect,
}: {
  row: IntakeQueueRow;
  now: Date;
  selected: boolean;
  onSelect: () => void;
}) {
  const until = daysUntil(row.appointmentDate, now);
  const progress = checklistProgress(row.steps);
  const blocker = blockerStep(row.steps);
  const urgent = until <= 1;

  return (
    <li>
      <div
        className={`iq-card ${selected ? "selected" : ""}`}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelect();
        }}
      >
        <div className="iq-card-top">
          <div className="iq-card-identity">
            <span className="iq-card-name">
              {row.patientName}
              {row.prospectivePersonId && !row.patientId ? <span className="iq-prospect-badge">Prospective</span> : null}
            </span>
            <span className="iq-card-when">
              {row.appointmentDate} at {row.appointmentTime} ·{" "}
              <span className={urgent ? "urgent" : undefined}>
                {until === 0 ? "Today" : until > 0 ? `${until}d away` : `${Math.abs(until)}d past`}
              </span>
            </span>
          </div>
          <div className="iq-progress">{progress.complete} of {progress.total} complete</div>
        </div>

        <div className="iq-chip-row">
          {row.steps.filter((s) => s.state !== "not_available").map((step) => (
            <span key={step.id} className={`iq-chip iq-chip-${step.state}`} title={step.detail}>
              <Icon
                name={step.state === "recorded" ? "check" : step.state === "review" ? "priority_high" : "circle"}
                size="sm"
                label={step.state}
              />
              {step.label}
            </span>
          ))}
        </div>

        <div className="iq-card-meta">
          <span><Icon name="badge" size="sm" label="Insurance" />{row.planAcceptance.replace("_", " ")}</span>
          {row.episode.assignedStaffName ? (
            <span><Icon name="person" size="sm" label="Assigned to" />{row.episode.assignedStaffName}</span>
          ) : (
            <span><Icon name="person_off" size="sm" label="Unassigned" />Unassigned</span>
          )}
          {row.episode.followUpAt ? (
            <span><Icon name="event" size="sm" label="Follow-up" />{new Date(row.episode.followUpAt).toLocaleString()}</span>
          ) : null}
          {row.episode.lastOutreachAt ? (
            <span><Icon name="call" size="sm" label="Last outreach" />{new Date(row.episode.lastOutreachAt).toLocaleDateString()}</span>
          ) : null}
        </div>

        <div className="iq-card-footer">
          <span className="iq-blocker">
            {blocker ? `Next: ${blocker.label} (${blocker.owner})` : "Ready — no blocking items"}
          </span>
          <span>Waiting {waitingDurationLabel(row.episode.updatedAt, now)}</span>
        </div>
      </div>
    </li>
  );
}
