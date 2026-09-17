"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api-client";
import { ensurePatientOpen } from "../../lib/workspace-navigation";
import { refreshPatientRoster } from "../../lib/patient-roster";
import { practiceToday, practiceMinutesNow } from "../../lib/practice-calendar";
import { minutesToTimeString, type VisitType } from "../../lib/schedule-data";
import { tentativeIntakeError } from "../../domain/patient-administration";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
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

/** `Button`'s `disabled` prop is a literal-`true` discriminated union so a
 * disabled control always carries a reason. */
function disabledWhile(condition: boolean, reason = "Saving…"): { disabled: true; disabledReason: string } | { disabled?: false } {
  return condition ? { disabled: true, disabledReason: reason } : {};
}

/** Half-hour slots across a typical clinic day, labeled the way appointment
 * times are stored/displayed elsewhere ("9:00 AM"). */
const NEW_INTAKE_TIME_OPTIONS = Array.from({ length: (18 - 8) * 2 + 1 }, (_, i) => 8 * 60 + i * 30).map((minutes) => ({
  minutes,
  label: minutesToTimeString(minutes),
}));

function defaultIntakeTimeMinutes(): number {
  const now = practiceMinutesNow();
  const rounded = Math.ceil(now / 30) * 30;
  const clamped = Math.max(NEW_INTAKE_TIME_OPTIONS[0].minutes, Math.min(NEW_INTAKE_TIME_OPTIONS[NEW_INTAKE_TIME_OPTIONS.length - 1].minutes, rounded));
  return clamped;
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
  const [showNewIntakeModal, setShowNewIntakeModal] = useState(false);

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
          <Button variant="primary" size="sm" icon="person_add" onClick={() => setShowNewIntakeModal(true)}>
            New Intake
          </Button>
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

      {showNewIntakeModal ? (
        <NewIntakeModal
          onClose={() => setShowNewIntakeModal(false)}
          onCreated={async (prospectiveId) => {
            setShowNewIntakeModal(false);
            await load();
            setSelectedId(prospectiveId);
          }}
        />
      ) : null}
    </section>
  );
}

/**
 * The front door into Intake itself: a caller with no appointment and no
 * chart yet. This creates the same prospective-person + tentative-appointment
 * pair the Calendar's "Create new patient" booking path creates (D-076) —
 * just reachable directly from the queue a staff member is already looking
 * at, rather than requiring a detour through Calendar first.
 */
function NewIntakeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (prospectiveId: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState(() => practiceToday());
  const [timeMinutes, setTimeMinutes] = useState(() => defaultIntakeTimeMinutes());
  const [visitType, setVisitType] = useState<VisitType>("60-min Intake");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Patient creation and appointment creation are separate audited writes
  // (D-073) — if the appointment fails after the prospect was created, retry
  // reuses that same prospect instead of creating a second one.
  const [pendingProspectId, setPendingProspectId] = useState<string | null>(null);

  const validationError = tentativeIntakeError({ name, dob, phone, email });

  async function submit() {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const prospectiveId = pendingProspectId ?? (await api.prospectivePersons.create({ name: name.trim(), dob, mobilePhone: phone, email })).id;
      setPendingProspectId(prospectiveId);
      await api.appointments.create({
        patientId: prospectiveId,
        patientName: name.trim(),
        date,
        time: minutesToTimeString(timeMinutes),
        type: visitType,
        status: "tentative",
        chiefComplaint: "New patient intake",
      });
      await onCreated(prospectiveId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="intake-new-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-intake-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="intake-new-modal-panel">
        <header className="intake-new-modal-header">
          <h2 id="new-intake-modal-title">New Intake</h2>
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </header>

        <p className="iqd-step-detail">
          Holds a prospective record, not a clinical chart, with a tentative appointment to carry it into intake.
        </p>

        {error ? <div className="intake-new-modal-error" role="alert">{error}</div> : null}

        <div className="iqd-field">
          <label>Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="iqd-field">
          <label>Date of birth</label>
          <input value={dob} onChange={(e) => setDob(e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
        <div className="iqd-field">
          <label>Callback phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="iqd-field">
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="intake-new-modal-row">
          <div className="iqd-field">
            <label>Appointment date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="iqd-field">
            <label>Time</label>
            <select value={timeMinutes} onChange={(e) => setTimeMinutes(Number(e.target.value))}>
              {NEW_INTAKE_TIME_OPTIONS.map((slot) => (
                <option key={slot.minutes} value={slot.minutes}>{slot.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="iqd-field">
          <label>Visit type</label>
          <select value={visitType} onChange={(e) => setVisitType(e.target.value as VisitType)}>
            <option value="60-min Intake">60-min Intake</option>
            <option value="45-min Therapy + Meds">45-min Therapy + Meds</option>
            <option value="30-min Med Check">30-min Med Check</option>
          </select>
        </div>

        <div className="iqd-actions">
          <Button
            variant="primary"
            {...disabledWhile(submitting || Boolean(validationError), submitting ? "Saving…" : validationError || "Enter a name, birth date, phone, and email first")}
            onClick={() => void submit()}
          >
            {pendingProspectId ? "Retry booking" : "Hold & Start Intake"}
          </Button>
          <Button variant="tertiary" {...disabledWhile(submitting)} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
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
