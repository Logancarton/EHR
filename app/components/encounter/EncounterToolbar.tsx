"use client";

import { useEffect, useId, useRef, useState } from "react";
import { builtInTemplates } from "../../lib/encounter-engine";
import type { EncounterSaveView } from "../../lib/encounter-save-lifecycle";
import Icon from "../ui/Icon";

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
  pastNotesAvailable = true,
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
  /** False when the clinician has turned the past-encounter search drawer off. */
  pastNotesAvailable?: boolean;
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
  const [openPanel, setOpenPanel] = useState<"template" | "time" | "more" | null>(null);
  const toolbarRef = useRef<HTMLElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!openPanel) return;
    function dismiss(event: PointerEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) setOpenPanel(null);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [openPanel]);

  function toggle(panel: "template" | "time" | "more") {
    setOpenPanel((current) => current === panel ? null : panel);
  }

  return (
    <header ref={toolbarRef} className="encounter-top-toolbar" aria-label="Encounter Controls"
      onKeyDown={(event) => {
        if (event.key === "Escape" && openPanel) {
          toolbarRef.current?.querySelector<HTMLButtonElement>('[aria-expanded="true"]')?.focus();
          setOpenPanel(null);
          event.stopPropagation();
        }
      }}>
      <div className="toolbar-left-group">
        <div className="encounter-tool-menu">
          <button type="button" className="encounter-tool-trigger" aria-expanded={openPanel === "template"}
            aria-controls={`${panelId}-template`} onClick={() => toggle("template")}>
            Template <span aria-hidden="true">⌄</span>
          </button>
          {openPanel === "template" && (
            <div className="encounter-tool-popover template-options" id={`${panelId}-template`}>
              <strong className="tool-popover-title">Note template</strong>
              <p>Choose the starting structure for this visit.</p>
              {builtInTemplates.map((template) => (
                <button key={template.id} type="button" className="template-option"
                  aria-pressed={selectedTemplateId === template.id} disabled={isLocked}
                  onClick={() => { onSelectTemplate(template.id); setOpenPanel(null); }}>
                  <span>{template.name}</span><small>{template.badge}</small>
                </button>
              ))}
              <div className="tool-popover-footer">
                <button type="button" onClick={() => { onSaveAsDefaultTemplate(); setOpenPanel(null); }}>Save as default</button>
                <button type="button" disabled={isLocked} onClick={() => { onApplyTemplateDefaults(); setOpenPanel(null); }}>Apply default phrases</button>
              </div>
            </div>
          )}
        </div>
        {pastNotesAvailable && (
          <button type="button" className={`toolbar-history-toggle ${showPastNotes ? "active" : ""}`}
            aria-pressed={showPastNotes} onClick={onTogglePastNotes} title="Search previous visits">
            Past notes <span className="encounter-tool-count">{pastNotesCount}</span>
          </button>
        )}
        <div className="encounter-tool-menu">
          <button type="button" className="encounter-tool-trigger" aria-expanded={openPanel === "time"}
            aria-controls={`${panelId}-time`} onClick={() => toggle("time")}>
            Therapy time <span className="encounter-tool-count">{psychotherapyMinutes}m</span><span aria-hidden="true">⌄</span>
          </button>
          {openPanel === "time" && (
            <div className="encounter-tool-popover" id={`${panelId}-time`}>
              <strong className="tool-popover-title">Psychotherapy time</strong>
              <p>Record the time provided during this visit.</p>
              <div className="therapy-time-control">
                <button type="button" aria-label="Subtract five minutes" disabled={isLocked || psychotherapyMinutes <= 0}
                  onClick={() => onPsychotherapyChange(psychotherapyMinutes - 5)}>−</button>
                <span><strong>{psychotherapyMinutes}</strong> minutes</span>
                <button type="button" aria-label="Add five minutes" disabled={isLocked || psychotherapyMinutes >= 120}
                  onClick={() => onPsychotherapyChange(psychotherapyMinutes + 5)}>+</button>
              </div>
              <div className="therapy-time-choices">
                {[0, 16, 30, 45, 60].map((minutes) => (
                  <button type="button" key={minutes} aria-pressed={psychotherapyMinutes === minutes}
                    disabled={isLocked} onClick={() => onPsychotherapyChange(minutes)}>{minutes} min</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="toolbar-right-actions">
        <div className="encounter-status-tag" aria-live="polite" data-save-status={isLocked ? "signed" : saveState?.status || "unsaved"}>
          {isLocked ? (
            <span className="status-locked-pill" title={signedAt}>Signed</span>
          ) : saveState?.status === "saving" ? (
            <span className="status-draft-pill">Saving…</span>
          ) : saveState?.status === "saved" ? (
            <span className="status-draft-pill"><Icon name="check" /> {savedLabel(saveState.savedAt)}</span>
          ) : saveState?.status === "failed" ? (
            <span className="status-draft-pill" title={saveState.error || "Server save failed"}>
              Save failed <button type="button" onClick={onRetrySave} className="save-retry-button">Retry</button>
            </span>
          ) : <span className="status-draft-pill">Unsaved changes</span>}
        </div>
        {legacyRecoveryAvailable && !isLocked && (
          <button type="button" className="btn-toolbar-action" onClick={onRecoverLegacyDraft}>Recover local draft</button>
        )}
        <div className="encounter-tool-menu">
          <button type="button" className="encounter-tool-trigger" aria-label="Note actions"
            aria-expanded={openPanel === "more"} aria-controls={`${panelId}-more`} onClick={() => toggle("more")}>•••</button>
          {openPanel === "more" && (
            <div className="encounter-tool-popover note-actions-popover" id={`${panelId}-more`}>
              <strong className="tool-popover-title">Note actions</strong>
              <button type="button" onClick={() => { onCopyNote(); setOpenPanel(null); }}>Copy note</button>
              <button type="button" onClick={() => { onPrint(); setOpenPanel(null); }}>Print / export</button>
            </div>
          )}
        </div>
        <button type="button" className={`btn-toolbar-primary ${!isLocked ? "provider-only-sign-action" : ""}`} onClick={onOpenReviewModal}>
          {isLocked ? "View Signed Record" : "Review & Sign"}
        </button>
      </div>
    </header>
  );
}
