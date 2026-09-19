"use client";

import { useEffect, useMemo, useState } from "react";
import { type Patient } from "../../domain/patient";
import { type ClinicalOrder, type MedicationOrder, type LabOrder } from "../../domain/orders";
import {
  type EncounterState,
  type CodingRecommendation,
} from "../../lib/encounter-engine";
import { loadStagedOrders, saveStagedOrders } from "../../lib/order-service";
import {
  authorizeEncounterClosingOrder,
  getClosingEncounter,
  listEncounterClosingOrders,
  stageEncounterClosingOrder,
  transmitEncounterClosingOrder,
} from "../../lib/encounter-close-api";
import type { OrderRecord } from "../../server/repositories/order-repository";
import {
  FOLLOW_UP_INTERVALS,
  calculateFollowUpDate,
  type FollowUpInterval,
} from "../../lib/schedule-data";
import { api } from "../../lib/api-client";
import {
  WORKSPACE_ORDER_CART_UPDATED_EVENT,
  WORKSPACE_APPOINTMENT_UPDATED_EVENT,
  dispatchWorkspaceEvent,
} from "../../lib/workspace-events";
import Icon from "../ui/Icon";

type ClosingStep =
  | "review"
  | "note"
  | "diagnoses"
  | "billing"
  | "prescriptions"
  | "labs"
  | "followup"
  | "sign";
type ClosingReference = {
  id: string;
  section: string;
  entityType: string;
  entityId: string;
  source: "action-derived" | "clinician-authored" | "ai-extracted";
  status: "proposed" | "confirmed" | "rejected";
  confidence?: number | null;
  display?: string;
  code?: string | null;
  codingSystem?: string | null;
};

function orderRequiresEpcs(order: ClinicalOrder | OrderRecord): boolean {
  if ("details" in order) {
    return Boolean(
      order.details?.requiresEpcs ||
        (order.details?.deaSchedule && order.details.deaSchedule !== "None"),
    );
  }
  return order.type === "medication" && Boolean(order.requiresEpcs || order.deaSchedule !== "None");
}

function pendingServerOrders(orders: OrderRecord[]): OrderRecord[] {
  return orders.filter(
    (order) =>
      order.status === "staged" ||
      order.status === "authorized" ||
      order.status === "transmission_failed",
  );
}

function clearLocalOrders(patientId: string, completedOrderIds: Set<string>) {
  const allOrders = loadStagedOrders();
  const remaining = (allOrders[patientId] || []).filter(
    (order) => !completedOrderIds.has(order.id),
  );
  const next = { ...allOrders, [patientId]: remaining };
  saveStagedOrders(next);
  dispatchWorkspaceEvent(WORKSPACE_ORDER_CART_UPDATED_EVENT, {
    patientId,
    remainingCount: remaining.length,
  });
}

