import { createHash } from "node:crypto";
import {
  prescriptionIntentFromOrderInput,
  type MedicationPrescriptionIntent,
} from "../../domain/medication-prescription-intent";
import {
  sanitizePrescriptionTransactionErrorMessage,
  type PrescriptionTransaction,
} from "../../domain/prescription-transactions";
import type {
  PrescriptionRefillRequest,
  PrescriptionRefillRequestSource,
  PrescriptionRefillRequestStatusView,
} from "../../domain/prescription-refills";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import {
  PrescriptionRefillRepository,
  type RefillRequestProvenance,
} from "../repositories/prescription-refill-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { clinicalService, type ClinicalExecutionContext } from "./clinical-service";

type Dependencies = {
  refillRequests: typeof PrescriptionRefillRepository;
  transactions: typeof PrescriptionTransactionRepository;
  orders: typeof OrderRepository;
  audit: typeof AuditRepository;
};

const defaultDependencies: Dependencies = {
  refillRequests: PrescriptionRefillRepository,
  transactions: PrescriptionTransactionRepository,
  orders: OrderRepository,
  audit: AuditRepository,
};

function actorProvenance(actor: ProviderContext, context: ClinicalExecutionContext): RefillRequestProvenance {
  return {
    actorId: actor.userId,
    actorName: providerLabel(actor),
    sourceType: context.source,
    sourceSystem: "ehr-local",
    sourceRef: context.requestId,
  };
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}

function safeText(value: string | undefined, maxLength: number): string | undefined {
  if (!value?.trim()) return undefined;
  return sanitizePrescriptionTransactionErrorMessage(value.trim()).slice(0, maxLength);
}

function priorIntent(order: OrderRecord): MedicationPrescriptionIntent {
  const lifecycle =
    order.status === "transmitted"
      ? "transmitted"
      : order.status === "transmission_failed"
        ? "transmission_failed"
        : order.status === "authorized"
          ? "authorized"
          : "staged";
  return prescriptionIntentFromOrderInput({
    patientId: order.patientId,
    name: order.name,
    details: order.details,
    source: "api",
    lifecycle,
    preserveStoredIntent: true,
  });
}

function renewalDetails(
  request: PrescriptionRefillRequest,
  order: OrderRecord,
): Record<string, unknown> {
  const intent = priorIntent(order);
  return {
    medication: intent.medicationName,
    medicationName: intent.medicationName,
    genericName: intent.genericName,
    strength: intent.strength,
    dose: intent.dose,
    form: intent.form,
    route: intent.route,
    frequency: intent.frequency,
    dispenseQuantity: intent.quantity,
    daysSupply: intent.daysSupply,
    refills: intent.refills,
    substitutionAllowed: intent.substitutionAllowed,
    sig: intent.sig,
    associatedMedicationRecordId: intent.associatedMedicationRecordId,
    relationship: "continue",
    indication: intent.indication,
    pharmacy: intent.pharmacy,
    deaSchedule: intent.deaSchedule,
    requiresEpcs: order.details?.requiresEpcs === true ? true : undefined,
    sourceReference: `prescription-refill-request/${request.id}`,
    renewalReviewRequired: true,
    renewalSource: {
      refillRequestId: request.id,
      priorOrderId: request.priorOrderId,
      priorTransactionId: request.priorTransactionId,
    },
  };
}

function statusView(request: PrescriptionRefillRequest): PrescriptionRefillRequestStatusView {
  return {
    refillRequestId: request.id,
    patientId: request.patientId,
    priorOrderId: request.priorOrderId,
    priorTransactionId: request.priorTransactionId,
    status: request.status,
    requestSource: request.requestSource,
    sourceSystem: request.sourceSystem,
    sourceReference: request.sourceReference,
    renewalOrderId: request.renewalOrderId,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    source: {
      refillRequestRef: `prescription-refill-request/${request.id}`,
      priorOrderRef: `orders/${request.priorOrderId}`,
      priorTransactionRef: `prescription-transaction/${request.priorTransactionId}`,
      renewalOrderRef: request.renewalOrderId ? `orders/${request.renewalOrderId}` : undefined,
    },
    medicationTruthChanged: false,
  };
}

