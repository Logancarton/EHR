"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EncounterState } from "../../lib/encounter-engine";
import {
  FOLLOW_UP_VOCABULARY,
  MSE_VOCABULARY,
  RISK_VOCABULARY,
  ROS_VOCABULARY,
  SECTION_VOCABULARY,
  type NoteVocabularyGroup,
} from "../../lib/note-section-vocabulary";
import type { NarrativeField } from "./EncounterNoteDocument";
import Icon from "../ui/Icon";

/**
 * The context rail: everything the clinician steers the note with, on the left,
 * while the note itself is written on the right.
 *
 * Three tools share the rail. **Suggestions** follows the cursor: click into a
 * section of the note and the standard phrasing for that section is what the rail
 * shows, the way a writing tool offers suggestions for the paragraph you are in
 * (D-100). "Browse all sections" lists every category. Hidden panels and hidden
 * categories stay mounted, so switching tools or sections preserves unsent text.
 *
 * Context entries are the clinician's own words. They are carried into the note
 * only when the clinician sends them to a section — nothing here writes into the
 * legal record on its own.
 */

export type ContextEntry = {
  id: string;
  text: string;
  createdAt: string;
};

export type ContextRailProps = {
  draft: EncounterState;
  isLocked: boolean;
  contextEntries: ContextEntry[];
  onAddContext: (text: string) => void;
  onRemoveContext: (id: string) => void;
  onSendContextToSection: (id: string, section: NarrativeField) => void;
  onInsertPhrase: (section: NarrativeField, text: string) => void;
  onSetMse: (dimension: string, text: string) => void;
  /** Section the document currently has focus in, so dictation has a target. */
  activeSection: string | null;
  micListening: boolean;
  onToggleLiveMic: (field: NarrativeField) => void;
  isAmbientPlaying: boolean;
  onStartAmbient: () => void;
  onSynthesize: () => void;
  transcriptCount: number;
};

const SECTION_LABELS: Array<{ id: NarrativeField; label: string }> = [
  { id: "chiefComplaint", label: "Chief complaint" },
  { id: "intervalHistory", label: "Interval history" },
  { id: "reviewOfSymptoms", label: "Review of symptoms" },
  { id: "treatmentResponse", label: "Treatment response" },
  { id: "sideEffects", label: "Side effects" },
  { id: "assessment", label: "Assessment" },
  { id: "riskAssessment", label: "Risk assessment" },
  { id: "plan", label: "Plan" },
  { id: "followUp", label: "Follow-up" },
];

/**
 * Every phrase category, keyed by the note section it writes into. The order is
 * the note's own order, so "Browse all sections" reads top to bottom like the
 * document beside it.
 */
const SUGGESTION_GROUPS: Array<{ id: string; key: string; heading?: string; group: NoteVocabularyGroup }> = [
  { id: "cc", key: "chiefComplaint", heading: "Chief complaint", group: SECTION_VOCABULARY.chiefComplaint },
  ...Object.entries(ROS_VOCABULARY).map(([category, group], index) => ({
    id: `ros-${category}`,
    key: "reviewOfSymptoms",
    heading: index === 0 ? "Review of symptoms" : undefined,
    group,
  })),
  { id: "tr", key: "treatmentResponse", heading: "Treatment response", group: SECTION_VOCABULARY.treatmentResponse },
  { id: "se", key: "sideEffects", heading: "Side effects", group: SECTION_VOCABULARY.sideEffects },
  ...Object.entries(MSE_VOCABULARY).map(([dimension, group], index) => ({
    id: `mse-${dimension}`,
    key: `mse.${dimension}`,
    heading: index === 0 ? "Mental status exam" : undefined,
    group,
  })),
  { id: "risk", key: "riskAssessment", heading: "Risk assessment", group: RISK_VOCABULARY },
  { id: "fu", key: "followUp", heading: "Follow-up", group: FOLLOW_UP_VOCABULARY },
];

function sectionLabel(section: string | null): string {
  if (!section) return "no section — click into the note first";
  if (section.startsWith("mse.")) {
    const dimension = section.slice(4);
    return `MSE · ${MSE_VOCABULARY[dimension]?.label ?? dimension}`;
  }
  return SECTION_LABELS.find((entry) => entry.id === section)?.label ?? section;
}

