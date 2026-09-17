"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../../lib/api-client";
import { useAuthSession } from "../../auth/AuthSessionGate";
import { navigateToPatientLocation } from "../../../lib/workspace-navigation";
import AsyncSection, { InlineError } from "../../ui/AsyncSection";
import Button from "../../ui/Button";
import StatusBadge from "../../ui/StatusBadge";
import Icon from "../../ui/Icon";
import PatientInformationDrawer from "../../patient/PatientInformationDrawer";
import {
  GUARDIAN_SITUATIONS,
  INTAKE_DISPOSITION_REASONS,
  INTAKE_STAGE_LABELS,
  daysUntil,
  isReadyToConfirm,
  outstandingBlockers,
  type FormField,
  type GuardianSituation,
  type IdentityDocumentReviewResult,
  type IntakeDispositionReason,
  type IntakeReadinessStep,
  type IntakeStepId,
  type PayerParticipationStatus,
} from "../../../domain/intake";
import type { ProspectivePersonCandidateMatch } from "../../../domain/prospective-person";
import type { IntakeDetail } from "../../../server/services/intake-service";
import { practiceToday, practiceMinutesNow } from "../../../lib/practice-calendar";
import { minutesToTimeString, type VisitType } from "../../../lib/schedule-data";

/** These steps still open the existing full administrative editor once a
 * chart exists — see `identityAndContactAction` for the pre-chart case. */
const ADMIN_STEPS = new Set<IntakeStepId>(["identity", "contact", "insurance_details"]);

/** `Button`'s `disabled` prop is a literal-`true` discriminated union so a
 * disabled control always carries a reason; this bridges a plain runtime
 * boolean into that shape without repeating the reason at every call site. */
function disabledWhile(condition: boolean, reason = "Saving…"): { disabled: true; disabledReason: string } | { disabled?: false } {
  return condition ? { disabled: true, disabledReason: reason } : {};
}

const STEP_TONE: Record<IntakeReadinessStep["state"], "success" | "danger" | "warning" | "neutral"> = {
  recorded: "success",
  needed: "danger",
  review: "warning",
  not_available: "neutral",
};

const STEP_ICON: Record<IntakeReadinessStep["state"], string> = {
  recorded: "check_circle",
  needed: "radio_button_unchecked",
  review: "error",
  not_available: "remove_circle_outline",
};

const ELIGIBILITY_RESULTS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "needs_review", label: "Needs review" },
  { value: "failed", label: "Failed" },
  { value: "uncertain", label: "Uncertain / incomplete response" },
];

/** The subject payload every intake action carries — whichever id the
 * episode currently has. Both may be present after promotion. */
function subjectPayload(episode: IntakeDetail["episode"]) {
  return { patientId: episode.patientId, prospectivePersonId: episode.prospectivePersonId };
}

