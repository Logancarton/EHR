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
}: {
  patientId: string;
  patientName: string;
  onClose: () => void;
  /** Called with the new thread once the request is recorded. */
  onCreated: (threadId: string) => void;
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

        {link ? (
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
            {link ? "Done" : "Cancel"}
          </Button>
          {link ? null : selectedCount === 0 ? (
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
