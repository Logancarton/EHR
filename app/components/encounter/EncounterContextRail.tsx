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
 * A small set of tool buttons reveals recording, context, or findings beside the
 * same note. Hidden panels stay mounted so switching tools preserves unsent text.
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
  const [activeTool, setActiveTool] = useState("findings");
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

  return (
    <aside className="context-rail" aria-label="Encounter context and controls">
      <div className="context-tools-heading"><strong>Note tools</strong><span>Choose, then add</span></div>
      <div className="context-tool-switcher" role="group" aria-label="Note tools">
        {[
          ["findings", "Findings"], ["mse", "Mental status"], ["symptoms", "Symptoms"],
          ["record", "Record"], ["context", `Context${contextEntries.length ? ` · ${contextEntries.length}` : ""}`],
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

      {/* ---- Section phrasing --------------------------------------------- */}
      <RailBlock title="Findings" visible={activeTool === "findings"} id={`${toolId}-findings`}>
        <p className="context-rail-note">
          Open a category, then tap a phrase to add it to your note. Your existing text stays in place.
        </p>
        <PhrasePicker
          group={SECTION_VOCABULARY.chiefComplaint}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("chiefComplaint", text)}
        />
        <PhrasePicker
          group={SECTION_VOCABULARY.treatmentResponse}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("treatmentResponse", text)}
        />
        <PhrasePicker
          group={SECTION_VOCABULARY.sideEffects}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("sideEffects", text)}
        />
        <PhrasePicker
          group={RISK_VOCABULARY}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("riskAssessment", text)}
        />
        <PhrasePicker
          group={FOLLOW_UP_VOCABULARY}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("followUp", text)}
        />
      </RailBlock>

      {/* ---- Review of symptoms ------------------------------------------- */}
      <RailBlock title="Review of symptoms" visible={activeTool === "symptoms"} id={`${toolId}-symptoms`}>
        <p className="context-rail-note">
          Add the symptoms you reviewed. Each choice adds to the same section of your note.
        </p>
        {Object.entries(ROS_VOCABULARY).map(([category, group]) => (
          <PhrasePicker
            key={category}
            group={group}
            disabled={isLocked}
            onPick={(text) => onInsertPhrase("reviewOfSymptoms", text)}
          />
        ))}
      </RailBlock>

      {/* ---- Mental status ------------------------------------------------ */}
      <RailBlock title="Mental status exam" visible={activeTool === "mse"} id={`${toolId}-mse`}>
        <p className="context-rail-note">
          Choose an observed finding. Each choice replaces only that dimension of the exam.
        </p>
        {Object.entries(MSE_VOCABULARY).map(([dimension, group]) => (
          <PhrasePicker
            key={dimension}
            group={group}
            disabled={isLocked}
            onPick={(text) => onSetMse(dimension, text)}
          />
        ))}
      </RailBlock>
    </aside>
  );
}
