"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_MESSAGE_ATTACHMENTS,
  type MessageAttachment,
  type MessageAttachmentDraft,
  type MessageAttachmentKind,
  type MessageAttachmentRef,
} from "../../domain/messages";
import { clinicalRecordApi } from "../../lib/clinical-record-api";
import { formatClinicalDate } from "../../lib/clinical-date";
import { documentTypeLabel } from "../../lib/document-type-presentation";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import Icon from "../ui/Icon";

/**
 * Attachments on a patient message (D-127).
 *
 * A message carries chart records by reference: a signed note, a rating scale,
 * a chart document or a lab result. A file from the clinician's computer is
 * filed in the chart as a document first and then attached, so everything a
 * message carried is also in the record. The server re-checks every reference
 * against the patient when the message is written.
 */

export type AttachmentDraft = MessageAttachmentDraft;

const KIND_ICON: Record<MessageAttachmentKind, string> = {
  document: "description",
  encounter: "clinical_notes",
  assessment: "assignment",
  lab: "biotech",
};

const KIND_LABEL: Record<MessageAttachmentKind, string> = {
  document: "Document",
  encounter: "Signed note",
  assessment: "Rating scale",
  lab: "Lab result",
};

const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"];
const MAX_FILE_BYTES = 3 * 1024 * 1024;

type Tab = MessageAttachmentKind;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return file.text();
}

