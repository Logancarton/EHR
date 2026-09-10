"use client";

import { useState, type FormEvent } from "react";
import type { EncounterState } from "../../lib/encounter-engine";
import {
  FOLLOW_UP_VOCABULARY,
  MSE_VOCABULARY,
  RISK_VOCABULARY,
  SECTION_VOCABULARY,
  type NoteVocabularyGroup,
} from "../../lib/note-section-vocabulary";
import type { NarrativeField } from "./EncounterNoteDocument";

/**
 * The context rail: everything the clinician steers the note with, on the left,
 * while the note itself is written on the right.
 *
 * The point is that none of this is buried. Every category is visible at once, so
 * filling in something the conversation did not cover is one click rather than
 * hunting through the document for the section that owns it. The clinician is
 * recording or dictating; this is where they add what was not said.
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

/** A labelled dropdown that inserts its selection and resets, so it can be reused. */
function PhraseSelect({
  group,
  disabled,
  onPick,
}: {
  group: NoteVocabularyGroup;
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <label className="context-rail-select">
      <span>{group.label}</span>
      <select
        disabled={disabled}
        value=""
        onChange={(event) => {
          const option = group.options.find((candidate) => candidate.label === event.target.value);
          if (option) onPick(option.text);
          // Reset so the same phrase can be picked again after an edit.
          event.target.value = "";
        }}
      >
        <option value="">Choose…</option>
        {group.options.map((option) => (
          <option key={option.label} value={option.label}>{option.label}</option>
        ))}
      </select>
    </label>
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
      {/* ---- Recording ---------------------------------------------------- */}
      <section className="context-rail-block">
        <h3>Recording</h3>
        <div className="context-rail-actions">
          <button type="button" disabled={isLocked || isAmbientPlaying} onClick={onStartAmbient}>
            {isAmbientPlaying ? "Recording…" : "▶ Start ambient"}
          </button>
          <button type="button" disabled={isLocked} onClick={onSynthesize}>
            ✦ Scribe the note
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
      </section>

      {/* ---- Context ------------------------------------------------------ */}
      <section className="context-rail-block">
        <h3>Context</h3>
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
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Section phrasing --------------------------------------------- */}
      <section className="context-rail-block">
        <h3>Fill a section</h3>
        <p className="context-rail-note">
          Standard phrasing, inserted as ordinary editable text. Appends rather than
          overwrites, so it never destroys what was dictated or typed.
        </p>
        <PhraseSelect
          group={SECTION_VOCABULARY.chiefComplaint}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("chiefComplaint", text)}
        />
        <PhraseSelect
          group={SECTION_VOCABULARY.treatmentResponse}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("treatmentResponse", text)}
        />
        <PhraseSelect
          group={SECTION_VOCABULARY.sideEffects}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("sideEffects", text)}
        />
        <PhraseSelect
          group={RISK_VOCABULARY}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("riskAssessment", text)}
        />
        <PhraseSelect
          group={FOLLOW_UP_VOCABULARY}
          disabled={isLocked}
          onPick={(text) => onInsertPhrase("followUp", text)}
        />
      </section>

      {/* ---- Mental status ------------------------------------------------ */}
      <section className="context-rail-block">
        <h3>Mental status exam</h3>
        <p className="context-rail-note">
          Observed rather than spoken, so it is rarely in the transcript. Each
          dimension replaces just that line.
        </p>
        {Object.entries(MSE_VOCABULARY).map(([dimension, group]) => (
          <PhraseSelect
            key={dimension}
            group={group}
            disabled={isLocked}
            onPick={(text) => onSetMse(dimension, text)}
          />
        ))}
      </section>
    </aside>
  );
}
