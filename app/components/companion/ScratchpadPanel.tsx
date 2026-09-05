"use client";

import { type ScratchNote } from "../../domain/tasks";

export default function ScratchpadPanel({
  notes,
  newNoteText,
  setNewNoteText,
  onAddNote,
  onDeleteNote,
  onInsertToNote,
  onClose,
}: {
  notes: ScratchNote[];
  newNoteText: string;
  setNewNoteText: (text: string) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
  onInsertToNote: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#feefe3", color: "#b06000" }}>📝</span>
          <div>
            <strong>Clinical Scratchpad</strong>
            <small>Quick notes, formulas, phone memos</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="scratchpad-container">
        <div className="scratchpad-composer">
          <textarea
            placeholder="Jot down quick thoughts, phone call notes..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                onAddNote(newNoteText);
              }
            }}
          />
          <button type="button" onClick={() => onAddNote(newNoteText)}>
            ＋ Add note
          </button>
        </div>

        {notes.map((note) => (
          <div key={note.id} className={`scratchpad-note ${note.color}`}>
            <div className="note-text">{note.text}</div>
            <div className="note-footer">
              <span>{note.time}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="note-copy-btn"
                  title="Copy to clipboard / note"
                  onClick={() => onInsertToNote(note.text)}
                >
                  📋 Copy
                </button>
                <button
                  type="button"
                  className="note-copy-btn"
                  style={{ color: "var(--m3-danger)" }}
                  title="Delete note"
                  onClick={() => onDeleteNote(note.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
