"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Patient } from "../../domain/patient";
import { formatClinicalDate } from "../../lib/clinical-date";
import { forgetDocumentFocus, peekDocumentFocus } from "../../lib/document-focus-request";
import { DOCUMENT_TYPE_OPTIONS, documentTypeLabel } from "../../lib/document-type-presentation";
import { describeRecordSource } from "../../lib/record-source-presentation";
import {
  WORKSPACE_SELECT_DOCUMENT_EVENT,
  WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";
import AsyncSection from "../ui/AsyncSection";
import { RecordGroups, RecordOrganizerBar, RecordOrganizerDisclosure, describeOrganization } from "../ui/RecordOrganizer";
import { organizeRecords, useRecordOrganization } from "../../lib/record-organization";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import SafetyPlanReviewDialog from "./SafetyPlanReviewDialog";
import { isSafetyPlanDraft } from "../../domain/patient-form-requests";

type WorkflowStatus = "received" | "needs_review" | "reviewed" | "filed" | "superseded";

type DocumentRecord = {
  id: string;
  patient_id: string;
  document_type: string;
  title: string;
  status: string;
  workflow_status?: WorkflowStatus;
  current_version: number;
  mime_type?: string | null;
  storage_key?: string | null;
  content_sha256?: string | null;
  source_system?: string | null;
  source_ref?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  workflow_updated_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  filed_by?: string | null;
  filed_at?: string | null;
  superseded_by_document_id?: string | null;
};

type DocumentVersion = {
  id: string;
  version_number: number;
  content_text?: string | null;
  mime_type?: string | null;
  storage_key?: string | null;
  content_sha256?: string | null;
  created_by?: string | null;
  created_at: string;
};

type WorkflowEvent = {
  id: string;
  from_status: WorkflowStatus;
  to_status: WorkflowStatus;
  note?: string | null;
  actor_name: string;
  created_at: string;
};

const nextStatus: Partial<Record<WorkflowStatus, WorkflowStatus>> = {
  received: "needs_review",
  needs_review: "reviewed",
  reviewed: "filed",
  filed: "superseded",
};

function label(status: WorkflowStatus) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function actionLabel(status: WorkflowStatus) {
  return {
    received: "Send to review",
    needs_review: "Mark reviewed",
    reviewed: "File document",
    filed: "Supersede",
    superseded: "Complete",
  }[status];
}

function formatDate(value?: string | null) {
  return formatClinicalDate(value);
}

/** A stored file (PDF or image) is kept as a data URL; text is kept as text. */
function isFileContent(content?: string | null): content is string {
  return Boolean(content && /^data:(application\/pdf|image\/(png|jpeg|gif|webp));base64,/.test(content));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightedDocumentText(content: string, terms: readonly string[]) {
  const normalizedTerms = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2))];
  if (!normalizedTerms.length) return content;
  const matcher = new RegExp(`(${normalizedTerms.map(escapeRegExp).join("|")})`, "gi");
  return content.split(matcher).map((part, index) =>
    normalizedTerms.some((term) => part.toLowerCase() === term.toLowerCase())
      ? <mark key={`${index}:${part}`} data-document-search-match="true">{part}</mark>
      : part,
  );
}

function DocumentContent({
  version,
  title,
  highlightTerms,
}: {
  version: DocumentVersion | null;
  title: string;
  highlightTerms: readonly string[];
}) {
  const content = version?.content_text;
  if (!isFileContent(content)) {
    return (
      <div className="patient-document-reader-content">
        {content ? highlightedDocumentText(content, highlightTerms) : "No text content stored for this document version."}
      </div>
    );
  }
  const isPdf = content.startsWith("data:application/pdf");
  const extension = isPdf ? "pdf" : content.slice(11, content.indexOf(";")).replace("jpeg", "jpg");
  return (
    <div className="patient-document-reader-content is-file">
      {isPdf ? (
        <object data={content} type="application/pdf" aria-label={title} className="patient-document-file-preview">
          <p>This browser cannot preview the PDF here. Download it to read it.</p>
        </object>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a data URL from the chart, not a remote asset
        <img src={content} alt={title} className="patient-document-file-preview" />
      )}
      <a className="patient-document-file-download" href={content} download={`${title.replace(/[^\w.-]+/g, "_")}.${extension}`}>
        <Icon name="download" size="sm" /> Download
      </a>
    </div>
  );
}