export default function EncounterSignModal({
  isOpen,
  onClose,
  patient,
  draft,
  codingRec,
  psychotherapyMinutes,
  isLocked,
  attestationChecked,
  onToggleAttestation,
  onSignNote,
}: {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  draft: EncounterState;
  codingRec: CodingRecommendation;
  psychotherapyMinutes: number;
  isLocked: boolean;
  attestationChecked: boolean;
  onToggleAttestation: (checked: boolean) => void;
  onSignNote: () => void | Promise<void>;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [localOrders, setLocalOrders] = useState<ClinicalOrder[]>([]);
  const [serverOrders, setServerOrders] = useState<OrderRecord[]>([]);
  const [followupConfirmed, setFollowupConfirmed] = useState(false);
  const [epcsPin, setEpcsPin] = useState("");
  const [epcsToken, setEpcsToken] = useState("");
  const [working, setWorking] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [ceremonyPatientId, setCeremonyPatientId] = useState<string | null>(null);
  const [references, setReferences] = useState<ClosingReference[]>([]);
  const [refDecisions, setRefDecisions] = useState<Record<string, "confirmed" | "rejected">>({});
  const [referenceLoadState, setReferenceLoadState] = useState<"loading" | "loaded" | "error">("loading");
  const [referenceReloadKey, setReferenceReloadKey] = useState(0);
  const [selectedFollowUpInterval, setSelectedFollowUpInterval] = useState<FollowUpInterval>("2 weeks");
  const [bookingFollowUp, setBookingFollowUp] = useState(false);
  const [followUpBookingSuccess, setFollowUpBookingSuccess] = useState<string | null>(null);
  const [followUpBookingError, setFollowUpBookingError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
    setWorking(false);
    setWorkflowMessage(null);
    setCeremonyPatientId(null);
    setFollowupConfirmed(false);
    setSelectedFollowUpInterval("2 weeks");
    setBookingFollowUp(false);
    setFollowUpBookingSuccess(null);
    setFollowUpBookingError(null);
    setEpcsPin("");
    setEpcsToken("");
    setReferences([]);
    setRefDecisions({});

    const local = (loadStagedOrders()[patient.id] || []).filter(
      (order) => order.status === "staged" || order.status === "draft",
    );
    setLocalOrders(local);

    listEncounterClosingOrders(patient.id)
      .then((orders) => {
        setServerOrders(orders);
        const transmittedIds = new Set(
          orders.filter((order) => order.status === "transmitted").map((order) => order.id),
        );
        if (transmittedIds.size > 0) {
          clearLocalOrders(patient.id, transmittedIds);
          setLocalOrders((current) => current.filter((order) => !transmittedIds.has(order.id)));
        }
      })
      .catch(() => {
        // The modal can still review and sign a note with no orders. Any order-bearing
        // close will surface the server error before authorization/transmission.
      });
  }, [isOpen, patient.id, draft.encounterId]);

  useEffect(() => {
    if (!isOpen) return;
    const encounterId = draft.encounterId;
    if (!encounterId) {
      setReferences([]);
      setRefDecisions({});
      setReferenceLoadState("loaded");
      return;
    }

    let cancelled = false;
    setReferenceLoadState("loading");
    api.encounters
      .references(encounterId, patient.id)
      .then((records) => {
        if (cancelled) return;
        setReferences(records);
        const initial: Record<string, "confirmed" | "rejected"> = {};
        records.forEach((reference) => {
          initial[reference.id] = reference.status === "rejected" ? "rejected" : "confirmed";
        });
        setRefDecisions(initial);
        setReferenceLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) setReferenceLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, draft.encounterId, patient.id, referenceReloadKey]);

  const medicationOrders = useMemo(
    () => localOrders.filter((order): order is MedicationOrder => order.type === "medication"),
    [localOrders],
  );
  const labOrders = useMemo(
    () => localOrders.filter((order): order is LabOrder => order.type === "lab"),
    [localOrders],
  );
  const recoveryOrders = useMemo(() => pendingServerOrders(serverOrders), [serverOrders]);

  const steps = useMemo<Array<{ key: ClosingStep; label: string }>>(() => {
    const items: Array<{ key: ClosingStep; label: string }> = [
      { key: "review", label: "Review" },
      { key: "note", label: "Note" },
      { key: "diagnoses", label: "Diagnoses" },
      { key: "billing", label: "Billing" },
    ];
    if (medicationOrders.length > 0) items.push({ key: "prescriptions", label: "Prescriptions" });
    if (labOrders.length > 0) items.push({ key: "labs", label: "Labs" });
    items.push({ key: "followup", label: "Follow-up" });
    items.push({ key: "sign", label: localOrders.length > 0 ? "Sign & Authorize" : "Sign" });
    return items;
  }, [medicationOrders.length, labOrders.length, localOrders.length]);

  const currentStep = steps[Math.min(stepIndex, steps.length - 1)]?.key || "review";
  const hasControlled = useMemo(
    () => localOrders.some(orderRequiresEpcs),
    [localOrders],
  );
  const recoveryHasControlled = useMemo(
    () => recoveryOrders.some(orderRequiresEpcs),
    [recoveryOrders],
  );

  function closeCeremony() {
    if (working) return;
    setCeremonyPatientId(null);
    onClose();
  }

  function authMetadata(requiresEpcs: boolean) {
    return {
      epcsAttested: requiresEpcs ? Boolean(epcsPin && epcsToken) : false,
      authorizationSource: "unified-encounter-close",
      // Synthetic prototype identifiers only; production credentials belong to the
      // future certified prescribing/EPCS integration and must not live in the client.
      npi: "0000000000",
      deaNumber: "TEST000000",
      stateLicense: "TEST-LICENSE",
      ...(requiresEpcs ? { epcsPin, otpToken: epcsToken } : {}),
    };
  }

  function transmissionMetadata(requiresEpcs: boolean) {
    return {
      ...authMetadata(requiresEpcs),
      transmissionSource: "unified-encounter-close",
    };
  }

  async function refreshServerOrders() {
    const refreshed = await listEncounterClosingOrders(patient.id);
    setServerOrders(refreshed);
    return refreshed;
  }

  async function handleSignAndClose() {
    if (!attestationChecked || !followupConfirmed) return;
    if (draft.encounterId && referenceLoadState !== "loaded") {
      setWorkflowMessage("Encounter evidence could not be confirmed. Reload references before signing.");
      return;
    }
    if (hasControlled && (!epcsPin || !epcsToken)) {
      setWorkflowMessage("Prototype EPCS authentication is required for the controlled prescription before authorization.");
      return;
    }

    // Once the irreversible legal-signing phase begins, this modal owns the ceremony
    // for this exact patient. EncounterWorkspace may clear its ordinary review flag at
    // note signature, but the closing surface stays visible until downstream order work
    // either completes or reaches a recoverable error state.
    setCeremonyPatientId(patient.id);
    setWorking(true);
    setWorkflowMessage("Preparing authoritative staged orders…");
    const completedIds = new Set<string>();

    try {
      // Persist reviewed orders before signing, but do not authorize or transmit yet.
      // This gives the post-sign steps a durable recovery target without creating a
      // pseudo-transaction between the legal note and external orders.
      const staged: OrderRecord[] = [];
      for (const order of localOrders) {
        staged.push(await stageEncounterClosingOrder(patient.id, order, draft.encounterId));
      }
      // Clinician reference decisions are part of the signed provenance snapshot.
      // They must be durably persisted before the irreversible legal signature.
      if (draft.encounterId && Object.keys(refDecisions).length > 0) {
        const confirmIds = Object.entries(refDecisions)
          .filter(([, status]) => status === "confirmed")
          .map(([id]) => id);
        const rejectIds = Object.entries(refDecisions)
          .filter(([, status]) => status === "rejected")
          .map(([id]) => id);
        try {
          const persisted = await api.encounters.reviewReferences(
            draft.encounterId,
            patient.id,
            { confirmIds, rejectIds },
          );
          setReferences(persisted);
        } catch {
          throw new Error("Encounter evidence decisions could not be saved. The note was not signed; retry the evidence step.");
        }
      }

      setWorkflowMessage("Signing and locking the legal encounter note…");
      await Promise.resolve(onSignNote());

      // The parent signing flow catches its own errors. Confirm authoritative state
      // before any order authorization so a failed note signature never sends orders.
      const signedEncounter = await getClosingEncounter(patient.id, draft.encounterId);
      if (signedEncounter.status !== "signed") {
        throw new Error("The encounter note did not reach signed state. No orders were authorized or transmitted.");
      }

      const failures: string[] = [];
      for (const order of staged) {
        const requiresEpcs = orderRequiresEpcs(order);
        try {
          setWorkflowMessage(`Authorizing ${order.name}…`);
          const authorized = await authorizeEncounterClosingOrder(
            patient.id,
            order.id,
            authMetadata(requiresEpcs),
          );

          setWorkflowMessage(`Transmitting ${order.name} through the mock adapter…`);
          const outcome = await transmitEncounterClosingOrder(
            patient.id,
            authorized.id,
            transmissionMetadata(requiresEpcs),
          );
          if (outcome.order.status === "transmitted") completedIds.add(order.id);
        } catch {
          failures.push(order.name);
        }
      }

      if (completedIds.size > 0) clearLocalOrders(patient.id, completedIds);
      let orderRefreshFailed = false;
      try {
        await refreshServerOrders();
      } catch {
        orderRefreshFailed = true;
      }

      if (failures.length > 0 || orderRefreshFailed) {
        const parts = [
          "The legal note is signed and remains immutable.",
          failures.length > 0
            ? `${failures.length} order(s) still need attention. Use Retry Pending Orders below; the legal note will not be re-signed.`
            : null,
          orderRefreshFailed
            ? "The latest server order state could not be verified. Refresh the recovery view before assuming downstream work is complete."
            : null,
        ].filter(Boolean);
        const message = parts.join(" ");
        setWorkflowMessage(message);
        window.alert(message);
        return;
      }

      setWorkflowMessage(
        localOrders.length > 0
          ? "Encounter signed. Orders authorized and transmitted. Encounter closing complete."
          : "Encounter signed. Encounter closing complete.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkflowMessage(message);
      if (message.includes("did not reach signed state")) {
        window.alert(message);
      } else {
        window.alert(
          `Encounter closing stopped: ${message}\n\nIf the note was already signed, it remains signed; use the recovery view to resume pending orders.`,
        );
      }
    } finally {
      setWorking(false);
    }
  }

  async function handleRecovery() {
    if (recoveryHasControlled && (!epcsPin || !epcsToken)) {
      setWorkflowMessage("Prototype EPCS authentication is required before retrying the controlled prescription.");
      return;
    }

    setWorking(true);
    const completedIds = new Set<string>();
    const failures: string[] = [];
    try {
      for (const order of recoveryOrders) {
        const requiresEpcs = orderRequiresEpcs(order);
        try {
          let current = order;
          if (current.status === "staged") {
            current = await authorizeEncounterClosingOrder(
              patient.id,
              current.id,
              authMetadata(requiresEpcs),
            );
          }
          const outcome = await transmitEncounterClosingOrder(
            patient.id,
            current.id,
            transmissionMetadata(requiresEpcs),
          );
          if (outcome.order.status === "transmitted") completedIds.add(current.id);
        } catch (error) {
          failures.push(`${order.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (completedIds.size > 0) clearLocalOrders(patient.id, completedIds);
      const refreshed = await refreshServerOrders();
      const remaining = pendingServerOrders(refreshed);
      if (failures.length || remaining.length) {
        setWorkflowMessage(
          `${remaining.length} order(s) remain pending. ` +
            (failures.length ? failures.join(" · ") : "Retry is safe and does not re-sign the note."),
        );
      } else {
        setWorkflowMessage("All pending encounter orders are transmitted. The signed note was not changed.");
      }
    } finally {
      setWorking(false);
    }
  }

  if (!isOpen && ceremonyPatientId !== patient.id) return null;

  if (isLocked) {
    return (
      <div className="modal-backdrop" onClick={closeCeremony}>
        <div className="review-sign-modal" onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="eyebrow">Encounter Closing Recovery</span>
              <h3>Signed Psychiatric Record</h3>
            </div>
            <button type="button" className="modal-close" onClick={closeCeremony} disabled={working}><Icon name="close" /></button>
          </div>

          <div className="note-preview-document">
            <div className="signed-stamp-box" style={{ marginBottom: 16 }}>
              <span><Icon name="check" /> Legal note signed and immutable</span>
              <small>{draft.signedAt} · {draft.signedBy || "Authenticated clinician"}</small>
            </div>

            {working ? (
              <div className="note-doc-section">
                <h4>FINALIZING EXTERNAL ORDERS</h4>
                <p>The note is already signed. Remaining authorization/transmission steps are proceeding independently.</p>
              </div>
            ) : recoveryOrders.length === 0 ? (
              <div className="note-doc-section">
                <h4>ENCOUNTER CLOSED</h4>
                <p>No staged, authorization-pending, or failed encounter orders remain.</p>
              </div>
            ) : (
              <div className="note-doc-section">
                <h4>ORDER RECOVERY — NOTE WILL NOT BE RE-SIGNED</h4>
                <p>
                  {recoveryOrders.length} order(s) remain outside the signed-note action. Retrying is idempotent:
                  transmitted orders are not resent and the legal note is never rolled back.
                </p>
                <ul className="mse-doc-list">
                  {recoveryOrders.map((order) => (
                    <li key={order.id}>
                      <strong>{order.name}</strong> — {order.status.replaceAll("_", " ")}
                      {order.details?.lastTransmissionError?.message
                        ? ` · ${order.details.lastTransmissionError.message}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {recoveryHasControlled && recoveryOrders.length > 0 && (
              <div className="note-doc-section">
                <h4>PROTOTYPE EPCS AUTHENTICATION</h4>
                <p>Controlled prescriptions require a distinct authentication step before authorization/retry.</p>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <input
                    value={epcsPin}
                    onChange={(event) => setEpcsPin(event.target.value)}
                    placeholder="Prototype PIN"
                    type="password"
                  />
                  <input
                    value={epcsToken}
                    onChange={(event) => setEpcsToken(event.target.value)}
                    placeholder="Prototype OTP/token"
                  />
                </div>
              </div>
            )}

            {workflowMessage && (
              <div className="note-doc-section">
                <strong>Status:</strong> {workflowMessage}
              </div>
            )}
          </div>

          <div className="review-sign-footer">
            <div className="modal-actions">
              <button type="button" className="modal-cancel-btn" onClick={closeCeremony} disabled={working}>Close</button>
              {recoveryOrders.length > 0 && (
                <button
                  type="button"
                  className="sign-confirm-btn"
                  onClick={handleRecovery}
                  disabled={working || (recoveryHasControlled && (!epcsPin || !epcsToken))}
                >
                  {working ? "Retrying pending orders…" : "Retry Pending Orders"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={closeCeremony}>
      <div className="review-sign-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="eyebrow">Unified Psychiatric Encounter Closing</span>
            <h3>Review, Sign &amp; Authorize</h3>
          </div>
          <button type="button" className="modal-close" onClick={closeCeremony} disabled={working}><Icon name="close" /></button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "10px 18px",
            overflowX: "auto",
            borderBottom: "1px solid var(--m3-outline-variant)",
          }}
        >
          {steps.map((item, index) => (
            <button
              key={item.key}
              type="button"
              className={index === stepIndex ? "sign-confirm-btn" : "modal-cancel-btn"}
              style={{ padding: "6px 10px", whiteSpace: "nowrap" }}
              onClick={() => setStepIndex(index)}
              disabled={working}
            >
              {index < stepIndex ? "" : ""}{item.label}
            </button>
          ))}
        </div>

        <div className="note-preview-document">
          {currentStep === "review" && (
            <>
              <div className="note-doc-meta">
                <div><strong>Patient:</strong> {patient.name} · <strong>MRN:</strong> {patient.mrn} · <strong>DOB:</strong> {patient.dob}</div>
                <div><strong>Visit:</strong> {draft.visitType} · <strong>Billing:</strong> {codingRec.primaryCode} {codingRec.addonCodes.join(" ")}</div>
                <div><strong>Closing items:</strong> {medicationOrders.length} prescription(s) · {labOrders.length} lab order(s)</div>
              </div>
              <div className="note-doc-section">
                <h4>CLOSING SEQUENCE</h4>
                <p>
                  Review documentation, diagnoses, billing, staged orders, and follow-up first. The final action signs the legal note;
                  order authorization and transmission then occur as separate authoritative actions with their own audit/failure state.
                </p>
              </div>
            </>
          )}

          {currentStep === "note" && (
            <>
              <div className="note-doc-section"><h4>CHIEF COMPLAINT</h4><p>{draft.chiefComplaint || "Routine psychiatric follow-up."}</p></div>
              <div className="note-doc-section"><h4>INTERVAL HISTORY (HPI)</h4><p>{draft.intervalHistory || "None documented."}</p></div>
              <div className="note-doc-section"><h4>MENTAL STATUS EXAMINATION</h4><ul className="mse-doc-list">
                <li><strong>Appearance:</strong> {draft.mse.appearance}</li>
                <li><strong>Behavior:</strong> {draft.mse.behavior}</li>
                <li><strong>Speech:</strong> {draft.mse.speech}</li>
                <li><strong>Mood &amp; Affect:</strong> {draft.mse.moodAffect}</li>
                <li><strong>Thought Process:</strong> {draft.mse.thoughtProcess}</li>
                <li><strong>Thought Content:</strong> {draft.mse.thoughtContent}</li>
                <li><strong>Cognition:</strong> {draft.mse.cognition}</li>
                <li><strong>Insight &amp; Judgment:</strong> {draft.mse.insightJudgment}</li>
              </ul></div>
              <div className="note-doc-section"><h4>ASSESSMENT &amp; PLAN</h4><p style={{ whiteSpace: "pre-line" }}>{draft.assessment || "Clinical assessment pending."}</p><p style={{ whiteSpace: "pre-line" }}>{draft.plan || "Plan as documented."}</p></div>
            </>
          )}

          {currentStep === "diagnoses" && (
            <div className="note-doc-section">
              <h4>DIAGNOSES &amp; ENCOUNTER EVIDENCE</h4>
              <p style={{ marginBottom: 12 }}>
                References linking clinical documentation to authoritative records. Confirmed references establish claim codes and audit provenance upon signing.
              </p>

              {referenceLoadState === "loading" ? (
                <p style={{ color: "var(--m3-on-surface-variant)", marginBottom: 12 }}>
                  Loading encounter evidence…
                </p>
              ) : referenceLoadState === "error" ? (
                <div style={{ marginBottom: 16 }} role="alert">
                  <p style={{ color: "var(--m3-error, #b91c1c)", marginBottom: 8 }}>
                    Encounter evidence could not be loaded. This is not the same as having no references, and signing is disabled until retrieval succeeds.
                  </p>
                  <button type="button" onClick={() => setReferenceReloadKey((value) => value + 1)}>
                    Retry evidence load
                  </button>
                </div>
              ) : references.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                  {references.map((ref) => {
                    const currentStatus = refDecisions[ref.id] || (ref.status === "rejected" ? "rejected" : "confirmed");
                    const isProposed = ref.source === "ai-extracted";
                    const isConfirmed = currentStatus === "confirmed";

                    return (
                      <div
                        key={ref.id}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          border: `1px solid ${isConfirmed ? "var(--m3-primary-container, #c7d2fe)" : "var(--m3-outline-variant, #e2e8f0)"}`,
                          backgroundColor: isConfirmed ? "var(--m3-surface-variant, #f8fafc)" : "var(--m3-surface, #ffffff)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                textTransform: "uppercase",
                                padding: "2px 6px",
                                borderRadius: 4,
                                backgroundColor:
                                  ref.source === "action-derived"
                                    ? "#e0e7ff"
                                    : ref.source === "clinician-authored"
                                    ? "#dcfce7"
                                    : "#fef3c7",
                                color:
                                  ref.source === "action-derived"
                                    ? "#3730a3"
                                    : ref.source === "clinician-authored"
                                    ? "#166534"
                                    : "#92400e",
                              }}
                            >
                              {ref.source.replace("-", " ")}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--m3-on-surface-variant, #64748b)" }}>
                              Section: <strong>{ref.section}</strong>
                            </span>
                            {ref.code && (
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  fontFamily: "var(--font-mono, monospace)",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  backgroundColor: "var(--m3-primary-container, #e0e7ff)",
                                  color: "var(--m3-on-primary-container, #1e1b4b)",
                                }}
                              >
                                {ref.code}
                              </span>
                            )}
                            {ref.entityType === "problem" && !ref.code && (
                              <span style={{ fontSize: 11, color: "#64748b" }}>(Uncoded)</span>
                            )}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>
                            {ref.display || `${ref.entityType}: ${ref.entityId}`}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {isProposed ? (
                            <>
                              <button
                                type="button"
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  border: isConfirmed ? "2px solid #16a34a" : "1px solid var(--m3-outline, #cbd5e1)",
                                  backgroundColor: isConfirmed ? "#dcfce7" : "transparent",
                                  color: isConfirmed ? "#15803d" : "inherit",
                                  cursor: "pointer",
                                }}
                                onClick={() => setRefDecisions({ ...refDecisions, [ref.id]: "confirmed" })}
                              >
                                {isConfirmed ? "✓ Accepted" : "Accept"}
                              </button>
                              <button
                                type="button"
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  border: !isConfirmed ? "2px solid #dc2626" : "1px solid var(--m3-outline, #cbd5e1)",
                                  backgroundColor: !isConfirmed ? "#fee2e2" : "transparent",
                                  color: !isConfirmed ? "#b91c1c" : "inherit",
                                  cursor: "pointer",
                                }}
                                onClick={() => setRefDecisions({ ...refDecisions, [ref.id]: "rejected" })}
                              >
                                {!isConfirmed ? "✕ Declined" : "Decline"}
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#166534" }}>
                              ✓ Confirmed ({ref.source === "action-derived" ? "Staged Act" : "Authored"})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ color: "var(--m3-on-surface-variant)", fontStyle: "italic", marginBottom: 12 }}>
                  No note references extracted or linked for this encounter yet.
                </p>
              )}

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--m3-outline-variant)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--m3-on-surface-variant)", marginBottom: 6 }}>
                  Active Chart Diagnoses Context:
                </div>
                {patient.diagnoses.length ? (
                  <ul className="mse-doc-list">
                    {patient.diagnoses.map((diagnosis) => (
                      <li key={diagnosis}>{diagnosis}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No active diagnosis projection on file.</p>
                )}
                <p style={{ marginTop: 10 }}><strong>Encounter assessment:</strong> {draft.assessment || "Not documented."}</p>
              </div>
            </div>
          )}

          {currentStep === "billing" && (
            <div className="note-doc-section">
              <h4>BILLING CONFIRMATION</h4>
              <p><strong>Primary E/M:</strong> {codingRec.primaryCode}</p>
              <p><strong>Add-on code(s):</strong> {codingRec.addonCodes.join(", ") || "None"}</p>
              <p><strong>MDM:</strong> {codingRec.mdmLevel.toUpperCase()} — {codingRec.mdmReasoning}</p>
              <p><strong>Psychotherapy minutes:</strong> {psychotherapyMinutes}</p>

              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--m3-outline-variant)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", color: "var(--m3-on-surface-variant)", marginBottom: 6 }}>
                  Attested Claim Diagnoses (Traceable to Records):
                </div>
                {(() => {
                  const confirmedProblems = references.filter(
                    (r) => r.entityType === "problem" && (refDecisions[r.id] ?? r.status) === "confirmed",
                  );
                  if (confirmedProblems.length === 0) {
                    return (
                      <p style={{ color: "var(--m3-on-surface-variant)", fontStyle: "italic" }}>
                        No referenced diagnoses confirmed for this encounter yet.
                      </p>
                    );
                  }
                  return (
                    <ul className="mse-doc-list">
                      {confirmedProblems.map((p) => (
                        <li key={p.id}>
                          <strong>{p.code ? `${p.code} · ` : ""}{p.display || p.entityId}</strong>
                          {p.code ? " (ICD-10-CM)" : " (Uncoded record)"}
                        </li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </div>
          )}

          {currentStep === "prescriptions" && (
            <div className="note-doc-section">
              <h4>STAGED PRESCRIPTIONS</h4>
              <ul className="mse-doc-list">
                {medicationOrders.map((order) => (
                  <li key={order.id}>
                    <strong>{order.medication}</strong> — {order.sig} · Qty {order.dispenseQuantity} · {order.refills} refill(s) · {order.pharmacy.name}
                    {orderRequiresEpcs(order) ? " · Controlled / EPCS required" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {currentStep === "labs" && (
            <div className="note-doc-section">
              <h4>STAGED LABS</h4>
              <ul className="mse-doc-list">
                {labOrders.map((order) => (
                  <li key={order.id}>
                    <strong>{order.testName}</strong> — {order.priority} · {order.targetFacility}{order.fastingRequired ? " · Fasting" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {currentStep === "followup" && (
            <div className="note-doc-section">
              <h4>FOLLOW-UP &amp; APPOINTMENT SCHEDULING</h4>
              <p><strong>Current scheduled/anticipated follow-up:</strong> {patient.nextVisit || "Unscheduled"}</p>

              <div
                style={{
                  marginTop: 14,
                  marginBottom: 14,
                  padding: "14px 16px",
                  background: "var(--m3-surface-variant, #f8fafc)",
                  borderRadius: 8,
                  border: "1px solid var(--m3-outline-variant, #e2e8f0)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color: "var(--m3-on-surface-variant)",
                    marginBottom: 8,
                  }}
                >
                  Deterministic Follow-Up Interval
                </div>
                <p style={{ fontSize: 13, marginBottom: 10, color: "var(--m3-on-surface, #1e293b)" }}>
                  Select the clinically indicated interval to schedule an authoritative linked follow-up appointment directly from this encounter:
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                  {FOLLOW_UP_INTERVALS.map((interval) => {
                    const isSelected = selectedFollowUpInterval === interval;
                    const targetDate = calculateFollowUpDate(
                      draft.date || new Date().toISOString().slice(0, 10),
                      interval,
                    );
                    return (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => setSelectedFollowUpInterval(interval)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 500,
                          border: isSelected
                            ? "2px solid var(--m3-primary, #3b82f6)"
                            : "1px solid var(--m3-outline-variant, #cbd5e1)",
                          backgroundColor: isSelected
                            ? "var(--m3-primary-container, #eff6ff)"
                            : "var(--m3-surface, #ffffff)",
                          color: isSelected
                            ? "var(--m3-on-primary-container, #1d4ed8)"
                            : "var(--m3-on-surface, #334155)",
                          cursor: "pointer",
                        }}
                      >
                        {interval} ({targetDate})
                      </button>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      setBookingFollowUp(true);
                      setFollowUpBookingError(null);
                      setFollowUpBookingSuccess(null);
                      try {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const res = await api.appointments.scheduleFollowUp({
                          patientId: patient.id,
                          originAppointmentId: draft.appointmentId || undefined,
                          interval: selectedFollowUpInterval,
                          baseDate: draft.date || todayStr,
                        });
                        setFollowUpBookingSuccess(
                          `Scheduled ${selectedFollowUpInterval} follow-up on ${res.date} at ${res.time}`,
                        );
                        setFollowupConfirmed(true);
                        dispatchWorkspaceEvent(WORKSPACE_APPOINTMENT_UPDATED_EVENT, {
                          appointmentId: res.id,
                          status: res.status,
                        });
                      } catch (err) {
                        setFollowUpBookingError(
                          err instanceof Error
                            ? err.message
                            : "Failed to schedule follow-up appointment",
                        );
                      } finally {
                        setBookingFollowUp(false);
                      }
                    }}
                    disabled={bookingFollowUp}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      border: "none",
                      backgroundColor: "var(--m3-primary, #2563eb)",
                      color: "#ffffff",
                      cursor: bookingFollowUp ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Icon name="event_available" size="sm" />
                    {bookingFollowUp
                      ? "Booking follow-up..."
                      : `Schedule ${selectedFollowUpInterval} follow-up`}
                  </button>

                  {followUpBookingSuccess && (
                    <span
                      style={{
                        fontSize: 12,
                        color: "#16a34a",
                        fontWeight: 500,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon name="check_circle" size="sm" />
                      {followUpBookingSuccess}
                    </span>
                  )}
                  {followUpBookingError && (
                    <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 500 }}>
                      {followUpBookingError}
                    </span>
                  )}
                </div>
              </div>

              <label className="attestation-checkbox-label" style={{ marginTop: 12 }}>
                <input
                  type="checkbox"
                  checked={followupConfirmed}
                  onChange={(event) => setFollowupConfirmed(event.target.checked)}
                />
                <span>I reviewed the follow-up plan and it is appropriate for this encounter.</span>
              </label>
            </div>
          )}

          {currentStep === "sign" && (
            <>
              <div className="note-doc-section">
                <h4>LEGAL NOTE SIGNATURE</h4>
                <p>
                  Signing freezes the legal encounter note. Order authorization and mock transmission happen afterward as separate actions.
                  A transmission failure cannot undo or alter the signed note.
                </p>
              </div>

              {hasControlled && (
                <div className="note-doc-section">
                  <h4>PROTOTYPE EPCS AUTHENTICATION</h4>
                  <p>A controlled prescription is staged. Complete the separate prototype authentication gate before final authorization.</p>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <input value={epcsPin} onChange={(event) => setEpcsPin(event.target.value)} placeholder="Prototype PIN" type="password" />
                    <input value={epcsToken} onChange={(event) => setEpcsToken(event.target.value)} placeholder="Prototype OTP/token" />
                  </div>
                </div>
              )}

              <label className="attestation-checkbox-label">
                <input
                  type="checkbox"
                  checked={attestationChecked}
                  onChange={(event) => onToggleAttestation(event.target.checked)}
                />
                <span>
                  I attest that I conducted this psychiatric encounter, reviewed the clinical documentation, diagnoses, billing,
                  staged orders, and follow-up plan, and confirm the accuracy of the legal note and assigned services.
                </span>
              </label>

              {workflowMessage && (
                <div className="note-doc-section"><strong>Status:</strong> {workflowMessage}</div>
              )}
            </>
          )}
        </div>

        <div className="review-sign-footer">
          <div className="modal-actions" style={{ width: "100%", justifyContent: "space-between" }}>
            <button
              type="button"
              className="modal-cancel-btn"
              onClick={() => (stepIndex === 0 ? closeCeremony() : setStepIndex((index) => Math.max(0, index - 1)))}
              disabled={working}
            >
              {stepIndex === 0 ? "Back to Edit" : "Back"}
            </button>

            {stepIndex < steps.length - 1 ? (
              <button
                type="button"
                className="sign-confirm-btn"
                onClick={() => setStepIndex((index) => Math.min(steps.length - 1, index + 1))}
                disabled={working || (currentStep === "followup" && !followupConfirmed)}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                className="sign-confirm-btn"
                onClick={handleSignAndClose}
                disabled={
                  working ||
                  !attestationChecked ||
                  !followupConfirmed ||
                  (hasControlled && (!epcsPin || !epcsToken))
                }
              >
                {working
                  ? workflowMessage || "Closing encounter…"
                  : localOrders.length > 0
                    ? "Sign Note, Then Authorize & Transmit"
                    : "Sign Legal Record"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}