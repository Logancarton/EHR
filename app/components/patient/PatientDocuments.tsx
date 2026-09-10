"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Patient } from "../../domain/patient";
import { formatClinicalDate } from "../../lib/clinical-date";

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

const DOCUMENT_TYPE_OPTIONS = [
  { value: "consult_note", label: "Consultation Note" },
  { value: "eval_report", label: "Evaluation Report" },
  { value: "specialist_note", label: "Specialist Note" },
  { value: "discharge_summary", label: "Discharge Summary" },
  { value: "lab_requisition", label: "Lab Requisition / Order" },
  { value: "prior_auth", label: "Prior Authorization" },
  { value: "outside_records", label: "Outside Clinical Records" },
  { value: "education_plan", label: "Education / 504 Plan" },
];

export default function PatientDocuments({ patient }: { patient: Patient }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [replacementId, setReplacementId] = useState("");
  const pendingSelectionRef = useRef<string | null>(null);

  // Modal states for Document Intake and Revision
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("consult_note");
  const [uploadContent, setUploadContent] = useState("");
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  const [reviseModalOpen, setReviseModalOpen] = useState(false);
  const [reviseContent, setReviseContent] = useState("");
  const [reviseSubmitting, setReviseSubmitting] = useState(false);

  async function loadDocuments(preferredId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clinical-records?patientId=${encodeURIComponent(patient.id)}`, {
        cache: "no-store",
        headers: { "x-ehr-patient-id": patient.id },
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to load documents");
      const next = Array.isArray(payload.record?.documents) ? (payload.record.documents as DocumentRecord[]) : [];
      setDocuments(next);
      const requested = preferredId || pendingSelectionRef.current || selectedId;
      const nextSelectedId = requested && next.some((doc) => doc.id === requested) ? requested : next[0]?.id || null;
      setSelectedId(nextSelectedId);
      if (pendingSelectionRef.current === nextSelectedId) pendingSelectionRef.current = null;
    } catch (cause) {
      setDocuments([]);
      setSelectedId(null);
      setError(cause instanceof Error ? cause.message : "Unable to load documents");
    } finally {
      setLoading(false);
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
    pendingSelectionRef.current = null;
    setSelectedId(null);
    setSelectedVersionNumber(null);
    void loadDocuments();
  }, [patient.id]);

  useEffect(() => {
    setReplacementId("");
    setSelectedVersionNumber(null);
    if (selectedId) void loadDetail(selectedId);
    else {
      setVersions([]);
      setEvents([]);
    }
  }, [selectedId]);

  useEffect(() => {
    function handleSelect(event: Event) {
      const detail = (event as CustomEvent<{ patientId?: string; documentId?: string }>).detail;
      if (!detail?.documentId || detail.patientId !== patient.id) return;
      pendingSelectionRef.current = detail.documentId;
      setSelectedId(detail.documentId);
    }
    window.addEventListener("ehr-select-document", handleSelect);
    return () => window.removeEventListener("ehr-select-document", handleSelect);
  }, [patient.id]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter((doc) =>
      [doc.title, doc.document_type, doc.source_system, doc.source_ref, doc.workflow_status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [documents, query]);

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
      window.dispatchEvent(new CustomEvent("ehr-document-workflow-updated", { detail: { patientId: patient.id, documentId: selected.id } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update document workflow");
    } finally {
      setActing(false);
    }
  }

  async function handleCreateDocument(event: React.FormEvent) {
    event.preventDefault();
    if (!uploadTitle.trim() || !uploadContent.trim()) {
      setError("Document title and text content are required.");
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
            mimeType: "text/plain",
            contentText: uploadContent.trim(),
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Failed to create document.");
      setUploadModalOpen(false);
      setUploadTitle("");
      setUploadContent("");
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
            <span className="eyebrow">Patient record</span>
            <h2>Documents</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="patient-doc-count">{documents.length}</span>
            <button
              type="button"
              className="patient-doc-upload-btn"
              onClick={() => setUploadModalOpen(true)}
              title="Upload new clinical document"
            >
              + Upload
            </button>
          </div>
        </div>
        <input
          className="patient-doc-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          aria-label="Search patient documents"
        />
        <div className="patient-doc-list">
          {loading ? (
            <div className="global-empty-state">Loading documents…</div>
          ) : filtered.length === 0 ? (
            <div className="global-empty-state">No documents match this search.</div>
          ) : (
            filtered.map((doc) => (
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
                  <small>{doc.document_type} · v{doc.current_version}</small>
                  <small>
                    {label((doc.workflow_status || "received") as WorkflowStatus)} · {formatDate(doc.updated_at)}
                  </small>
                </span>
              </button>
            ))
          )}
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
                  {selected.document_type} · Version {selected.current_version} · {selected.mime_type || "document"}
                </p>
              </div>
              <div className="patient-document-action-wrap">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    setReviseContent(activeVersion?.content_text || "");
                    setReviseModalOpen(true);
                  }}
                  title="Upload a new revised version of this document"
                >
                  + Revise
                </button>
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
                    <button
                      type="button"
                      onClick={() => void advanceWorkflow()}
                      disabled={acting || (targetStatus === "superseded" && !replacementId)}
                    >
                      {acting ? "Updating…" : actionLabel(currentStatus)}
                    </button>
                  </>
                ) : null}
              </div>
            </header>

            <div className="patient-document-meta-grid">
              <div>
                <span>Source</span>
                <strong>{selected.source_system || "EHR"}</strong>
                <small>{selected.source_ref || "No external reference"}</small>
              </div>
              <div>
                <span>Added by</span>
                <strong>{selected.created_by || "Unknown"}</strong>
                <small>{formatDate(selected.created_at)}</small>
              </div>
              <div>
                <span>Reviewed</span>
                <strong>{selected.reviewed_by || "Not yet"}</strong>
                <small>{formatDate(selected.reviewed_at)}</small>
              </div>
              <div>
                <span>Filed</span>
                <strong>{selected.filed_by || "Not yet"}</strong>
                <small>{formatDate(selected.filed_at)}</small>
              </div>
            </div>

            {/* Document Reader Card with Byte Integrity Badge */}
            <div className="patient-document-reader-card">
              <div className="patient-document-reader-head">
                <div>
                  <strong>Viewing Version {activeVersion?.version_number ?? selected.current_version}</strong>
                  {activeVersion?.version_number === selected.current_version ? (
                    <span style={{ marginLeft: 6, color: "var(--m3-primary)", fontWeight: 600 }}>(Latest)</span>
                  ) : (
                    <span style={{ marginLeft: 6, color: "var(--m3-text-secondary)" }}>(Historical Snapshot)</span>
                  )}
                  <span style={{ marginLeft: 12, color: "var(--m3-text-secondary)" }}>
                    {activeVersion?.mime_type || selected.mime_type || "text/plain"}
                  </span>
                </div>
                <div
                  className="patient-document-sha-badge"
                  title={`Cryptographic SHA-256 byte digest: ${activeVersion?.content_sha256 || selected.content_sha256}`}
                >
                  ✓ SHA-256: {(activeVersion?.content_sha256 || selected.content_sha256 || "").slice(0, 12)}…
                </div>
              </div>
              <div className="patient-document-reader-content">
                {activeVersion?.content_text || "No text content stored for this document version."}
              </div>
            </div>

            <section className="patient-document-section">
              <div className="patient-document-section-head">
                <h3>Version History</h3>
                <span style={{ fontSize: 11, color: "var(--m3-text-secondary)" }}>
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
                          <span style={{ color: "var(--m3-primary)", fontWeight: 700, fontSize: 10 }}>● Active</span>
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
                        {label(event.from_status)} → {label(event.to_status)}
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
                ✕
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
                  Document Text Content
                  <textarea
                    required
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
                ✕
              </button>
            </div>
            <form onSubmit={handleReviseDocument}>
              <div className="patient-doc-modal-body">
                <p style={{ margin: 0, fontSize: 11, color: "var(--m3-text-secondary)" }}>
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