export default function PatientDocuments({ patient }: { patient: Patient }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [safetyPlanReviewOpen, setSafetyPlanReviewOpen] = useState(false);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | WorkflowStatus>("all");
  const [organization, organize] = useRecordOrganization("ehr.organize.patient-documents");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const [copiedSha, setCopiedSha] = useState(false);
  const [highlightTerms, setHighlightTerms] = useState<string[]>([]);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<{
    documentId: string;
    documentVersionNumber?: number;
    documentSearchTerms?: string[];
  } | null>(null);

  // Modal states for Document Intake and Revision
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("consult_note");
  const [uploadContent, setUploadContent] = useState("");
  /** A chosen file: its type and data URL, sent instead of pasted text. */
  const [uploadFile, setUploadFile] = useState<{ name: string; mimeType: string; dataUrl: string } | null>(null);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  const [reviseModalOpen, setReviseModalOpen] = useState(false);
  const [reviseContent, setReviseContent] = useState("");
  const [reviseSubmitting, setReviseSubmitting] = useState(false);

  // Only the latest read may choose the selection. Two reads in flight (a remount,
  // a refresh after a workflow change) used to let the later-finishing one fall
  // back to the newest document, replacing a document that had just been opened
  // from AI search.
  const loadRequestRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  async function loadDocuments(preferredId?: string | null) {
    const request = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clinical-records?patientId=${encodeURIComponent(patient.id)}`, {
        cache: "no-store",
        headers: { "x-ehr-patient-id": patient.id },
      });
      const payload = await response.json();
      if (request !== loadRequestRef.current) return;
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to load documents");
      const next = Array.isArray(payload.record?.documents) ? (payload.record.documents as DocumentRecord[]) : [];
      setDocuments(next);
      const requested = preferredId || pendingSelectionRef.current?.documentId || selectedIdRef.current;
      const nextSelectedId = requested && next.some((doc) => doc.id === requested) ? requested : next[0]?.id || null;
      setSelectedId(nextSelectedId);
    } catch (cause) {
      if (request !== loadRequestRef.current) return;
      setDocuments([]);
      setSelectedId(null);
      setError(cause instanceof Error ? cause.message : "Unable to load documents");
    } finally {
      if (request === loadRequestRef.current) setLoading(false);
    }
  }

  async function loadDetail(documentId: string) {
    setDetailLoading(true);
    try {
      const patientQuery = encodeURIComponent(patient.id);
      const documentQuery = encodeURIComponent(documentId);
      const requestOptions: RequestInit = {
        cache: "no-store",
        headers: { "x-ehr-patient-id": patient.id },
      };
      const [versionResponse, workflowResponse] = await Promise.all([
        fetch(`/api/clinical-records?patientId=${patientQuery}&documentId=${documentQuery}`, requestOptions),
        fetch(`/api/documents/workflow?patientId=${patientQuery}&documentId=${documentQuery}`, requestOptions),
      ]);
      const [versionPayload, workflowPayload] = await Promise.all([versionResponse.json(), workflowResponse.json()]);
      setVersions(versionResponse.ok && versionPayload.success !== false && Array.isArray(versionPayload.versions) ? versionPayload.versions : []);
      setEvents(workflowResponse.ok && workflowPayload.success !== false && Array.isArray(workflowPayload.events) ? workflowPayload.events : []);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    pendingSelectionRef.current = peekDocumentFocus(patient.id);
    setSelectedId(null);
    setSelectedVersionNumber(null);
    setHighlightTerms([]);
    void loadDocuments();
  }, [patient.id]);

  useEffect(() => {
    setReplacementId("");
    const pending = pendingSelectionRef.current?.documentId === selectedId ? pendingSelectionRef.current : null;
    setSelectedVersionNumber(pending?.documentVersionNumber ?? null);
    setHighlightTerms(pending?.documentSearchTerms || []);
    if (pending) {
      pendingSelectionRef.current = null;
      forgetDocumentFocus(patient.id);
    }
    if (selectedId) void loadDetail(selectedId);
    else {
      setVersions([]);
      setEvents([]);
    }
  }, [selectedId]);

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_SELECT_DOCUMENT_EVENT, (detail) => {
      if (detail.patientId !== patient.id) return;
      // Heard live, so it is not left over for a later mount.
      forgetDocumentFocus(detail.patientId);
      pendingSelectionRef.current = {
        documentId: detail.documentId,
        documentVersionNumber: detail.documentVersionNumber,
        documentSearchTerms: detail.documentSearchTerms,
      };
      if (selectedId === detail.documentId) {
        setSelectedVersionNumber(detail.documentVersionNumber ?? null);
        setHighlightTerms(detail.documentSearchTerms || []);
        pendingSelectionRef.current = null;
      } else {
        setSelectedId(detail.documentId);
      }
    });
  }, [patient.id, selectedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return documents.filter((doc) => {
      const status = (doc.workflow_status || "received") as WorkflowStatus;
      if (statusFilter === "open" && status !== "received" && status !== "needs_review") return false;
      if (statusFilter !== "all" && statusFilter !== "open" && status !== statusFilter) return false;
      if (!normalized) return true;
      return [doc.title, doc.document_type, documentTypeLabel(doc.document_type), doc.source_system, doc.source_ref, doc.workflow_status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [documents, query, statusFilter]);

  // A chart can hold hundreds of documents: the clinician chooses how they are
  // sorted, grouped and windowed, and the choice is remembered (record-organization).
  const organized = useMemo(
    () => organizeRecords(
      filtered,
      (doc) => ({ date: doc.updated_at, title: doc.title, typeLabel: documentTypeLabel(doc.document_type) }),
      organization,
    ),
    [filtered, organization],
  );

  const selected = documents.find((doc) => doc.id === selectedId) || null;
  const currentStatus = (selected?.workflow_status || "received") as WorkflowStatus;
  const targetStatus = nextStatus[currentStatus];
  const replacementOptions = documents.filter(
    (doc) => doc.id !== selectedId && (doc.workflow_status || "received") !== "superseded"
  );

  const activeVersion = useMemo(() => {
    if (!versions.length) return null;
    if (selectedVersionNumber !== null) {
      const found = versions.find((v) => v.version_number === selectedVersionNumber);
      if (found) return found;
    }
    return versions.find((v) => v.version_number === selected?.current_version) || versions[0] || null;
  }, [versions, selectedVersionNumber, selected?.current_version]);

  useEffect(() => {
    if (!highlightTerms.length || !activeVersion || isFileContent(activeVersion.content_text)) return;
    const timer = window.setTimeout(() => {
      readerRef.current
        ?.querySelector<HTMLElement>("[data-document-search-match='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeVersion, highlightTerms]);


  async function advanceWorkflow() {
    if (!selected || !targetStatus) return;
    if (targetStatus === "superseded" && !replacementId) {
      setError("Choose the replacement document before superseding this one.");
      return;
    }
    setActing(true);
    setError("");
    try {
      const response = await fetch("/api/documents/workflow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ehr-patient-id": patient.id,
        },
        body: JSON.stringify({
          documentId: selected.id,
          toStatus: targetStatus,
          supersededByDocumentId: targetStatus === "superseded" ? replacementId : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to update document workflow");
      await loadDocuments(selected.id);
      await loadDetail(selected.id);
      dispatchWorkspaceEvent(WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT, {
        patientId: patient.id,
        documentId: selected.id,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update document workflow");
    } finally {
      setActing(false);
    }
  }

  async function handleCreateDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadTitle.trim() || (!uploadFile && !uploadContent.trim())) {
      setError("A document title and either a file or text content are required.");
      return;
    }
    setUploadSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/clinical-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ehr-patient-id": patient.id,
        },
        body: JSON.stringify({
          type: "create_document",
          payload: {
            patientId: patient.id,
            documentType: uploadType,
            title: uploadTitle.trim(),
            mimeType: uploadFile ? uploadFile.mimeType : "text/plain",
            contentText: uploadFile ? uploadFile.dataUrl : uploadContent.trim(),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Failed to create document.");
      setUploadModalOpen(false);
      setUploadTitle("");
      setUploadContent("");
      setUploadFile(null);
      await loadDocuments(payload.result?.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to create document.");
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function handleReviseDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !reviseContent.trim()) {
      setError("Revised text content is required.");
      return;
    }
    setReviseSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/clinical-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ehr-patient-id": patient.id,
        },
        body: JSON.stringify({
          type: "revise_document",
          payload: {
            documentId: selected.id,
            mimeType: "text/plain",
            contentText: reviseContent.trim(),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Failed to revise document.");
      setReviseModalOpen(false);
      setReviseContent("");
      await loadDocuments(selected.id);
      await loadDetail(selected.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to revise document.");
    } finally {
      setReviseSubmitting(false);
    }
  }

  return (
    <section className="patient-documents-workspace">
      <aside className="patient-documents-list-pane">
        <div className="patient-documents-list-head">
          <div>
            <h2>Documents</h2>
          </div>
          <div className="patient-doc-header-actions">
            <span className="patient-doc-count" title={filtered.length === documents.length ? undefined : `${filtered.length} of ${documents.length} shown`}>
              {filtered.length === documents.length ? documents.length : `${filtered.length}/${documents.length}`}
            </span>
            <Button
              className="patient-doc-upload-btn"
              variant="primary"
              size="sm"
              icon="upload"
              onClick={() => setUploadModalOpen(true)}
              title="Upload new clinical document"
            >
              Upload
            </Button>
          </div>
        </div>
        <input
          className="patient-doc-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          aria-label="Search patient documents"
        />
        <RecordOrganizerDisclosure summary={[
          ({ all: "All statuses", open: "Needs action", reviewed: "Reviewed", filed: "Filed", superseded: "Superseded" } as Record<string, string>)[statusFilter] ?? statusFilter,
          describeOrganization(organization),
        ].join(" · ")}>
        <div className="patient-doc-organize">
          <label className="patient-doc-status-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">All statuses</option>
              <option value="open">Needs action</option>
              <option value="reviewed">Reviewed</option>
              <option value="filed">Filed</option>
              <option value="superseded">Superseded</option>
            </select>
          </label>
          <RecordOrganizerBar label="documents" organization={organization} onChange={organize} compact />
        </div>
        </RecordOrganizerDisclosure>
        <div className="patient-doc-list">
          <AsyncSection
            loading={loading}
            error={error || null}
            isEmpty={filtered.length === 0}
            hasLoadedOnce={documents.length > 0}
            loadingMessage="Loading documents…"
            emptyMessage={
              documents.length === 0
                ? "No documents are filed in this chart yet."
                : "No documents match this search or status."
            }
            onRetry={() => void loadDocuments(selectedId)}
          >
            <RecordGroups
              groups={organized.groups}
              hiddenByWindow={organized.hiddenByWindow}
              onShowAll={() => organize({ window: "all" })}
              emptyMessage="No documents in this date range."
              renderItem={(doc) => (
              <button
                type="button"
                key={doc.id}
                data-document-id={doc.id}
                className={`patient-doc-row ${selectedId === doc.id ? "active" : ""}`}
                onClick={() => setSelectedId(doc.id)}
              >
                <span className={`patient-doc-status-dot ${doc.workflow_status || "received"}`} />
                <span className="patient-doc-row-copy">
                  <strong>{doc.title}</strong>
                  <small>{documentTypeLabel(doc.document_type)} · v{doc.current_version}</small>
                  <small>
                    {label((doc.workflow_status || "received") as WorkflowStatus)} · {formatDate(doc.updated_at)}
                  </small>
                </span>
              </button>
            )}
            />
          </AsyncSection>
        </div>
      </aside>

      <div className="patient-document-detail-pane">
        {error ? <div className="global-inline-error">{error}</div> : null}
        {!selected ? (
          <div className="global-empty-state">Select a document to review its details.</div>
        ) : (
          <article className="patient-document-detail" data-document-id={selected.id}>
            <header className="patient-document-detail-header">
              <div>
                <span className={`patient-document-workflow-badge ${currentStatus}`}>{label(currentStatus)}</span>
                <h2>{selected.title}</h2>
                <p>
                  {documentTypeLabel(selected.document_type)} · Version {selected.current_version} · {selected.mime_type || "document"}
                </p>
              </div>
              <div className="patient-document-action-wrap">
                {isSafetyPlanDraft(selected) && activeVersion?.content_text ? (
                  <Button variant="primary" size="sm" icon="health_and_safety" onClick={() => setSafetyPlanReviewOpen(true)}>
                    Review & finalize
                  </Button>
                ) : null}
                {isFileContent(activeVersion?.content_text) ? null : (
                  <Button
                    className="secondary-action"
                    size="sm"
                    onClick={() => {
                      setReviseContent(activeVersion?.content_text || "");
                      setReviseModalOpen(true);
                    }}
                    title="Upload a new revised version of this document"
                  >
                    + Revise
                  </Button>
                )}
                {targetStatus ? (
                  <>
                    {targetStatus === "superseded" ? (
                      <select
                        value={replacementId}
                        onChange={(event) => setReplacementId(event.target.value)}
                        aria-label="Replacement document"
                      >
                        <option value="">Choose replacement…</option>
                        {replacementOptions.map((doc) => (
                          <option value={doc.id} key={doc.id}>
                            {doc.title}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {targetStatus === "superseded" && !replacementId ? (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled
                        disabledReason="Choose which document supersedes this one."
                      >
                        {actionLabel(currentStatus)}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={acting}
                        loadingLabel="Updating…"
                        onClick={() => void advanceWorkflow()}
                      >
                        {actionLabel(currentStatus)}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </header>

            <div className="patient-document-meta-grid">
              <div>
                <span>Source</span>
                <strong title={selected.source_system || "EHR"}>{selected.source_system ? describeRecordSource(null, selected.source_system) : "EHR"}</strong>
                <small title={selected.source_ref || "No external reference"}>{selected.source_ref || "No external reference"}</small>
              </div>
              <div>
                <span>Added by</span>
                <strong title={selected.created_by || "Unknown"}>{selected.created_by || "Unknown"}</strong>
                <small>{formatDate(selected.created_at)}</small>
              </div>
              <div>
                <span>Reviewed</span>
                <strong title={selected.reviewed_by || "Not yet"}>{selected.reviewed_by || "Not yet"}</strong>
                <small>{formatDate(selected.reviewed_at)}</small>
              </div>
              <div>
                <span>Filed</span>
                <strong title={selected.filed_by || "Not yet"}>{selected.filed_by || "Not yet"}</strong>
                <small>{formatDate(selected.filed_at)}</small>
              </div>
            </div>

            {/* Document Reader Card with Byte Integrity Badge */}
            <div className="patient-document-reader-card" ref={readerRef}>
              <div className="patient-document-reader-head">
                <div>
                  <strong>Viewing Version {activeVersion?.version_number ?? selected.current_version}</strong>
                  {activeVersion?.version_number === selected.current_version ? (
                    <span className="patient-doc-version-latest">(Latest)</span>
                  ) : (
                    <span className="patient-doc-version-historical">(Historical Snapshot)</span>
                  )}
                  <span className="patient-doc-version-meta">
                    {activeVersion?.mime_type || selected.mime_type || "text/plain"}
                  </span>
                </div>
                <button
                  type="button"
                  className={`patient-document-sha-badge is-copyable ${copiedSha ? "is-copied" : ""}`}
                  title={`Cryptographic SHA-256 byte digest: ${activeVersion?.content_sha256 || selected.content_sha256} — Click to copy verified tamper-proof hash`}
                  onClick={() => {
                    const fullHash = activeVersion?.content_sha256 || selected.content_sha256 || "";
                    if (fullHash && typeof navigator !== "undefined" && navigator.clipboard) {
                      void navigator.clipboard.writeText(fullHash);
                      setCopiedSha(true);
                      setTimeout(() => setCopiedSha(false), 2000);
                    }
                  }}
                >
                  <Icon name={copiedSha ? "check_circle" : "check"} />
                  <span>
                    SHA-256: {(activeVersion?.content_sha256 || selected.content_sha256 || "").slice(0, 12)}…
                  </span>
                  {copiedSha && <span className="sha-copied-tag">Copied!</span>}
                </button>
              </div>
              {highlightTerms.length ? (
                <div className="patient-document-search-focus" role="status">
                  Opened from AI search · highlighting {highlightTerms.join(", ")}
                </div>
              ) : null}
              <DocumentContent version={activeVersion} title={selected.title} highlightTerms={highlightTerms} />
            </div>

            <section className="patient-document-section">
              <div className="patient-document-section-head">
                <h3>Version History</h3>
                <span className="patient-doc-note">
                  Click a version to view exact snapshot
                </span>
              </div>
              {detailLoading ? (
                <p>Loading versions…</p>
              ) : versions.length === 0 ? (
                <p>No version history available.</p>
              ) : (
                <div className="patient-document-version-list">
                  {versions.map((version) => {
                    const isSelected = activeVersion?.version_number === version.version_number;
                    return (
                      <div
                        key={version.id}
                        className={`patient-document-version-row ${isSelected ? "active" : ""}`}
                        onClick={() => setSelectedVersionNumber(version.version_number)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedVersionNumber(version.version_number);
                        }}
                      >
                        <strong>v{version.version_number}</strong>
                        {isSelected ? (
                          <span className="patient-doc-active-marker">Active</span>
                        ) : (
                          <span />
                        )}
                        <span>{version.created_by || "Unknown"}</span>
                        <time>{formatDate(version.created_at)}</time>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="patient-document-section">
              <h3>Workflow history</h3>
              {events.length === 0 ? (
                <p>No workflow transitions recorded yet.</p>
              ) : (
                <div className="patient-document-workflow-list">
                  {events.map((event) => (
                    <div key={event.id} className="patient-document-workflow-event">
                      <span className="patient-doc-flow">
                        {label(event.from_status)} <Icon name="arrow_forward" size="sm" /> {label(event.to_status)}
                      </span>
                      <strong>{event.actor_name}</strong>
                      <time>{formatDate(event.created_at)}</time>
                      {event.note ? <p>{event.note}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </article>
        )}
      </div>

      {/* Upload Document Modal */}
      {uploadModalOpen && (
        <div className="patient-doc-modal-backdrop" onClick={() => setUploadModalOpen(false)}>
          <div className="patient-doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="patient-doc-modal-head">
              <h3>Upload Clinical Document</h3>
              <button
                type="button"
                className="patient-doc-modal-close"
                onClick={() => setUploadModalOpen(false)}
                aria-label="Close"
              >
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={handleCreateDocument}>
              <div className="patient-doc-modal-body">
                <label>
                  Document Type
                  <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                    {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Document Title
                  <input
                    type="text"
                    required
                    placeholder="e.g. Neuropsychological Consultation or Inpatient Discharge Summary"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                  />
                </label>
                <label>
                  File (PDF or image, up to 3 MB)
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) {
                        setUploadFile(null);
                        return;
                      }
                      if (file.size > 3 * 1024 * 1024) {
                        setError("That file is larger than 3 MB.");
                        e.target.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        setUploadFile({ name: file.name, mimeType: file.type, dataUrl: String(reader.result) });
                        if (!uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
                      };
                      reader.onerror = () => setError("The file could not be read.");
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <label>
                  {uploadFile ? "Text content (not used — a file is attached)" : "Or paste the document text"}
                  <textarea
                    required={!uploadFile}
                    disabled={Boolean(uploadFile)}
                    placeholder="Paste report text, clinical findings, or consultation note contents…"
                    value={uploadContent}
                    onChange={(e) => setUploadContent(e.target.value)}
                  />
                </label>
              </div>
              <div className="patient-doc-modal-foot">
                <button
                  type="button"
                  className="patient-doc-modal-cancel"
                  onClick={() => setUploadModalOpen(false)}
                  disabled={uploadSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="patient-doc-modal-submit" disabled={uploadSubmitting}>
                  {uploadSubmitting ? "Uploading & Hashing…" : "Save Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revise Document Modal */}
      {safetyPlanReviewOpen && selected && activeVersion?.content_text ? (
        <SafetyPlanReviewDialog
          patientId={patient.id}
          patientName={patient.name}
          draftDocumentId={selected.id}
          draftText={activeVersion.content_text}
          onClose={() => setSafetyPlanReviewOpen(false)}
          onFinalized={(documentId) => {
            setSafetyPlanReviewOpen(false);
            void loadDocuments(documentId);
            dispatchWorkspaceEvent(WORKSPACE_DOCUMENT_WORKFLOW_UPDATED_EVENT, { patientId: patient.id, documentId });
          }}
        />
      ) : null}
      {reviseModalOpen && selected && (
        <div className="patient-doc-modal-backdrop" onClick={() => setReviseModalOpen(false)}>
          <div className="patient-doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="patient-doc-modal-head">
              <h3>Revise Document: {selected.title}</h3>
              <button
                type="button"
                className="patient-doc-modal-close"
                onClick={() => setReviseModalOpen(false)}
                aria-label="Close"
              >
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={handleReviseDocument}>
              <div className="patient-doc-modal-body">
                <p className="patient-doc-note">
                  Creating Version {selected.current_version + 1}. The previous version will be preserved
                  immutably in version history with its original cryptographic digest.
                </p>
                <label>
                  Revised Text Content
                  <textarea
                    required
                    placeholder="Enter updated document contents…"
                    value={reviseContent}
                    onChange={(e) => setReviseContent(e.target.value)}
                  />
                </label>
              </div>
              <div className="patient-doc-modal-foot">
                <button
                  type="button"
                  className="patient-doc-modal-cancel"
                  onClick={() => setReviseModalOpen(false)}
                  disabled={reviseSubmitting}
                >
                  Cancel
                </button>
                <button type="submit" className="patient-doc-modal-submit" disabled={reviseSubmitting}>
                  {reviseSubmitting ? "Saving New Version…" : "Publish Version"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
