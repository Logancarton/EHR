import { defaultPrescribingAdapter } from "../../adapters";
import type {
  PatientMedicationTruthRelationship,
  PatientPrescriptionCancellationLineage,
  PatientPrescriptionChangeLineage,
  PatientPrescriptionRecoveryProjection,
  PatientPrescriptionRefillLineage,
  PatientPrescriptionTransportProjection,
  PatientPrescriptionWorkItem,
  PatientPrescribingActionProjection,
  PatientPrescribingLineageEvent,
  PatientPrescribingWorkflowGroup,
  PatientPrescribingWorkspaceProjection,
} from "../../domain/patient-prescribing-workspace";
import type { PrescriptionTransaction } from "../../domain/prescription-transactions";
import { assertPermission, hasPermission, type ProviderContext } from "../auth/provider-context";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { integrationHealthService } from "./integration-health-service";
import { medicationPrescriptionService } from "./medication-prescription-service";
import { prescriptionChangeRequestService } from "./prescription-change-request-service";
import { prescriptionRecoveryService, type PrescriptionRecoveryStatus } from "./prescription-recovery-service";
import { prescriptionRefillService } from "./prescription-refill-service";

type IntegrationGate = { ready: boolean; reason: string };

const GROUP_ORDER: PatientPrescribingWorkflowGroup[] = [
  "needs_provider_action",
  "ready_to_authorize",
  "ready_to_send",
  "awaiting_external_outcome",
  "needs_operational_review",
  "completed_historical",
];

const GROUP_LABELS: Record<PatientPrescribingWorkflowGroup, string> = {
  needs_provider_action: "Needs provider action",
  ready_to_authorize: "Ready to authorize",
  ready_to_send: "Ready to send",
  awaiting_external_outcome: "Awaiting external outcome",
  needs_operational_review: "Needs operational review",
  completed_historical: "Completed / historical",
};

const AWAITING_STATES = new Set<PrescriptionTransaction["state"]>([
  "prepared",
  "submitted",
  "acknowledged",
  "cancellation_requested",
  "change_requested",
]);

function blockedIntegration(reason = "No configured prescribing integration is currently ready for this transport path."): IntegrationGate {
  return { ready: false, reason };
}

async function loadIntegrationGates(actor: ProviderContext): Promise<Map<string, IntegrationGate>> {
  const gates = new Map<string, IntegrationGate>();
  if (!hasPermission(actor, "transmit_order") || !hasPermission(actor, "manage_integrations")) return gates;
  try {
    const statuses = await integrationHealthService.list(actor);
    for (const status of statuses.filter((item) => item.purpose === "prescribing")) {
      if (status.readiness === "ready") {
        gates.set(status.adapterId, { ready: true, reason: "The configured prescribing integration is ready for the established transport path." });
      } else if (status.readiness === "disabled") {
        gates.set(status.adapterId, blockedIntegration("The configured prescribing integration is disabled."));
      } else {
        gates.set(status.adapterId, blockedIntegration("The configured prescribing integration is missing required secret material."));
      }
    }
  } catch {
    // Projection reads remain available to read_clinical actors while external actions fail closed.
  }
  return gates;
}

function projectedTransport(transaction: PrescriptionTransaction): PatientPrescriptionTransportProjection {
  return {
    transactionId: transaction.id,
    transactionType: transaction.transactionType,
    state: transaction.state,
    attemptCount: transaction.attemptCount,
    relatedTransactionId: transaction.relatedTransactionId,
    pharmacyName: transaction.destination?.pharmacyName,
    updatedAt: transaction.updatedAt,
  };
}

function medicationTruth(order: OrderRecord): PatientMedicationTruthRelationship {
  const review = medicationPrescriptionService.review(order, { source: "api" });
  const confirmation = order.details?.medicationTruthConfirmation;
  const confirmed = Boolean(
    confirmation &&
    typeof confirmation === "object" &&
    (confirmation.operation === "add" || confirmation.operation === "update") &&
    typeof confirmation.medicationRecordId === "string",
  );
  return {
    confirmed,
    medicationRecordId: confirmed ? confirmation.medicationRecordId : undefined,
    confirmationOperation: confirmed ? confirmation.operation : undefined,
    advisoryImpact: review.truthImpact.kind,
    advisorySummary: review.truthImpact.summary,
    suggestedOperation: confirmed ? undefined : review.truthImpact.medicationId ? "update" : "add",
    suggestedMedicationRecordId: confirmed ? undefined : review.truthImpact.medicationId || undefined,
    changedByPrescriptionActivity: false,
  };
}

