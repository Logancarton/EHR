"use client";

import { useMemo, useState } from "react";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import type { PracticeDocumentQueueRow } from "../../lib/practice-queue-api";

type DocumentFilter = "all" | "recent" | "external";

function formatDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

function isRecent(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && Date.now() - parsed <= 14 * 24 * 60 * 60 * 1000;
}

function isExternal(row: PracticeDocumentQueueRow) {
  const source = (row.sourceSystem || "").toLowerCase();
  return Boolean(source && !["ehr-local", "ehr", "local"].includes(source));
}

export default function GlobalDocumentsWorkspace({
  rows,
  loading,
  error,
  onRefresh,
}: {
  rows: PracticeDocumentQueueRow[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const types = useMemo(() => [...new Set(rows.map((row) => row.documentType).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "recent" && !isRecent(row.updatedAt)) return false;
      if (filter === "external" && !isExternal(row)) return false;
      if (typeFilter !== "all" && row.documentType !== typeFilter) return false;
      if (!normalized) return true;
      return [
        row.patientName,
        row.patientMrn,
        row.title,
        row.documentType,
        row.mimeType,
        row.sourceSystem,
        row.sourceRef,
        row.createdBy,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [rows, filter, query, typeFilter]);

  const recent = rows.filter((row) => isRecent(row.updatedAt)).length;
  const external = rows.filter(isExternal).length;
  const versioned = rows.filter((row) => row.currentVersion > 1).length;

  return (
    <div className="global-documents-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{rows.length}</strong><span>Documents</span></div>
        <div><strong>{recent}</strong><span>Updated 14d</span></div>
        <div><strong>{external}</strong><span>External source</span></div>
        <div><strong>{versioned}</strong><span>Multi-version</span></div>
      </div>

      <div className="global-queue-toolbar">
        <div className="global-filter-group">
          {(["all", "recent", "external"] as DocumentFilter[]).map((value) => (
            <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : value === "recent" ? "Recent" : "External"}
            </button>
          ))}
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter documents by type">
          <option value="all">All document types</option>
          {types.map((type) => <option value={type} key={type}>{type}</option>)}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, title, type, source…" aria-label="Search practice document queue" />
        <button type="button" className="global-refresh-btn" onClick={onRefresh}>↻ Refresh</button>
      </div>

      {error ? <div className="global-inline-error">{error}</div> : null}

      <div className="global-document-list">
        {loading ? (
          <div className="global-empty-state">Loading authoritative documents…</div>
        ) : filtered.length === 0 ? (
          <div className="global-empty-state">No documents match these filters.</div>
        ) : filtered.map((row) => (
          <button type="button" key={row.documentId} className="global-document-row" onClick={() => void navigateToPatientLocation(row.patientId, "History")}>
            <span className="global-inbox-avatar">{row.patientInitials || "•"}</span>
            <span className="global-document-main">
              <span className="global-document-row-top">
                <strong>{row.patientName}</strong>
                <small>{row.patientMrn}</small>
                <span className="global-document-type">{row.documentType}</span>
                <time>{formatDate(row.updatedAt)}</time>
              </span>
              <b>{row.title}</b>
              <span className="global-inbox-meta">
                Version {row.currentVersion} · {row.mimeType || "document"} · {row.sourceSystem || "EHR"}
                {row.createdBy ? ` · Added by ${row.createdBy}` : ""}
              </span>
              {row.sourceRef ? <span className="global-source-ref">Source: {row.sourceRef}</span> : null}
            </span>
            <span className="global-row-arrow">→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