export default function IntakeDetailPanel({
  id,
  onClose,
  onChanged,
  onOpenChart,
  onPromoted,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenChart: (patientId: string) => void;
  /** Promotion changes which id this episode is reached by — the panel's
   * `id` prop is parent-controlled, so the parent must be told to select the
   * new patient id itself, or it would keep querying a prospect id that no
   * longer resolves to an active intake appointment (it was relinked). */
  onPromoted: (newPatientId: string) => void;
}) {
  const { user } = useAuthSession();
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activePanel, setActivePanel] = useState<IntakeStepId | null>(null);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [showDisposeDialog, setShowDisposeDialog] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [showScheduleVisitDialog, setShowScheduleVisitDialog] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "outreach">("note");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.intake.detail(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This intake could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Switching the selected queue row reuses this mounted panel rather than
  // remounting it, so any panel-local UI state (an open inline editor, a
  // half-typed note, the dispose dialog) must not carry over and silently
  // attach itself to a different subject.
  useEffect(() => {
    setActivePanel(null);
    setShowAdminDrawer(false);
    setShowDisposeDialog(false);
    setShowOverrideDialog(false);
    setShowScheduleVisitDialog(false);
    setNoteText("");
    setError(null);
  }, [id]);

  const refresh = useCallback(async () => {
    await load();
    onChanged();
  }, [load, onChanged]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function onStepClick(step: IntakeReadinessStep) {
    if (!detail) return;
    if (step.state === "not_available") return;
    if (ADMIN_STEPS.has(step.id) && detail.episode.patientId) {
      setShowAdminDrawer(true);
      return;
    }
    if ((step.id === "government_id" || step.id === "insurance_card") && detail.episode.patientId) {
      void navigateToPatientLocation(detail.episode.patientId, "Documents");
      return;
    }
    // Pre-chart (D-077): identity/contact/insurance details/documents all
    // open their own inline panel below the step row instead.
    setActivePanel((current) => (current === step.id ? null : step.id));
  }

  if (loading && !detail) {
    return (
      <div className="intake-detail-pane">
        <AsyncSection loading isEmpty={false} loadingMessage="Loading intake…" emptyMessage="">
          <div />
        </AsyncSection>
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="intake-detail-pane">
        <InlineError message={error} onRetry={() => void load()} />
      </div>
    );
  }

  if (!detail) return null;

  const { episode, appointment, administrative, stage, steps, notes } = detail;
  const until = appointment ? daysUntil(appointment.date) : undefined;
  const ready = isReadyToConfirm(steps);
  const blockers = outstandingBlockers(steps);
  const isMinor = steps.find((s) => s.id === "guardian")?.state !== "not_available";
  const isProspect = Boolean(episode.prospectivePersonId && !episode.patientId);
  const displayName = appointment?.patientName ?? administrative.identity.legalName;

  return (
    <div className="intake-detail-pane">
      <div className="iqd-header">
        <div className="iqd-header-top">
          {episode.patientId ? (
            <button type="button" className="iq-card-name" onClick={() => onOpenChart(episode.patientId!)} title="Open full chart">
              {displayName}
            </button>
          ) : (
            <span className="iq-card-name">{displayName}<span className="iq-prospect-badge">Prospective</span></span>
          )}
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </div>
        <StatusBadge tone={ready ? "success" : "info"}>{INTAKE_STAGE_LABELS[stage]}</StatusBadge>
        <div className="iqd-note-meta">
          {appointment ? (
            <>
              {appointment.date} at {appointment.time} · {until === 0 ? "Today" : until! > 0 ? `${until} day${until === 1 ? "" : "s"} away` : `${Math.abs(until!)} day${Math.abs(until!) === 1 ? "" : "s"} past`}
            </>
          ) : (
            "No visit scheduled yet"
          )}
        </div>
        {error ? <InlineError message={error} /> : null}
      </div>

      {episode.dispositionStatus === "archived" ? (
        <div className="iqd-section">
          <StatusBadge tone="neutral">Archived</StatusBadge>
          <p className="iqd-step-detail">
            {episode.dispositionReason?.replace(/_/g, " ")}
            {episode.dispositionNote ? ` — ${episode.dispositionNote}` : ""}
            {episode.disposedBy ? ` (by ${episode.disposedBy})` : ""}
          </p>
          <Button size="sm" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "reactivate", episodeId: episode.id, ...subjectPayload(episode) }))}>
            Reactivate
          </Button>
        </div>
      ) : null}

      {isProspect ? (
        <div className="iqd-section">
          <h3>Pre-chart identity</h3>
          <p className="iqd-step-detail">
            No clinical chart exists yet. Confirm identity and resolve any possible duplicate before creating or linking one.
          </p>
          <PromotionPanel
            prospectiveId={episode.prospectivePersonId!}
            busy={busy}
            onPromoted={(newPatientId) => onPromoted(newPatientId)}
            setBusy={setBusy}
            setError={setError}
          />
        </div>
      ) : null}

      <div className="iqd-section">
        <h3>Readiness checklist</h3>
        {steps.map((step) => (
          <div key={step.id} className="iqd-step-row-wrapper">
            <button
              type="button"
              className="iqd-step-row"
              disabled={step.state === "not_available" || busy}
              onClick={() => onStepClick(step)}
            >
              <span className="iqd-step-check">
                <Icon name={STEP_ICON[step.state]} size="sm" filled={step.state === "recorded"} label={step.state} />
              </span>
              <span className="iqd-step-body">
                <span className="iqd-step-label">
                  {step.label}
                  <StatusBadge tone={STEP_TONE[step.state]} shape="pill">
                    {step.state.replace("_", " ")}
                  </StatusBadge>
                </span>
                <span className="iqd-step-detail">{step.detail}</span>
              </span>
            </button>
            {activePanel === step.id ? (
              <div className="iqd-inline-panel">
                <StepPanel
                  step={step}
                  detail={detail}
                  busy={busy}
                  isMinor={isMinor}
                  onRun={run}
                  onClose={() => setActivePanel(null)}
                  onSaved={() => void refresh()}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="iqd-section">
        <h3>Assignment &amp; follow-up</h3>
        <div className="iqd-field">
          <label>Assigned staff</label>
          <div className="iqd-actions">
            {episode.assignedStaffName ? (
              <>
                <span>{episode.assignedStaffName}</span>
                <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "unassign", episodeId: episode.id, ...subjectPayload(episode) }))}>
                  Unassign
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                {...disabledWhile(busy)}
                onClick={() => run(() => api.intake.action({ action: "assign", episodeId: episode.id, ...subjectPayload(episode), staffId: user.userId, staffName: user.displayName }))}
              >
                Assign to me
              </Button>
            )}
          </div>
        </div>
        <div className="iqd-field">
          <label>Follow-up date/time</label>
          <input
            type="datetime-local"
            defaultValue={episode.followUpAt ? episode.followUpAt.slice(0, 16) : ""}
            onBlur={(e) => {
              const value = e.target.value ? new Date(e.target.value).toISOString() : null;
              if (value !== episode.followUpAt) void run(() => api.intake.action({ action: "set_follow_up", episodeId: episode.id, ...subjectPayload(episode), followUpAt: value }));
            }}
            disabled={busy}
          />
        </div>
        {isMinor ? (
          <div className="iqd-field">
            <label>Guardian situation</label>
            <select
              value={episode.guardianSituation}
              disabled={busy}
              onChange={(e) => void run(() => api.intake.action({ action: "set_guardian_situation", episodeId: episode.id, ...subjectPayload(episode), situation: e.target.value as GuardianSituation }))}
            >
              {GUARDIAN_SITUATIONS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="iqd-field">
          <label>Staff review</label>
          {episode.staffReviewResolvedAt ? (
            <div className="iqd-actions">
              <span>Signed off by {episode.staffReviewResolvedBy}</span>
              <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "reopen_staff_review", episodeId: episode.id, ...subjectPayload(episode) }))}>
                Reopen
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "resolve_staff_review", episodeId: episode.id, ...subjectPayload(episode) }))}>
              Sign off
            </Button>
          )}
        </div>
      </div>

      <div className="iqd-section">
        <h3>Notes &amp; outreach</h3>
        <ul className="iqd-notes-list">
          {notes.length === 0 ? <li className="iqd-note">No notes yet.</li> : null}
          {notes.map((note) => (
            <li key={note.id} className="iqd-note">
              <div className="iqd-note-meta">{note.authorName} · {new Date(note.createdAt).toLocaleString()} · {note.kind}</div>
              {note.body}
            </li>
          ))}
        </ul>
        <form
          className="iqd-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!noteText.trim()) return;
            void run(async () => {
              await api.intake.action({ action: "add_note", episodeId: episode.id, ...subjectPayload(episode), body: noteText, kind: noteKind });
              setNoteText("");
            });
          }}
        >
          <textarea
            placeholder="Add a note or log outreach…"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            disabled={busy}
          />
          <div className="iqd-actions" style={{ flexDirection: "column" }}>
            <select value={noteKind} onChange={(e) => setNoteKind(e.target.value as "note" | "outreach")} disabled={busy}>
              <option value="note">Note</option>
              <option value="outreach">Outreach</option>
            </select>
            <Button type="submit" size="sm" {...disabledWhile(busy || !noteText.trim(), busy ? "Saving…" : "Enter a note first")}>Add</Button>
          </div>
        </form>
      </div>

      <div className="iqd-section">
        <h3>Actions</h3>
        <div className="iqd-actions">
          {!appointment ? (
            <Button variant="primary" {...disabledWhile(busy)} onClick={() => setShowScheduleVisitDialog(true)}>
              Schedule visit…
            </Button>
          ) : ready ? (
            <Button
              variant="primary"
              {...disabledWhile(busy)}
              onClick={() => run(() => api.appointments.updateStatus(appointment.id, "confirmed"))}
            >
              Confirm appointment
            </Button>
          ) : (
            <Button
              variant="secondary"
              {...disabledWhile(busy)}
              onClick={() => setShowOverrideDialog(true)}
              title="Every readiness requirement is not yet complete."
            >
              Confirm anyway…
            </Button>
          )}
          <Button variant="destructive" {...disabledWhile(busy)} onClick={() => setShowDisposeDialog(true)}>
            Archive / remove
          </Button>
        </div>
        {showScheduleVisitDialog ? (
          <ScheduleVisitForm
            busy={busy}
            onCancel={() => setShowScheduleVisitDialog(false)}
            onSubmit={(scheduleInput) =>
              run(async () => {
                await api.intake.action({ action: "schedule_visit", episodeId: episode.id, ...scheduleInput });
                setShowScheduleVisitDialog(false);
              })
            }
          />
        ) : null}
        {showOverrideDialog && appointment ? (
          <OverrideConfirmForm
            blockers={blockers}
            busy={busy}
            onCancel={() => setShowOverrideDialog(false)}
            onSubmit={(reason) =>
              run(async () => {
                await api.intake.action({
                  action: "confirm_with_override",
                  episodeId: episode.id,
                  appointmentId: appointment.id,
                  reason,
                  ...subjectPayload(episode),
                });
                setShowOverrideDialog(false);
              })
            }
          />
        ) : null}
        {showDisposeDialog ? (
          <DisposeForm
            busy={busy}
            onCancel={() => setShowDisposeDialog(false)}
            onSubmit={(reason, note) =>
              run(async () => {
                await api.intake.action({ action: "dispose", episodeId: episode.id, ...subjectPayload(episode), reason, note });
                setShowDisposeDialog(false);
              })
            }
          />
        ) : null}
      </div>

      {showAdminDrawer && episode.patientId ? (
        <PatientInformationDrawer
          patientId={episode.patientId}
          patientName={administrative.identity.legalName}
          onClose={() => {
            setShowAdminDrawer(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function OverrideConfirmForm({
  blockers,
  busy,
  onCancel,
  onSubmit,
}: {
  blockers: IntakeReadinessStep[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="iqd-inline-panel">
      <p className="iqd-step-detail">
        {blockers.length === 0 ? "No blockers are outstanding right now." : `Outstanding: ${blockers.map((b) => b.label).join(", ")}.`}
      </p>
      <div className="iqd-field">
        <label>Reason for confirming anyway</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <div className="iqd-actions">
        <Button
          size="sm"
          variant="primary"
          {...disabledWhile(busy || !reason.trim(), busy ? "Saving…" : "Enter a reason first")}
          onClick={() => onSubmit(reason)}
        >
          Confirm with incomplete requirements
        </Button>
        <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PromotionPanel({
  prospectiveId,
  busy,
  setBusy,
  setError,
  onPromoted,
}: {
  prospectiveId: string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
  onPromoted: (newPatientId: string) => void;
}) {
  const [matches, setMatches] = useState<ProspectivePersonCandidateMatch[] | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkDuplicates() {
    setChecking(true);
    try {
      const res = await api.prospectivePersons.action<{ success: boolean; matches: ProspectivePersonCandidateMatch[] }>({
        action: "find_duplicates",
        prospectiveId,
      });
      setMatches(res.matches);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check for possible duplicates.");
    } finally {
      setChecking(false);
    }
  }

  async function promote(mode: "create" | "link", existingPatientId?: string) {
    setBusy(true);
    try {
      const result = await api.prospectivePersons.action<{ patient: { id: string } }>({ action: "promote", prospectiveId, mode, existingPatientId });
      onPromoted(result.patient.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="iqd-inline-panel">
      {matches === null ? (
        <Button size="sm" {...disabledWhile(busy || checking, "Checking…")} onClick={() => void checkDuplicates()}>
          Check for possible existing patients
        </Button>
      ) : (
        <>
          {matches.length === 0 ? (
            <p className="iqd-step-detail">No likely matches found.</p>
          ) : (
            <ul className="iqd-notes-list">
              {matches.map((m) => (
                <li key={m.patientId} className="iqd-note">
                  <div className="iqd-actions">
                    <span>{m.name} · DOB {m.dob} · MRN {m.mrn} ({m.matchedOn.join(" + ")} matched)</span>
                    <Button size="sm" {...disabledWhile(busy)} onClick={() => void promote("link", m.patientId)}>
                      Link to this patient
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => void promote("create")}>
            {matches.length === 0 ? "Create new patient chart" : "None of these — create a new chart"}
          </Button>
        </>
      )}
    </div>
  );
}

/** Half-hour slots across a typical clinic day, in the "9:00 AM" convention
 * appointment times are stored/displayed in elsewhere. */
const SCHEDULE_VISIT_TIME_OPTIONS = Array.from({ length: (18 - 8) * 2 + 1 }, (_, i) => 8 * 60 + i * 30).map((minutes) => ({
  minutes,
  label: minutesToTimeString(minutes),
}));

function defaultScheduleVisitTimeMinutes(): number {
  const now = practiceMinutesNow();
  const rounded = Math.ceil(now / 30) * 30;
  const first = SCHEDULE_VISIT_TIME_OPTIONS[0].minutes;
  const last = SCHEDULE_VISIT_TIME_OPTIONS[SCHEDULE_VISIT_TIME_OPTIONS.length - 1].minutes;
  return Math.max(first, Math.min(last, rounded));
}

/** Attaches the first tentative hold to an episode that started with no
 * visit scheduled — the same episode, not a new intake record. */
function ScheduleVisitForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { date: string; time: string; type: VisitType }) => void;
}) {
  const [date, setDate] = useState(() => practiceToday());
  const [timeMinutes, setTimeMinutes] = useState(() => defaultScheduleVisitTimeMinutes());
  const [visitType, setVisitType] = useState<VisitType>("60-min Intake");

  return (
    <div className="iqd-inline-panel">
      <div className="iqd-field">
        <label>Appointment date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="iqd-field">
        <label>Time</label>
        <select value={timeMinutes} onChange={(e) => setTimeMinutes(Number(e.target.value))}>
          {SCHEDULE_VISIT_TIME_OPTIONS.map((slot) => (
            <option key={slot.minutes} value={slot.minutes}>{slot.label}</option>
          ))}
        </select>
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
          size="sm"
          variant="primary"
          {...disabledWhile(busy || !date, busy ? "Saving…" : "Choose a date first")}
          onClick={() => onSubmit({ date, time: minutesToTimeString(timeMinutes), type: visitType })}
        >
          Schedule visit
        </Button>
        <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DisposeForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: IntakeDispositionReason, note: string) => void;
}) {
  const [reason, setReason] = useState<IntakeDispositionReason>("patient_changed_mind");
  const [note, setNote] = useState("");
  return (
    <div className="iqd-inline-panel">
      <div className="iqd-field">
        <label>Reason</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as IntakeDispositionReason)}>
          {INTAKE_DISPOSITION_REASONS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="iqd-field">
        <label>Note (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="iqd-actions">
        <Button size="sm" variant="destructive" {...disabledWhile(busy)} onClick={() => onSubmit(reason, note)}>Archive intake</Button>
        <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function StepPanel({
  step,
  detail,
  busy,
  isMinor,
  onRun,
  onClose,
  onSaved,
}: {
  step: IntakeReadinessStep;
  detail: IntakeDetail;
  busy: boolean;
  isMinor: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { administrative, consents, forms, eligibility, payment, episode, documents, insuranceCardDocuments } = detail;
  const subject = subjectPayload(episode);
  const isProspect = !episode.patientId;

  if ((step.id === "identity" || step.id === "contact") && isProspect) {
    return <ProspectIdentityForm prospectiveId={episode.prospectivePersonId!} administrative={administrative} busy={busy} onSaved={onSaved} onRun={onRun} />;
  }

  if (step.id === "insurance_details" && isProspect) {
    return <ProspectCoverageForm subject={subject} coverage={administrative.coverage} busy={busy} onRun={onRun} />;
  }

  if (step.id === "government_id") {
    if (!isProspect) {
      return (
        <IdentityDocumentPanel
          subject={subject}
          documents={documents}
          busy={busy}
          onRun={onRun}
        />
      );
    }
    return (
      <ProspectDocumentCapture
        subject={subject}
        documentTypeOptions={[
          { value: "government_id_front", label: "Government ID — front" },
          { value: "government_id_back", label: "Government ID — back" },
        ]}
        existingDocuments={documents}
        busy={busy}
        onRun={onRun}
      >
        {documents.filter((d) => d.workflowStatus !== "superseded").length > 0 ? (
          <IdentityDocumentPanel subject={subject} documents={documents} busy={busy} onRun={onRun} />
        ) : null}
      </ProspectDocumentCapture>
    );
  }

  if (step.id === "insurance_card") {
    if (!isProspect) {
      return <p className="iqd-step-detail">Upload or review the card image from the patient's Documents section.</p>;
    }
    return (
      <ProspectDocumentCapture
        subject={subject}
        documentTypeOptions={[
          { value: "insurance_card_primary", label: "Insurance card — primary" },
          { value: "insurance_card_secondary", label: "Insurance card — secondary" },
        ]}
        existingDocuments={insuranceCardDocuments}
        busy={busy}
        onRun={onRun}
      />
    );
  }

  if (step.id === "plan_acceptance") {
    return <PlanAcceptancePanel policyPayer={administrative.coverage.find((c) => c.status === "active" && !c.isSelfPay)?.payerName} planAcceptance={detail.planAcceptance} busy={busy} onRun={onRun} />;
  }

  if (step.id === "consents") {
    return (
      <ConsentsPanel
        required={consents.required}
        signed={consents.signed}
        defaultSignerName={administrative.identity.legalName}
        isMinor={isMinor}
        busy={busy}
        onSign={(templateId, signerName, signerRelationship) =>
          onRun(() => api.intake.action({ action: "record_consent_signature", ...subject, templateId, signerName, signerRelationship }))
        }
      />
    );
  }

  if (step.id === "intake_forms") {
    return (
      <FormsPanel
        requiredTemplates={forms.required}
        submissions={forms.submissions}
        busy={busy}
        onSave={(templateId, submissionId, answers, status) =>
          onRun(() => api.intake.action({ action: "save_form_submission", ...subject, templateId, submissionId, answers, status }))
        }
      />
    );
  }

  if (step.id === "eligibility") {
    const policy = administrative.coverage.find((c) => c.status === "active" && !c.isSelfPay);
    if (!policy) return <p className="iqd-step-detail">No active payer coverage to check.</p>;
    return (
      <EligibilityForm
        busy={busy}
        onSubmit={(result, note, benefitEvidence) =>
          onRun(() => api.intake.action({ action: "record_eligibility_check", ...subject, coveragePolicyId: policy.id, result, note, benefitEvidence }))
        }
        lastResult={eligibility?.result}
      />
    );
  }

  if (step.id === "payment") {
    return (
      <PaymentForm
        busy={busy}
        current={payment}
        onSubmit={(status, brand, lastFour, waiverReason) =>
          onRun(() => api.intake.action({ action: "record_payment_readiness", ...subject, status, brand, lastFour, waiverReason }))
        }
      />
    );
  }

  void onClose;
  return null;
}

/** Pre-chart identity editing: a minimal inline form, since the full
 * administrative editor (`PatientInformationDrawer`) operates on a chart
 * this record does not have yet. */
function ProspectIdentityForm({
  prospectiveId,
  administrative,
  busy,
  onRun,
  onSaved,
}: {
  prospectiveId: string;
  administrative: IntakeDetail["administrative"];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  onSaved: () => void;
}) {
  const [name, setName] = useState(administrative.identity.legalName);
  const [dob, setDob] = useState(administrative.identity.dob);
  const [phone, setPhone] = useState(administrative.contact.mobilePhone ?? "");
  const [email, setEmail] = useState(administrative.contact.email ?? "");

  return (
    <div>
      <div className="iqd-field">
        <label>Full name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
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
      <p className="iqd-step-detail">Updates the prospective record directly — there is no chart to edit yet.</p>
      <Button
        size="sm"
        {...disabledWhile(busy)}
        onClick={() =>
          onRun(async () => {
            await api.prospectivePersons.action({ action: "update", prospectiveId, name, dob, mobilePhone: phone, email });
            onSaved();
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

function IdentityDocumentPanel({
  subject,
  documents,
  busy,
  onRun,
}: {
  subject: { patientId?: string; prospectivePersonId?: string };
  documents: IntakeDetail["documents"];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const current = documents.filter((d) => d.workflowStatus !== "superseded");
  const [documentId, setDocumentId] = useState(current[0]?.id ?? "");
  const [legible, setLegible] = useState(true);
  const [result, setResult] = useState<IdentityDocumentReviewResult>("confirmed");
  const [conflictNote, setConflictNote] = useState("");

  if (current.length === 0) {
    return <p className="iqd-step-detail">No ID document uploaded yet — add one from the patient's Documents section.</p>;
  }

  return (
    <div>
      <div className="iqd-field">
        <label>Document</label>
        <select value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
          {current.map((d) => (
            <option key={d.id} value={d.id}>{d.documentType} — {d.workflowStatus}</option>
          ))}
        </select>
      </div>
      <div className="iqd-field">
        <label>
          <input type="checkbox" checked={legible} onChange={(e) => setLegible(e.target.checked)} /> Image is legible
        </label>
      </div>
      <div className="iqd-field">
        <label>Result</label>
        <select value={result} onChange={(e) => setResult(e.target.value as IdentityDocumentReviewResult)}>
          <option value="confirmed">Identity confirmed — matches the chart</option>
          <option value="conflict">Conflict with chart information</option>
          <option value="needs_more_info">Needs more information</option>
        </select>
      </div>
      {result === "conflict" ? (
        <div className="iqd-field">
          <label>Describe the conflict</label>
          <textarea value={conflictNote} onChange={(e) => setConflictNote(e.target.value)} required />
        </div>
      ) : null}
      <Button
        size="sm"
        {...disabledWhile(busy || (result === "conflict" && !conflictNote.trim()), busy ? "Saving…" : "Describe the conflict first")}
        onClick={() =>
          onRun(() => api.intake.action({ action: "record_identity_document_review", ...subject, documentId, result, legible, conflictNote: result === "conflict" ? conflictNote : undefined }))
        }
      >
        Record identity review
      </Button>
    </div>
  );
}

const DOCUMENT_WORKFLOW_NEXT: Record<string, { toStatus: "needs_review" | "reviewed"; label: string }> = {
  received: { toStatus: "needs_review", label: "Mark needs review" },
  needs_review: { toStatus: "reviewed", label: "Mark reviewed" },
};

/**
 * Prospect-safe document capture (D-077): the same `documents` table a
 * chart's Documents surface reads, reached from Intake because a prospect
 * has no chart-scoped Documents tab to navigate to yet. Content is
 * plain-text — this build has no binary/object storage, and this panel does
 * not pretend otherwise (see `PatientDocuments.tsx`).
 */
function ProspectDocumentCapture({
  subject,
  documentTypeOptions,
  existingDocuments,
  busy,
  onRun,
  children,
}: {
  subject: { patientId?: string; prospectivePersonId?: string };
  documentTypeOptions: Array<{ value: string; label: string }>;
  existingDocuments: IntakeDetail["documents"] | IntakeDetail["insuranceCardDocuments"];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  children?: ReactNode;
}) {
  const [documentType, setDocumentType] = useState(documentTypeOptions[0]?.value ?? "");
  const [title, setTitle] = useState(documentTypeOptions[0]?.label ?? "");
  const [contentText, setContentText] = useState("");
  const current = existingDocuments.filter((d) => d.workflowStatus !== "superseded");

  return (
    <div>
      {current.length > 0 ? (
        <ul className="iqd-notes-list">
          {current.map((d) => {
            const next = DOCUMENT_WORKFLOW_NEXT[d.workflowStatus];
            return (
              <li key={d.id} className="iqd-note">
                <div className="iqd-actions">
                  <span>{documentTypeOptions.find((o) => o.value === d.documentType)?.label ?? d.documentType} — {d.workflowStatus.replace("_", " ")}</span>
                  {next ? (
                    <Button
                      size="sm"
                      {...disabledWhile(busy)}
                      onClick={() => onRun(() => api.intake.action({ action: "transition_document", documentId: d.id, toStatus: next.toStatus }))}
                    >
                      {next.label}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="iqd-field">
        <label>Document</label>
        <select
          value={documentType}
          onChange={(e) => {
            setDocumentType(e.target.value);
            setTitle(documentTypeOptions.find((o) => o.value === e.target.value)?.label ?? "");
          }}
        >
          {documentTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="iqd-field">
        <label>Content (synthetic — this build has no binary upload)</label>
        <textarea value={contentText} onChange={(e) => setContentText(e.target.value)} placeholder="Describe what the image would show, for this synthetic build." />
      </div>
      <Button
        size="sm"
        {...disabledWhile(busy)}
        onClick={() =>
          onRun(async () => {
            await api.intake.action({ action: "upload_document", ...subject, documentType, title: title || documentType, contentText });
            setContentText("");
          })
        }
      >
        Add {documentTypeOptions.find((o) => o.value === documentType)?.label ?? "document"}
      </Button>
      {children}
    </div>
  );
}

/** Prospect-safe coverage entry (D-077): the same `insurance_policies` row a
 * chart's Coverage editor writes — self-pay or a payer/member/priority
 * record, reached before a chart exists. Distinct from the insurance-card
 * evidence step above: this is the policy information, not a card image. */
function ProspectCoverageForm({
  subject,
  coverage,
  busy,
  onRun,
}: {
  subject: { patientId?: string; prospectivePersonId?: string };
  coverage: IntakeDetail["administrative"]["coverage"];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [isSelfPay, setIsSelfPay] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [groupNumber, setGroupNumber] = useState("");
  const [subscriberName, setSubscriberName] = useState("");
  const [relationship, setRelationship] = useState("self");
  const [coveragePriority, setCoveragePriority] = useState(coverage.filter((c) => c.status === "active").length > 0 ? 2 : 1);

  return (
    <div>
      {coverage.length > 0 ? (
        <ul className="iqd-notes-list">
          {coverage.map((c) => (
            <li key={c.id} className="iqd-note">
              {c.isSelfPay ? "Self-pay" : c.payerName} {c.status !== "active" ? `(${c.status})` : c.priority === 1 ? "(primary)" : "(secondary)"}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="iqd-field">
        <label>
          <input type="checkbox" checked={isSelfPay} onChange={(e) => setIsSelfPay(e.target.checked)} /> Self-pay
        </label>
      </div>
      {!isSelfPay ? (
        <>
          <div className="iqd-field">
            <label>Payer</label>
            <input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
          </div>
          <div className="iqd-field">
            <label>Member ID</label>
            <input value={memberId} onChange={(e) => setMemberId(e.target.value)} />
          </div>
          <div className="iqd-field">
            <label>Group number</label>
            <input value={groupNumber} onChange={(e) => setGroupNumber(e.target.value)} />
          </div>
          <div className="iqd-field">
            <label>Subscriber name (if not self)</label>
            <input value={subscriberName} onChange={(e) => setSubscriberName(e.target.value)} />
          </div>
          <div className="iqd-field">
            <label>Relationship to subscriber</label>
            <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
              <option value="self">Self</option>
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
              <option value="other">Other</option>
            </select>
          </div>
        </>
      ) : null}
      <div className="iqd-field">
        <label>Billing order</label>
        <select value={coveragePriority} onChange={(e) => setCoveragePriority(Number(e.target.value))}>
          <option value={1}>Primary</option>
          <option value={2}>Secondary</option>
          <option value={3}>Tertiary</option>
        </select>
      </div>
      <Button
        size="sm"
        {...disabledWhile(busy || (!isSelfPay && !payerName.trim()), busy ? "Saving…" : "Enter a payer, or mark this self-pay")}
        onClick={() =>
          onRun(() =>
            api.intake.action({
              action: "add_coverage",
              ...subject,
              isSelfPay,
              payerName: isSelfPay ? payerName || "Self-pay" : payerName,
              memberId: memberId || undefined,
              groupNumber: groupNumber || undefined,
              subscriberName: subscriberName || undefined,
              relationship: isSelfPay ? undefined : relationship,
              coveragePriority,
            }),
          )
        }
      >
        Add coverage
      </Button>
    </div>
  );
}

function PlanAcceptancePanel({
  policyPayer,
  planAcceptance,
  busy,
  onRun,
}: {
  policyPayer?: string;
  planAcceptance: IntakeDetail["planAcceptance"];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [status, setStatus] = useState<PayerParticipationStatus>("in_network");
  const { hasPermission } = useAuthSession();

  if (!policyPayer) return <p className="iqd-step-detail">No active payer to match.</p>;
  if (!hasPermission("manage_organization")) {
    return <p className="iqd-step-detail">Current status: {planAcceptance.replace("_", " ")}. Ask a practice owner/manager to configure payer-plan participation.</p>;
  }

  return (
    <div>
      <p className="iqd-step-detail">Current status: {planAcceptance.replace("_", " ")}. Configure this payer for the whole practice:</p>
      <div className="iqd-field">
        <label>Participation</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as PayerParticipationStatus)}>
          <option value="in_network">Accepted / in network</option>
          <option value="out_of_network">Not accepted / out of network</option>
        </select>
      </div>
      <Button
        size="sm"
        {...disabledWhile(busy)}
        onClick={() => onRun(() => api.intake.action({ action: "add_payer_plan_participation", payerName: policyPayer, status }))}
      >
        Save payer participation
      </Button>
    </div>
  );
}

function ConsentsPanel({
  required,
  signed,
  defaultSignerName,
  isMinor,
  busy,
  onSign,
}: {
  required: IntakeDetail["consents"]["required"];
  signed: IntakeDetail["consents"]["signed"];
  defaultSignerName: string;
  isMinor: boolean;
  busy: boolean;
  onSign: (templateId: string, signerName: string, signerRelationship: "self" | "guardian" | "legal-representative" | "other") => Promise<void>;
}) {
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [relationship, setRelationship] = useState<"self" | "guardian" | "legal-representative" | "other">(isMinor ? "guardian" : "self");
  const signedIds = new Set(signed.map((s) => s.templateId));

  return (
    <div>
      <div className="iqd-field">
        <label>Signer name</label>
        <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
      </div>
      <div className="iqd-field">
        <label>Signer relationship</label>
        <select value={relationship} onChange={(e) => setRelationship(e.target.value as typeof relationship)}>
          <option value="self">Self</option>
          <option value="guardian">Guardian</option>
          <option value="legal-representative">Legal representative</option>
          <option value="other">Other</option>
        </select>
      </div>
      <ul className="iqd-notes-list">
        {required.map((template) => {
          const isSigned = signedIds.has(template.id);
          return (
            <li key={template.id} className="iqd-note">
              <div className="iqd-actions">
                <span>{template.title}</span>
                {isSigned ? (
                  <StatusBadge tone="success" shape="pill">Signed</StatusBadge>
                ) : (
                  <Button size="sm" {...disabledWhile(busy || !signerName.trim(), busy ? "Saving…" : "Enter a signer name first")} onClick={() => void onSign(template.id, signerName, relationship)}>
                    Record signature
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="iqd-step-detail">Staff-attested only — this build has no capture pad.</p>
    </div>
  );
}

function FormsPanel({
  requiredTemplates,
  submissions,
  busy,
  onSave,
}: {
  requiredTemplates: IntakeDetail["forms"]["required"];
  submissions: IntakeDetail["forms"]["submissions"];
  busy: boolean;
  onSave: (templateId: string, submissionId: string | undefined, answers: Record<string, string>, status: "in_progress" | "submitted") => Promise<void>;
}) {
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function openTemplate(templateId: string) {
    const existing = submissions.find((s) => s.templateId === templateId);
    setAnswers(existing?.answers ?? {});
    setOpenTemplateId(templateId);
  }

  return (
    <div>
      <ul className="iqd-notes-list">
        {requiredTemplates.map((template) => {
          const submission = [...submissions].filter((s) => s.templateId === template.id).sort((a, b) => (a.status === "submitted" ? -1 : 1))[0];
          const done = submission?.status === "submitted" || submission?.status === "reviewed";
          return (
            <li key={template.id} className="iqd-note">
              <div className="iqd-actions">
                <span>{template.title}</span>
                {done ? (
                  <StatusBadge tone="success" shape="pill">Submitted</StatusBadge>
                ) : (
                  <Button size="sm" {...disabledWhile(busy)} onClick={() => openTemplate(template.id)}>
                    {submission ? "Continue" : "Start"}
                  </Button>
                )}
              </div>
              {openTemplateId === template.id ? (
                <InlineFormRenderer
                  templateId={template.id}
                  answers={answers}
                  busy={busy}
                  onChange={(fieldId, value) => setAnswers((prev) => ({ ...prev, [fieldId]: value }))}
                  onSave={async (status) => {
                    await onSave(template.id, submission?.id, answers, status);
                    if (status === "submitted") setOpenTemplateId(null);
                  }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Renders the generic sectioned questionnaire from the seeded form template's
 * schema. This intentionally reads the same template metadata the readiness
 * checklist reads, rather than a bespoke page per form (P7-A/B foundation). */
function InlineFormRenderer({
  templateId,
  answers,
  busy,
  onChange,
  onSave,
}: {
  templateId: string;
  answers: Record<string, string>;
  busy: boolean;
  onChange: (fieldId: string, value: string) => void;
  onSave: (status: "in_progress" | "submitted") => Promise<void>;
}) {
  const [sections, setSections] = useState<Array<{ id: string; title: string; fields: FormField[] }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/intake/form-templates");
        const json = await res.json();
        if (!cancelled && json?.success) {
          const found = (json.templates as Array<{ id: string; sections: Array<{ id: string; title: string; fields: FormField[] }> }>).find((t) => t.id === templateId);
          setSections(found?.sections ?? []);
        }
      } catch {
        if (!cancelled) setSections([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (sections === null) return <p className="iqd-step-detail">Loading form…</p>;

  return (
    <div className="intake-form-fields">
      {sections.map((section) => (
        <div key={section.id}>
          <div className="intake-form-section-title">{section.title}</div>
          {section.fields.map((field) => (
            <div key={field.id} className="iqd-field">
              <label>{field.label}</label>
              {field.type === "textarea" ? (
                <textarea value={answers[field.id] ?? ""} onChange={(e) => onChange(field.id, e.target.value)} />
              ) : field.type === "yesno" ? (
                <select value={answers[field.id] ?? ""} onChange={(e) => onChange(field.id, e.target.value)}>
                  <option value="">Not answered</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              ) : (
                <input value={answers[field.id] ?? ""} onChange={(e) => onChange(field.id, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="iqd-actions">
        <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => void onSave("in_progress")}>Save draft</Button>
        <Button size="sm" {...disabledWhile(busy)} onClick={() => void onSave("submitted")}>Submit</Button>
      </div>
    </div>
  );
}

function EligibilityForm({
  busy,
  lastResult,
  onSubmit,
}: {
  busy: boolean;
  lastResult?: string;
  onSubmit: (result: "active" | "inactive" | "needs_review" | "failed" | "uncertain", note: string, benefitEvidence?: { officeVisitCopay?: string; coinsurance?: string; deductibleRemaining?: string }) => Promise<void>;
}) {
  const [result, setResult] = useState<"active" | "inactive" | "needs_review" | "failed" | "uncertain">("active");
  const [note, setNote] = useState("");
  const [copay, setCopay] = useState("");
  const [coinsurance, setCoinsurance] = useState("");
  const [deductibleRemaining, setDeductibleRemaining] = useState("");

  return (
    <div>
      {lastResult ? <p className="iqd-step-detail">Last recorded: {lastResult}</p> : null}
      <div className="iqd-field">
        <label>Result of payer call/portal check</label>
        <select value={result} onChange={(e) => setResult(e.target.value as typeof result)}>
          {ELIGIBILITY_RESULTS.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <div className="iqd-field">
        <label>Note</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who you spoke with, reference number, etc." />
      </div>
      <div className="iqd-field">
        <label>Office visit copay (if given)</label>
        <input value={copay} onChange={(e) => setCopay(e.target.value)} placeholder="e.g. $25" />
      </div>
      <div className="iqd-field">
        <label>Coinsurance (if given)</label>
        <input value={coinsurance} onChange={(e) => setCoinsurance(e.target.value)} placeholder="e.g. 20%" />
      </div>
      <div className="iqd-field">
        <label>Deductible remaining (if given)</label>
        <input value={deductibleRemaining} onChange={(e) => setDeductibleRemaining(e.target.value)} placeholder="e.g. $0 or $350" />
      </div>
      <p className="iqd-step-detail">Leave a field blank if the payer did not return it — never guessed.</p>
      <Button
        size="sm"
        {...disabledWhile(busy)}
        onClick={() =>
          void onSubmit(result, note, {
            officeVisitCopay: copay.trim() || undefined,
            coinsurance: coinsurance.trim() || undefined,
            deductibleRemaining: deductibleRemaining.trim() || undefined,
          })
        }
      >
        Record staff-verified eligibility
      </Button>
    </div>
  );
}

function PaymentForm({
  busy,
  current,
  onSubmit,
}: {
  busy: boolean;
  current: IntakeDetail["payment"];
  onSubmit: (status: "on_file" | "waived", brand?: string, lastFour?: string, waiverReason?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"on_file" | "waived">("waived");
  const [brand, setBrand] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [waiverReason, setWaiverReason] = useState("");

  return (
    <div>
      {current ? <p className="iqd-step-detail">Current: {current.status}{current.waiverReason ? ` — ${current.waiverReason}` : ""}</p> : null}
      <div className="iqd-field">
        <label>Record</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="on_file">Payment method reference on file</option>
          <option value="waived">Staff exception / waiver</option>
        </select>
      </div>
      {mode === "on_file" ? (
        <>
          <div className="iqd-field">
            <label>Card brand</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Visa" />
          </div>
          <div className="iqd-field">
            <label>Last four</label>
            <input value={lastFour} onChange={(e) => setLastFour(e.target.value)} maxLength={4} />
          </div>
          <p className="iqd-step-detail">No processor is configured — this records a reference only, never a card number.</p>
        </>
      ) : (
        <div className="iqd-field">
          <label>Reason</label>
          <textarea value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} required />
        </div>
      )}
      <Button
        size="sm"
        {...disabledWhile(busy || (mode === "waived" && !waiverReason.trim()), busy ? "Saving…" : "Enter a waiver reason first")}
        onClick={() => void onSubmit(mode, brand || undefined, lastFour || undefined, waiverReason || undefined)}
      >
        Save
      </Button>
    </div>
  );
}
