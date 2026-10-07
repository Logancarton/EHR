"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api-client";
import {
  DEFAULT_FORM_REQUEST_TTL_DAYS,
  SAFETY_PLAN_LABEL,
  type RemoteAssessmentInstrument,
  type RequestedForm,
} from "../../domain/patient-form-requests";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

type Options = Awaited<ReturnType<typeof api.patientFormRequests.options>>;

const STATUS_LABELS: Record<Options["requests"][number]["status"], string> = {
  pending: "Not opened yet",
  accessed: "Opened, not submitted",
  completed: "Completed",
  revoked: "Revoked",
  expired: "Expired",
};

/**
 * Asks the patient to complete rating scales and sign consents before a visit.
 *
 * Nothing is delivered by the system: no portal, SMS or email transport is
 * connected. The request is recorded in a new thread and the patient's link is
 * shown here exactly once, for staff to pass on themselves. Closing the dialog
 * discards it; only its hash is kept on the server.
 */
export default function FormRequestDialog({
  patientId,
  patientName,
  onClose,
  onCreated,
  onOpenThread,
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  /** Called with the new thread once the request is recorded. */
  onCreated: (threadId: string) => void;
  /** Opens a sent request's thread. */
  onOpenThread?: (threadId: string) => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [loadError, setLoadError] = useState("");
  const [instruments, setInstruments] = useState<RemoteAssessmentInstrument[]>([]);
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [safetyPlan, setSafetyPlan] = useState(false);
  const [ttlDays, setTtlDays] = useState(DEFAULT_FORM_REQUEST_TTL_DAYS);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<"new" | "sent">("new");
  const [revoking, setRevoking] = useState<string | null>(null);

  const reload = () =>
    api.patientFormRequests.options(patientId).then(setOptions).catch(() => undefined);

  async function revoke(invitationId: string) {
    setRevoking(invitationId);
    setError("");
    try {
      await api.patientFormRequests.revoke(patientId, invitationId);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The link could not be revoked.");
    } finally {
      setRevoking(null);
    }
  }

  useEffect(() => {
    let current = true;
    api.patientFormRequests
      .options(patientId)
      .then((loaded) => {
        if (current) setOptions(loaded);
      })
      .catch((cause) => {
        if (current) setLoadError(cause instanceof Error ? cause.message : "The forms could not be loaded.");
      });
    return () => {
      current = false;
    };
  }, [patientId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const selectedCount = instruments.length + templateIds.length + (safetyPlan ? 1 : 0);

  async function submit() {
    if (selectedCount === 0 || submitting) return;
    setSubmitting(true);
    setError("");
    const items: RequestedForm[] = [
      ...instruments.map((instrument) => ({ kind: "assessment" as const, instrument })),
      ...templateIds.map((templateId) => ({ kind: "consent" as const, templateId })),
      ...(safetyPlan ? [{ kind: "safety-plan" as const }] : []),
    ];
    try {
      const result = await api.patientFormRequests.create(patientId, { items, ttlDays, note: note.trim() || undefined });
      setLink(new URL(result.linkUrl, window.location.origin).toString());
      onCreated(result.threadId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The request could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copy failed. Select the link and copy it by hand.");
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="walkin-modal form-request-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Request forms from ${patientName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3><Icon name="assignment" /> Request forms</h3>
            <p className="form-request-subtitle">
              For {patientName} to complete before the visit · the link is not sent by Clinical Bond; no portal, SMS or email is connected
            </p>
          </div>
          <Button className="modal-close" variant="icon" icon="close" aria-label="Close" onClick={onClose} />
        </div>

        {!link ? (
          <div className="form-request-tabs" role="tablist" aria-label="Form requests">
            <button type="button" role="tab" aria-selected={view === "new"} className={view === "new" ? "active" : ""} onClick={() => setView("new")}>
              New request
            </button>
            <button type="button" role="tab" aria-selected={view === "sent"} className={view === "sent" ? "active" : ""} onClick={() => setView("sent")}>
              Sent{options ? ` (${options.requests.filter((r) => r.status === "pending" || r.status === "accessed").length} open)` : ""}
            </button>
          </div>
        ) : null}

        {!link && view === "sent" ? (
          <div className="modal-body form-request-result">
            {!options ? (
              <p className="form-request-hint">Loading requests…</p>
            ) : options.requests.length === 0 ? (
              <p className="form-request-hint">No forms have been requested from this chart.</p>
            ) : (
              <ul className="form-request-sent">
                {options.requests.map((request) => {
                  const open = request.status === "pending" || request.status === "accessed";
                  return (
                    <li key={request.id}>
                      <div>
                        <strong>{request.titles.join(", ")}</strong>
                        <small>
                          {STATUS_LABELS[request.status]} · sent {request.createdAt.slice(0, 10)} by {request.createdByName}
                          {open ? ` · expires ${request.expiresAt.slice(0, 10)}` : ""}
                          {request.completedAt ? ` · completed ${request.completedAt.slice(0, 10)}` : ""}
                        </small>
                      </div>
                      <div className="form-request-sent-actions">
                        {request.threadId && onOpenThread ? (
                          <Button size="sm" onClick={() => { onOpenThread(request.threadId!); onClose(); }}>Thread</Button>
                        ) : null}
                        {open ? (
                          <Button size="sm" loading={revoking === request.id} loadingLabel="Revoking…" onClick={() => void revoke(request.id)}>
                            Revoke
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? <p className="form-request-error" role="alert">{error}</p> : null}
          </div>
        ) : link ? (
          <div className="modal-body form-request-result">
            <p>
              <strong>Recorded in a new thread.</strong> Give this link to {patientName} by your own text or email. It is
              shown only now; closing this window discards it. The patient confirms their date of birth before the forms open.
            </p>
            <div className="form-request-link-row">
              <input
                className="form-request-link"
                readOnly
                value={link}
                aria-label="Patient form link"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="primary" icon={copied ? "check" : "content_copy"} onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
            {error ? <p className="form-request-error" role="alert">{error}</p> : null}
            <p className="form-request-hint">
              Answers come back to that thread, and scores go to the chart&apos;s rating-scale history. A positive PHQ-9
              item 9 marks the thread urgent.
            </p>
          </div>
        ) : (
          <div className="modal-body">
            {loadError ? (
              <p className="form-request-error" role="alert">{loadError}</p>
            ) : !options ? (
              <p className="form-request-hint">Loading forms…</p>
            ) : (
              <>
                <fieldset className="form-request-group">
                  <legend>Rating scales</legend>
                  {options.assessments.map((option) => (
                    <label key={option.instrument} className="form-request-option">
                      <input
                        type="checkbox"
                        checked={instruments.includes(option.instrument)}
                        onChange={() => setInstruments((list) => toggle(list, option.instrument))}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <p className="form-request-hint">C-SSRS is clinician-administered and stays in the visit.</p>
                </fieldset>

                <fieldset className="form-request-group">
                  <legend>Plans</legend>
                  <label className="form-request-option">
                    <input type="checkbox" checked={safetyPlan} onChange={() => setSafetyPlan((value) => !value)} />
                    <span>{SAFETY_PLAN_LABEL}</span>
                  </label>
                  <p className="form-request-hint">Filed in Documents as the patient&apos;s draft, to go over together.</p>
                </fieldset>

                <fieldset className="form-request-group">
                  <legend>Consents to sign</legend>
                  {options.consents.length === 0 ? (
                    <p className="form-request-hint">No active consent templates.</p>
                  ) : (
                    options.consents.map((option) => (
                      <label key={option.templateId} className="form-request-option">
                        <input
                          type="checkbox"
                          checked={templateIds.includes(option.templateId)}
                          onChange={() => setTemplateIds((list) => toggle(list, option.templateId))}
                        />
                        <span>{option.title}</span>
                      </label>
                    ))
                  )}
                </fieldset>

                <div className="form-request-fields">
                  <label>
                    <span>Link expires after</span>
                    <select value={ttlDays} onChange={(event) => setTtlDays(Number(event.target.value))}>
                      <option value={3}>3 days</option>
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={30}>30 days</option>
                    </select>
                  </label>
                  <label>
                    <span>Note in the thread (optional)</span>
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="e.g. Please complete before Thursday's visit."
                    />
                  </label>
                </div>
                {error ? <p className="form-request-error" role="alert">{error}</p> : null}
              </>
            )}
          </div>
        )}

        <div className="modal-actions">
          <Button className="modal-cancel-btn" onClick={onClose}>
            {link || view === "sent" ? "Done" : "Cancel"}
          </Button>
          {link || view === "sent" ? null : selectedCount === 0 ? (
            <Button className="modal-submit-btn" variant="primary" disabled disabledReason="Choose at least one form.">
              Create link
            </Button>
          ) : (
            <Button
              className="modal-submit-btn"
              variant="primary"
              loading={submitting}
              loadingLabel="Recording…"
              onClick={() => void submit()}
            >
              Create link ({selectedCount})
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
