"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Icon from "../ui/Icon";
import type { Patient } from "../../domain/patient";
import {
  namedNoteType,
  noteTypeChoices,
  type NoteStartMode,
  type NoteType,
} from "../../domain/note-types";
import { useDismissible } from "../../lib/use-dismissible";
import { formatDateOfBirth, dateOfBirthSearchText } from "../../domain/patient-administration";

/**
 * What the top bar's microphone offers.
 *
 * The microphone used to start listening straight into the omnibox, which also
 * opened the search dropdown: a clinician reaching for dictation got a search
 * menu. It now asks what the voice is for. Dictating or scribing a note needs a
 * patient and a kind of note before anything listens; talking with Clinical Bond
 * is the old omnibox voice path, unchanged.
 */
type Step =
  | { kind: "action" }
  | { kind: "patient"; mode: NoteStartMode }
  | { kind: "type"; mode: NoteStartMode; patient: Patient };

const MODE_LABEL: Record<NoteStartMode, string> = {
  dictate: "Dictate note",
  scribe: "Scribe note",
};

const PATIENT_LIMIT = 8;

export type VoiceActionMenuProps = {
  /** The microphone button, which takes focus back when the menu closes. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Holds the microphone and the menu: clicking the microphone again is its toggle, not an outside click. */
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  roster: readonly Patient[];
  activePatientId?: string | null;
  customNoteTypes: readonly string[];
  onSaveCustomNoteType: (name: string) => void;
  onStartNote: (request: { patient: Patient; noteType: NoteType; mode: NoteStartMode }) => void;
  onTalk: () => void;
};

