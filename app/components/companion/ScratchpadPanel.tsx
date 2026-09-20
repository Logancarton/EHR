"use client";

import { type ScratchNote } from "../../domain/tasks";
import AsyncSection, { InlineError } from "../ui/AsyncSection";
import Icon from "../ui/Icon";
import CompanionPanelHeader from "./CompanionPanelHeader";

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
}: {
  notes: ScratchNote[];
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  onRetry: () => void;
  newNoteText: string;
  setNewNoteText: (text: string) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
  onInsertToNote: (text: string) => void;
  onClose: () => void;
  onUnpin?: () => void;
}) {
  return (
    <aside className="companion-panel">
      <CompanionPanelHeader
        title="Clinical Scratchpad"
        context="Quick notes, formulas, phone memos"
        icon="edit_note"
        iconStyle={{ background: "#feefe3", color: "#b06000" }}
        onClose={onClose}
        onUnpin={onUnpin}
        unpinLabel="Unpin Scratchpad"
      />

      <div className="scratchpad-container">
        <div className="scratchpad-composer">
          <textarea
            placeholder="Jot down quick thoughts, phone call notes..."
            value={newNoteText}
            disabled={!hasLoaded || loading}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                onAddNote(newNoteText);
              }
            }}
          />
          <button type="button" disabled={!hasLoaded || loading} onClick={() => onAddNote(newNoteText)}>
            ＋ Add note
          </button>
        </div>

        {error && hasLoaded ? <InlineError message={error} onRetry={onRetry} /> : null}
        <AsyncSection
          loading={loading}
          error={!hasLoaded ? error : null}
          isEmpty={notes.length === 0}
          hasLoadedOnce={hasLoaded}
          loadingMessage="Loading scratchpad…"
          emptyMessage="No scratchpad notes are currently saved."
          onRetry={onRetry}
        >
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
                  <Icon name="content_paste" /> Copy
                </button>
                <button
                  type="button"
                  className="note-copy-btn"
                  style={{ color: "var(--m3-danger)" }}
                  title="Delete note"
                  onClick={() => onDeleteNote(note.id)}
                >
                  <Icon name="close" />
                </button>
              </div>
            </div>
          </div>
        ))}
        </AsyncSection>
      </div>
    </aside>
  );
}
