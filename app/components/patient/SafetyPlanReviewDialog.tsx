"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api-client";
import {
  SAFETY_PLAN_SECTIONS,
  parseSafetyPlanText,
  type SafetyPlanAnswers,
  type SafetyPlanSectionId,
} from "../../domain/patient-form-requests";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

/**
 * Goes over a patient's own safety-plan draft with them and finalizes it.
 *
 * Opens on the patient's words, section by section, for the clinician to edit
 * together with the patient. Finalizing files a new reviewed plan; the draft is
 * kept and marked superseded by it (D-129).
 */
export default function SafetyPlanReviewDialog({
  patientId,
  patientName,
  draftDocumentId,
  draftText,
  onClose,
  onFinalized,
}: {
  patientId: string;
  patientName: string;
  draftDocumentId: string;
  draftText: string;
  onClose: () => void;
  onFinalized: (documentId: string) => void;
}) {
  const [answers, setAnswers] = useState<SafetyPlanAnswers>(() => parseSafetyPlanText(draftText));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const filled = SAFETY_PLAN_SECTIONS.some((section) => answers[section.id]?.trim());

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function finalize() {
    setSaving(true);
    setError("");
    try {
      const result = await api.safetyPlans.finalize(patientId, draftDocumentId, answers);
      onFinalized(result.documentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The safety plan could not be finalized.");
      setSaving(false);
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={() => (saving ? undefined : onClose())}>
      <div
        className="walkin-modal form-request-dialog safety-plan-review"
        role="dialog"
        aria-modal="true"
        aria-label={`Review safety plan for ${patientName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3><Icon name="health_and_safety" /> Review & finalize safety plan</h3>
            <p className="form-request-subtitle">
              {patientName}&apos;s own draft. Go over each section together and edit as you agree; the draft stays in Documents.
            </p>
          </div>
          <Button className="modal-close" variant="icon" icon="close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal-body form-request-result">
          {SAFETY_PLAN_SECTIONS.map((section, index) => (
            <label key={section.id} className="safety-plan-review-field">
              <span>{index + 1}. {section.title}</span>
              <small>{section.prompt}</small>
              <textarea
                rows={3}
                value={answers[section.id] ?? ""}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [section.id as SafetyPlanSectionId]: event.target.value }))
                }
              />
            </label>
          ))}
          <p className="form-request-hint">988 and 911 are added to every plan.</p>
          {error ? <p className="form-request-error" role="alert">{error}</p> : null}
        </div>
        <div className="modal-actions">
          <Button className="modal-cancel-btn" onClick={onClose}>Cancel</Button>
          {filled ? (
            <Button className="modal-submit-btn" variant="primary" loading={saving} loadingLabel="Finalizing…" onClick={() => void finalize()}>
              Finalize plan
            </Button>
          ) : (
            <Button className="modal-submit-btn" variant="primary" disabled disabledReason="Fill in at least one section.">
              Finalize plan
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