export class PrescriptionRefillService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  status(requestId: string, patientId: string, actor: ProviderContext): PrescriptionRefillRequestStatusView {
    assertPermission(actor, "read_clinical");
    const request = this.deps.refillRequests.getById(requestId);
    if (!request) throw new Error(`Prescription refill request not found: ${requestId}`);
    if (request.patientId !== patientId) {
      throw new Error(`Patient binding mismatch: refill request ${requestId} belongs to ${request.patientId}, not ${patientId}.`);
    }
    return statusView(request);
  }

  listStatus(patientId: string, actor: ProviderContext): PrescriptionRefillRequestStatusView[] {
    assertPermission(actor, "read_clinical");
    return this.deps.refillRequests.listByPatient(patientId).map(statusView);
  }

  requestRefill(
    targetTransactionId: string,
    input: {
      requestSource: PrescriptionRefillRequestSource;
      sourceReference?: string;
      note?: string;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { request: PrescriptionRefillRequest; idempotent: boolean; medicationTruthChanged: false } {
    if (context.source === "ai") {
      throw new Error("AI may summarize or propose refill workflows but cannot create refill requests or approve renewals.");
    }
    assertPermission(actor, "stage_order");

    const target = this.deps.transactions.getById(targetTransactionId);
    if (!target) throw new Error(`Prescription transaction not found: ${targetTransactionId}`);
    if (target.transactionType !== "new_rx") {
      throw new Error(`Refill/renewal requests must reference a prior new_rx transaction, not ${target.transactionType}.`);
    }
    if (!["submitted", "acknowledged", "accepted"].includes(target.state)) {
      throw new Error(`Prescription transaction ${target.id} cannot seed a refill request from transport state ${target.state}.`);
    }

    const order = this.deps.orders.getById(target.orderId);
    if (!order || order.patientId !== target.patientId || order.type !== "medication") {
      throw new Error(`Prior prescription order is unavailable or inconsistent for transaction ${target.id}.`);
    }
    if (order.status !== "transmitted") {
      throw new Error(`Prior prescription order ${order.id} must be transmitted before it can seed a refill request.`);
    }

    const sourceReference = safeText(input.sourceReference, 200);
    const note = safeText(input.note, 500);
    const stableSourceIdentity = input.sourceReference?.trim() || "active-request";
    const idempotencyKey = `prescription-refill:${target.id}:${input.requestSource}:${fingerprint(stableSourceIdentity)}`;
    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.deps.refillRequests.getOrCreate({
        patientId: target.patientId,
        priorOrderId: target.orderId,
        priorTransactionId: target.id,
        requestSource: input.requestSource,
        sourceSystem: "ehr-local",
        sourceReference,
        note,
        idempotencyKey,
        createdBy: providerLabel(actor),
      }, provenance);

      if (result.created) {
        this.deps.audit.log({
          ...auditActor(actor),
          eventType: "prescription_refill_requested",
          patientId: target.patientId,
          description: `Recorded ${input.requestSource} refill/renewal request for prescription ${target.id}.`,
          metadata: {
            refillRequestId: result.request.id,
            priorOrderId: target.orderId,
            priorTransactionId: target.id,
            requestSource: input.requestSource,
            sourceReference: result.request.sourceReference,
            source: context.source,
            requestId: context.requestId,
            medicationTruthChanged: false,
          },
        });
      }
      db.exec("COMMIT");
      return { request: result.request, idempotent: !result.created, medicationTruthChanged: false };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  renewPrescription(
    refillRequestId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { request: PrescriptionRefillRequest; order: OrderRecord; idempotent: boolean; medicationTruthChanged: false } {
    if (context.source === "ai") {
      throw new Error("AI may draft a proposed renewal but cannot execute refill approval or create the clinician-staged renewal intent.");
    }
    assertPermission(actor, "stage_order");

    const current = this.deps.refillRequests.getById(refillRequestId);
    if (!current) throw new Error(`Prescription refill request not found: ${refillRequestId}`);
    if (current.renewalOrderId) {
      const existingOrder = this.deps.orders.getById(current.renewalOrderId);
      if (!existingOrder) throw new Error(`Linked renewal order not found: ${current.renewalOrderId}`);
      return { request: current, order: existingOrder, idempotent: true, medicationTruthChanged: false };
    }

    const priorTransaction = this.deps.transactions.getById(current.priorTransactionId);
    if (!priorTransaction) throw new Error(`Prior prescription transaction not found: ${current.priorTransactionId}`);
    if (
      priorTransaction.patientId !== current.patientId ||
      priorTransaction.orderId !== current.priorOrderId ||
      priorTransaction.transactionType !== "new_rx"
    ) {
      throw new Error(`Prescription refill request ${current.id} has inconsistent prior-prescription identity.`);
    }

    const priorOrder = this.deps.orders.getById(current.priorOrderId);
    if (!priorOrder || priorOrder.patientId !== current.patientId || priorOrder.type !== "medication") {
      throw new Error(`Prior prescription order is unavailable or inconsistent for refill request ${current.id}.`);
    }

    const renewalOrderId = `ord-rx-renewal-${current.id}`;
    const provenance = actorProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const order = clinicalService.stageOrder({
        id: renewalOrderId,
        patientId: current.patientId,
        type: "medication",
        name: priorIntent(priorOrder).medicationName,
        details: renewalDetails(current, priorOrder),
      }, actor, context);

      const request = this.deps.refillRequests.markRenewalStaged(current.id, order.id, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_renewal_staged",
        patientId: current.patientId,
        description: `Staged a new prescription intent from refill request ${current.id}.`,
        metadata: {
          refillRequestId: current.id,
          priorOrderId: current.priorOrderId,
          priorTransactionId: current.priorTransactionId,
          renewalOrderId: order.id,
          copiedForReview: true,
          automaticallyAuthorized: false,
          automaticallyTransmitted: false,
          medicationTruthChanged: false,
          source: context.source,
          requestId: context.requestId,
        },
      });
      db.exec("COMMIT");
      return { request, order, idempotent: false, medicationTruthChanged: false };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

export const prescriptionRefillService = new PrescriptionRefillService();
