"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PrescriptionOperationsDetail,
  PrescriptionOperationsQueue,
  PrescriptionOperationsQueueItem,
  PrescriptionRecoveryActionId,
} from "../domain/prescription-operations";
import { prescriptionOperationsApi } from "../lib/prescription-operations-api";
import { currentActivePatientId, ensurePatientOpen, settleWorkspace } from "../lib/workspace-navigation";

type EvidenceAction = Exclude<PrescriptionRecoveryActionId, "retry_transmission">;

function formatTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

function classificationLabel(item: PrescriptionOperationsQueueItem) {
  return item.statusLabel;
}

function actionLabel(action: EvidenceAction) {
  return {
    investigated_unresolved: "Record investigation unresolved",
    confirmed_not_received: "Confirm not received",
    superseded_by_verified_transaction: "Supersede with verified transaction",
  }[action];
}

function timelineCategoryLabel(category: PrescriptionOperationsDetail["timeline"][number]["category"]) {
  return {
    local_system: "System",
    manual_evidence: "Manual evidence",
    outbound_attempt: "Transport attempt",
    verified_vendor: "Verified vendor",
    callback_processing: "Callback",
  }[category];
}

export default function PrescriptionOperationsWorkspace() {
  const [queue, setQueue] = useState<PrescriptionOperationsQueue | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PrescriptionOperationsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [evidenceAction, setEvidenceAction] = useState<EvidenceAction | null>(null);
  const [evidenceSource, setEvidenceSource] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [supersedingTransactionId, setSupersedingTransactionId] = useState("");
  const [activePatientId, setActivePatientId] = useState<string | null>(null);

  async function loadQueue(preferredId?: string | null) {
    setLoading(true);
    setError("");
    try {
      const next = await prescriptionOperationsApi.queue();
      setQueue(next);
      window.dispatchEvent(new CustomEvent("ehr-sidebar-badges", { detail: { prescribing: next.items.length } }));
      const candidate = preferredId && next.items.some((item) => item.id === preferredId)
        ? preferredId
        : next.items[0]?.id || null;
      setSelectedId(candidate);
      if (!candidate) setDetail(null);
    } catch (cause) {
      setQueue(null);
      setSelectedId(null);
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "Prescription operations could not be loaded.");
      window.dispatchEvent(new CustomEvent("ehr-sidebar-badges", { detail: { prescribing: 0 } }));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(itemId: string) {
    setDetailLoading(true);
    setActionError("");
    try {
      const next = await prescriptionOperationsApi.detail(itemId);
      setDetail(next);
      setActivePatientId(currentActivePatientId());
    } catch (cause) {
      setDetail(null);
      setActionError(cause instanceof Error ? cause.message : "This item is no longer available.");
      await loadQueue();
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  const integrationProblems = useMemo(
    () => queue?.integrations.filter((integration) => integration.readiness !== "ready") || [],
    [queue],
  );
  const retryReady = queue?.items.filter((item) => item.retry.allowed).length || 0;
  const conflicts = queue?.items.filter((item) => item.evidenceConflict).length || 0;
  const patientContextMatches = Boolean(detail && activePatientId === detail.patient.id);

  async function activatePatientContext() {
    if (!detail) return;
    setActionError("");
    const tab = await ensurePatientOpen(detail.patient.id);
    if (!tab) {
      setActionError("The patient chart could not be activated. Open the patient from search before performing a prescribing action.");
      return;
    }
    tab.click();
    await settleWorkspace(2);
    setActivePatientId(currentActivePatientId());
  }

  function requireMatchingPatient(): string | null {
    if (!detail) return null;
    const active = currentActivePatientId();
    setActivePatientId(active);
    if (!active) {
      setActionError(`Activate ${detail.patient.name}'s chart before performing this patient-bound action.`);
      return null;
    }
    if (active !== detail.patient.id) {
      setActionError(`Active patient mismatch. ${detail.patient.name}'s chart must be active before this action can be submitted.`);
      return null;
    }
    return active;
  }

  async function refreshAfterAction(itemId: string) {
    setEvidenceAction(null);
    setEvidenceSource("");
    setEvidenceNote("");
    setSupersedingTransactionId("");
    await loadQueue(itemId);
  }

  async function recordEvidence() {
    if (!detail || !evidenceAction) return;
    const active = requireMatchingPatient();
    if (!active) return;
    if (!evidenceSource.trim() || !evidenceNote.trim()) {
      setActionError("Evidence source and a brief recovery note are required.");
      return;
    }
    if (evidenceAction === "superseded_by_verified_transaction" && !supersedingTransactionId) {
      setActionError("Choose the verified same-patient transaction that supersedes this ambiguous attempt.");
      return;
    }

    setActionBusy(true);
    setActionError("");
    try {
      await prescriptionOperationsApi.recordEvidence({
        activePatientId: active,
        transactionId: detail.prescription.transactionId,
        disposition: evidenceAction,
        evidenceSource: evidenceSource.trim(),
        note: evidenceNote.trim(),
        supersedingTransactionId: evidenceAction === "superseded_by_verified_transaction"
          ? supersedingTransactionId
          : undefined,
      });
      await refreshAfterAction(detail.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Recovery evidence could not be recorded.");
      await loadQueue(detail.id);
    } finally {
      setActionBusy(false);
    }
  }

  async function retryTransmission() {
    if (!detail) return;
    const active = requireMatchingPatient();
    if (!active) return;
    setActionBusy(true);
    setActionError("");
    try {
      await prescriptionOperationsApi.retry({ activePatientId: active, orderId: detail.prescription.orderId });
      await refreshAfterAction(detail.id);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "The prescription could not be retried.");
      await loadQueue(detail.id);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="prescription-ops-workspace">
      <div className="prescription-ops-summary">
        <div><strong>{queue?.items.length || 0}</strong><span>Needs attention</span></div>
        <div><strong>{retryReady}</strong><span>Retry eligible</span></div>
        <div><strong>{conflicts}</strong><span>Evidence conflicts</span></div>
        <button type="button" onClick={() => void loadQueue(selectedId)} disabled={loading}>↻ Refresh</button>
      </div>

      {integrationProblems.map((integration, index) => (
        <div className="prescription-integration-alert" key={`${integration.adapterId || "prescribing"}:${index}`}>
          <strong>{integration.statusLabel}</strong>
          <span>{integration.reason}</span>
        </div>
      ))}

      {error ? <div className="global-inline-error">{error}</div> : null}

      <div className="prescription-ops-grid">
        <aside className="prescription-ops-queue" aria-label="Prescription attention queue">
          <div className="prescription-ops-queue-heading">
            <strong>Attention queue</strong>
            <span>Only unresolved or problematic prescribing items are shown.</span>
          </div>
          {loading ? (
            <div className="global-empty-state">Loading prescribing operations…</div>
          ) : !queue?.items.length ? (
            <div className="global-empty-state">No prescription operations currently require provider attention.</div>
          ) : (
            queue.items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`prescription-ops-row ${selectedId === item.id ? "active" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className={`prescription-ops-status ${item.classification}`}>{classificationLabel(item)}</span>
                <strong>{item.patient.name}</strong>
                <b>{item.prescription.medicationName}</b>
                <small>{item.patient.mrn} · {item.prescription.transportState.replace(/_/g, " ")}</small>
                <p>{item.reason}</p>
                <span className={`prescription-retry-state ${item.retry.allowed ? "allowed" : "blocked"}`}>
                  {item.retry.allowed ? "Retry allowed" : "Retry blocked"}
                </span>
              </button>
            ))
          )}
        </aside>

        <main className="prescription-ops-detail" aria-live="polite">
          {detailLoading ? (
            <div className="global-empty-state">Loading authoritative prescription detail…</div>
          ) : !detail ? (
            <div className="global-empty-state">Select an attention item to review its evidence and safe next actions.</div>
          ) : (
            <>
              <header className="prescription-detail-header">
                <div>
                  <span className="eyebrow">{detail.statusLabel}</span>
                  <h2>{detail.prescription.medicationName}</h2>
                  <p>{detail.patient.name} · {detail.patient.mrn}</p>
                </div>
                <div className="prescription-detail-tags">
                  <span>{detail.prescription.transactionType.replace(/_/g, " ")}</span>
                  <span>{detail.prescription.transportState.replace(/_/g, " ")}</span>
                  <span>Attempt {detail.prescription.attemptCount}</span>
                </div>
              </header>

              <section className="prescription-attention-reason">
                <strong>Why this needs attention</strong>
                <p>{detail.reason}</p>
              </section>

              <section className={`prescription-retry-card ${detail.retry.allowed ? "allowed" : "blocked"}`}>
                <div>
                  <strong>{detail.retry.allowed ? "Retry allowed" : "Retry blocked"}</strong>
                  <p>{detail.retry.reason}</p>
                </div>
                <button
                  type="button"
                  disabled={!detail.retry.allowed || !patientContextMatches || actionBusy}
                  onClick={() => void retryTransmission()}
                >
                  Retry transmission
                </button>
              </section>

              <section className={`prescription-patient-context ${patientContextMatches ? "matched" : "mismatch"}`}>
                <div>
                  <strong>{patientContextMatches ? "Patient context active" : "Patient context required"}</strong>
                  <span>{patientContextMatches
                    ? `${detail.patient.name}'s chart is the active execution context.`
                    : `Activate ${detail.patient.name}'s chart before any recovery or retry action.`}</span>
                </div>
                {!patientContextMatches ? (
                  <button type="button" onClick={() => void activatePatientContext()}>Activate patient chart</button>
                ) : null}
              </section>

              {actionError ? <div className="global-inline-error">{actionError}</div> : null}

              <section className="prescription-recovery-actions">
                <div className="prescription-section-heading">
                  <strong>Safe human actions</strong>
                  <span>The buttons submit through the existing authenticated, patient-bound clinical action gateway.</span>
                </div>
                <div className="prescription-action-buttons">
                  {detail.actions.filter((action) => action.id !== "retry_transmission").map((action) => (
                    <button
                      type="button"
                      key={action.id}
                      disabled={!action.allowed || !patientContextMatches || actionBusy}
                      title={action.reason}
                      onClick={() => setEvidenceAction(action.id as EvidenceAction)}
                    >
                      {actionLabel(action.id as EvidenceAction)}
                    </button>
                  ))}
                </div>

                {evidenceAction ? (
                  <div className="prescription-evidence-form">
                    <div className="prescription-evidence-form-title">
                      <strong>{actionLabel(evidenceAction)}</strong>
                      <button type="button" onClick={() => setEvidenceAction(null)} aria-label="Close recovery evidence form">×</button>
                    </div>
                    {evidenceAction === "superseded_by_verified_transaction" ? (
                      <label>
                        Verified transaction
                        <select value={supersedingTransactionId} onChange={(event) => setSupersedingTransactionId(event.target.value)}>
                          <option value="">Choose verified transaction…</option>
                          {detail.supersedingCandidates.map((candidate) => (
                            <option key={candidate.transactionId} value={candidate.transactionId}>
                              {candidate.medicationName} · {candidate.verifiedState.replace(/_/g, " ")} · {formatTime(candidate.verifiedAt)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      Evidence source
                      <input
                        value={evidenceSource}
                        onChange={(event) => setEvidenceSource(event.target.value)}
                        maxLength={120}
                        placeholder="Example: pharmacy phone confirmation"
                      />
                    </label>
                    <label>
                      Recovery note
                      <textarea
                        value={evidenceNote}
                        onChange={(event) => setEvidenceNote(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="Record only the bounded operational evidence supporting this disposition."
                      />
                    </label>
                    <div className="prescription-evidence-form-actions">
                      <button type="button" onClick={() => setEvidenceAction(null)}>Cancel</button>
                      <button type="button" disabled={actionBusy} onClick={() => void recordEvidence()}>
                        {actionBusy ? "Recording…" : "Record evidence"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="prescription-timeline-section">
                <div className="prescription-section-heading">
                  <strong>Evidence timeline</strong>
                  <span>Bounded events only; raw transport metadata and vendor payloads are not exposed.</span>
                </div>
                <div className="prescription-timeline">
                  {detail.timeline.length ? detail.timeline.map((event) => (
                    <div className={`prescription-timeline-row ${event.category}`} key={event.id}>
                      <span className="prescription-timeline-marker" aria-hidden="true" />
                      <div>
                        <span className="prescription-timeline-category">{timelineCategoryLabel(event.category)}</span>
                        <strong>{event.label}</strong>
                        {event.detail ? <p>{event.detail}</p> : null}
                        <small>{formatTime(event.at)}{event.sourceLabel ? ` · ${event.sourceLabel}` : ""}</small>
                      </div>
                    </div>
                  )) : <div className="global-empty-state">No bounded transaction events are available for this item.</div>}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