function authorizeProjection(order: OrderRecord, actor: ProviderContext): PatientPrescribingActionProjection {
  const base = { id: "authorize" as const, targetId: order.id };
  if (order.status !== "staged") return { ...base, allowed: false, reason: "Only a staged prescription can be authorized." };
  if (!hasPermission(actor, "authorize_order")) return { ...base, allowed: false, reason: "Authorization requires provider order-authorization authority." };
  if (order.details?.requiresEpcs === true || (order.details?.deaSchedule && order.details.deaSchedule !== "None")) {
    return { ...base, allowed: false, reason: "This prescription requires the existing EPCS attestation flow; this workspace does not bypass or simulate EPCS." };
  }
  const review = medicationPrescriptionService.review(order, { source: "api" });
  if (!review.canAuthorize) {
    const reason = review.validationIssues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ");
    return { ...base, allowed: false, reason: reason || "Prescription review must be completed before authorization." };
  }
  return { ...base, allowed: true, reason: "Prescription review is valid and server-derived authorization authority is present." };
}

function transmitProjection(input: {
  order: OrderRecord;
  actor: ProviderContext;
  latest?: PrescriptionTransaction;
  recovery?: PrescriptionRecoveryStatus;
  integrations: Map<string, IntegrationGate>;
}): PatientPrescribingActionProjection {
  const { order, actor, latest, recovery, integrations } = input;
  const retry = order.status === "transmission_failed" || order.status === "transmission_uncertain";
  const base = { id: retry ? "retry_transmission" as const : "transmit" as const, targetId: order.id };
  if (!["authorized", "transmission_failed", "transmission_uncertain"].includes(order.status)) {
    return { ...base, allowed: false, reason: "Prescription must be authorized and not already completed before transmission." };
  }
  if (!hasPermission(actor, "transmit_order")) return { ...base, allowed: false, reason: "Transmission requires prescribing transmission authority." };
  if (order.details?.requiresEpcs === true || (order.details?.deaSchedule && order.details.deaSchedule !== "None")) {
    return { ...base, allowed: false, reason: "This prescription requires the existing EPCS transmission flow; this workspace does not collect or bypass EPCS credentials." };
  }
  if (order.status === "transmission_uncertain" && !recovery?.retryAllowed) {
    return { ...base, allowed: false, reason: "Outcome is uncertain. Controlled retry remains blocked until retained recovery evidence explicitly unlocks it." };
  }
  const gate = integrations.get(latest?.adapterId || defaultPrescribingAdapter.id) || blockedIntegration();
  if (!gate.ready) return { ...base, allowed: false, reason: gate.reason };
  return {
    ...base,
    allowed: true,
    reason: retry
      ? "Existing server-side retry safeguards, authorization, permission, and integration readiness permit the established retry path."
      : "Authorization, permission, and integration readiness permit the established transmission path.",
  };
}

function truthProjection(order: OrderRecord, actor: ProviderContext, truth: PatientMedicationTruthRelationship): PatientPrescribingActionProjection {
  const base = { id: "confirm_medication_truth" as const, targetId: order.id };
  if (truth.confirmed) return { ...base, allowed: false, reason: "Medication truth has already been explicitly confirmed for this prescription." };
  if (!["authorized", "transmitted", "transmission_failed"].includes(order.status)) {
    return { ...base, allowed: false, reason: "Medication truth can only be confirmed after explicit prescription authorization." };
  }
  if (!hasPermission(actor, "authorize_order") || !hasPermission(actor, "manage_clinical_record")) {
    return { ...base, allowed: false, reason: "Medication-truth confirmation requires both order-authorization and clinical-record authority." };
  }
  return {
    ...base,
    allowed: true,
    reason: truth.suggestedOperation === "update"
      ? "The prescription review identifies an existing medication record; explicit confirmation may update that record through the established pathway."
      : "No medication record is changed automatically; explicit confirmation may add this prescription to medication truth through the established pathway.",
  };
}

