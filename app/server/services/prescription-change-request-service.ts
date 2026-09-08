import {
  PRESCRIPTION_CHANGE_REQUEST_CATEGORIES,
  type PrescriptionChangeRequest,
  type PrescriptionChangeRequestCategory,
  type PrescriptionChangeRequestStatusView,
  type PrescriptionRequestedChanges,
} from "../../domain/prescription-changes";
import {
  prescriptionIntentFromOrderInput,
  type MedicationPrescriptionIntent,
} from "../../domain/medication-prescription-intent";
import { sanitizePrescriptionTransactionErrorMessage } from "../../domain/prescription-transactions";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { getDatabase } from "../db/connection";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import {
  PrescriptionChangeRequestRepository,
  type ChangeRequestProvenance,
} from "../repositories/prescription-change-request-repository";
import { PrescriptionTransactionRepository } from "../repositories/prescription-transaction-repository";
import { clinicalService, type ClinicalExecutionContext } from "./clinical-service";

type Dependencies = {
  changeRequests: typeof PrescriptionChangeRequestRepository;
  transactions: typeof PrescriptionTransactionRepository;
  orders: typeof OrderRepository;
  audit: typeof AuditRepository;
};

const defaultDependencies: Dependencies = {
  changeRequests: PrescriptionChangeRequestRepository,
  transactions: PrescriptionTransactionRepository,
  orders: OrderRepository,
  audit: AuditRepository,
};

const CATEGORY_SET = new Set<string>(PRESCRIPTION_CHANGE_REQUEST_CATEGORIES);

function clinicianProvenance(actor: ProviderContext, context: ClinicalExecutionContext): ChangeRequestProvenance {
  return {
    actorId: actor.userId,
    actorName: providerLabel(actor),
    sourceType: context.source,
    sourceSystem: "ehr-local",
    sourceRef: context.requestId,
  };
}

function integrationProvenance(adapterId: string, externalRequestId: string, sourceReference?: string): ChangeRequestProvenance {
  return {
    actorId: `integration:${adapterId}`,
    actorName: `External prescribing adapter (${adapterId})`,
    sourceType: "external-vendor",
    sourceSystem: adapterId,
    sourceRef: sourceReference || externalRequestId,
  };
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

function safeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return sanitizePrescriptionTransactionErrorMessage(value.trim()).slice(0, maxLength);
}

