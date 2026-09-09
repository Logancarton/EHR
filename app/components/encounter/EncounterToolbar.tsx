"use client";

import { builtInTemplates } from "../../lib/encounter-engine";
import type { EncounterSaveView } from "../../lib/encounter-save-lifecycle";

function savedLabel(value?: string) {
  if (!value) return "Saved";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Saved";
  return `Saved ${parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function EncounterToolbar({
  selectedTemplateId,
  onSelectTemplate,
  onSaveAsDefaultTemplate,
  onApplyTemplateDefaults,
  showPastNotes,
  onTogglePastNotes,
  pastNotesCount,
  psychotherapyMinutes,
  onPsychotherapyChange,
  isLocked,
  saveState,
  signedAt,
  onRetrySave,
  legacyRecoveryAvailable,
  onRecoverLegacyDraft,
  onCopyNote,
  onPrint,
  onOpenReviewModal,
}: {
  selectedTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  onSaveAsDefaultTemplate: () => void;
  onApplyTemplateDefaults: () => void;
  showPastNotes: boolean;
  onTogglePastNotes: () => void;
  pastNotesCount: number;
  psychotherapyMinutes: number;
  onPsychotherapyChange: (minutes: number) => void;
  isLocked: boolean;
  saveState: EncounterSaveView | null;
  signedAt?: string;
  onRetrySave: () => void;
  legacyRecoveryAvailable: boolean;
  onRecoverLegacyDraft: () => void;
  onCopyNote: () => void;
  onPrint: () => void;
  onOpenReviewModal: () => void;
}) {
  return (
    <header className="encounter-top-toolbar" aria-label="Encounter Controls">
      <div className="toolbar-left-group">
        <div className="template-picker-group">
          <span className="picker-label">NOTE TEMPLATE:</span>
          <select
            value={selectedTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="template-select-dropdown"
            disabled={isLocked}
            aria-label="Select Note Preference Template"
          >
            {builtInTemplates.map((tmpl) => (
              <option key={tmpl.id} value={tmpl.id}>
                {tmpl.name} ({tmpl.badge})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="template-save-default-btn"
            onClick={onSaveAsDefaultTemplate}
            title="Save this template as your permanent starting default for all new encounters"
          >
            ★ Save as Default
          </button>
          <button
            type="button"
            className="template-apply-defaults-btn"
            onClick={onApplyTemplateDefaults}
            disabled={isLocked}
            title="Re-apply template default phrases and MSE"
          >
            ↺ Defaults
          </button>
        </div>

        <button
          type="button"
          className={`toolbar-history-toggle ${showPastNotes ? "active" : ""}`}
          onClick={onTogglePastNotes}
          title="Toggle search drawer for longitudinal past notes"
        >
          📚 Past Notes ({pastNotesCount})
        </button>
      </div>

      <div className="toolbar-psychotherapy-stepper">
        <span className="stepper-label">PSYCHOTHERAPY TIME:</span>
        <div className="stepper-controls">
          <button
            type="button"
            className="stepper-btn"
            onClick={() => onPsychotherapyChange(psychotherapyMinutes - 5)}
            disabled={isLocked || psychotherapyMinutes <= 0}
          >
            −5m
          </button>
          <span className="stepper-value"><strong>{psychotherapyMinutes}</strong> min</span>
          <button
            type="button"
            className="stepper-btn"
            onClick={() => onPsychotherapyChange(psychotherapyMinutes + 5)}
            disabled={isLocked || psychotherapyMinutes >= 120}
          >
            +5m
          </button>
        </div>

        <div className="stepper-quick-pills">
          <button type="button" className={`pill-btn ${psychotherapyMinutes === 0 ? "active" : ""}`} onClick={() => onPsychotherapyChange(0)} disabled={isLocked}>0m</button>
          <button type="button" className={`pill-btn ${psychotherapyMinutes === 16 ? "active" : ""}`} onClick={() => onPsychotherapyChange(16)} disabled={isLocked} title="Minimum time for +90833 (16-37 min)">16m (+90833)</button>
          <button type="button" className={`pill-btn ${psychotherapyMinutes === 30 ? "active" : ""}`} onClick={() => onPsychotherapyChange(30)} disabled={isLocked} title="Standard 30 min add-on (+90833)">30m (+90833)</button>
          <button type="button" className={`pill-btn ${psychotherapyMinutes === 45 ? "active" : ""}`} onClick={() => onPsychotherapyChange(45)} disabled={isLocked} title="45 min add-on (+90836)">45m (+90836)</button>
        </div>
      </div>

      <div className="toolbar-right-actions">
        <div className="encounter-status-tag" aria-live="polite" data-save-status={isLocked ? "signed" : saveState?.status || "unsaved"}>
          {isLocked ? (
            <span className="status-locked-pill">🔒 Signed · {signedAt}</span>
          ) : saveState?.status === "saving" ? (
            <span className="status-draft-pill">↻ Saving…</span>
          ) : saveState?.status === "saved" ? (
            <span className="status-draft-pill">✓ {savedLabel(saveState.savedAt)}</span>
          ) : saveState?.status === "failed" ? (
            <span className="status-draft-pill" title={saveState.error || "Server save failed"}>
              ⚠ Save failed
              <button type="button" onClick={onRetrySave} className="save-retry-button">Retry</button>
            </span>
          ) : (
            <span className="status-draft-pill">• Unsaved changes</span>
          )}
        </div>

        {legacyRecoveryAvailable && !isLocked && (
          <button
            type="button"
            className="btn-toolbar-action"
            onClick={onRecoverLegacyDraft}
            title="Explicitly recover an older unscoped browser draft into the current authenticated clinician session"
          >
            Recover local draft
          </button>
        )}

        <button type="button" className="btn-toolbar-action" onClick={onCopyNote} title="Copy formatted clinical note to clipboard">📋 Copy Note</button>
        <button type="button" className="btn-toolbar-action" onClick={onPrint} title="Print or export clinical document">🖶 Print</button>
        <button type="button" className={`btn-toolbar-primary ${!isLocked ? "provider-only-sign-action" : ""}`} onClick={onOpenReviewModal}>
          {isLocked ? "View Signed Record" : "🔒 Review & Sign"}
        </button>
      </div>
    </header>
  );
}
