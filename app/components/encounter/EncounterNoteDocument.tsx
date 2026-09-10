"use client";

import { useEffect, useRef, useState } from "react";
import type { EncounterState } from "../../lib/encounter-engine";

import type { ClinicalOrder } from "../../domain/orders";
import {
  FOLLOW_UP_VOCABULARY,
  MSE_VOCABULARY,
  RISK_VOCABULARY,
  SECTION_VOCABULARY,
  type NoteVocabularyGroup,
} from "../../lib/note-section-vocabulary";

/**
 * The encounter note as a document.
 *
 * This is the primary surface of the encounter, not a preview of one. It reads as a
 * continuous clinical document — one readable column, real headings, proper measure —
 * and every narrative section is editable where it sits. Three ways in coexist on the
 * same text: the scribe writes into it, the category pickers insert standard phrasing,
 * and the clinician types. None of them is a separate mode; all three are live at once
 * and every one produces ordinary editable text.
 *
 * Sections that come from the chart — medications, diagnoses, allergies, orders — are
 * rendered, not typed. They are the record, and the note shows what the record says
 * rather than inviting a second, divergent copy of it inside the note body.
 */

/**
 * Allergies are loaded, never assumed (D-030). "Not yet loaded" and "failed to
 * load" are distinct from "none recorded", because in a note "no known allergies"
 * is a clinical claim and this document is on its way to a signed legal record.
 */
export type AllergyLoad =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; values: string[] };

export type NoteDocumentProps = {
  patient: { name: string; mrn: string; dob: string; age: number; meds?: string[]; diagnoses?: string[] };
  allergies: AllergyLoad;
  draft: EncounterState;
  onUpdateDraft: (updater: (previous: EncounterState) => EncounterState) => void;
  isLocked: boolean;
  psychotherapyMinutes: number;
  codingRec: { code: string; rationale?: string } | null;
  stagedOrders: ClinicalOrder[];
  /** Section the scribe and dictation should write into. */
  activeSection: string | null;
  onActiveSectionChange: (section: string | null) => void;
  micListening: boolean;
  activeMicField: string;
  onToggleLiveMic: (field: NarrativeField) => void;
};

export type NarrativeField =
  | "chiefComplaint"
  | "intervalHistory"
  | "treatmentResponse"
  | "sideEffects"
  | "assessment"
  | "plan"
  | "riskAssessment"
  | "followUp";

/**
 * A section of document prose that is edited in place.
 *
 * A textarea that grows to its content, styled as document text rather than as a
 * form field: the clinician should feel they are writing the note, not filling in a
 * box that will later become one.
 */
