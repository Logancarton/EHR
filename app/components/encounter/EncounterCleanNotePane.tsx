"use client";

import { type Patient } from "../../domain/patient";
import {
  type EncounterState,
  type CodingRecommendation,
} from "../../lib/encounter-engine";

export default function EncounterCleanNotePane({
  patient,
  draft,
  codingRec,
  psychotherapyMinutes,
  isLocked,
  onCopyNote,
  onPrint,
  onOpenReviewModal,
}: {
  patient: Patient;
  draft: EncounterState;
  codingRec: CodingRecommendation;
  psychotherapyMinutes: number;
  isLocked: boolean;
  onCopyNote: () => void;
  onPrint: () => void;
  onOpenReviewModal: () => void;
}) {
  return (
    <section className="tri-column clean-note-column" aria-label="Clean Note Document Preview">
      <div className="pane-card-header clean-note-header">
        <div className="header-badge-title">
          <span className="doc-icon">📄</span>
          <div>
            <h3>Clean Note Document</h3>
            <small>Publication-grade formatted record</small>
          </div>
        </div>

        <div className="clean-note-quick-actions">
          <button
            type="button"
            className="btn-clean-copy"
            onClick={onCopyNote}
            title="Copy entire formatted clinical note"
          >
            📋 Copy
          </button>
          <button
            type="button"
            className="btn-clean-print"
            onClick={onPrint}
            title="Print preview"
          >
            🖶
          </button>
        </div>
      </div>

      {/* Publication Document Sheet */}
      <div className="clean-note-sheet-scroll">
        <div className="clean-note-paper">
          {/* Clinic Letterhead */}
          <div className="clean-paper-letterhead">
            <div className="letterhead-clinic">
              <h4>ANTIGRAVITY PSYCHIATRIC MEDICINE</h4>
              <p>Outpatient Clinical Evaluation &amp; Management Note</p>
            </div>
            <div className="letterhead-seal">★ VERIFIED</div>
          </div>

          {/* Patient Demographics & DOS */}
          <div className="clean-patient-banner">
            <div className="banner-col">
              <div><strong>Patient:</strong> {patient.name}</div>
              <div><strong>MRN:</strong> {patient.mrn} · <strong>DOB:</strong> {patient.dob} ({patient.age}y)</div>
            </div>
            <div className="banner-col">
              <div><strong>Date of Service:</strong> Sep 4, 2026</div>
              <div><strong>Provider:</strong> Dr. Logan Carton, MD (NPI: 1948201948)</div>
            </div>
          </div>

          {/* Live Billing Codes Stamp */}
          <div className="clean-billing-stamp">
            <div className="stamp-primary">
              <span className="cpt-tag">{codingRec.primaryCode}</span>
              <span>{codingRec.primaryTitle.split("·")[1]?.trim() || "Established Patient Visit"}</span>
            </div>
            {codingRec.addonCodes.map((code) => (
              <div key={code} className="stamp-addon">
                <span className="addon-tag">{code}</span>
                <span>Psychotherapy Add-on ({psychotherapyMinutes} min)</span>
              </div>
            ))}
          </div>

          {/* Formatted Clinical Sections */}
          <div className="clean-doc-section">
            <h5>CHIEF COMPLAINT</h5>
            <p className="clean-doc-text">{draft.chiefComplaint || "Routine psychiatric follow-up."}</p>
          </div>

          <div className="clean-doc-section">
            <h5>INTERVAL HISTORY &amp; CLINICAL TRAJECTORY</h5>
            <p className="clean-doc-text">{draft.intervalHistory || "None documented."}</p>
          </div>

          {(draft.treatmentResponse || draft.sideEffects) && (
            <div className="clean-doc-section">
              <h5>TREATMENT RESPONSE &amp; TOLERABILITY</h5>
              <div className="clean-two-col-grid">
                <div>
                  <strong>Therapeutic Response:</strong>
                  <p className="clean-doc-text">{draft.treatmentResponse || "None reported."}</p>
                </div>
                <div>
                  <strong>Adverse Effects / Vitals:</strong>
                  <p className="clean-doc-text">{draft.sideEffects || "Denies side effects."}</p>
                </div>
              </div>
            </div>
          )}

          <div className="clean-doc-section">
            <h5>MENTAL STATUS EXAMINATION</h5>
            <div className="clean-mse-table">
              <div className="mse-row">
                <span className="mse-col-title">Appearance:</span>
                <span className="mse-col-val">{draft.mse.appearance}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Behavior &amp; Rapport:</span>
                <span className="mse-col-val">{draft.mse.behavior}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Speech:</span>
                <span className="mse-col-val">{draft.mse.speech}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Mood &amp; Affect:</span>
                <span className="mse-col-val">{draft.mse.moodAffect}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Thought Process:</span>
                <span className="mse-col-val">{draft.mse.thoughtProcess}</span>
              </div>
              <div className="mse-row highlight-safety">
                <span className="mse-col-title">Thought Content (SI/HI):</span>
                <span className="mse-col-val">{draft.mse.thoughtContent}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Cognition:</span>
                <span className="mse-col-val">{draft.mse.cognition}</span>
              </div>
              <div className="mse-row">
                <span className="mse-col-title">Insight &amp; Judgment:</span>
                <span className="mse-col-val">{draft.mse.insightJudgment}</span>
              </div>
            </div>
          </div>

          <div className="clean-doc-section">
            <h5>CLINICAL ASSESSMENT &amp; MEDICAL DECISION MAKING</h5>
            <p className="clean-doc-text pre-wrap">{draft.assessment || "Clinical assessment pending."}</p>
            <div className="clean-mdm-box">
              <strong>Medical Decision Making (MDM): Level {codingRec.mdmLevel.toUpperCase()}</strong>
              <p>{codingRec.mdmReasoning}</p>
            </div>
          </div>

          <div className="clean-doc-section">
            <h5>TREATMENT PLAN &amp; CLINICAL ORDERS</h5>
            <p className="clean-doc-text pre-wrap">{draft.plan || "Plan as documented."}</p>
            {psychotherapyMinutes >= 16 && (
              <div className="clean-psychotherapy-box">
                <strong>Interactive Psychotherapy Service Documented:</strong>
                <p>{psychotherapyMinutes} minutes of interactive psychotherapy provided in conjunction with E/M service.</p>
              </div>
            )}
          </div>

          {/* Signature Block */}
          <div className="clean-doc-signature">
            {isLocked ? (
              <div className="signature-locked-box">
                <div className="sig-icon">✓</div>
                <div>
                  <strong>Electronically Signed by {draft.signedBy}</strong>
                  <p>NPI: {draft.npi} · Date: {draft.signedAt} · Legal Record Sealed</p>
                </div>
              </div>
            ) : (
              <div className="signature-draft-box">
                <span className="draft-watermark">PRE-SIGNATURE CLINICAL DRAFT</span>
                <button
                  type="button"
                  className="btn-sign-from-note"
                  onClick={onOpenReviewModal}
                >
                  Review &amp; Sign Note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
