"use client";

import { useMemo, useState } from "react";
import { navigateToPatientLocation } from "../../lib/workspace-navigation";
import type { PracticeDocumentQueueRow } from "../../lib/practice-queue-api";
import AsyncSection from "../ui/AsyncSection";
import Button from "../ui/Button";
import Icon from "../ui/Icon";

type DocumentFilter = "all" | "incoming" | "needs_review" | "recent" | "external";

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

function workflowLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
      if (filter === "incoming" && row.workflowStatus !== "received") return false;
      if (filter === "needs_review" && row.workflowStatus !== "needs_review") return false;
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
        row.workflowStatus,
        row.reviewedBy,
        row.filedBy,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [rows, filter, query, typeFilter]);

  const incoming = rows.filter((row) => row.workflowStatus === "received").length;
  const needsReview = rows.filter((row) => row.workflowStatus === "needs_review").length;
  const filed = rows.filter((row) => row.workflowStatus === "filed").length;
  const external = rows.filter(isExternal).length;

  return (
    <div className="global-documents-workspace">
      <div className="global-module-summary-strip">
        <div><strong>{incoming}</strong><span>Received</span></div>
        <div><strong>{needsReview}</strong><span>Needs review</span></div>
        <div><strong>{filed}</strong><span>Filed</span></div>
        <div><strong>{external}</strong><span>External source</span></div>
      </div>

      <div className="global-queue-toolbar">
        <div className="global-filter-group">
          {(["all", "incoming", "needs_review", "recent", "external"] as DocumentFilter[]).map((value) => (
            <Button key={value} size="sm" pressed={filter === value} onClick={() => setFilter(value)}>
              {value === "all" ? "All" : value === "incoming" ? "Received" : value === "needs_review" ? "Needs review" : value === "recent" ? "Recent" : "External"}
            </Button>
          ))}
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter documents by type">
          <option value="all">All document types</option>
          {types.map((type) => <option value={type} key={type}>{type}</option>)}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, title, workflow, source…" aria-label="Search practice document queue" />
        <Button className="global-refresh-btn" icon="refresh" loading={loading} loadingLabel="Refreshing…" onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      <div className="global-document-list">
        <AsyncSection
          loading={loading}
          error={error || null}
          isEmpty={filtered.length === 0}
          hasLoadedOnce={rows.length > 0}
          loadingMessage="Loading authoritative documents…"
          emptyMessage={
            rows.length === 0
              ? "No documents are in the practice queue."
              : "No documents match these filters."
          }
          onRetry={onRefresh}
        >
          {filtered.map((row) => (
          <button
            type="button"
            key={row.documentId}
            className="global-document-row"
            onClick={() => void navigateToPatientLocation(row.patientId, "Documents", undefined, row.documentId)}
          >
            <span className="global-inbox-avatar">{row.patientInitials || "•"}</span>
            <span className="global-document-main">
              <span className="global-document-row-top">
                <strong>{row.patientName}</strong>
                <small>{row.patientMrn}</small>
                <span className="global-document-type">{row.documentType}</span>
                <span className={`global-document-workflow ${row.workflowStatus}`}>{workflowLabel(row.workflowStatus)}</span>
                <time>{formatDate(row.updatedAt)}</time>
              </span>
              <b>{row.title}</b>
              <span className="global-inbox-meta">
                Version {row.currentVersion} · {row.mimeType || "document"} · {row.sourceSystem || "EHR"}
                {row.reviewedBy ? ` · Reviewed by ${row.reviewedBy}` : ""}
                {row.filedBy ? ` · Filed by ${row.filedBy}` : ""}
              </span>
              {row.sourceRef ? <span className="global-source-ref">Source: {row.sourceRef}</span> : null}
            </span>
            <span className="global-row-arrow">→</span>
          </button>
          ))}
        </AsyncSection>
      </div>
    </div>
  );
}