function DocumentProse({
  value,
  placeholder,
  disabled,
  onChange,
  onFocus,
  ariaLabel,
}: {
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onFocus: () => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Grow to content so the document has no inner scrollbars and reads as one page.
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className="note-doc-prose"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      rows={1}
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** Inserts standard phrasing into a section. Never replaces silently when text exists. */
function VocabularyPicker({
  group,
  disabled,
  hasContent,
  onInsert,
}: {
  group: NoteVocabularyGroup;
  disabled: boolean;
  hasContent: boolean;
  onInsert: (text: string, mode: "replace" | "append") => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="note-doc-picker" ref={anchor}>
      <button
        type="button"
        className="note-doc-picker-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-label={`Insert ${group.label} phrasing`}
        onClick={() => setOpen((value) => !value)}
      >
        {group.label} ⌄
      </button>
      {open && (
        <div className="note-doc-picker-menu" role="menu">
          {group.options.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              onClick={() => {
                // Appending rather than overwriting protects anything already
                // written — dictated, scribed, or typed — from a stray selection.
                onInsert(option.text, hasContent ? "append" : "replace");
                setOpen(false);
              }}
            >
              <strong>{option.label}</strong>
              <small>{option.text}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function chartList(values: string[] | undefined, empty: string) {
  if (!values || values.length === 0) return <p className="note-doc-text muted">{empty}</p>;
  return (
    <ul className="note-doc-chart-list">
      {values.map((value) => <li key={value}>{value}</li>)}
    </ul>
  );
}

export default function EncounterNoteDocument({
  patient,
  allergies,
  draft,
  onUpdateDraft,
  isLocked,
  psychotherapyMinutes,
  codingRec,
  stagedOrders,
  activeSection,
  onActiveSectionChange,
  micListening,
  activeMicField,
  onToggleLiveMic,
}: NoteDocumentProps) {
  function setField(field: NarrativeField, next: string) {
    onUpdateDraft((previous) => ({ ...previous, [field]: next }));
  }

  function insertInto(field: NarrativeField, text: string, mode: "replace" | "append") {
    onUpdateDraft((previous) => {
      const current = String((previous as unknown as Record<string, unknown>)[field] ?? "");
      return {
        ...previous,
        [field]: mode === "append" && current.trim() ? `${current.trim()}\n${text}` : text,
      };
    });
  }

  function setMse(dimension: string, text: string) {
    onUpdateDraft((previous) => ({
      ...previous,
      mse: { ...previous.mse, [dimension]: text },
    }));
  }

  const value = (field: NarrativeField) =>
    String((draft as unknown as Record<string, unknown>)[field] ?? "");

  function section(
    id: NarrativeField,
    heading: string,
    placeholder: string,
    vocabulary?: NoteVocabularyGroup,
  ) {
    const current = value(id);
    return (
      <section
        className={`note-doc-section ${activeSection === id ? "is-active" : ""}`}
        aria-labelledby={`note-heading-${id}`}
      >
        <div className="note-doc-section-head">
          <h3 id={`note-heading-${id}`}>{heading}</h3>
          <div className="note-doc-section-tools">
            {vocabulary && (
              <VocabularyPicker
                group={vocabulary}
                disabled={isLocked}
                hasContent={Boolean(current.trim())}
                onInsert={(text, mode) => insertInto(id, text, mode)}
              />
            )}
            {!isLocked && (
              <button
                type="button"
                className={`note-doc-mic ${micListening && activeMicField === id ? "listening" : ""}`}
                title={`Dictate into ${heading}`}
                aria-label={`Dictate into ${heading}`}
                aria-pressed={micListening && activeMicField === id}
                onClick={() => onToggleLiveMic(id)}
              >
                ●
              </button>
            )}
          </div>
        </div>
        <DocumentProse
          value={current}
          placeholder={placeholder}
          disabled={isLocked}
          ariaLabel={heading}
          onFocus={() => onActiveSectionChange(id)}
          onChange={(next) => setField(id, next)}
        />
      </section>
    );
  }

  return (
    <article className="note-doc" aria-label="Encounter note document">
      <header className="note-doc-letterhead">
        <div className="note-doc-practice">
          <strong>Outpatient Adult &amp; Adolescent Psychiatry</strong>
          <span>Psychiatric Evaluation &amp; Management Note</span>
        </div>
        <dl className="note-doc-meta">
          <div><dt>Patient</dt><dd>{patient.name}</dd></div>
          <div><dt>MRN</dt><dd>{patient.mrn}</dd></div>
          <div><dt>DOB</dt><dd>{patient.dob} ({patient.age})</dd></div>
          <div><dt>Date of service</dt><dd>{draft.date}</dd></div>
          <div><dt>Visit type</dt><dd>{draft.visitType}</dd></div>
        </dl>
      </header>

      {section("chiefComplaint", "Chief Complaint", "Why the patient is here today.", SECTION_VOCABULARY.chiefComplaint)}
      {section("intervalHistory", "Interval History", "What has changed since the last visit.")}

      {/* Chart-sourced. Shown, not retyped — the record is the record. */}
      <section className="note-doc-section note-doc-section-chart" aria-labelledby="note-heading-meds">
        <div className="note-doc-section-head"><h3 id="note-heading-meds">Current Medications</h3></div>
        {chartList(patient.meds, "No active medications recorded.")}
      </section>

      <section className="note-doc-section note-doc-section-chart" aria-labelledby="note-heading-allergies">
        <div className="note-doc-section-head"><h3 id="note-heading-allergies">Allergies</h3></div>
        {allergies.status === "loading" ? (
          <p className="note-doc-text muted">Checking allergies…</p>
        ) : allergies.status === "error" ? (
          <p className="note-doc-text muted">
            Allergies could not be loaded. Do not read this as no known allergies.
          </p>
        ) : (
          chartList(allergies.values, "Allergy status not assessed this visit.")
        )}
      </section>

      {section("treatmentResponse", "Treatment Response", "Benefit from the current regimen.", SECTION_VOCABULARY.treatmentResponse)}
      {section("sideEffects", "Side Effects & Tolerability", "Side effects on direct questioning.", SECTION_VOCABULARY.sideEffects)}

      <section className="note-doc-section" aria-labelledby="note-heading-mse">
        <div className="note-doc-section-head"><h3 id="note-heading-mse">Mental Status Examination</h3></div>
        <div className="note-doc-mse">
          {Object.entries(MSE_VOCABULARY).map(([dimension, group]) => (
            <div className="note-doc-mse-row" key={dimension}>
              <div className="note-doc-mse-label">
                <span>{group.label}</span>
                <VocabularyPicker
                  group={group}
                  disabled={isLocked}
                  hasContent={false}
                  onInsert={(text) => setMse(dimension, text)}
                />
              </div>
              <DocumentProse
                value={String((draft.mse as unknown as Record<string, string>)[dimension] ?? "")}
                placeholder={`${group.label} findings.`}
                disabled={isLocked}
                ariaLabel={`Mental status: ${group.label}`}
                onFocus={() => onActiveSectionChange(`mse.${dimension}`)}
                onChange={(next) => setMse(dimension, next)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="note-doc-section note-doc-section-chart" aria-labelledby="note-heading-dx">
        <div className="note-doc-section-head"><h3 id="note-heading-dx">Diagnoses</h3></div>
        {chartList(patient.diagnoses, "No active diagnoses recorded.")}
      </section>

      {section("assessment", "Clinical Assessment & Medical Decision Making", "Formulation and reasoning for today's decisions.")}
      {section("riskAssessment", "Risk Assessment", "Suicidality, homicidality, means, protective factors, and disposition.", RISK_VOCABULARY)}
      {section("plan", "Treatment Plan", "Medication decisions, monitoring, psychotherapy focus, and safety planning.")}

      <section className="note-doc-section note-doc-section-chart" aria-labelledby="note-heading-orders">
        <div className="note-doc-section-head"><h3 id="note-heading-orders">Orders Placed This Visit</h3></div>
        {stagedOrders.length === 0 ? (
          <p className="note-doc-text muted">No orders placed during this encounter.</p>
        ) : (
          <ul className="note-doc-chart-list">
            {stagedOrders.map((order) => (
              <li key={order.id}>
                {order.type === "medication" ? order.medication : order.testName}
                <span className="note-doc-order-status"> · {order.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {section("followUp", "Follow-Up", "When the patient is seen next, and under what conditions sooner.", FOLLOW_UP_VOCABULARY)}

      <section className="note-doc-section note-doc-section-chart" aria-labelledby="note-heading-time">
        <div className="note-doc-section-head"><h3 id="note-heading-time">Time & Billing Attestation</h3></div>
        <p className="note-doc-text">
          Psychotherapy time: <strong>{psychotherapyMinutes} minutes</strong>.
          {codingRec?.code ? <> Evaluation and management level: <strong>{codingRec.code}</strong>.</> : null}
        </p>
        {codingRec?.rationale && <p className="note-doc-text muted">{codingRec.rationale}</p>}
        <p className="note-doc-text muted">
          Coding is a suggestion derived from documented content and requires clinician confirmation at signing.
        </p>
      </section>

      {draft.signedBy && (
        <footer className="note-doc-signature">
          <strong>Electronically signed by {draft.signedBy}</strong>
          <span>NPI {draft.npi} · {draft.signedAt} · Legal record sealed</span>
        </footer>
      )}
    </article>
  );
}
