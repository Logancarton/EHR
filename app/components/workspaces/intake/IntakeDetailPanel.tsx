"use client";

import { useCallback, useEffect, useState } from "react";
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
  type FormField,
  type GuardianSituation,
  type IntakeDispositionReason,
  type IntakeReadinessStep,
  type IntakeStepId,
} from "../../../domain/intake";
import type { IntakeDetail } from "../../../server/services/intake-service";

const ADMIN_STEPS = new Set<IntakeStepId>(["identity", "contact", "coverage"]);

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

export default function IntakeDetailPanel({
  patientId,
  onClose,
  onChanged,
  onOpenChart,
}: {
  patientId: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenChart: (patientId: string) => void;
}) {
  const { user } = useAuthSession();
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [activePanel, setActivePanel] = useState<IntakeStepId | null>(null);
  const [showAdminDrawer, setShowAdminDrawer] = useState(false);
  const [showDisposeDialog, setShowDisposeDialog] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteKind, setNoteKind] = useState<"note" | "outreach">("note");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.intake.detail(patientId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This intake could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Switching the selected queue row reuses this mounted panel rather than
  // remounting it, so any panel-local UI state (an open inline editor, a
  // half-typed note, the dispose dialog) must not carry over and silently
  // attach itself to a different patient.
  useEffect(() => {
    setActivePanel(null);
    setShowAdminDrawer(false);
    setShowDisposeDialog(false);
    setNoteText("");
    setError(null);
  }, [patientId]);

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
    if (ADMIN_STEPS.has(step.id)) {
      setShowAdminDrawer(true);
      return;
    }
    if (step.id === "government_id") {
      void navigateToPatientLocation(patientId, "Documents");
      return;
    }
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
  const until = daysUntil(appointment.date);
  const ready = isReadyToConfirm(steps);
  const isMinor = steps.find((s) => s.id === "guardian")?.state !== "not_available";

  return (
    <div className="intake-detail-pane">
      <div className="iqd-header">
        <div className="iqd-header-top">
          <button type="button" className="iq-card-name" onClick={() => onOpenChart(patientId)} title="Open full chart">
            {appointment.patientName}
          </button>
          <Button variant="icon" size="sm" icon="close" aria-label="Close" onClick={onClose} />
        </div>
        <StatusBadge tone={ready ? "success" : "info"}>{INTAKE_STAGE_LABELS[stage]}</StatusBadge>
        <div className="iqd-note-meta">
          {appointment.date} at {appointment.time} · {until === 0 ? "Today" : until > 0 ? `${until} day${until === 1 ? "" : "s"} away` : `${Math.abs(until)} day${Math.abs(until) === 1 ? "" : "s"} past`}
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
          <Button size="sm" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "reactivate", episodeId: episode.id, patientId }))}>
            Reactivate
          </Button>
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
                <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "unassign", episodeId: episode.id, patientId }))}>
                  Unassign
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                {...disabledWhile(busy)}
                onClick={() => run(() => api.intake.action({ action: "assign", episodeId: episode.id, patientId, staffId: user.userId, staffName: user.displayName }))}
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
              if (value !== episode.followUpAt) void run(() => api.intake.action({ action: "set_follow_up", episodeId: episode.id, patientId, followUpAt: value }));
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
              onChange={(e) => void run(() => api.intake.action({ action: "set_guardian_situation", episodeId: episode.id, patientId, situation: e.target.value as GuardianSituation }))}
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
              <Button size="sm" variant="tertiary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "reopen_staff_review", episodeId: episode.id, patientId }))}>
                Reopen
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="secondary" {...disabledWhile(busy)} onClick={() => run(() => api.intake.action({ action: "resolve_staff_review", episodeId: episode.id, patientId }))}>
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
              await api.intake.action({ action: "add_note", episodeId: episode.id, patientId, body: noteText, kind: noteKind });
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
          <Button
            variant="primary"
            {...disabledWhile(busy)}
            onClick={() => run(() => api.appointments.updateStatus(appointment.id, "confirmed"))}
            title={ready ? undefined : "Not every requirement is complete yet, but staff may still confirm."}
          >
            Confirm appointment
          </Button>
          <Button variant="destructive" {...disabledWhile(busy)} onClick={() => setShowDisposeDialog(true)}>
            Archive / remove
          </Button>
        </div>
        {showDisposeDialog ? (
          <DisposeForm
            busy={busy}
            onCancel={() => setShowDisposeDialog(false)}
            onSubmit={(reason, note) =>
              run(async () => {
                await api.intake.action({ action: "dispose", episodeId: episode.id, patientId, reason, note });
                setShowDisposeDialog(false);
              })
            }
          />
        ) : null}
      </div>

      {showAdminDrawer ? (
        <PatientInformationDrawer
          patientId={patientId}
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
}: {
  step: IntakeReadinessStep;
  detail: IntakeDetail;
  busy: boolean;
  isMinor: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const { administrative, consents, forms, eligibility, payment } = detail;
  const patientId = administrative.patientId;

  if (step.id === "consents") {
    return (
      <ConsentsPanel
        required={consents.required}
        signed={consents.signed}
        defaultSignerName={administrative.identity.legalName}
        isMinor={isMinor}
        busy={busy}
        onSign={(templateId, signerName, signerRelationship) =>
          onRun(() => api.intake.action({ action: "record_consent_signature", patientId, templateId, signerName, signerRelationship }))
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
          onRun(() => api.intake.action({ action: "save_form_submission", patientId, templateId, submissionId, answers, status }))
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
        onSubmit={(result, note) =>
          onRun(() => api.intake.action({ action: "record_eligibility_check", patientId, coveragePolicyId: policy.id, result, note }))
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
          onRun(() => api.intake.action({ action: "record_payment_readiness", patientId, status, brand, lastFour, waiverReason }))
        }
      />
    );
  }

  void onClose;
  return null;
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
  onSubmit: (result: "active" | "inactive" | "needs_review" | "failed" | "uncertain", note: string) => Promise<void>;
}) {
  const [result, setResult] = useState<"active" | "inactive" | "needs_review" | "failed" | "uncertain">("active");
  const [note, setNote] = useState("");
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
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Copay, benefit detail, or who you spoke with" />
      </div>
      <Button size="sm" {...disabledWhile(busy)} onClick={() => void onSubmit(result, note)}>Record staff-verified eligibility</Button>
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
