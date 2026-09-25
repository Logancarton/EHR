"use client";

import { useEffect, useMemo, useState } from "react";
import { type ScratchNote } from "../../domain/tasks";
import type { Patient } from "../../domain/patient";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Icon from "../ui/Icon";
import CompanionPanelFrame from "./CompanionPanelFrame";

const PRACTICE_TARGET = "";

/**
 * Scratchpad notes are either about one patient or about the practice, and the
 * panel says which on every note. With a chart in front of the clinician it shows
 * that patient's notes and practice notes only — another patient's titration memo
 * with no name on it is exactly the wrong-patient error a chart is built to stop.
 * Practice canvases show everything, each note naming whom it belongs to.
 */
export default function ScratchpadPanel({
  notes,
  loading,
  error,
  hasLoaded,
  onRetry,
  newNoteText,
  setNewNoteText,
  onAddNote,
  onDeleteNote,
  onInsertToNote,
  onClose,
  onUnpin,
  activePatient,
  roster = [],
  isExpanded = false,
  onExpand,
  onRedock,
}: {
  notes: ScratchNote[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  onRetry: () => void;
  newNoteText: string;
  setNewNoteText: (text: string) => void;
  onAddNote: (text: string, patientId?: string) => void;
  onDeleteNote: (id: string) => void;
  onInsertToNote: (text: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
  /** The patient whose chart is the foreground canvas, if any. */
  activePatient?: Pick<Patient, "id" | "name"> | null;
  roster?: readonly Pick<Patient, "id" | "name">[];
  isExpanded?: boolean;
  onExpand?: () => void;
  onRedock?: () => void;
}) {
  const [target, setTarget] = useState<string>(activePatient?.id ?? PRACTICE_TARGET);

  // A new note defaults to the chart in front of the clinician, and follows it.
  useEffect(() => {
    setTarget(activePatient?.id ?? PRACTICE_TARGET);
  }, [activePatient?.id]);

  const nameFor = useMemo(() => {
    const names = new Map(roster.map((patient) => [patient.id, patient.name]));
    if (activePatient) names.set(activePatient.id, activePatient.name);
    return (patientId: string) => names.get(patientId) ?? "Unlisted patient";
  }, [activePatient, roster]);

  const visibleNotes = activePatient
    ? notes.filter((note) => !note.patientId || note.patientId === activePatient.id)
    : notes;
  const hiddenCount = notes.length - visibleNotes.length;

  function addNote() {
    onAddNote(newNoteText, target || undefined);
  }

  return (
    <CompanionPanelFrame
      className="scratchpad-panel"
      rootProps={{
        "data-companion-panel": "scratchpad",
        "data-companion-presentation": isExpanded ? "expanded" : "docked",
      }}
      ariaLabel="Scratchpad"
      title="Clinical Scratchpad"
      context={activePatient ? `${activePatient.name} · plus practice notes` : "All notes"}
      icon="edit_note"
      iconStyle={{ background: "#feefe3", color: "#b06000" }}
      onClose={onClose}
      onUnpin={onUnpin}
      unpinLabel="Unpin Scratchpad"
      isExpanded={isExpanded}
      onExpand={onExpand}
      onRedock={onRedock}
      bodyClassName="scratchpad-container"
    >
      <div className="scratchpad-composer">
        <textarea
          placeholder="Jot down quick thoughts, phone call notes..."
          value={newNoteText}
          disabled={!hasLoaded || loading}
          onChange={(e) => setNewNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
          }}
        />
        <div className="scratchpad-composer-row">
          <label className="scratchpad-target">
            <span>For</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label="Who this note is about"
            >
              {activePatient ? <option value={activePatient.id}>{activePatient.name}</option> : null}
              <option value={PRACTICE_TARGET}>Practice note — no patient</option>
            </select>
          </label>
          <button type="button" disabled={!hasLoaded || loading} onClick={addNote}>
            Add note
          </button>
        </div>
      </div>

      {error && hasLoaded ? <InlineError message={error} onRetry={onRetry} /> : null}
      <AsyncSection
        loading={loading}
        error={!hasLoaded ? error : null}
        isEmpty={visibleNotes.length === 0}
        hasLoadedOnce={hasLoaded}
        loadingMessage="Loading scratchpad…"
        emptyMessage={
          activePatient
            ? `No notes for ${activePatient.name} and no practice notes.`
            : "No scratchpad notes are currently saved."
        }
        onRetry={onRetry}
      >
        {visibleNotes.map((note) => (
          <div
            key={note.id}
            className={`scratchpad-note ${note.color}`}
            data-note-scope={note.patientId ? "patient" : "practice"}
          >
            <span className={`scratchpad-note-owner ${note.patientId ? "" : "is-practice"}`}>
              <Icon name={note.patientId ? "person" : "domain"} size="sm" />
              {note.patientId ? nameFor(note.patientId) : "Practice note — no patient"}
            </span>
            <div className="note-text">{note.text}</div>
            <div className="note-footer">
              <span>{note.time}</span>
              <div className="note-actions">
                <button
                  type="button"
                  className="note-copy-btn"
                  title="Copy to clipboard / note"
                  onClick={() => onInsertToNote(note.text)}
                >
                  <Icon name="content_paste" size="sm" /> Copy
                </button>
                <button
                  type="button"
                  className="note-copy-btn is-danger"
                  title="Delete note"
                  aria-label="Delete note"
                  onClick={() => onDeleteNote(note.id)}
                >
                  <Icon name="close" size="sm" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </AsyncSection>
      {hiddenCount > 0 ? (
        <p className="scratchpad-hidden-note" role="note">
          {hiddenCount} {hiddenCount === 1 ? "note" : "notes"} about other patients hidden while this chart is open.
        </p>
      ) : null}
    </CompanionPanelFrame>
  );
}
