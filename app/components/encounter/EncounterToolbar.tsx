"use client";

import { builtInTemplates } from "../../lib/encounter-engine";

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
  lastAutosavedAt,
  signedAt,
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
  lastAutosavedAt?: string;
  signedAt?: string;
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

      {/* PSYCHOTHERAPY TIME STEPPER & CODING ACCELERATOR */}
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
          <span className="stepper-value">
            <strong>{psychotherapyMinutes}</strong> min
          </span>
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
          <button
            type="button"
            className={`pill-btn ${psychotherapyMinutes === 0 ? "active" : ""}`}
            onClick={() => onPsychotherapyChange(0)}
            disabled={isLocked}
          >
            0m
          </button>
          <button
            type="button"
            className={`pill-btn ${psychotherapyMinutes === 16 ? "active" : ""}`}
            onClick={() => onPsychotherapyChange(16)}
            disabled={isLocked}
            title="Minimum time for +90833 (16-37 min)"
          >
            16m (+90833)
          </button>
          <button
            type="button"
            className={`pill-btn ${psychotherapyMinutes === 30 ? "active" : ""}`}
            onClick={() => onPsychotherapyChange(30)}
            disabled={isLocked}
            title="Standard 30 min add-on (+90833)"
          >
            30m (+90833)
          </button>
          <button
            type="button"
            className={`pill-btn ${psychotherapyMinutes === 45 ? "active" : ""}`}
            onClick={() => onPsychotherapyChange(45)}
            disabled={isLocked}
            title="45 min add-on (+90836)"
          >
            45m (+90836)
          </button>
        </div>
      </div>

      {/* TOP RIGHT: STATUS & PRIMARY ACTIONS */}
      <div className="toolbar-right-actions">
        <div className="encounter-status-tag">
          {isLocked ? (
            <span className="status-locked-pill">🔒 Signed · {signedAt}</span>
          ) : (
            <span className="status-draft-pill">✓ Autosaved {lastAutosavedAt}</span>
          )}
        </div>

        <button
          type="button"
          className="btn-toolbar-action"
          onClick={onCopyNote}
          title="Copy formatted clinical note to clipboard"
        >
          📋 Copy Note
        </button>
        <button
          type="button"
          className="btn-toolbar-action"
          onClick={onPrint}
          title="Print or export clinical document"
        >
          🖶 Print
        </button>
        <button
          type="button"
          className="btn-toolbar-primary"
          onClick={onOpenReviewModal}
        >
          {isLocked ? "View Signed Record" : "🔒 Review & Sign"}
        </button>
      </div>
    </header>
  );
}