function cancelProjection(input: {
  actor: ProviderContext;
  original?: PrescriptionTransaction;
  cancellation?: PrescriptionTransaction;
  integrations: Map<string, IntegrationGate>;
}): PatientPrescribingActionProjection {
  const { actor, original, cancellation, integrations } = input;
  const base = { id: "cancel_prescription" as const, targetId: original?.id };
  if (cancellation) {
    return {
      ...base,
      allowed: false,
      reason: ["cancellation_acknowledged", "canceled"].includes(cancellation.state)
        ? "Cancellation outcome is already retained in prescription history."
        : "A linked CancelRx transaction already exists; resolve its transport lifecycle rather than creating another cancellation.",
    };
  }
  if (!original || !["submitted", "acknowledged", "accepted"].includes(original.state)) {
    return { ...base, allowed: false, reason: "Cancellation is available only for an eligible transmitted new prescription transaction." };
  }
  if (!hasPermission(actor, "transmit_order")) return { ...base, allowed: false, reason: "Cancellation requires prescribing transmission authority." };
  const gate = integrations.get(original.adapterId) || blockedIntegration();
  if (!gate.ready) return { ...base, allowed: false, reason: gate.reason };
  return { ...base, allowed: true, reason: "The original transmitted prescription is eligible for the established linked CancelRx pathway." };
}

function projectedRecovery(status: PrescriptionRecoveryStatus | undefined): PatientPrescriptionRecoveryProjection | undefined {
  if (!status) return undefined;
  return {
    transactionId: status.transactionId,
    status: status.operationalStatus,
    requiresAttention: status.requiresAttention,
    retryAllowed: status.retryAllowed,
    reason: status.conflict
      ? "Manual recovery evidence conflicts with later verified external evidence. Review is required; retry is blocked."
      : status.retryAllowed
        ? "Retained clinician-recorded evidence explicitly permits one controlled retry through the existing recovery path."
        : status.requiresAttention
          ? "Transport outcome requires operational review. The system will not infer success, failure, or retry permission."
          : "Retained recovery evidence documents or resolves prior ambiguity without changing medication truth.",
  };
}

function groupFor(input: {
  order: OrderRecord;
  latest?: PrescriptionTransaction;
  recovery?: PrescriptionRecoveryStatus;
  pendingRefill: boolean;
  pendingChange: boolean;
}): PatientPrescribingWorkflowGroup {
  const { order, latest, recovery, pendingRefill, pendingChange } = input;
  if (pendingRefill || pendingChange) return "needs_provider_action";
  if (
    order.status === "transmission_failed" ||
    order.status === "transmission_uncertain" ||
    latest?.state === "failed" ||
    latest?.state === "outcome_uncertain" ||
    recovery?.requiresAttention
  ) return "needs_operational_review";
  if (order.status === "staged") return "ready_to_authorize";
  if (order.status === "authorized") return "ready_to_send";
  if (latest && AWAITING_STATES.has(latest.state)) return "awaiting_external_outcome";
  return "completed_historical";
}

function statusLabel(group: PatientPrescribingWorkflowGroup, latest: PrescriptionTransaction | undefined, pendingRefill: boolean, pendingChange: boolean): string {
  if (pendingRefill) return "Refill request awaiting review";
  if (pendingChange) return "Pharmacy requested a change";
  if (group === "ready_to_authorize") return "Ready to authorize";
  if (group === "ready_to_send") return "Ready to send";
  if (group === "awaiting_external_outcome") return "Waiting for pharmacy network response";
  if (group === "needs_operational_review") return latest?.state === "outcome_uncertain" ? "Outcome unknown — review required" : "Transmission failed / review required";
  if (latest?.state === "accepted") return "Accepted by pharmacy network";
  if (latest?.state === "canceled" || latest?.state === "cancellation_acknowledged") return "Cancellation completed";
  if (latest?.state === "rejected") return "Rejected by pharmacy network";
  return "Historical prescription";
}