/**
 * Expand a category to see its choices. Reuses the existing vocabulary and write
 * callbacks; the Other field keeps the clinician free to use their own wording.
 */
function PhrasePicker({
  group,
  disabled,
  onPick,
}: {
  group: NoteVocabularyGroup;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [lastPick, setLastPick] = useState("");
  const otherRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (otherOpen) otherRef.current?.focus();
  }, [otherOpen]);

  function commitOther() {
    const text = otherText.trim();
    if (!text) return;
    onPick(text);
    setLastPick("Your wording inserted");
    setOtherText("");
    setOtherOpen(false);
  }

  function cancelOther() {
    setOtherText("");
    setOtherOpen(false);
  }

  return (
    <details className="context-phrase-picker">
      <summary><span>{group.label}</span><span className="phrase-option-count">{group.options.length} options <span aria-hidden="true">⌄</span></span></summary>
      <div className="context-phrase-options" role="group" aria-label={`${group.label} choices`}>
        {group.options.map((option) => (
          <button key={option.label} type="button" disabled={disabled} title={option.text}
            onClick={() => { onPick(option.text); setLastPick(`${option.label} inserted`); }}>
            {option.label}
          </button>
        ))}
        <button type="button" className="phrase-other-button" disabled={disabled}
          aria-expanded={otherOpen} onClick={() => setOtherOpen(!otherOpen)}>+ Other</button>
      </div>
      <p className="phrase-insert-feedback" role="status">{lastPick}</p>

      {otherOpen && (
        <div className="context-rail-other">
          <textarea
            ref={otherRef}
            rows={2}
            value={otherText}
            disabled={disabled}
            aria-label={`Other — ${group.label}`}
            placeholder={`Your own wording for ${group.label.toLowerCase()}…`}
            onChange={(event) => setOtherText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                commitOther();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelOther();
              }
            }}
          />
          <div className="context-rail-other-actions">
            <button type="button" disabled={disabled || !otherText.trim()} onClick={commitOther}>
              Insert
            </button>
            <button type="button" className="context-rail-other-cancel" onClick={cancelOther}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </details>
  );
}

/**
 * Keep all panel contents mounted, including unfinished context and Other text.
 */
function RailBlock({ title, children, visible, id }: { title: string; children: ReactNode; visible: boolean; id: string }) {
  return (
    <section className="context-rail-block" hidden={!visible} id={id} aria-label={title}>
      <h3>{title}</h3>
      <div className="context-rail-block-body">{children}</div>
    </section>
  );
}

