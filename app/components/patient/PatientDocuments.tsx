"use client";

import { useEffect, useMemo, useState } from "react";
import type { Patient } from "../../domain/patient";

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
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export default function PatientDocuments({ patient }: { patient: Patient }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [replacementId, setReplacementId] = useState("");

  async function loadDocuments(preferredId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/clinical-records?patientId=${encodeURIComponent(patient.id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Unable to load documents");
      const next = Array.isArray(payload.record?.documents) ? payload.record.documents as DocumentRecord[] : [];
      setDocuments(next);
      const requested = preferredId || selectedId;
      setSelectedId(requested && next.some((doc) => doc.id === requested) ? requested : next[0]?.id || null);
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
      const [versionResponse, workflowResponse] = await Promise.all([
        fetch(`/api/clinical-records?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" }),
        fetch(`/api/documents/workflow?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" }),
      ]);
      const [versionPayload, workflowPayload] = await Promise.all([versionResponse.json(), workflowResponse.json()]);
      setVersions(versionResponse.ok && versionPayload.success !== false && Array.isArray(versionPayload.versions) ? versionPayload.versions : []);
      setEvents(workflowResponse.ok && workflowPayload.success !== false && Array.isArray(workflowPayload.events) ? workflowPayload.events : []);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [patient.id]);

  useEffect(() => {
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
      setSelectedId(detail.documentId);
    }
    window.addEventListener("ehr-select-document", handleSelect);
    return () => window.removeEventListener("ehr-select-document", handleSelect);
  }, [patient.id]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return documents;
    return documents.filter((doc) => [doc.title, doc.document_type, doc.source_system, doc.source_ref, doc.workflow_status]
      .filter(Boolean).join(" ").toLowerCase().includes(normalized));
  }, [documents, query]);

  const selected = documents.find((doc) => doc.id === selectedId) || null;
  const currentStatus = (selected?.workflow_status || "needs_review") as WorkflowStatus;
  const targetStatus = nextStatus[currentStatus];
  const replacementOptions = documents.filter((doc) => doc.id !== selectedId && doc.workflow_status !== "superseded");

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

  return (
    <section className="patient-documents-workspace">
      <aside className="patient-documents-list-pane">
        <div className="patient-documents-list-head">
          <div><span className="eyebrow">Patient record</span><h2>Documents</h2></div>
          <span className="patient-doc-count">{documents.length}</span>
        </div>
        <input
          className="patient-doc-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          aria-label="Search patient documents"
        />
        <div className="patient-doc-list">
          {loading ? <div className="global-empty-state">Loading documents…</div> : filtered.length === 0 ? (
            <div className="global-empty-state">No documents match this search.</div>
          ) : filtered.map((doc) => (
            <button
              type="button"
              key={doc.id}
              data-document-id={doc.id}
              className={`patient-doc-row ${selectedId === doc.id ? "active" : ""}`}
              onClick={() => setSelectedId(doc.id)}
            >
              <span className={`patient-doc-status-dot ${doc.workflow_status || "needs_review"}`} />
              <span className="patient-doc-row-copy">
                <strong>{doc.title}</strong>
                <small>{doc.document_type} · v{doc.current_version}</small>
                <small>{label((doc.workflow_status || "needs_review") as WorkflowStatus)} · {formatDate(doc.updated_at)}</small>
              </span>
            </button>
          ))}
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
                <p>{selected.document_type} · Version {selected.current_version} · {selected.mime_type || "document"}</p>
              </div>
              {targetStatus ? (
                <div className="patient-document-action-wrap">
                  {targetStatus === "superseded" ? (
                    <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)} aria-label="Replacement document">
                      <option value="">Choose replacement…</option>
                      {replacementOptions.map((doc) => <option value={doc.id} key={doc.id}>{doc.title}</option>)}
                    </select>
                  ) : null}
                  <button type="button" onClick={() => void advanceWorkflow()} disabled={acting || (targetStatus === "superseded" && !replacementId)}>
                    {acting ? "Updating…" : actionLabel(currentStatus)}
                  </button>
                </div>
              ) : null}
            </header>

            <div className="patient-document-meta-grid">
              <div><span>Source</span><strong>{selected.source_system || "EHR"}</strong><small>{selected.source_ref || "No external reference"}</small></div>
              <div><span>Added by</span><strong>{selected.created_by || "Unknown"}</strong><small>{formatDate(selected.created_at)}</small></div>
              <div><span>Reviewed</span><strong>{selected.reviewed_by || "Not yet"}</strong><small>{formatDate(selected.reviewed_at)}</small></div>
              <div><span>Filed</span><strong>{selected.filed_by || "Not yet"}</strong><small>{formatDate(selected.filed_at)}</small></div>
            </div>

            <section className="patient-document-section">
              <h3>Versions</h3>
              {detailLoading ? <p>Loading…</p> : versions.length === 0 ? <p>No version history available.</p> : (
                <div className="patient-document-version-list">
                  {versions.map((version) => (
                    <div key={version.id} className="patient-document-version-row">
                      <strong>Version {version.version_number}</strong>
                      <span>{version.mime_type || selected.mime_type || "document"}</span>
                      <span>{version.created_by || "Unknown"}</span>
                      <time>{formatDate(version.created_at)}</time>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="patient-document-section">
              <h3>Workflow history</h3>
              {events.length === 0 ? <p>No workflow transitions recorded yet.</p> : (
                <div className="patient-document-workflow-list">
                  {events.map((event) => (
                    <div key={event.id} className="patient-document-workflow-event">
                      <span className="patient-doc-flow">{label(event.from_status)} → {label(event.to_status)}</span>
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
    </section>
  );
}
