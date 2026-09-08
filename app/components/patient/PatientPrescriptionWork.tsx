"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PatientPrescriptionWorkItem,
  PatientPrescribingActionProjection,
  PatientPrescribingWorkspaceProjection,
} from "../../domain/patient-prescribing-workspace";
import type { Patient } from "../../domain/patient";
import { patientPrescribingWorkspaceApi } from "../../lib/patient-prescribing-workspace-api";
import styles from "./PatientPrescriptionWork.module.css";

const actionLabels: Record<PatientPrescribingActionProjection["id"], string> = {
  authorize: "Authorize",
  transmit: "Send prescription",
  retry_transmission: "Retry transmission",
  confirm_medication_truth: "Confirm medication record",
  renew_refill: "Stage renewal",
  accept_change: "Accept & stage replacement",
  decline_change: "Decline change",
  cancel_prescription: "Request cancellation",
  record_recovery_evidence: "Record recovery evidence",
};

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function prescriptionSummary(item: PatientPrescriptionWorkItem) {
  return [
    item.prescription.strength,
    item.prescription.dose,
    item.prescription.route,
    item.prescription.frequency,
  ].filter(Boolean).join(" · ");
}

type RecoveryDraft = {
  transactionId: string;
  disposition: "investigated_unresolved" | "confirmed_not_received";
  evidenceSource: string;
  note: string;
};

