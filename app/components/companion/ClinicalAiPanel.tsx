"use client";

import { useState } from "react";
import { type Patient, type Section } from "../../domain/patient";
import {
  type ProviderPreferences,
  defaultPreferences,
  parseAiPreferenceCommand,
} from "../../lib/preference-engine";

export default function ClinicalAiPanel({
  patient,
  section,
  command,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  onClose,
}: {
  patient: Patient;
  section: Section;
  command: string;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  onClose?: () => void;
}) {
  const [customAiText, setCustomAiText] = useState("");
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  function handleAiSubmit(promptText: string) {
    if (!promptText.trim()) return;
    const input = promptText.trim();
    if (preferences && onUpdatePreferences) {
      const res = parseAiPreferenceCommand(input, preferences);
      if (res.recognized && res.updatedPreferences) {
        onUpdatePreferences(res.updatedPreferences);
        setAiFeedback(res.feedback);
        setCustomAiText("");
        return;
      }
    }
    setAiFeedback(`✦ AI clinical assist: Synthesized context for “${input}”.`);
    setCustomAiText("");
  }

  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark">✦</span>
          <div>
            <strong>Clinical AI</strong>
            <small>Context: {patient.name} · {section}</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ai-context">
        <span>LIVE CONTEXT</span>
        <p>AI follows active patient, workspace density ({preferences.density}), and preset ({preferences.activePresetId}).</p>
      </div>
      {command && (
        <div className="ai-global-command">
          <span>GLOBAL COMMAND</span>
          <strong>{command}</strong>
          <small>Captured by universal search bar.</small>
        </div>
      )}
      {aiFeedback && (
        <div className="ai-action-card">
          <span className="spark">✦</span>
          <div>
            <strong>AI Workspace Assistant</strong>
            <p>{aiFeedback}</p>
          </div>
        </div>
      )}
      <div className="ai-card">
        <span className="eyebrow">Before this visit</span>
        <h3>3 things worth checking</h3>
        <ol>
          <li><strong>Response:</strong> Clarify benefit since the last medication adjustment.</li>
          <li><strong>Monitoring:</strong> Confirm adherence and review any pending monitoring.</li>
          <li><strong>Function:</strong> Compare sleep, work/school, and daily impairment with last visit.</li>
        </ol>
      </div>
      <div className="suggestion-chips">
        {onOpenCustomizer && (
          <button type="button" onClick={onOpenCustomizer}>⚙️ Layout drawer</button>
        )}
        <button type="button" onClick={() => handleAiSubmit("Switch to minimal mode")}>🧘 Zen mode</button>
        <button type="button" onClick={() => handleAiSubmit("Switch to med check layout")}>💊 Med check</button>
        <button type="button" onClick={() => handleAiSubmit("Save current layout as Focus Flow")}>★ Save layout</button>
        <button type="button" onClick={() => handleAiSubmit("Summarize chart")}>Summarize chart</button>
        <button type="button" onClick={() => handleAiSubmit("Compare last 3 visits")}>Compare visits</button>
      </div>
      <div className="ai-composer">
        <textarea
          placeholder={`Ask about ${patient.name} or adjust layout ("hide metrics", "zen mode", "save preset")...`}
          value={customAiText}
          onChange={(e) => setCustomAiText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAiSubmit(customAiText);
            }
          }}
        />
        <div>
          <span>Chart &amp; layout context on</span>
          <button type="button" onClick={() => handleAiSubmit(customAiText)}>↑</button>
        </div>
      </div>
      <p className="ai-disclaimer">Prototype only. No real PHI or clinical decision support is connected.</p>
    </aside>
  );
}