export class PatientPrescribingWorkspaceService {
  async project(patientId: string, actor: ProviderContext): Promise<PatientPrescribingWorkspaceProjection> {
    assertPermission(actor, "read_clinical");
    if (!PatientRepository.getById(patientId)) throw new Error(`Patient not found: ${patientId}`);

    const integrations = await loadIntegrationGates(actor);
    const orders = OrderRepository.getByPatient(patientId).filter((order) => order.type === "medication");
    const transactions = PrescriptionTransactionRepository.listByPatient(patientId);
    const refills = prescriptionRefillService.listStatus(patientId, actor);
    const changes = prescriptionChangeRequestService.listStatus(patientId, actor);
    const recoveries = new Map(prescriptionRecoveryService.listByPatient(patientId, actor).map((status) => [status.transactionId, status]));

    const items: PatientPrescriptionWorkItem[] = orders.map((order) => {
      const orderTransactions = transactions.filter((transaction) => transaction.orderId === order.id);
      const originals = orderTransactions.filter((transaction) => transaction.transactionType === "new_rx");
      const cancellations = orderTransactions.filter((transaction) => transaction.transactionType === "cancel_rx");
      const original = originals[0];
      const cancellation = cancellations[0];
      const latest = orderTransactions[0];
      const recovery = latest ? recoveries.get(latest.id) : undefined;
      const review = medicationPrescriptionService.review(order, { source: "api" });
      const truth = medicationTruth(order);

      const refillLineage: PatientPrescriptionRefillLineage[] = refills
        .filter((request) => request.priorOrderId === order.id || request.renewalOrderId === order.id)
        .map((request) => ({
          refillRequestId: request.refillRequestId,
          status: request.status,
          requestSource: request.requestSource,
          priorOrderId: request.priorOrderId,
          priorTransactionId: request.priorTransactionId,
          renewalOrderId: request.renewalOrderId,
          updatedAt: request.updatedAt,
        }));
      const changeLineage: PatientPrescriptionChangeLineage[] = changes
        .filter((request) => request.sourceOrderId === order.id || request.resultingOrderId === order.id)
        .map((request) => ({
          changeRequestId: request.changeRequestId,
          status: request.status,
          category: request.category,
          requestedChanges: request.requestedChanges,
          sourceOrderId: request.sourceOrderId,
          sourceTransactionId: request.sourceTransactionId,
          resultingOrderId: request.resultingOrderId,
          updatedAt: request.updatedAt,
        }));
      const cancellationLineage: PatientPrescriptionCancellationLineage[] = cancellations
        .filter((transaction) => Boolean(transaction.relatedTransactionId))
        .map((transaction) => ({
          cancellationTransactionId: transaction.id,
          targetTransactionId: transaction.relatedTransactionId!,
          state: transaction.state,
          updatedAt: transaction.updatedAt,
        }));
      const pendingRefills = refillLineage.filter((request) => request.status === "pending" && request.priorOrderId === order.id);
      const pendingChanges = changeLineage.filter((request) => request.status === "pending" && request.sourceOrderId === order.id);
      const group = groupFor({
        order,
        latest,
        recovery,
        pendingRefill: pendingRefills.length > 0,
        pendingChange: pendingChanges.length > 0,
      });

      const actions: PatientPrescribingActionProjection[] = [
        authorizeProjection(order, actor),
        transmitProjection({ order, actor, latest, recovery, integrations }),
        truthProjection(order, actor, truth),
        cancelProjection({ actor, original, cancellation, integrations }),
      ];
      for (const request of pendingRefills) {
        const allowed = hasPermission(actor, "stage_order");
        actions.push({
          id: "renew_refill",
          allowed,
          reason: allowed
            ? "Provider action may stage a new renewal prescription intent; the prior order remains historical."
            : "Renewal requires order-staging authority.",
          targetId: request.refillRequestId,
        });
      }
      for (const request of pendingChanges) {
        const allowed = hasPermission(actor, "stage_order");
        actions.push({
          id: "accept_change",
          allowed,
          reason: allowed
            ? "Accepting this request stages a new replacement prescription intent and preserves the original history."
            : "Accepting a pharmacy change requires order-staging authority.",
          targetId: request.changeRequestId,
        });
        actions.push({
          id: "decline_change",
          allowed,
          reason: allowed
            ? "Declining records the provider response without changing the existing prescription or medication truth."
            : "Declining a pharmacy change requires order-staging authority.",
          targetId: request.changeRequestId,
        });
      }
      if (recovery?.requiresAttention) {
        const allowed = hasPermission(actor, "transmit_order");
        actions.push({
          id: "record_recovery_evidence",
          allowed,
          reason: allowed
            ? "Operational recovery evidence may be recorded through the established bounded recovery pathway."
            : "Operational recovery requires prescribing transmission authority.",
          targetId: recovery.transactionId,
        });
      }

      const lineage: PatientPrescribingLineageEvent[] = [
        { id: `order:${order.id}`, kind: "order", label: "Prescription intent staged", at: order.createdAt },
      ];
      for (const transaction of orderTransactions) {
        lineage.push({
          id: `transport:${transaction.id}`,
          kind: transaction.transactionType === "cancel_rx" ? "cancellation" : "transport",
          label: transaction.transactionType === "cancel_rx"
            ? `CancelRx — ${transaction.state.replaceAll("_", " ")}`
            : `Prescription transport — ${transaction.state.replaceAll("_", " ")}`,
          at: transaction.updatedAt,
        });
      }
      for (const request of refillLineage) {
        lineage.push({
          id: `refill:${request.refillRequestId}`,
          kind: "refill",
          label: request.status === "pending" ? "Refill request received" : "Renewal prescription staged",
          at: request.updatedAt,
        });
      }
      for (const request of changeLineage) {
        lineage.push({
          id: `change:${request.changeRequestId}`,
          kind: "change_request",
          label: request.status === "pending" ? "Pharmacy change request received" : `Pharmacy change request ${request.status}`,
          at: request.updatedAt,
        });
      }
      if (recovery) {
        lineage.push({
          id: `recovery:${recovery.transactionId}:${recovery.operationalStatus}`,
          kind: "recovery",
          label: `Operational recovery — ${recovery.operationalStatus.replaceAll("_", " ")}`,
          at: latest?.updatedAt || order.updatedAt,
        });
      }
      lineage.sort((left, right) => left.at.localeCompare(right.at));

      const updatedAt = [
        order.updatedAt,
        ...orderTransactions.map((item) => item.updatedAt),
        ...refillLineage.map((item) => item.updatedAt),
        ...changeLineage.map((item) => item.updatedAt),
      ].sort().at(-1) || order.updatedAt;

      return {
        id: `prescription-work:${order.id}`,
        patientId,
        orderId: order.id,
        medicationName: review.intent.medicationName,
        displayStatus: statusLabel(group, latest, pendingRefills.length > 0, pendingChanges.length > 0),
        group,
        orderStatus: order.status,
        historical: group === "completed_historical",
        pharmacyName: review.intent.pharmacy?.name || original?.destination?.pharmacyName,
        prescription: {
          strength: review.intent.strength,
          dose: review.intent.dose,
          route: review.intent.route,
          frequency: review.intent.frequency,
          sig: review.intent.sig,
          quantity: review.intent.quantity,
          daysSupply: review.intent.daysSupply,
          refills: review.intent.refills,
        },
        medicationTruth: truth,
        latestTransport: latest ? projectedTransport(latest) : undefined,
        transports: orderTransactions.map(projectedTransport),
        refillLineage,
        changeLineage,
        cancellationLineage,
        recovery: projectedRecovery(recovery),
        actions,
        lineage,
        updatedAt,
      };
    });

    items.sort((left, right) => GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group) || right.updatedAt.localeCompare(left.updatedAt));
    return {
      patientId,
      generatedAt: new Date().toISOString(),
      sections: GROUP_ORDER.map((group) => ({ group, label: GROUP_LABELS[group], items: items.filter((item) => item.group === group) })),
      medicationTruthBoundary: "Prescription activity never changes the clinical medication record without explicit confirmation.",
    };
  }
}

export const patientPrescribingWorkspaceService = new PatientPrescribingWorkspaceService();