function safeRequiredText(value: unknown, field: string, maxLength: number): string {
  const safe = safeText(value, maxLength);
  if (!safe) throw new Error(`${field} is required.`);
  return safe;
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRequestedChanges(input: PrescriptionRequestedChanges): PrescriptionRequestedChanges {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const changes: PrescriptionRequestedChanges = {};
  const medicationName = safeText(raw.medicationName, 240);
  const genericName = safeText(raw.genericName, 240);
  const strength = safeText(raw.strength, 120);
  const dose = safeText(raw.dose, 120);
  const form = safeText(raw.form, 120);
  const route = safeText(raw.route, 120);
  const frequency = safeText(raw.frequency, 160);
  const sig = safeText(raw.sig, 500);
  const indication = safeText(raw.indication, 240);
  const quantity = safeNumber(raw.quantity);
  const daysSupply = safeNumber(raw.daysSupply);
  const refills = safeNumber(raw.refills);

  if (medicationName !== undefined) changes.medicationName = medicationName;
  if (genericName !== undefined) changes.genericName = genericName;
  if (strength !== undefined) changes.strength = strength;
  if (dose !== undefined) changes.dose = dose;
  if (form !== undefined) changes.form = form;
  if (route !== undefined) changes.route = route;
  if (frequency !== undefined) changes.frequency = frequency;
  if (quantity !== undefined) changes.quantity = quantity;
  if (daysSupply !== undefined) changes.daysSupply = daysSupply;
  if (refills !== undefined) changes.refills = refills;
  if (typeof raw.substitutionAllowed === "boolean") changes.substitutionAllowed = raw.substitutionAllowed;
  if (sig !== undefined) changes.sig = sig;
  if (indication !== undefined) changes.indication = indication;
  return changes;
}

function normalizeCategory(value: PrescriptionChangeRequestCategory): PrescriptionChangeRequestCategory {
  if (!CATEGORY_SET.has(value)) {
    throw new Error(`Unsupported prescription change request category: ${String(value)}.`);
  }
  return value;
}

function normalizedTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("receivedAt must be a valid timestamp when provided.");
  return new Date(timestamp).toISOString();
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

function normalizedMedicationName(value: string | undefined): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function replacementDetails(
  request: PrescriptionChangeRequest,
  order: OrderRecord,
): Record<string, unknown> {
  const intent = priorIntent(order);
  const changes = request.requestedChanges;
  const medicationName = changes.medicationName ?? intent.medicationName;
  const genericName = changes.genericName ?? intent.genericName;
  const medicationIdentityChanged =
    (changes.medicationName !== undefined && normalizedMedicationName(changes.medicationName) !== normalizedMedicationName(intent.medicationName)) ||
    (changes.genericName !== undefined && normalizedMedicationName(changes.genericName) !== normalizedMedicationName(intent.genericName));

  return {
    medication: medicationName,
    medicationName,
    genericName,
    strength: changes.strength ?? intent.strength,
    dose: changes.dose ?? intent.dose,
    form: changes.form ?? intent.form,
    route: changes.route ?? intent.route,
    frequency: changes.frequency ?? intent.frequency,
    dispenseQuantity: changes.quantity ?? intent.quantity,
    daysSupply: changes.daysSupply ?? intent.daysSupply,
    refills: changes.refills ?? intent.refills,
    substitutionAllowed: changes.substitutionAllowed ?? intent.substitutionAllowed,
    sig: changes.sig ?? intent.sig,
    associatedMedicationRecordId: medicationIdentityChanged ? undefined : intent.associatedMedicationRecordId,
    relationship: medicationIdentityChanged ? "replace" : "change",
    indication: changes.indication ?? intent.indication,
    pharmacy: intent.pharmacy,
    deaSchedule: medicationIdentityChanged ? undefined : intent.deaSchedule,
    requiresEpcs: order.details?.requiresEpcs === true ? true : undefined,
    sourceReference: `prescription-change-request/${request.id}`,
    prescriptionChangeReviewRequired: true,
    changeRequestSource: {
      changeRequestId: request.id,
      sourceOrderId: request.sourceOrderId,
      sourceTransactionId: request.sourceTransactionId,
      adapterId: request.adapterId,
      vendorName: request.vendorName,
      externalRequestId: request.externalRequestId,
      category: request.category,
    },
  };
}

function statusView(request: PrescriptionChangeRequest): PrescriptionChangeRequestStatusView {
  return {
    changeRequestId: request.id,
    patientId: request.patientId,
    sourceOrderId: request.sourceOrderId,
    sourceTransactionId: request.sourceTransactionId,
    adapterId: request.adapterId,
    vendorName: request.vendorName,
    externalRequestId: request.externalRequestId,
    category: request.category,
    requestedChanges: request.requestedChanges,
    summary: request.summary,
    sourceReference: request.sourceReference,
    status: request.status,
    resultingOrderId: request.resultingOrderId,
    resolutionDecision: request.resolutionDecision,
    resolvedById: request.resolvedById,
    resolvedByName: request.resolvedByName,
    resolvedAt: request.resolvedAt,
    receivedAt: request.receivedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    source: {
      changeRequestRef: `prescription-change-request/${request.id}`,
      sourceOrderRef: `orders/${request.sourceOrderId}`,
      sourceTransactionRef: `prescription-transaction/${request.sourceTransactionId}`,
      resultingOrderRef: request.resultingOrderId ? `orders/${request.resultingOrderId}` : undefined,
    },
    medicationTruthChanged: false,
  };
}

export class PrescriptionChangeRequestService {
  constructor(private readonly deps: Dependencies = defaultDependencies) {}

  status(requestId: string, patientId: string, actor: ProviderContext): PrescriptionChangeRequestStatusView {
    assertPermission(actor, "read_clinical");
    const request = this.deps.changeRequests.getById(requestId);
    if (!request) throw new Error(`Prescription change request not found: ${requestId}`);
    if (request.patientId !== patientId) {
      throw new Error(`Patient binding mismatch: prescription change request ${requestId} belongs to ${request.patientId}, not ${patientId}.`);
    }
    return statusView(request);
  }

  listStatus(patientId: string, actor: ProviderContext): PrescriptionChangeRequestStatusView[] {
    assertPermission(actor, "read_clinical");
    return this.deps.changeRequests.listByPatient(patientId).map(statusView);
  }

  /**
   * Trusted internal adapter-normalization boundary. A future public callback must be
   * authenticated/verified and replay-protected before it may call this method.
   */
  recordChangeRequest(input: {
    sourceTransactionId: string;
    adapterId: string;
    externalRequestId: string;
    category: PrescriptionChangeRequestCategory;
    requestedChanges: PrescriptionRequestedChanges;
    summary?: string;
    sourceReference?: string;
    receivedAt?: string;
  }): { request: PrescriptionChangeRequest; idempotent: boolean; medicationTruthChanged: false } {
    const target = this.deps.transactions.getById(input.sourceTransactionId);
    if (!target) throw new Error(`Prescription transaction not found: ${input.sourceTransactionId}`);
    if (target.transactionType !== "new_rx") {
      throw new Error(`Prescription change requests must reference a prior new_rx transaction, not ${target.transactionType}.`);
    }
    if (!["submitted", "acknowledged", "accepted", "change_requested"].includes(target.state)) {
      throw new Error(`Prescription transaction ${target.id} cannot seed a change request from transport state ${target.state}.`);
    }

    const adapterId = safeRequiredText(input.adapterId, "adapterId", 120);
    if (adapterId !== target.adapterId) {
      throw new Error(`Prescription change request adapter ${adapterId} does not match source transaction adapter ${target.adapterId}.`);
    }
    const externalRequestId = safeRequiredText(input.externalRequestId, "externalRequestId", 200);
    const category = normalizeCategory(input.category);
    const requestedChanges = normalizeRequestedChanges(input.requestedChanges);
    const summary = safeText(input.summary, 800);
    const sourceReference = safeText(input.sourceReference, 240);
    const receivedAt = normalizedTimestamp(input.receivedAt);

    const order = this.deps.orders.getById(target.orderId);
    if (!order || order.patientId !== target.patientId || order.type !== "medication") {
      throw new Error(`Source prescription order is unavailable or inconsistent for transaction ${target.id}.`);
    }
    if (order.status !== "transmitted") {
      throw new Error(`Source prescription order ${order.id} must be transmitted before it can seed a pharmacy change request.`);
    }

    const provenance = integrationProvenance(adapterId, externalRequestId, sourceReference);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = this.deps.changeRequests.getOrCreate({
        patientId: target.patientId,
        sourceOrderId: target.orderId,
        sourceTransactionId: target.id,
        adapterId,
        vendorName: safeRequiredText(target.vendorName, "vendorName", 200),
        externalRequestId,
        category,
        requestedChanges,
        summary,
        sourceReference,
        receivedAt,
      }, provenance);

      if (result.created) {
        this.deps.audit.log({
          userId: provenance.actorId,
          userName: provenance.actorName,
          userRole: "external-system",
          eventType: "prescription_change_request_recorded",
          patientId: target.patientId,
          description: `Recorded a pharmacy/vendor prescription change request for transaction ${target.id}.`,
          metadata: {
            changeRequestId: result.request.id,
            sourceOrderId: target.orderId,
            sourceTransactionId: target.id,
            adapterId,
            externalRequestId,
            category,
            sourceReference: result.request.sourceReference,
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

  respond(
    changeRequestId: string,
    decision: "accept" | "decline",
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): { request: PrescriptionChangeRequest; order?: OrderRecord; idempotent: boolean; medicationTruthChanged: false } {
    if (context.source === "ai") {
      throw new Error("AI may summarize or draft a response to a prescription change request but cannot accept or decline it.");
    }
    assertPermission(actor, "stage_order");

    const initial = this.deps.changeRequests.getById(changeRequestId);
    if (!initial) throw new Error(`Prescription change request not found: ${changeRequestId}`);

    if (decision === "accept" && initial.status === "accepted") {
      if (!initial.resultingOrderId) throw new Error(`Accepted prescription change request ${initial.id} is missing its resulting order.`);
      const existingOrder = this.deps.orders.getById(initial.resultingOrderId);
      if (!existingOrder) throw new Error(`Linked replacement order not found: ${initial.resultingOrderId}`);
      return { request: initial, order: existingOrder, idempotent: true, medicationTruthChanged: false };
    }
    if (decision === "decline" && initial.status === "declined") {
      return { request: initial, idempotent: true, medicationTruthChanged: false };
    }
    if (decision === "accept" && initial.status === "declined") {
      throw new Error(`Prescription change request ${initial.id} was already declined and cannot be accepted.`);
    }
    if (decision === "decline" && initial.status === "accepted") {
      throw new Error(`Prescription change request ${initial.id} was already accepted and cannot be declined.`);
    }

    const sourceTransaction = this.deps.transactions.getById(initial.sourceTransactionId);
    if (
      !sourceTransaction ||
      sourceTransaction.patientId !== initial.patientId ||
      sourceTransaction.orderId !== initial.sourceOrderId ||
      sourceTransaction.transactionType !== "new_rx"
    ) {
      throw new Error(`Prescription change request ${initial.id} has inconsistent source-prescription identity.`);
    }
    const sourceOrder = this.deps.orders.getById(initial.sourceOrderId);
    if (!sourceOrder || sourceOrder.patientId !== initial.patientId || sourceOrder.type !== "medication") {
      throw new Error(`Source prescription order is unavailable or inconsistent for change request ${initial.id}.`);
    }

    const provenance = clinicianProvenance(actor, context);
    const db = getDatabase();
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.deps.changeRequests.getById(changeRequestId);
      if (!current) throw new Error(`Prescription change request not found: ${changeRequestId}`);

      if (decision === "decline") {
        const request = this.deps.changeRequests.markDeclined(current.id, provenance);
        this.deps.audit.log({
          ...auditActor(actor),
          eventType: "prescription_change_request_declined",
          patientId: current.patientId,
          description: `Declined prescription change request ${current.id}.`,
          metadata: {
            changeRequestId: current.id,
            sourceOrderId: current.sourceOrderId,
            sourceTransactionId: current.sourceTransactionId,
            decision: "declined",
            automaticallyTransmitted: false,
            medicationTruthChanged: false,
            source: context.source,
            requestId: context.requestId,
          },
        });
        db.exec("COMMIT");
        return { request, idempotent: false, medicationTruthChanged: false };
      }

      const replacementOrderId = `ord-rx-change-${current.id}`;
      const order = clinicalService.stageOrder({
        id: replacementOrderId,
        patientId: current.patientId,
        type: "medication",
        name: current.requestedChanges.medicationName || priorIntent(sourceOrder).medicationName,
        details: replacementDetails(current, sourceOrder),
      }, actor, context);
      const request = this.deps.changeRequests.markAccepted(current.id, order.id, provenance);
      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "prescription_change_request_accepted",
        patientId: current.patientId,
        description: `Accepted prescription change request ${current.id} and staged a new replacement prescription intent.`,
        metadata: {
          changeRequestId: current.id,
          sourceOrderId: current.sourceOrderId,
          sourceTransactionId: current.sourceTransactionId,
          resultingOrderId: order.id,
          decision: "accepted",
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

export const prescriptionChangeRequestService = new PrescriptionChangeRequestService();
