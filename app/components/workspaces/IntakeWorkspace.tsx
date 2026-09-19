"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api-client";
import { ensurePatientOpen } from "../../lib/workspace-navigation";
import { refreshPatientRoster } from "../../lib/patient-roster";
import { practiceToday } from "../../lib/practice-calendar";
import { type VisitType } from "../../lib/schedule-data";
import { tentativeIntakeError } from "../../domain/patient-administration";
import { useWorkspaceNavigation } from "../../lib/workspace-navigation-context";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import IntakeDetailPanel from "./intake/IntakeDetailPanel";
import DaySlotPicker, { visitTypeDurationLabel } from "./intake/DaySlotPicker";
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
  "awaiting_first_visit",
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
      // Rows with no visit scheduled yet have nothing to sort by here — they
      // sink to the end of this particular ordering rather than colliding
      // arbitrarily with an empty-string date.
      copy.sort((a, b) => {
        if (!a.appointmentDate && !b.appointmentDate) return 0;
        if (!a.appointmentDate) return 1;
        if (!b.appointmentDate) return -1;
        return `${a.appointmentDate}${a.appointmentTime}`.localeCompare(`${b.appointmentDate}${b.appointmentTime}`);
      });
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
        <div className="intake-queue-intro">
          <p className="intake-queue-subtitle">From first contact to ready for care.</p>
          <span className="intake-queue-count">
            {rows.length} {rows.length === 1 ? "person" : "people"}
          </span>
        </div>

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
  const nav = useWorkspaceNavigation();
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [scheduleVisitNow, setScheduleVisitNow] = useState(false);
  const [date, setDate] = useState(() => practiceToday());
  const [time, setTime] = useState<string | null>(null);
  const [visitType, setVisitType] = useState<VisitType>("60-min Intake");
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Patient creation and appointment creation are separate audited writes
  // (D-073) — if the second write fails after the prospect was created,
  // retry reuses that same prospect instead of creating a second one.
  const [pendingProspectId, setPendingProspectId] = useState<string | null>(null);
  // Dismissing on an overlay click only feels right when the click actually
  // started there too. Without this, dragging to select text in a field (the
  // Email input is a common case) and releasing past the panel's edge lands a
  // "click" on the overlay and silently discards the whole form.
  const mouseDownOnOverlayRef = useRef(false);

  const fullName = [firstName, middleName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  const validationError = tentativeIntakeError({ name: fullName, dob, phone, email })
    || (scheduleVisitNow && !time ? "Choose an open time slot for the visit." : null);

  async function submit() {
    if (submitInFlightRef.current) return;
    if (validationError) {
      setError(validationError);
      return;
    }
    submitInFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const prospectiveId = pendingProspectId ?? (await api.prospectivePersons.create({ name: fullName, dob, mobilePhone: phone, email })).id;
      setPendingProspectId(prospectiveId);
      if (scheduleVisitNow) {
        await api.appointments.create({
          patientId: prospectiveId,
          patientName: fullName,
          date,
          time: time!,
          type: visitType,
          duration: visitTypeDurationLabel(visitType),
          status: "tentative",
          chiefComplaint: "New patient intake",
        });
      } else {
        await api.intake.action({ action: "start_standalone", prospectivePersonId: prospectiveId });
      }
      await onCreated(prospectiveId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be completed.");
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div
      className="intake-new-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-intake-modal-title"
      onMouseDown={(e) => {
        mouseDownOnOverlayRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (mouseDownOnOverlayRef.current && e.target === e.currentTarget && !submitting) onClose();
        mouseDownOnOverlayRef.current = false;
      }}
    >
      <div className={`intake-new-modal-panel ${scheduleVisitNow ? "with-calendar" : ""}`}>
        <header className="intake-new-modal-header">
          <h2 id="new-intake-modal-title">New Intake</h2>
          <Button
            variant="icon"
            size="sm"
            icon="close"
            aria-label="Close"
            {...disabledWhile(submitting)}
            onClick={onClose}
          />
        </header>

        <p className="iqd-step-detail">
          Holds a prospective record, not a clinical chart. A visit is optional here — add one now, or later once the timing is worked out.
        </p>

        {error ? <div className="intake-new-modal-error" role="alert">{error}</div> : null}

        <div className={`intake-new-modal-content-grid ${scheduleVisitNow ? "with-calendar" : ""}`}>
          <div className="intake-new-modal-form-col">
            <div className="intake-new-modal-row">
              <div className="iqd-field">
                <label>First name</label>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" autoFocus />
              </div>
              <div className="iqd-field">
                <label>Middle name</label>
                <input value={middleName} onChange={(e) => setMiddleName(e.target.value)} autoComplete="off" />
              </div>
              <div className="iqd-field">
                <label>Last name</label>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <div className="iqd-field">
              <label>Date of birth</label>
              <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} autoComplete="off" />
            </div>
            <div className="iqd-field">
              <label>Callback phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
            </div>
            <div className="iqd-field">
              <label>Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>

            <div className="iqd-field">
              <label>
                <input
                  type="checkbox"
                  checked={scheduleVisitNow}
                  onChange={(e) => {
                    setScheduleVisitNow(e.target.checked);
                    setTime(null);
                  }}
                /> Schedule a tentative visit now
              </label>
            </div>

            {!scheduleVisitNow ? (
              <p className="iqd-step-detail">No visit will be scheduled — this shows up under Awaiting First Visit until one is added.</p>
            ) : null}

            <div className="iqd-actions">
              <Button
                variant="primary"
                {...disabledWhile(submitting || Boolean(validationError), submitting ? "Saving…" : validationError || "Enter a name, birth date, phone, and email first")}
                onClick={() => void submit()}
              >
                {pendingProspectId ? "Retry" : scheduleVisitNow ? "Hold & Start Intake" : "Start Intake"}
              </Button>
              <Button variant="tertiary" {...disabledWhile(submitting)} onClick={onClose}>Cancel</Button>
            </div>
          </div>

          {scheduleVisitNow ? (
            <div className="intake-new-modal-calendar-col">
              <DaySlotPicker
                date={date}
                onDateChange={(next) => {
                  setDate(next);
                  setTime(null);
                }}
                visitType={visitType}
                onVisitTypeChange={(next) => {
                  setVisitType(next);
                  setTime(null);
                }}
                selectedTime={time}
                onSelectTime={setTime}
                busy={submitting}
                onOpenFullCalendar={() => {
                  nav.openCalendar();
                  onClose();
                }}
              />
            </div>
          ) : null}
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
  const until = row.appointmentDate ? daysUntil(row.appointmentDate, now) : undefined;
  const progress = checklistProgress(row.steps);
  const blocker = blockerStep(row.steps);
  const urgent = until !== undefined && until <= 1;

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
              {row.appointmentDate && row.appointmentTime ? (
                <>
                  {row.appointmentDate} at {row.appointmentTime} ·{" "}
                  <span className={urgent ? "urgent" : undefined}>
                    {until === 0 ? "Today" : until! > 0 ? `${until}d away` : `${Math.abs(until!)}d past`}
                  </span>
                </>
              ) : (
                <span className="iq-no-visit">No visit scheduled yet</span>
              )}
            </span>
          </div>
          <div className="iq-progress">{progress.complete} of {progress.total} complete</div>
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
