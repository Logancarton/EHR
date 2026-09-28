"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../../lib/api-client";
import { useAuthSession } from "../../auth/AuthSessionGate";
import {
  ASSESSMENT_INSTRUMENTS,
  type AssessmentInstrumentType,
  type AssessmentRecord,
} from "../../../domain/clinical-measurements";
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
  type FormSubmissionStatus,
} from "../../../domain/intake";
import type { ProspectivePersonCandidateMatch } from "../../../domain/prospective-person";
import type { IntakeDetail } from "../../../server/services/intake-service";
import { practiceToday } from "../../../lib/practice-calendar";
import { type VisitType } from "../../../lib/schedule-data";
import DaySlotPicker, { visitTypeDurationLabel } from "./DaySlotPicker";

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

const STEP_SHORT_LABEL: Record<IntakeStepId, string> = {
  identity: "Identity",
  contact: "Contact",
  account: "Portal",
  government_id: "Government ID",
  insurance_details: "Coverage",
  insurance_card: "Insurance Card",
  plan_acceptance: "Plan",
  eligibility: "Eligibility",
  consents: "Consents",
  intake_forms: "Forms",
  assessments: "Assessments",
  payment: "Payment",
  guardian: "Guardian",
  staff_review: "Staff Review",
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

    // Once a chart exists, identity/contact/coverage already have a richer
    // authoritative editor. The timeline is still the launch point; it opens
    // that editor instead of duplicating those fields inside Intake.
    if (ADMIN_STEPS.has(step.id) && detail.episode.patientId) {
      setShowAdminDrawer(true);
      return;
    }

    // Every other timeline node is inspectable, including recorded and
    // not-yet-available steps. "Done" should never mean "dead control."
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
  const activeStep = activePanel ? steps.find((step) => step.id === activePanel) : undefined;
  const relevantSteps = steps.filter((step) => step.state !== "not_available");
  const completedSteps = relevantSteps.filter((step) => step.state === "recorded").length;

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

      <section className="iqd-progress-section" aria-label="Intake progress">
        <div className="iqd-progress-heading">
          <div>
            <span className="iqd-progress-kicker">Intake progress</span>
            <span className="iqd-progress-help">Select any step to review what is on file or complete what is missing.</span>
          </div>
          <span className="iqd-progress-count">{completedSteps} of {relevantSteps.length} complete</span>
        </div>

        <div className="iqd-timeline">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={`iqd-step-row iqd-timeline-step state-${step.state} ${activePanel === step.id ? "is-active" : ""}`}
              disabled={busy}
              aria-expanded={activePanel === step.id}
              title={step.detail}
              onClick={() => onStepClick(step)}
            >
              <span className="iqd-timeline-marker" aria-hidden="true">
                <span className="iqd-timeline-node">
                  <Icon name={STEP_ICON[step.state]} size="sm" filled={step.state === "recorded"} />
                </span>
                {index < steps.length - 1 ? <span className="iqd-timeline-connector" /> : null}
              </span>
              <span className="iqd-timeline-label">{STEP_SHORT_LABEL[step.id]}</span>
              <span className="iqd-timeline-state">{step.state.replace("_", " ")}</span>
              <span className="iqd-sr-step-label">{step.label}</span>
            </button>
          ))}
        </div>

        {activeStep ? (
          <div className="iqd-step-workspace">
            <div className="iqd-step-workspace-head">
              <div>
                <h3>{activeStep.label}</h3>
                <p>{activeStep.detail}</p>
              </div>
              <div className="iqd-step-workspace-actions">
                <StatusBadge tone={STEP_TONE[activeStep.state]} shape="pill">
                  {activeStep.state.replace("_", " ")}
                </StatusBadge>
                <Button variant="icon" size="sm" icon="close" aria-label="Close step" onClick={() => setActivePanel(null)} />
              </div>
            </div>
            <div className="iqd-inline-panel">
              <StepPanel
                step={activeStep}
                detail={detail}
                busy={busy}
                isMinor={isMinor}
                onRun={run}
                onClose={() => setActivePanel(null)}
                onSaved={() => void refresh()}
              />
            </div>
          </div>
        ) : null}
      </section>

      {isProspect ? (
        <div className="iqd-section iqd-prechart-section">
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
          initialSection="intake"
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
    <div className="iqd-promotion-panel">
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

/** Attaches the first tentative hold to an episode that started with no
 * visit scheduled — the same episode, not a new intake record. Picks from
 * the practice's real day schedule rather than a blind dropdown, so a blank
 * spot is the only kind of spot that can be chosen. */
function ScheduleVisitForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { date: string; time: string; type: VisitType; duration: string }) => void;
}) {
  const [date, setDate] = useState(() => practiceToday());
  const [time, setTime] = useState<string | null>(null);
  const [visitType, setVisitType] = useState<VisitType>("60-min Intake");

  return (
    <div className="iqd-inline-panel">
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
        busy={busy}
      />
      <div className="iqd-actions">
        <Button
          size="sm"
          variant="primary"
          {...disabledWhile(busy || !time, busy ? "Saving…" : "Choose an open time slot first")}
          onClick={() => onSubmit({ date, time: time!, type: visitType, duration: visitTypeDurationLabel(visitType) })}
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

  if (step.state === "not_available") {
    return <p className="iqd-step-detail">{step.detail}</p>;
  }

  if (step.id === "guardian") {
    if (!isMinor) return <p className="iqd-step-detail">No guardian workflow is required for this patient.</p>;
    return (
      <div>
        <div className="iqd-field">
          <label>Guardian situation</label>
          <select
            value={episode.guardianSituation}
            disabled={busy}
            onChange={(e) =>
              void onRun(() =>
                api.intake.action({
                  action: "set_guardian_situation",
                  episodeId: episode.id,
                  ...subject,
                  situation: e.target.value as GuardianSituation,
                }),
              )
            }
          >
            {GUARDIAN_SITUATIONS.map((guardian) => (
              <option key={guardian.value} value={guardian.value}>{guardian.label}</option>
            ))}
          </select>
        </div>
        <p className="iqd-step-detail">
          {GUARDIAN_SITUATIONS.find((guardian) => guardian.value === episode.guardianSituation)?.detail}
        </p>
      </div>
    );
  }

  if (step.id === "staff_review") {
    return (
      <div>
        <p className="iqd-step-detail">
          {episode.staffReviewResolvedAt
            ? `Signed off by ${episode.staffReviewResolvedBy ?? "staff"}.`
            : "Staff has not signed off on this intake yet."}
        </p>
        {episode.staffReviewResolvedAt ? (
          <Button
            size="sm"
            variant="tertiary"
            {...disabledWhile(busy)}
            onClick={() => void onRun(() => api.intake.action({ action: "reopen_staff_review", episodeId: episode.id, ...subject }))}
          >
            Reopen staff review
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            {...disabledWhile(busy)}
            onClick={() => void onRun(() => api.intake.action({ action: "resolve_staff_review", episodeId: episode.id, ...subject }))}
          >
            Sign off
          </Button>
        )}
      </div>
    );
  }

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
      return (
        <div>
          <p className="iqd-step-detail">
            {insuranceCardDocuments.length > 0
              ? `${insuranceCardDocuments.length} insurance card document(s) are on file. Open Documents to review the images or workflow state.`
              : "No insurance card document is on file yet."}
          </p>
          <Button size="sm" variant="secondary" onClick={() => void navigateToPatientLocation(episode.patientId!, "Documents")}>
            Open Documents
          </Button>
        </div>
      );
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
        onSign={(templateId, signerName, signerRelationship, method, signatureData, attestationStatement) =>
          onRun(() =>
            api.intake.action({
              action: "record_consent_signature",
              ...subject,
              templateId,
              signerName,
              signerRelationship,
              method,
              signatureData,
              attestationStatement,
            })
          )
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
        onReview={(submissionId, reviewNotes) =>
          onRun(() => api.intake.action({ action: "review_form_submission", ...subject, submissionId, reviewNotes }))
        }
      />
    );
  }

  if (step.id === "assessments") {
    return (
      <AssessmentsPanel
        subject={subject}
        assessments={detail.assessments ?? []}
        busy={busy}
        onRun={onRun}
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
    return <p className="iqd-step-detail">No ID document uploaded yet — add one from the patient&apos;s Documents section.</p>;
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

function SignatureCanvas({
  onChange,
  disabled,
}: {
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    canvas.setPointerCapture(e.pointerId);
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) {
      setHasDrawn(true);
    }
  }

  function stopDrawing(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {}
    onChange(canvas.toDataURL("image/png"));
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange(null);
  }

  return (
    <div className="iqd-canvas-container">
      <canvas
        ref={canvasRef}
        width={420}
        height={130}
        className="iqd-signature-canvas"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
      />
      <div className="iqd-canvas-actions">
        <span className="iqd-canvas-hint">Draw legal signature in the box</span>
        <Button size="sm" variant="tertiary" onClick={clearCanvas} {...disabledWhile(!hasDrawn || Boolean(disabled), "Clear")}>
          Clear
        </Button>
      </div>
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
  onSign: (
    templateId: string,
    signerName: string,
    signerRelationship: "self" | "guardian" | "legal-representative" | "other",
    method?: "staff_attested" | "drawn_canvas" | "typed_attestation",
    signatureData?: string,
    attestationStatement?: string,
  ) => Promise<void>;
}) {
  const [activeSigningId, setActiveSigningId] = useState<string | null>(null);
  const [viewTermsId, setViewTermsId] = useState<string | null>(null);
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [relationship, setRelationship] = useState<"self" | "guardian" | "legal-representative" | "other">(isMinor ? "guardian" : "self");
  const [method, setMethod] = useState<"drawn_canvas" | "typed_attestation" | "staff_attested">("drawn_canvas");
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [typedAgreed, setTypedAgreed] = useState(false);

  const signedByTemplateId = new Map(signed.map((s) => [s.templateId, s]));

  async function handleSign(templateId: string) {
    let attestationStatement: string | undefined;
    if (method === "typed_attestation") {
      attestationStatement = `Digitally acknowledged and certified by ${signerName.trim()} (${relationship}) on ${new Date().toISOString()}`;
    }
    await onSign(
      templateId,
      signerName.trim(),
      relationship,
      method,
      method === "drawn_canvas" ? drawnSignature || undefined : undefined,
      attestationStatement,
    );
    setActiveSigningId(null);
    setDrawnSignature(null);
    setTypedAgreed(false);
  }

  return (
    <div className="iqd-consents-workspace">
      <ul className="iqd-notes-list">
        {required.map((template) => {
          const sig = signedByTemplateId.get(template.id);
          const isSigned = Boolean(sig);
          const isSigning = activeSigningId === template.id;
          const isViewingTerms = viewTermsId === template.id;

          return (
            <li key={template.id} className="iqd-note iqd-consent-item">
              <div className="iqd-consent-row">
                <div className="iqd-consent-meta">
                  <strong>{template.title}</strong>
                  <span className="iqd-note-meta">
                    Category: {template.category.replace("_", " ")} · v{template.version}
                  </span>
                </div>
                <div className="iqd-actions">
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => setViewTermsId((cur) => (cur === template.id ? null : template.id))}
                  >
                    {isViewingTerms ? "Hide terms" : "Read terms"}
                  </Button>
                  {isSigned ? (
                    <StatusBadge tone="success" shape="pill">Signed</StatusBadge>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      {...disabledWhile(busy)}
                      onClick={() => {
                        setActiveSigningId(isSigning ? null : template.id);
                        setDrawnSignature(null);
                        setTypedAgreed(false);
                      }}
                    >
                      {isSigning ? "Cancel" : "Sign consent…"}
                    </Button>
                  )}
                </div>
              </div>

              {isViewingTerms ? (
                <div className="iqd-consent-terms-view">
                  <h4>{template.title} Terms</h4>
                  <div className="iqd-consent-body-scroll">
                    {template.bodyText || "Standard practice clinical agreement and consent terms."}
                  </div>
                </div>
              ) : null}

              {isSigned && sig ? (
                <div className="iqd-signature-receipt">
                  <div className="iqd-signature-receipt-header">
                    <span className="iqd-signature-receipt-title">Verified Signature Receipt</span>
                    <StatusBadge tone="info" shape="pill">
                      {sig.method === "drawn_canvas" ? "Drawn digital signature" : sig.method === "typed_attestation" ? "Typed legal attestation" : "Staff witness attestation"}
                    </StatusBadge>
                  </div>
                  <div className="iqd-signature-receipt-grid">
                    <div><strong>Signer:</strong> {sig.signerName} ({sig.signerRelationship})</div>
                    <div><strong>Signed At:</strong> {sig.signedAt.slice(0, 10)} {sig.signedAt.slice(11, 16)}</div>
                    <div><strong>Recorded By:</strong> {sig.recordedByName}</div>
                  </div>
                  {sig.signatureData ? (
                    <div className="iqd-signature-receipt-canvas">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sig.signatureData} alt={`Digital signature of ${sig.signerName}`} className="iqd-signature-preview-img" />
                    </div>
                  ) : null}
                  {sig.attestationStatement ? (
                    <blockquote className="iqd-signature-attestation-quote">
                      {sig.attestationStatement}
                    </blockquote>
                  ) : null}
                </div>
              ) : null}

              {isSigning ? (
                <div className="iqd-signature-capture-panel">
                  <h4>Sign: {template.title}</h4>
                  <div className="iqd-field-row">
                    <div className="iqd-field">
                      <label>Signer legal name</label>
                      <input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Full legal name" />
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
                  </div>

                  <div className="iqd-signature-method-tabs">
                    <label>Signature method</label>
                    <div className="iqd-tab-buttons">
                      <Button
                        size="sm"
                        variant={method === "drawn_canvas" ? "primary" : "secondary"}
                        onClick={() => setMethod("drawn_canvas")}
                      >
                        Draw signature (pad)
                      </Button>
                      <Button
                        size="sm"
                        variant={method === "typed_attestation" ? "primary" : "secondary"}
                        onClick={() => setMethod("typed_attestation")}
                      >
                        Type legal attestation
                      </Button>
                      <Button
                        size="sm"
                        variant={method === "staff_attested" ? "primary" : "secondary"}
                        onClick={() => setMethod("staff_attested")}
                      >
                        Staff witness attestation
                      </Button>
                    </div>
                  </div>

                  {method === "drawn_canvas" ? (
                    <SignatureCanvas onChange={setDrawnSignature} disabled={busy} />
                  ) : method === "typed_attestation" ? (
                    <div className="iqd-typed-attestation-box">
                      <p className="iqd-attestation-text">
                        &ldquo;I, <strong>{signerName || "[Signer Legal Name]"}</strong>, certify that I am the individual named above (or their authorized representative). I have read and agree to the terms in {template.title}.&rdquo;
                      </p>
                      <label className="iqd-checkbox-label">
                        <input
                          type="checkbox"
                          checked={typedAgreed}
                          onChange={(e) => setTypedAgreed(e.target.checked)}
                        />
                        <span>I understand that this digital signature is legally binding.</span>
                      </label>
                    </div>
                  ) : (
                    <div className="iqd-staff-witness-box">
                      <p className="iqd-step-detail">
                        Staff witness confirms that the patient or guardian has verbally agreed or provided written paper consent for {template.title}.
                      </p>
                    </div>
                  )}

                  <div className="iqd-actions" style={{ marginTop: 12 }}>
                    <Button
                      size="sm"
                      variant="primary"
                      {...disabledWhile(
                        busy ||
                          !signerName.trim() ||
                          (method === "drawn_canvas" && !drawnSignature) ||
                          (method === "typed_attestation" && !typedAgreed),
                        busy
                          ? "Saving…"
                          : !signerName.trim()
                          ? "Enter signer name"
                          : method === "drawn_canvas" && !drawnSignature
                          ? "Draw your signature"
                          : method === "typed_attestation" && !typedAgreed
                          ? "Check the attestation agreement"
                          : "Record signature",
                      )}
                      onClick={() => void handleSign(template.id)}
                    >
                      Record legal signature
                    </Button>
                    <Button size="sm" variant="tertiary" onClick={() => setActiveSigningId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FormSubmissionInspector({
  templateId,
  answers,
  submissionId,
  status,
  reviewedByName,
  reviewedAt,
  reviewNotes: initialReviewNotes,
  busy,
  onReview,
  onClose,
}: {
  templateId: string;
  answers: Record<string, string>;
  submissionId?: string;
  status: FormSubmissionStatus;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string;
  busy: boolean;
  onReview: (submissionId: string, reviewNotes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [sections, setSections] = useState<Array<{ id: string; title: string; fields: FormField[] }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialReviewNotes ?? "");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/intake/form-templates");
        const json = await res.json();
        if (!res.ok || json?.success === false) throw new Error("Could not load template");
        if (!cancelled) {
          const found = (json.templates as Array<{ id: string; sections: Array<{ id: string; title: string; fields: FormField[] }> }>).find((t) => t.id === templateId);
          if (!found) {
            setError("Form template schema not found.");
            return;
          }
          setSections(found.sections);
        }
      } catch {
        if (!cancelled) setError("Could not load form template details.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (error) return <InlineError message={error} />;
  if (sections === null) return <p className="iqd-step-detail">Loading submission answers…</p>;

  return (
    <div className="iqd-form-inspector">
      <div className="iqd-form-inspector-header">
        <div>
          <h4>Submitted Form Answers</h4>
          <span className="iqd-note-meta">
            Status: <StatusBadge tone={status === "reviewed" ? "success" : "info"} shape="pill">{status}</StatusBadge>
            {reviewedByName && reviewedAt ? ` · Reviewed by ${reviewedByName} on ${reviewedAt.slice(0, 10)}` : ""}
          </span>
        </div>
        <Button size="sm" variant="tertiary" onClick={onClose}>Close</Button>
      </div>

      <div className="iqd-form-inspector-body">
        {sections.map((section) => (
          <div key={section.id} className="iqd-form-inspect-section">
            <h5 className="intake-form-section-title">{section.title}</h5>
            <div className="iqd-form-inspect-grid">
              {section.fields.map((field) => (
                <div key={field.id} className="iqd-form-inspect-item">
                  <span className="iqd-form-inspect-label">{field.label}</span>
                  <span className="iqd-form-inspect-value">{answers[field.id] || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="iqd-form-review-box">
        <h5>Staff Clinical Review &amp; Sign-off</h5>
        {initialReviewNotes ? (
          <p className="iqd-step-detail"><strong>Previous review notes:</strong> {initialReviewNotes}</p>
        ) : null}
        <div className="iqd-field">
          <label>Review notes</label>
          <textarea
            placeholder="Document verification, clinical observations, or clarifications…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {submissionId ? (
          <div className="iqd-actions">
            <Button
              size="sm"
              variant="primary"
              {...disabledWhile(busy)}
              onClick={() => void onReview(submissionId, notes)}
            >
              {status === "reviewed" ? "Update review sign-off" : "Approve & sign off review"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FormsPanel({
  requiredTemplates,
  submissions,
  busy,
  onSave,
  onReview,
}: {
  requiredTemplates: IntakeDetail["forms"]["required"];
  submissions: IntakeDetail["forms"]["submissions"];
  busy: boolean;
  onSave: (templateId: string, submissionId: string | undefined, answers: Record<string, string>, status: "in_progress" | "submitted") => Promise<void>;
  onReview: (submissionId: string, reviewNotes?: string) => Promise<void>;
}) {
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [inspectingTemplateId, setInspectingTemplateId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  function openTemplate(templateId: string) {
    const existing = submissions.find((s) => s.templateId === templateId);
    setAnswers(existing?.answers ?? {});
    setOpenTemplateId(templateId);
    setInspectingTemplateId(null);
  }

  function toggleInspect(templateId: string) {
    setInspectingTemplateId((cur) => (cur === templateId ? null : templateId));
    setOpenTemplateId(null);
  }

  return (
    <div>
      <ul className="iqd-notes-list">
        {requiredTemplates.map((template) => {
          const submission = [...submissions].filter((s) => s.templateId === template.id).sort((a, b) => (a.status === "submitted" ? -1 : 1))[0];
          const isDone = submission?.status === "submitted" || submission?.status === "reviewed";
          const isInspecting = inspectingTemplateId === template.id;

          return (
            <li key={template.id} className="iqd-note iqd-form-item">
              <div className="iqd-actions">
                <div className="iqd-form-meta">
                  <strong>{template.title}</strong>
                  <span className="iqd-note-meta">
                    Version: v{template.version}
                  </span>
                </div>
                <div className="iqd-actions">
                  {isDone ? (
                    <>
                      <StatusBadge tone={submission?.status === "reviewed" ? "success" : "info"} shape="pill">
                        {submission?.status === "reviewed" ? "Reviewed" : "Submitted"}
                      </StatusBadge>
                      <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => toggleInspect(template.id)}>
                        {isInspecting ? "Hide answers" : "Inspect & review…"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" {...disabledWhile(busy)} onClick={() => openTemplate(template.id)}>
                      {submission ? "Continue" : "Start"}
                    </Button>
                  )}
                </div>
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

              {isInspecting && submission ? (
                <FormSubmissionInspector
                  templateId={template.id}
                  answers={submission.answers}
                  submissionId={submission.id}
                  status={submission.status}
                  reviewedByName={submission.reviewedByName}
                  reviewedAt={submission.reviewedAt}
                  reviewNotes={submission.reviewNotes}
                  busy={busy}
                  onReview={async (subId, notes) => {
                    await onReview(subId, notes);
                    setInspectingTemplateId(null);
                  }}
                  onClose={() => setInspectingTemplateId(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AssessmentQuestionnaireRunner({
  instrumentKey,
  responses,
  notes,
  busy,
  onResponseChange,
  onNotesChange,
  onCancel,
  onSubmit,
}: {
  instrumentKey: AssessmentInstrumentType;
  responses: Record<number, number>;
  notes: string;
  busy: boolean;
  onResponseChange: (qId: number, val: number) => void;
  onNotesChange: (notes: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const def = ASSESSMENT_INSTRUMENTS[instrumentKey];
  const score = Object.values(responses).reduce((sum, v) => sum + v, 0);
  const interp = def.interpret(score, responses);
  const allAnswered = def.questions.every((q) => responses[q.id] !== undefined);

  return (
    <div className="iqd-assessment-runner">
      <div className="iqd-runner-header">
        <div>
          <h4>{def.title}</h4>
          <p className="iqd-step-detail">{def.description}</p>
        </div>
        <div className="iqd-runner-live-score">
          <div className="iqd-live-score-val">
            Score: {score} / {def.maxScore}
          </div>
          <StatusBadge
            tone={
              interp.flags.length > 0 || interp.severity.toLowerCase().includes("severe")
                ? "danger"
                : interp.severity.toLowerCase().includes("moderate")
                ? "warning"
                : "success"
            }
            shape="pill"
          >
            {interp.severity}
          </StatusBadge>
        </div>
      </div>

      {interp.flags.length > 0 ? (
        <div className="iqd-safety-alert" style={{ marginBottom: 16 }}>
          <Icon name="warning" filled />
          <div>
            <strong>Safety Warning:</strong>
            {interp.flags.map((f, i) => (
              <div key={i}>{f}</div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="iqd-runner-questions">
        {def.questions.map((q) => {
          const selected = responses[q.id];
          return (
            <div key={q.id} className="iqd-runner-question-row">
              {q.sectionTitle ? (
                <div className="iqd-runner-section-title">
                  <strong>{q.sectionTitle}</strong>
                  {q.sectionDescription ? <span> — {q.sectionDescription}</span> : null}
                </div>
              ) : null}
              <div className="iqd-runner-q-text">
                <span className="iqd-runner-q-num">Q{q.id}.</span> {q.text}
              </div>
              <div className="iqd-runner-options">
                {q.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`iqd-option-btn ${selected === opt.value ? "is-selected" : ""}`}
                    disabled={busy}
                    onClick={() => onResponseChange(q.id, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="iqd-field" style={{ marginTop: 14 }}>
        <label>Clinician notes &amp; observations (optional)</label>
        <textarea
          placeholder="Clinical context, behavioral observations, or follow-up plan…"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>

      <div className="iqd-actions" style={{ marginTop: 14 }}>
        <Button
          size="sm"
          variant="primary"
          {...disabledWhile(busy || !allAnswered, busy ? "Saving…" : "Answer all questions to record")}
          onClick={onSubmit}
        >
          Record {def.title.split("(")[0].trim()}
        </Button>
        <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function AssessmentsPanel({
  subject,
  assessments,
  busy,
  onRun,
}: {
  subject: { patientId?: string; prospectivePersonId?: string };
  assessments: AssessmentRecord[];
  busy: boolean;
  onRun: (action: () => Promise<unknown>) => void;
}) {
  const [activeInstrument, setActiveInstrument] = useState<AssessmentInstrumentType | null>(null);
  const [responses, setResponses] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const allFlags = assessments.flatMap((a) => a.flags || []);

  return (
    <div className="iqd-assessments-workspace">
      {allFlags.length > 0 ? (
        <div className="iqd-safety-alert" style={{ marginBottom: 16 }}>
          <Icon name="warning" filled />
          <div>
            <strong>Critical Safety Flag Detected:</strong>
            {allFlags.map((flag, idx) => (
              <div key={idx} className="iqd-safety-alert-item">{flag}</div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="iqd-assessments-history">
        <h4>Standardized Rating Scales on File</h4>
        {assessments.length === 0 ? (
          <p className="iqd-step-detail">No standardized clinical rating scales on file yet.</p>
        ) : (
          <ul className="iqd-notes-list">
            {assessments.map((a) => (
              <li key={a.id} className="iqd-note iqd-assessment-card">
                <div className="iqd-assessment-header">
                  <div>
                    <strong>{a.title}</strong>
                    <span className="iqd-note-meta">
                      Administered {a.administeredAt.slice(0, 10)} by {a.administeredBy}
                    </span>
                  </div>
                  <div className="iqd-assessment-badges">
                    <span className="iqd-score-badge">
                      Score: {a.totalScore} / {a.maxScore}
                    </span>
                    <StatusBadge
                      tone={
                        a.flags && a.flags.length > 0
                          ? "danger"
                          : a.severity.toLowerCase().includes("severe")
                          ? "danger"
                          : a.severity.toLowerCase().includes("moderate")
                          ? "warning"
                          : "success"
                      }
                      shape="pill"
                    >
                      {a.severity}
                    </StatusBadge>
                  </div>
                </div>

                {a.flags && a.flags.length > 0 ? (
                  <div className="iqd-assessment-card-flag">
                    <Icon name="error" size="sm" filled />
                    <span>{a.flags.join(" · ")}</span>
                  </div>
                ) : null}

                {a.notes ? <p className="iqd-step-detail">Notes: {a.notes}</p> : null}

                <div className="iqd-assessment-footer">
                  {a.reviewStatus === "reviewed" ? (
                    <span className="iqd-reviewed-tag">
                      <Icon name="check_circle" size="sm" filled /> Reviewed by {a.reviewedBy} ({a.reviewedAt?.slice(0, 10)})
                    </span>
                  ) : reviewingId === a.id ? (
                    <div className="iqd-inline-review">
                      <input
                        placeholder="Clinician review notes (optional)…"
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        {...disabledWhile(busy)}
                        onClick={() =>
                          void onRun(async () => {
                            await api.intake.action({
                              action: "review_assessment",
                              assessmentId: a.id,
                              notes: reviewNotes,
                            });
                            setReviewingId(null);
                            setReviewNotes("");
                          })
                        }
                      >
                        Confirm review
                      </Button>
                      <Button size="sm" variant="tertiary" onClick={() => setReviewingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => setReviewingId(a.id)}>
                      Review &amp; sign off…
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="iqd-administer-assessment" style={{ marginTop: 20 }}>
        <h4>Administer Standardized Rating Scale</h4>
        <div className="iqd-instrument-picker">
          <Button
            size="sm"
            variant={activeInstrument === "phq-9" ? "primary" : "secondary"}
            onClick={() => { setActiveInstrument("phq-9"); setResponses({}); setNotes(""); }}
          >
            PHQ-9 (Depression)
          </Button>
          <Button
            size="sm"
            variant={activeInstrument === "gad-7" ? "primary" : "secondary"}
            onClick={() => { setActiveInstrument("gad-7"); setResponses({}); setNotes(""); }}
          >
            GAD-7 (Anxiety)
          </Button>
          <Button
            size="sm"
            variant={activeInstrument === "asrs-v1.1" ? "primary" : "secondary"}
            onClick={() => { setActiveInstrument("asrs-v1.1"); setResponses({}); setNotes(""); }}
          >
            ASRS v1.1 (ADHD)
          </Button>
          <Button
            size="sm"
            variant={activeInstrument === "cssrs" ? "primary" : "secondary"}
            onClick={() => { setActiveInstrument("cssrs"); setResponses({}); setNotes(""); }}
          >
            C-SSRS (Suicide Screen)
          </Button>
        </div>

        {activeInstrument ? (
          <AssessmentQuestionnaireRunner
            instrumentKey={activeInstrument}
            responses={responses}
            notes={notes}
            busy={busy}
            onResponseChange={(qId, val) => setResponses((prev) => ({ ...prev, [qId]: val }))}
            onNotesChange={setNotes}
            onCancel={() => { setActiveInstrument(null); setResponses({}); setNotes(""); }}
            onSubmit={() =>
              void onRun(async () => {
                await api.intake.action({
                  action: "record_assessment",
                  ...subject,
                  instrument: activeInstrument,
                  responses,
                  notes,
                });
                setActiveInstrument(null);
                setResponses({});
                setNotes("");
              })
            }
          />
        ) : null}
      </div>
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
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateReloadKey, setTemplateReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setTemplateError(null);
    void (async () => {
      try {
        const res = await fetch("/api/intake/form-templates");
        const json = await res.json();
        if (!res.ok || json?.success === false) throw new Error("template request failed");
        if (!cancelled) {
          const found = (json.templates as Array<{ id: string; sections: Array<{ id: string; title: string; fields: FormField[] }> }>).find((t) => t.id === templateId);
          if (!found) {
            setTemplateError("This intake form template is unavailable.");
            return;
          }
          setSections(found.sections);
        }
      } catch {
        if (!cancelled) setTemplateError("The intake form template could not be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, templateReloadKey]);

  if (templateError) {
    return <InlineError message={templateError} onRetry={() => setTemplateReloadKey((value) => value + 1)} />;
  }
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