export default function EncounterContextRail({
  draft,
  isLocked,
  contextEntries,
  onAddContext,
  onRemoveContext,
  onSendContextToSection,
  onInsertPhrase,
  onSetMse,
  activeSection,
  micListening,
  onToggleLiveMic,
  isAmbientPlaying,
  onStartAmbient,
  onSynthesize,
  transcriptCount,
}: ContextRailProps) {
  const [draftContext, setDraftContext] = useState("");
  const [sendTarget, setSendTarget] = useState<Record<string, NarrativeField>>({});
  const [activeTool, setActiveTool] = useState("suggestions");
  const toolId = useId();

  function submitContext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draftContext.trim();
    if (!text) return;
    onAddContext(text);
    setDraftContext("");
  }

  const dictationTarget = (activeSection && !activeSection.startsWith("mse.")
    ? (activeSection as NarrativeField)
    : "intervalHistory");

  const [browseAll, setBrowseAll] = useState(false);
  const suggestionKey = activeSection?.startsWith("mse.") ? activeSection : activeSection ?? "";
  const suggestionGroups = SUGGESTION_GROUPS;
  const relevant = suggestionGroups.filter((entry) => entry.key === suggestionKey);
  const activeLabel = activeSection ? sectionLabel(activeSection) : null;

  return (
    <aside className="context-rail" aria-label="Encounter context and controls">
      <div className="context-tools-heading"><strong>Note tools</strong><span>Follows your cursor</span></div>
      <div className="context-tool-switcher" role="group" aria-label="Note tools">
        {[
          ["suggestions", "Suggestions"],
          ["record", "Record"],
          ["context", `Context${contextEntries.length ? ` · ${contextEntries.length}` : ""}`],
        ].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={activeTool === key}
            aria-controls={`${toolId}-${key}`} onClick={() => setActiveTool(key)}>{label}</button>
        ))}
      </div>
      {/* ---- Recording ---------------------------------------------------- */}
      <RailBlock title="Recording" visible={activeTool === "record"} id={`${toolId}-record`}>
        <div className="context-rail-actions">
          <button type="button" disabled={isLocked || isAmbientPlaying} onClick={onStartAmbient}>
            {isAmbientPlaying ? "Recording…" : "▶ Start ambient"}
          </button>
          <button type="button" disabled={isLocked} onClick={onSynthesize}>
            <Icon name="auto_awesome" /> Scribe the note
          </button>
        </div>
        <button
          type="button"
          className={`context-rail-dictate ${micListening ? "listening" : ""}`}
          disabled={isLocked}
          aria-pressed={micListening}
          onClick={() => onToggleLiveMic(dictationTarget)}
        >
          {micListening ? "● Dictating" : "● Dictate"}
          <small>into {sectionLabel(activeSection)}</small>
        </button>
        <p className="context-rail-note">
          {transcriptCount > 0
            ? `${transcriptCount} utterances captured.`
            : "Nothing recorded yet."}
          {" "}The scribe fills empty sections and leaves anything you have written alone.
        </p>
      </RailBlock>

      {/* ---- Context ------------------------------------------------------ */}
      <RailBlock title="Context" visible={activeTool === "context"} id={`${toolId}-context`}>
        <p className="context-rail-note">
          What was not said aloud, or what the scribe should know. Yours until you send
          it to a section — nothing here enters the note on its own.
        </p>
        <form className="context-rail-compose" onSubmit={submitContext}>
          <textarea
            value={draftContext}
            onChange={(event) => setDraftContext(event.target.value)}
            placeholder="e.g. Mother called before the visit about sleep regression…"
            rows={3}
            disabled={isLocked}
            aria-label="Add context"
          />
          <button type="submit" disabled={isLocked || !draftContext.trim()}>Add context</button>
        </form>

        {contextEntries.length > 0 && (
          <ul className="context-rail-entries">
            {contextEntries.map((entry) => (
              <li key={entry.id}>
                <p>{entry.text}</p>
                <div className="context-rail-entry-actions">
                  <select
                    aria-label="Send to section"
                    value={sendTarget[entry.id] ?? ""}
                    disabled={isLocked}
                    onChange={(event) => {
                      const section = event.target.value as NarrativeField;
                      if (!section) return;
                      setSendTarget((current) => ({ ...current, [entry.id]: section }));
                      onSendContextToSection(entry.id, section);
                    }}
                  >
                    <option value="">Send to…</option>
                    {SECTION_LABELS.map((section) => (
                      <option key={section.id} value={section.id}>{section.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="context-rail-remove"
                    aria-label="Remove this context"
                    disabled={isLocked}
                    onClick={() => onRemoveContext(entry.id)}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailBlock>

      {/* ---- Suggestions ------------------------------------------------ */}
      <RailBlock title="Suggestions" visible={activeTool === "suggestions"} id={`${toolId}-suggestions`}>
        <p className="context-rail-note" data-suggestion-target={suggestionKey || "none"}>
          {activeLabel
            ? relevant.length > 0
              ? <>Phrases for <strong>{activeLabel}</strong>. Tap one to add it; your text stays in place.</>
              : <>No standard phrases for <strong>{activeLabel}</strong>. Write or dictate it in your own words.</>
            : "Click into a section of the note to see phrases for it."}
        </p>
        {suggestionGroups.map((entry) => {
          const shown = browseAll || entry.key === suggestionKey;
          return (
            <div key={entry.id} className="context-suggestion" hidden={!shown} data-suggestion-for={entry.key}>
              {browseAll && entry.heading && <p className="context-suggestion-heading">{entry.heading}</p>}
              <PhrasePicker
                group={entry.group}
                disabled={isLocked}
                onPick={(text) =>
                  entry.key.startsWith("mse.")
                    ? onSetMse(entry.key.slice(4), text)
                    : onInsertPhrase(entry.key as NarrativeField, text)
                }
              />
            </div>
          );
        })}
        <button
          type="button"
          className="context-browse-all"
          aria-pressed={browseAll}
          onClick={() => setBrowseAll((current) => !current)}
        >
          {browseAll ? "Show only this section" : "Browse all sections"}
        </button>
      </RailBlock>
    </aside>
  );
}