export default function VoiceActionMenu({
  anchorRef,
  containerRef,
  onClose,
  roster,
  activePatientId,
  customNoteTypes,
  onSaveCustomNoteType,
  onStartNote,
  onTalk,
}: VoiceActionMenuProps) {
  const [step, setStep] = useState<Step>({ kind: "action" });
  const [patientQuery, setPatientQuery] = useState("");
  const [namingKind, setNamingKind] = useState<"other" | "create" | null>(null);
  const [typeName, setTypeName] = useState("");
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useDismissible({
    active: true,
    onDismiss: () => {
      onClose();
      anchorRef.current?.focus();
    },
    surface: containerRef,
    dismissOnOutsideClick: true,
    dismissFromTextEntry: true,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.kind]);

  const patients = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    const matches = roster.filter((patient) =>
      !query || `${patient.name} ${patient.mrn} ${dateOfBirthSearchText(patient.dob)}`.toLowerCase().includes(query),
    );
    return [...matches].sort((left, right) => {
      if (left.id === activePatientId) return -1;
      if (right.id === activePatientId) return 1;
      return left.name.localeCompare(right.name);
    });
  }, [roster, patientQuery, activePatientId]);

  const choices = useMemo(() => noteTypeChoices(customNoteTypes), [customNoteTypes]);

  function start(noteType: NoteType) {
    if (step.kind !== "type") return;
    onStartNote({ patient: step.patient, noteType, mode: step.mode });
    onClose();
  }

  function startNamed() {
    const noteType = namedNoteType(typeName);
    if (!noteType) return;
    if (namingKind === "create" && noteType.custom) onSaveCustomNoteType(noteType.label);
    start(noteType);
  }

  const back = (
    <button
      type="button"
      className="voice-menu-back"
      aria-label="Back"
      onClick={() => {
        setNamingKind(null);
        setTypeName("");
        setStep(step.kind === "type" ? { kind: "patient", mode: step.mode } : { kind: "action" });
      }}
    >
      <Icon name="arrow_back" />
    </button>
  );

  return (
    <div className="voice-menu" role="region" aria-label="Voice">
      {step.kind === "action" && (
        <>
          <h2 className="voice-menu-title" tabIndex={-1} ref={headingRef}>What would you like to do?</h2>
          <div className="voice-menu-list">
            <button type="button" className="voice-menu-option" onClick={() => setStep({ kind: "patient", mode: "dictate" })}>
              <span className="voice-menu-icon"><Icon name="mic" /></span>
              <span><strong>Dictate note</strong><small>You speak; your words are typed into the note.</small></span>
              <Icon name="chevron_right" />
            </button>
            <button type="button" className="voice-menu-option" onClick={() => setStep({ kind: "patient", mode: "scribe" })}>
              <span className="voice-menu-icon"><Icon name="graphic_eq" /></span>
              <span>
                <strong>Scribe note</strong>
                <small>Record the visit, then draft the note from it. Scripted demo until the AI scribe is connected.</small>
              </span>
              <Icon name="chevron_right" />
            </button>
            <button
              type="button"
              className="voice-menu-option"
              onClick={() => {
                onClose();
                onTalk();
              }}
            >
              <span className="voice-menu-icon"><Icon name="forum" /></span>
              <span><strong>Talk with Clinical Bond</strong><small>Ask a question or give a command out loud.</small></span>
            </button>
          </div>
        </>
      )}

      {step.kind === "patient" && (
        <>
          <div className="voice-menu-head">
            {back}
            <h2 className="voice-menu-title" tabIndex={-1} ref={headingRef}>
              {MODE_LABEL[step.mode]} · Choose patient
            </h2>
          </div>
          <input
            className="voice-menu-input"
            aria-label="Search patients"
            placeholder="Search by name or MRN"
            value={patientQuery}
            onChange={(event) => setPatientQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && patients[0]) {
                event.preventDefault();
                setStep({ kind: "type", mode: step.mode, patient: patients[0] });
              }
            }}
          />
          <ul className="voice-menu-list" aria-label="Patients">
            {patients.slice(0, PATIENT_LIMIT).map((patient) => (
              <li key={patient.id} className="voice-menu-item">
                <button
                  type="button"
                  className="voice-menu-option voice-menu-patient"
                  onClick={() => setStep({ kind: "type", mode: step.mode, patient })}
                >
                  <span className="voice-menu-initials" aria-hidden="true">{patient.initials}</span>
                  <span>
                    <strong>{patient.name}</strong>
                    <small>DOB {formatDateOfBirth(patient.dob)} · {patient.mrn}{patient.id === activePatientId ? " · Open now" : ""}</small>
                  </span>
                </button>
              </li>
            ))}
            {patients.length === 0 && <li className="voice-menu-empty">No patient matches “{patientQuery.trim()}”.</li>}
            {patients.length > PATIENT_LIMIT && (
              <li className="voice-menu-empty">{patients.length - PATIENT_LIMIT} more — keep typing to narrow.</li>
            )}
          </ul>
        </>
      )}

      {step.kind === "type" && (
        <>
          <div className="voice-menu-head">
            {back}
            <h2 className="voice-menu-title" tabIndex={-1} ref={headingRef}>
              {MODE_LABEL[step.mode]} · {step.patient.name}
            </h2>
          </div>
          <p className="voice-menu-subtitle">Pick the note type</p>
          <ul className="voice-menu-list voice-menu-types" aria-label="Note types">
            {choices.map((noteType) => (
              <li key={noteType.id} className="voice-menu-item">
                <button key={noteType.id} type="button" className="voice-menu-option" onClick={() => start(noteType)}>
                  <span><strong>{noteType.label}</strong></span>
                </button>
              </li>
            ))}
            {(["other", "create"] as const).map((kind) =>
              namingKind === kind ? (
                <li key={kind} className="voice-menu-item">
                  <form
                    className="voice-menu-name-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      startNamed();
                    }}
                  >
                    <input
                      className="voice-menu-input"
                      autoFocus
                      aria-label={kind === "other" ? "Note name" : "New note type name"}
                      placeholder={kind === "other" ? "Name this note" : "New note type name"}
                      value={typeName}
                      maxLength={60}
                      onChange={(event) => setTypeName(event.target.value)}
                    />
                    <button type="submit" className="voice-menu-submit" disabled={!typeName.trim()}>
                      {kind === "other" ? "Start" : "Save and start"}
                    </button>
                  </form>
                </li>
              ) : (
                <li key={kind} className="voice-menu-item">
                  <button
                    type="button"
                    className="voice-menu-option voice-menu-secondary"
                    onClick={() => {
                      setNamingKind(kind);
                      setTypeName("");
                    }}
                  >
                    <span className="voice-menu-icon"><Icon name={kind === "other" ? "edit" : "add"} /></span>
                    <span>
                      <strong>{kind === "other" ? "Other" : "Create new note type"}</strong>
                      <small>{kind === "other" ? "Name this note just this once." : "Save a type to reuse."}</small>
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}