/** Chips for the attachments a draft carries, each removable. */
export function AttachmentDraftChips({
  attachments,
  onRemove,
}: {
  attachments: readonly AttachmentDraft[];
  onRemove: (attachment: AttachmentDraft) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="message-attachment-chips" aria-label="Attachments">
      {attachments.map((attachment) => (
        <li key={`${attachment.kind}:${attachment.recordId}`} className="message-attachment-chip">
          <Icon name={KIND_ICON[attachment.kind]} size="sm" />
          <span>
            <strong>{attachment.title}</strong>
            <small>{KIND_LABEL[attachment.kind]} · {attachment.detail}</small>
          </span>
          <button type="button" aria-label={`Remove ${attachment.title}`} onClick={() => onRemove(attachment)}>
            <Icon name="close" size="sm" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Attachments recorded on a sent message; each opens its record in the chart. */
export function SentAttachmentList({
  patientId,
  attachments,
}: {
  patientId: string;
  attachments?: readonly MessageAttachment[];
}) {
  if (!attachments?.length) return null;
  return (
    <ul className="message-attachment-chips is-sent" aria-label="Attached">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <button
            type="button"
            className="message-attachment-chip"
            title={`Open ${attachment.title} in the chart`}
            onClick={() => {
              const section =
                attachment.kind === "document" ? "Documents" : attachment.kind === "lab" ? "Labs" : "History";
              void navigateToPatientLocation(
                patientId,
                section,
                undefined,
                attachment.kind === "document" ? attachment.recordId : undefined,
              );
            }}
          >
            <Icon name={KIND_ICON[attachment.kind]} size="sm" />
            <span>
              <strong>{attachment.title}</strong>
              <small>{KIND_LABEL[attachment.kind]}{attachment.detail ? ` · ${attachment.detail}` : ""}</small>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type Candidate = AttachmentDraft & { searchText: string; sortDate: string };

/**
 * The Attach control: a button that opens an inline chooser of this patient's
 * chart records, grouped by kind, with search, plus a file picker. Inline
 * rather than floating, so it never sits under another layer.
 */
export function AttachmentPicker({
  patientId,
  selected,
  onChange,
  disabled = false,
  disabledReason,
}: {
  patientId: string;
  selected: readonly AttachmentDraft[];
  onChange: (next: AttachmentDraft[]) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("encounter");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || loadedFor === patientId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    clinicalRecordApi
      .snapshot(patientId)
      .then((snapshot) => {
        if (cancelled) return;
        const next: Candidate[] = [];
        for (const encounter of snapshot.encounters ?? []) {
          // Only a signed note is part of the record; a draft does not leave the practice.
          if (encounter.status !== "signed") continue;
          const detail = formatClinicalDate(encounter.date);
          next.push({
            kind: "encounter",
            recordId: encounter.id,
            title: `${encounter.type || "Visit"} note`,
            detail,
            searchText: `${encounter.type} ${encounter.chiefComplaint} ${encounter.date}`.toLowerCase(),
            sortDate: encounter.date,
          });
        }
        for (const assessment of snapshot.assessments ?? []) {
          next.push({
            kind: "assessment",
            recordId: assessment.id,
            title: assessment.title,
            detail: `Score ${assessment.totalScore}/${assessment.maxScore} · ${formatClinicalDate(assessment.administeredAt)}`,
            searchText: `${assessment.title} ${assessment.instrument} ${assessment.severity}`.toLowerCase(),
            sortDate: assessment.administeredAt,
          });
        }
        for (const document of snapshot.documents ?? []) {
          next.push({
            kind: "document",
            recordId: document.id,
            title: document.title,
            detail: `${documentTypeLabel(document.documentType)} · ${formatClinicalDate(document.createdAt)}`,
            searchText: `${document.title} ${documentTypeLabel(document.documentType)}`.toLowerCase(),
            sortDate: document.createdAt,
          });
        }
        for (const observation of snapshot.observations ?? []) {
          if (observation.category !== "laboratory") continue;
          if (observation.status === "entered-in-error" || observation.status === "cancelled") continue;
          next.push({
            kind: "lab",
            recordId: observation.id,
            title: observation.test_name,
            detail: `${observation.value_text}${observation.unit ? ` ${observation.unit}` : ""} · ${formatClinicalDate(observation.effective_at)}`,
            searchText: `${observation.test_name} ${observation.value_text}`.toLowerCase(),
            sortDate: observation.effective_at,
          });
        }
        const time = (value: string) => {
          const parsed = Date.parse(value);
          return Number.isNaN(parsed) ? 0 : parsed;
        };
        next.sort((a, b) => time(b.sortDate) - time(a.sortDate));
        setCandidates(next);
        setLoadedFor(patientId);
      })
      .catch(() => {
        if (!cancelled) setError("The chart's records could not be loaded. Close and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patientId, loadedFor]);

  const counts = useMemo(() => {
    const result: Record<Tab, number> = { encounter: 0, assessment: 0, document: 0, lab: 0 };
    for (const candidate of candidates) result[candidate.kind] += 1;
    return result;
  }, [candidates]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((candidate) => candidate.kind === tab && (!q || candidate.searchText.includes(q) || candidate.title.toLowerCase().includes(q)));
  }, [candidates, tab, query]);

  const isSelected = (candidate: MessageAttachmentRef) =>
    selected.some((item) => item.kind === candidate.kind && item.recordId === candidate.recordId);
  const atLimit = selected.length >= MAX_MESSAGE_ATTACHMENTS;

  function toggle(candidate: Candidate) {
    if (isSelected(candidate)) {
      onChange(selected.filter((item) => !(item.kind === candidate.kind && item.recordId === candidate.recordId)));
    } else if (!atLimit) {
      const { kind, recordId, title, detail } = candidate;
      onChange([...selected, { kind, recordId, title, detail }]);
    }
  }

  async function attachFile(file: File) {
    setError("");
    const mimeType = file.type || (file.name.toLowerCase().endsWith(".txt") ? "text/plain" : "");
    if (!FILE_TYPES.includes(mimeType)) {
      setError("Attach a PDF, an image (PNG, JPEG, GIF, WebP) or a text file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 3 MB. Attach a smaller file.");
      return;
    }
    if (atLimit) {
      setError(`A message can carry at most ${MAX_MESSAGE_ATTACHMENTS} attachments.`);
      return;
    }
    setUploading(true);
    try {
      const contentText = mimeType === "text/plain" ? await readAsText(file) : await readAsDataUrl(file);
      const title = file.name.replace(/\.[^.]+$/, "") || "Attachment";
      const created = await clinicalRecordApi.createDocument(patientId, {
        documentType: "message_attachment",
        title,
        mimeType,
        contentText,
      });
      onChange([
        ...selected,
        { kind: "document", recordId: created.id, title, detail: `File filed in chart · ${Math.max(1, Math.round(file.size / 1024))} KB` },
      ]);
      // The new document is part of the chart now; the list reloads to show it.
      setLoadedFor(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The file was not attached. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="message-attachment-picker">
      <button
        type="button"
        className="message-attach-btn"
        aria-expanded={open}
        disabled={disabled}
        title={disabled ? disabledReason : "Attach a note, assessment, document, lab result or file"}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="attach_file" size="sm" />
        <span>Attach{selected.length ? ` (${selected.length})` : ""}</span>
      </button>
      {open ? (
        <div className="message-attachment-panel" role="group" aria-label="Choose attachments">
          <div className="message-attachment-tabs" role="tablist" aria-label="Record type">
            {(["encounter", "assessment", "document", "lab"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
              >
                {value === "encounter" ? "Notes" : value === "assessment" ? "Assessments" : value === "document" ? "Documents" : "Labs"}
                {loadedFor === patientId ? ` (${counts[value]})` : ""}
              </button>
            ))}
          </div>
          <input
            className="message-attachment-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search this patient's records…"
            aria-label="Search records to attach"
          />
          <div className="message-attachment-options">
            {loading ? (
              <p className="message-attachment-empty">Loading the chart…</p>
            ) : visible.length === 0 ? (
              <p className="message-attachment-empty">
                {tab === "encounter"
                  ? "No signed notes match. Only signed notes can be attached."
                  : "Nothing here matches."}
              </p>
            ) : (
              visible.map((candidate) => (
                <label key={`${candidate.kind}:${candidate.recordId}`} className="message-attachment-option">
                  <input
                    type="checkbox"
                    checked={isSelected(candidate)}
                    disabled={!isSelected(candidate) && atLimit}
                    onChange={() => toggle(candidate)}
                  />
                  <span>
                    <strong>{candidate.title}</strong>
                    <small>{candidate.detail}</small>
                  </span>
                </label>
              ))
            )}
          </div>
          {error ? <p className="message-attachment-error" role="alert">{error}</p> : null}
          <div className="message-attachment-footer">
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={FILE_TYPES.join(",")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attachFile(file);
              }}
            />
            <button
              type="button"
              className="message-attachment-upload"
              disabled={uploading || atLimit}
              onClick={() => fileInput.current?.click()}
            >
              <Icon name="upload_file" size="sm" />
              {uploading ? "Filing in chart…" : "Upload a file"}
            </button>
            <small>Uploaded files are filed in the chart under Documents.</small>
            <button type="button" className="message-attachment-done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
