"use client";

import { type Patient } from "../../domain/patient";
import {
  type EncounterState,
  type CodingRecommendation,
} from "../../lib/encounter-engine";

export default function EncounterSignModal({
  isOpen,
  onClose,
  patient,
  draft,
  codingRec,
  psychotherapyMinutes,
  isLocked,
  attestationChecked,
  onToggleAttestation,
  onSignNote,
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  draft: EncounterState;
  codingRec: CodingRecommendation;
  psychotherapyMinutes: number;
  isLocked: boolean;
  attestationChecked: boolean;
  onToggleAttestation: (checked: boolean) => void;
  onSignNote: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="review-sign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Legal Medical Record Verification</span>
            <h3>{isLocked ? "Signed Psychiatric Record" : "Review & Sign Psychiatric Encounter Note"}</h3>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="note-preview-document">
          <div className="note-doc-meta">
            <div>
              <strong>Patient:</strong> {patient.name} · <strong>MRN:</strong> {patient.mrn} · <strong>DOB:</strong> {patient.dob} ({patient.age}y)
            </div>
            <div>
              <strong>Date of Service:</strong> Sep 4, 2026 · <strong>Provider:</strong> Dr. Logan Carton, MD (NPI: 1948201948)
            </div>
            <div>
              <strong>Visit Type:</strong> {draft.visitType} · <strong>Calculated Billing:</strong> {codingRec.primaryCode} {codingRec.addonCodes.join(" ")}
            </div>
          </div>

          <div className="note-doc-section">
            <h4>CHIEF COMPLAINT</h4>
            <p>{draft.chiefComplaint || "Routine psychiatric follow-up."}</p>
          </div>

          <div className="note-doc-section">
            <h4>INTERVAL HISTORY (HPI)</h4>
            <p>{draft.intervalHistory || "None documented."}</p>
          </div>

          {(draft.treatmentResponse || draft.sideEffects) && (
            <div className="note-doc-section">
              <h4>TREATMENT RESPONSE &amp; TOLERABILITY</h4>
              <p><strong>Response:</strong> {draft.treatmentResponse || "None."}</p>
              <p><strong>Side Effects:</strong> {draft.sideEffects || "None."}</p>
            </div>
          )}

          <div className="note-doc-section">
            <h4>MENTAL STATUS EXAMINATION</h4>
            <ul className="mse-doc-list">
              <li><strong>Appearance:</strong> {draft.mse.appearance}</li>
              <li><strong>Behavior:</strong> {draft.mse.behavior}</li>
              <li><strong>Speech:</strong> {draft.mse.speech}</li>
              <li><strong>Mood &amp; Affect:</strong> {draft.mse.moodAffect}</li>
              <li><strong>Thought Process:</strong> {draft.mse.thoughtProcess}</li>
              <li><strong>Thought Content:</strong> {draft.mse.thoughtContent}</li>
              <li><strong>Cognition:</strong> {draft.mse.cognition}</li>
              <li><strong>Insight &amp; Judgment:</strong> {draft.mse.insightJudgment}</li>
            </ul>
          </div>

          <div className="note-doc-section">
            <h4>CLINICAL ASSESSMENT &amp; MEDICAL DECISION MAKING</h4>
            <p style={{ whiteSpace: "pre-line" }}>{draft.assessment || "Clinical assessment pending."}</p>
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--m3-text-secondary)" }}>
              MDM Level: {codingRec.mdmLevel.toUpperCase()} — {codingRec.mdmReasoning}
            </div>
          </div>

          <div className="note-doc-section">
            <h4>TREATMENT PLAN &amp; ORDERS</h4>
            <p style={{ whiteSpace: "pre-line" }}>{draft.plan || "Plan as documented."}</p>
            {psychotherapyMinutes >= 16 && (
              <p style={{ marginTop: "6px", fontStyle: "italic", fontSize: "12px" }}>
                Psychotherapy: {psychotherapyMinutes} minutes of interactive psychotherapy provided concurrently.
              </p>
            )}
          </div>
        </div>

        {!isLocked ? (
          <div className="review-sign-footer">
            <label className="attestation-checkbox-label">
              <input
                type="checkbox"
                checked={attestationChecked}
                onChange={(e) => onToggleAttestation(e.target.checked)}
              />
              <span>
                I attest that I conducted this psychiatric encounter, reviewed the clinical documentation, and confirm the accuracy of the assigned E/M code ({codingRec.primaryCode}) and psychotherapy services.
              </span>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={onClose}
              >
                Back to Edit
              </button>
              <button
                type="button"
                className="sign-confirm-btn"
                onClick={onSignNote}
                disabled={!attestationChecked}
              >
                🔒 Sign Legal Record as Dr. Logan Carton, MD
              </button>
            </div>
          </div>
        ) : (
          <div className="review-sign-footer">
            <div className="signed-stamp-box">
              <span>✓ Electronically Signed by Dr. Logan Carton, MD</span>
              <small>{draft.signedAt} · NPI 1948201948 · Audit Verified</small>
            </div>
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