export default function PatientPrescriptionWork({
  patient,
  onOpenPrescribe,
  onMedicationTruthChanged,
}: {
  patient: Patient;
  onOpenPrescribe?: () => void;
  onMedicationTruthChanged?: () => void;
}) {
  const [workspace, setWorkspace] = useState<PatientPrescribingWorkspaceProjection | null>(null);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(null);

  async function refresh() {
    const next = await patientPrescribingWorkspaceApi.get(patient.id);
    setWorkspace(next);
  }

  useEffect(() => {
    let cancelled = false;
    setWorkspace(null);
    setError("");
    patientPrescribingWorkspaceApi.get(patient.id)
      .then((next) => { if (!cancelled) setWorkspace(next); })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load prescription work."); });
    return () => { cancelled = true; };
  }, [patient.id]);

  const visibleSections = useMemo(
    () => workspace?.sections.filter((section) => section.items.length > 0) || [],
    [workspace],
  );

  async function run(target: string, action: () => Promise<void>, successMessage: string, truthChanged = false) {
    setBusyTarget(target);
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      if (truthChanged) onMedicationTruthChanged?.();
      setMessage(successMessage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prescribing action failed.");
    } finally {
      setBusyTarget(null);
    }
  }

  function execute(item: PatientPrescriptionWorkItem, action: PatientPrescribingActionProjection) {
    if (!action.allowed || !action.targetId) return;
    const key = `${action.id}:${action.targetId}`;

    if (action.id === "authorize") {
      if (!window.confirm(`Authorize ${item.medicationName}?`)) return;
      void run(key, () => patientPrescribingWorkspaceApi.authorize(patient.id, action.targetId!), "Prescription authorized.");
      return;
    }
    if (action.id === "transmit" || action.id === "retry_transmission") {
      const verb = action.id === "retry_transmission" ? "Retry transmission of" : "Send";
      if (!window.confirm(`${verb} ${item.medicationName} through the established prescribing transport?`)) return;
      void run(key, () => patientPrescribingWorkspaceApi.transmit(patient.id, action.targetId!), action.id === "retry_transmission" ? "Controlled retry completed." : "Prescription transmission attempted.");
      return;
    }
    if (action.id === "confirm_medication_truth") {
      const operation = item.medicationTruth.suggestedOperation;
      if (!operation) return;
      const description = operation === "update"
        ? "update the linked authoritative medication record"
        : "add this prescription to the authoritative medication record";
      if (!window.confirm(`Explicitly ${description}? Prescription transport alone never performs this change.`)) return;
      void run(
        key,
        () => patientPrescribingWorkspaceApi.confirmMedicationTruth(
          patient.id,
          item.orderId,
          operation,
          operation === "update" ? item.medicationTruth.suggestedMedicationRecordId : undefined,
        ),
        "Medication truth explicitly confirmed.",
        true,
      );
      return;
    }
    if (action.id === "renew_refill") {
      if (!window.confirm("Stage a NEW renewal prescription intent from this refill request? The prior prescription will remain historical.")) return;
      void run(key, () => patientPrescribingWorkspaceApi.renewRefill(patient.id, action.targetId!), "New renewal prescription staged for review.");
      return;
    }
    if (action.id === "accept_change" || action.id === "decline_change") {
      const accepting = action.id === "accept_change";
      const prompt = accepting
        ? "Accept this pharmacy change and stage a NEW replacement prescription for review?"
        : "Decline this pharmacy change request?";
      if (!window.confirm(prompt)) return;
      void run(
        key,
        () => patientPrescribingWorkspaceApi.respondToChange(patient.id, action.targetId!, accepting ? "accept" : "decline"),
        accepting ? "Replacement prescription staged for review." : "Pharmacy change request declined.",
      );
      return;
    }
    if (action.id === "cancel_prescription") {
      const reason = window.prompt("Cancellation reason (required):", "");
      if (!reason?.trim()) return;
      if (!window.confirm("Submit a linked CancelRx request? This will not discontinue the clinical medication record.")) return;
      void run(key, () => patientPrescribingWorkspaceApi.cancel(patient.id, action.targetId!, reason.trim()), "Cancellation request submitted through the existing CancelRx pathway.");
      return;
    }
    if (action.id === "record_recovery_evidence") {
      setRecoveryDraft({ transactionId: action.targetId, disposition: "investigated_unresolved", evidenceSource: "", note: "" });
    }
  }

  async function submitRecovery() {
    if (!recoveryDraft?.evidenceSource.trim() || !recoveryDraft.note.trim()) {
      setError("Recovery evidence source and note are required.");
      return;
    }
    const draft = recoveryDraft;
    const key = `record_recovery_evidence:${draft.transactionId}`;
    await run(
      key,
      () => patientPrescribingWorkspaceApi.recordRecoveryEvidence(
        patient.id,
        draft.transactionId,
        draft.disposition,
        draft.evidenceSource.trim(),
        draft.note.trim(),
      ),
      draft.disposition === "confirmed_not_received"
        ? "Evidence recorded. Server-side recovery rules will determine whether one controlled retry is now available."
        : "Investigation status recorded; retry remains blocked unless qualifying evidence is later recorded.",
    );
    setRecoveryDraft(null);
  }

  function itemCard(item: PatientPrescriptionWorkItem) {
    const allowedActions = item.actions.filter((action) => action.allowed);
    return (
      <article className={styles.item} key={item.id}>
        <div className={styles.itemHeading}>
          <div>
            <strong>{item.medicationName}</strong>
            <span>{prescriptionSummary(item) || "Prescription intent"}</span>
            {item.pharmacyName && <span>{item.pharmacyName}</span>}
          </div>
          <span className={styles.status}>{item.displayStatus}</span>
        </div>

        {item.prescription.sig && <p className={styles.sig}>{item.prescription.sig}</p>}

        <div className={styles.truthBoundary}>
          <strong>Medication record:</strong>{" "}
          {item.medicationTruth.confirmed
            ? `Explicitly confirmed (${item.medicationTruth.confirmationOperation}).`
            : `Not changed by this prescription. ${item.medicationTruth.advisorySummary}`}
        </div>

        {item.recovery?.requiresAttention && (
          <div className={styles.attention}>
            <strong>Operational review required.</strong> {item.recovery.reason}
          </div>
        )}

        {allowedActions.length > 0 && (
          <div className={styles.actions}>
            {allowedActions.map((action) => {
              const key = `${action.id}:${action.targetId}`;
              return (
                <button
                  type="button"
                  key={key}
                  className={action.id === "authorize" || action.id === "transmit" || action.id === "renew_refill" || action.id === "accept_change" ? "primary" : undefined}
                  disabled={busyTarget !== null}
                  onClick={() => execute(item, action)}
                >
                  {busyTarget === key ? "Working…" : actionLabels[action.id]}
                </button>
              );
            })}
          </div>
        )}

        {recoveryDraft?.transactionId === item.recovery?.transactionId && (
          <div className={styles.recoveryForm}>
            <label>Recovery finding
              <select
                value={recoveryDraft!.disposition}
                onChange={(event) => setRecoveryDraft((current) => current
                  ? { ...current, disposition: event.target.value as RecoveryDraft["disposition"] }
                  : current)}
              >
                <option value="investigated_unresolved">Investigated — outcome still unresolved</option>
                <option value="confirmed_not_received">Confirmed not received — evaluate controlled retry</option>
              </select>
            </label>
            <label>Evidence source
              <input
                value={recoveryDraft!.evidenceSource}
                maxLength={120}
                placeholder="e.g. pharmacy phone confirmation"
                onChange={(event) => setRecoveryDraft((current) => current
                  ? { ...current, evidenceSource: event.target.value }
                  : current)}
              />
            </label>
            <label>Clinical / operational note
              <textarea
                value={recoveryDraft!.note}
                maxLength={500}
                rows={3}
                onChange={(event) => setRecoveryDraft((current) => current
                  ? { ...current, note: event.target.value }
                  : current)}
              />
            </label>
            <div className={styles.actions}>
              <button type="button" onClick={() => setRecoveryDraft(null)} disabled={busyTarget !== null}>Cancel</button>
              <button type="button" className="primary" onClick={() => void submitRecovery()} disabled={busyTarget !== null}>Record bounded evidence</button>
            </div>
            <small>Advanced superseding-transaction evidence review remains in Prescribing Operations.</small>
          </div>
        )}

        <details className={styles.details}>
          <summary>Review prescription state & lineage</summary>
          <div className={styles.detailGrid}>
            <div>
              <strong>Prescription intent</strong>
              <span>Order: {item.orderId}</span>
              <span>Order state: {formatStatus(item.orderStatus)}</span>
              {item.latestTransport && <span>Transport: {formatStatus(item.latestTransport.state)}</span>}
              <span>Medication truth: {item.medicationTruth.confirmed ? "explicitly confirmed" : "separate / unchanged"}</span>
            </div>
            <div>
              <strong>Action eligibility</strong>
              {item.actions.map((action) => (
                <span key={`${action.id}:${action.targetId || "none"}`}>
                  {actionLabels[action.id]}: {action.allowed ? "available" : "blocked"} — {action.reason}
                </span>
              ))}
            </div>
          </div>

          {(item.refillLineage.length > 0 || item.changeLineage.length > 0 || item.cancellationLineage.length > 0) && (
            <div className={styles.relationships}>
              {item.refillLineage.map((request) => (
                <span key={request.refillRequestId}>Refill: {formatStatus(request.status)} · prior {request.priorOrderId}{request.renewalOrderId ? ` → renewal ${request.renewalOrderId}` : ""}</span>
              ))}
              {item.changeLineage.map((request) => (
                <span key={request.changeRequestId}>Pharmacy change: {formatStatus(request.status)} · source {request.sourceOrderId}{request.resultingOrderId ? ` → replacement ${request.resultingOrderId}` : ""}</span>
              ))}
              {item.cancellationLineage.map((request) => (
                <span key={request.cancellationTransactionId}>CancelRx: {formatStatus(request.state)} · original transaction {request.targetTransactionId}</span>
              ))}
            </div>
          )}

          <div className={styles.timeline}>
            {item.lineage.map((event) => (
              <div key={event.id}>
                <span>{new Date(event.at).toLocaleString()}</span>
                <strong>{event.label}</strong>
              </div>
            ))}
          </div>
        </details>
      </article>
    );
  }

  return (
    <section className={`card ${styles.card}`}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Prescription workflow</span>
          <h2>Prescription work</h2>
          <p>Prescription intent and external transport stay separate from the medication record above. The server determines each lifecycle group and available action.</p>
        </div>
        {onOpenPrescribe && <button type="button" className="primary" onClick={onOpenPrescribe}>＋ New prescription</button>}
      </div>

      {workspace && <div className={styles.boundary}>{workspace.medicationTruthBoundary}</div>}
      {message && <p className={styles.message}>{message}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!workspace && !error && <p className={styles.empty}>Loading prescription work…</p>}

      {workspace && visibleSections.length === 0 && (
        <p className={styles.empty}>No prescription intents or external prescribing history are recorded for this patient.</p>
      )}

      {visibleSections.map((section) => section.group === "completed_historical" ? (
        <details className={styles.historySection} key={section.group}>
          <summary>{section.label} <span>{section.items.length}</span></summary>
          <div className={styles.list}>{section.items.map(itemCard)}</div>
        </details>
      ) : (
        <div className={styles.section} key={section.group}>
          <div className={styles.sectionHeading}>
            <strong>{section.label}</strong>
            <span>{section.items.length}</span>
          </div>
          <div className={styles.list}>{section.items.map(itemCard)}</div>
        </div>
      ))}
    </section>
  );
}
