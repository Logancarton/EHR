"use client";

import {
  type EncounterState,
  type NoteTemplate,
} from "../../lib/encounter-engine";

type FieldName = "chiefComplaint" | "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan";

export default function EncounterTemplatePane({
  draft,
  onUpdateDraft,
  activeTemplate,
  isLocked,
  mseOpen,
  onToggleMseOpen,
  onApplyMsePreset,
  micListening,
  activeMicField,
  onToggleLiveMic,
  toggleChip,
  isChipActive,
}: {
  draft: EncounterState;
  onUpdateDraft: (updater: (prev: EncounterState) => EncounterState) => void;
  activeTemplate: NoteTemplate;
  isLocked: boolean;
  mseOpen: boolean;
  onToggleMseOpen: () => void;
  onApplyMsePreset: (preset: "normal" | "anxious" | "depressed" | "hypomanic") => void;
  micListening: boolean;
  activeMicField: string;
  onToggleLiveMic: (field: "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan") => void;
  toggleChip: (field: FieldName, text: string) => void;
  isChipActive: (field: FieldName, text: string) => boolean;
}) {
  return (
    <section className="tri-column template-column" aria-label="Interactive Clinical Template">
      <div className="pane-card-header template-header">
        <div className="header-badge-title">
          <span className="template-icon">📝</span>
          <div>
            <h3>Interactive Clinical Template</h3>
            <small>Click chips to auto-fill or type directly into boxes</small>
          </div>
        </div>
        <span className="active-template-badge">{activeTemplate.badge}</span>
      </div>

      <div className="template-scroll-body">
        {/* 1. CHIEF COMPLAINT */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="input-chief-complaint">
              <strong>Chief Complaint</strong>
            </label>
          </div>

          {/* Clickable Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.chiefComplaint.map((chip) => {
              const active = isChipActive("chiefComplaint", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("chiefComplaint", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <input
            id="input-chief-complaint"
            className="template-input-box"
            value={draft.chiefComplaint}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, chiefComplaint: e.target.value }))}
            placeholder="Reason for visit / primary psychiatric concern..."
            disabled={isLocked}
          />
        </div>

        {/* 2. INTERVAL HISTORY / HPI */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="textarea-interval-history">
              <strong>Interval History (HPI)</strong>
            </label>
            {!isLocked && (
              <button
                type="button"
                className={`field-mic-btn ${micListening && activeMicField === "intervalHistory" ? "active" : ""}`}
                onClick={() => onToggleLiveMic("intervalHistory")}
              >
                {micListening && activeMicField === "intervalHistory" ? "🔴 Dictating" : "🎙️ Mic"}
              </button>
            )}
          </div>

          {/* Clickable Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.intervalHistory.map((chip) => {
              const active = isChipActive("intervalHistory", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("intervalHistory", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <textarea
            id="textarea-interval-history"
            className="template-textarea-box"
            rows={4}
            value={draft.intervalHistory}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, intervalHistory: e.target.value }))}
            placeholder="Interval trajectory, symptom changes, functional capacity, daily stressors..."
            disabled={isLocked}
          />
        </div>

        {/* 3. RESPONSE TO TREATMENT */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="textarea-treatment-response">
              <strong>Response to Treatment</strong>
            </label>
            {!isLocked && (
              <button
                type="button"
                className={`field-mic-btn ${micListening && activeMicField === "treatmentResponse" ? "active" : ""}`}
                onClick={() => onToggleLiveMic("treatmentResponse")}
              >
                {micListening && activeMicField === "treatmentResponse" ? "🔴" : "🎙️ Mic"}
              </button>
            )}
          </div>

          {/* Clickable Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.treatmentResponse.map((chip) => {
              const active = isChipActive("treatmentResponse", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("treatmentResponse", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <textarea
            id="textarea-treatment-response"
            className="template-textarea-box"
            rows={3}
            value={draft.treatmentResponse}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, treatmentResponse: e.target.value }))}
            placeholder="Sleep onset latency, focus, affective stability, functional improvements..."
            disabled={isLocked}
          />
        </div>

        {/* 4. SIDE EFFECTS & TOLERABILITY */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="textarea-side-effects">
              <strong>Side Effects &amp; Tolerability Screen</strong>
            </label>
            {!isLocked && (
              <button
                type="button"
                className={`field-mic-btn ${micListening && activeMicField === "sideEffects" ? "active" : ""}`}
                onClick={() => onToggleLiveMic("sideEffects")}
              >
                {micListening && activeMicField === "sideEffects" ? "🔴" : "🎙️ Mic"}
              </button>
            )}
          </div>

          {/* Clickable Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.sideEffects.map((chip) => {
              const active = isChipActive("sideEffects", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("sideEffects", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <textarea
            id="textarea-side-effects"
            className="template-textarea-box"
            rows={3}
            value={draft.sideEffects}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, sideEffects: e.target.value }))}
            placeholder="Adverse psychotropic effects, morning sedation, dry mouth, appetite, vitals..."
            disabled={isLocked}
          />
        </div>

        {/* 5. MENTAL STATUS EXAM (8 DIMENSIONS) */}
        <div className="template-section-block mse-container">
          <div className="mse-collapsible-bar" onClick={onToggleMseOpen}>
            <div>
              <strong>Mental Status Exam (MSE) — 8 Dimensions</strong>
              <span className="mse-sub-hint">Formal psychiatric objective examination</span>
            </div>
            <button type="button" className="mse-expand-toggle">
              {mseOpen ? "▲ Collapse" : "▼ Expand MSE"}
            </button>
          </div>

          {mseOpen && (
            <div className="mse-content-body">
              {!isLocked && (
                <div className="mse-quick-bar">
                  <span className="quick-label">Presets:</span>
                  <button type="button" onClick={() => onApplyMsePreset("normal")}>
                    Normal / Euthymic
                  </button>
                  <button type="button" onClick={() => onApplyMsePreset("anxious")}>
                    Anxious / Restless
                  </button>
                  <button type="button" onClick={() => onApplyMsePreset("depressed")}>
                    Depressed / Blunted
                  </button>
                  <button type="button" onClick={() => onApplyMsePreset("hypomanic")}>
                    Hypomanic / Pressured
                  </button>
                </div>
              )}

              <div className="mse-inputs-grid">
                <label>
                  <span>Appearance</span>
                  <input
                    value={draft.mse.appearance}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, appearance: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Behavior &amp; Rapport</span>
                  <input
                    value={draft.mse.behavior}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, behavior: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Speech</span>
                  <input
                    value={draft.mse.speech}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, speech: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Mood &amp; Affect</span>
                  <input
                    value={draft.mse.moodAffect}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, moodAffect: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Thought Process</span>
                  <input
                    value={draft.mse.thoughtProcess}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, thoughtProcess: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Thought Content (Safety/SI)</span>
                  <input
                    value={draft.mse.thoughtContent}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, thoughtContent: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Cognition &amp; Orientation</span>
                  <input
                    value={draft.mse.cognition}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, cognition: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
                <label>
                  <span>Insight &amp; Judgment</span>
                  <input
                    value={draft.mse.insightJudgment}
                    onChange={(e) =>
                      onUpdateDraft((p) => ({ ...p, mse: { ...p.mse, insightJudgment: e.target.value } }))
                    }
                    disabled={isLocked}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* 6. ASSESSMENT & DIFFERENTIAL */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="textarea-assessment">
              <strong>Clinical Assessment &amp; DSM-5 Impressions</strong>
            </label>
            {!isLocked && (
              <button
                type="button"
                className={`field-mic-btn ${micListening && activeMicField === "assessment" ? "active" : ""}`}
                onClick={() => onToggleLiveMic("assessment")}
              >
                {micListening && activeMicField === "assessment" ? "🔴" : "🎙️ Mic"}
              </button>
            )}
          </div>

          {/* Clickable DSM-5 Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.assessment.map((chip) => {
              const active = isChipActive("assessment", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("assessment", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <textarea
            id="textarea-assessment"
            className="template-textarea-box"
            rows={3}
            value={draft.assessment}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, assessment: e.target.value }))}
            placeholder="Psychiatric diagnostic formulation, DSM-5 codes, clinical stability..."
            disabled={isLocked}
          />
        </div>

        {/* 7. PLAN & STAGED ORDERS */}
        <div className="template-section-block">
          <div className="section-label-row">
            <label htmlFor="textarea-plan">
              <strong>Treatment Plan &amp; Orders</strong>
            </label>
            {!isLocked && (
              <button
                type="button"
                className={`field-mic-btn ${micListening && activeMicField === "plan" ? "active" : ""}`}
                onClick={() => onToggleLiveMic("plan")}
              >
                {micListening && activeMicField === "plan" ? "🔴" : "🎙️ Mic"}
              </button>
            )}
          </div>

          {/* Clickable Plan Action Chips */}
          <div className="clickable-chips-wrapper">
            {activeTemplate.quickChips.plan.map((chip) => {
              const active = isChipActive("plan", chip);
              return (
                <button
                  key={chip}
                  type="button"
                  className={`chip-pill ${active ? "active" : ""}`}
                  onClick={() => toggleChip("plan", chip)}
                  disabled={isLocked}
                >
                  {active ? "✓ " : "＋ "}
                  {chip}
                </button>
              );
            })}
          </div>

          {/* Typable Box */}
          <textarea
            id="textarea-plan"
            className="template-textarea-box"
            rows={4}
            value={draft.plan}
            onChange={(e) => onUpdateDraft((p) => ({ ...p, plan: e.target.value }))}
            placeholder="Medication titration, laboratory surveillance orders, psychotherapy focus, safety plan, follow-up..."
            disabled={isLocked}
          />
        </div>
      </div>
    </section>
  );
}
