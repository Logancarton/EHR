import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import {
  EncounterRepository,
  type EncounterRecord,
} from "../repositories/encounter-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { PatientRepository } from "../repositories/patient-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import type {
  AuditRepositoryPort,
  EncounterRepositoryPort,
  OrderRepositoryPort,
  PatientRepositoryPort,
} from "../repositories/ports";
import {
  prescriptionIntentFromOrderInput,
  reviewMedicationPrescriptionIntent,
} from "../../domain/medication-prescription-intent";

export type ClinicalExecutionContext = {
  source: "ui" | "ai" | "api";
  requestId?: string;
};

export type ClinicalServiceDependencies = {
  patients: PatientRepositoryPort;
  encounters: EncounterRepositoryPort;
  orders: OrderRepositoryPort;
  audit: AuditRepositoryPort;
};

const defaultDependencies: ClinicalServiceDependencies = {
  patients: PatientRepository,
  encounters: EncounterRepository,
  orders: OrderRepository,
  audit: AuditRepository,
};

function auditActor(actor: ProviderContext) {
  return {
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
  };
}

function executionMetadata(context: ClinicalExecutionContext) {
  return {
    source: context.source,
    requestId: context.requestId,
  };
}

function prescriptionSource(context: ClinicalExecutionContext): "clinician" | "ai" | "api" {
  if (context.source === "ai") return "ai";
  if (context.source === "ui") return "clinician";
  return "api";
}

const PROTECTED_AUTHORIZATION_METADATA_KEYS = new Set([
  "prescriptionIntent",
  "prescriptionReview",
  "medicationTruthConfirmation",
]);
const SECRET_AUTHORIZATION_METADATA_KEY = /password|passcode|pin|otp|token|secret|credential|api[_-]?key/i;

function sanitizeAuthorizationMetadataValue(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeAuthorizationMetadataValue);
  if (!value || typeof value !== "object") return value;

  const safe: Record<string, any> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (SECRET_AUTHORIZATION_METADATA_KEY.test(key)) continue;
    safe[key] = sanitizeAuthorizationMetadataValue(nestedValue);
  }
  return safe;
}

function safeAuthorizationMetadata(metadata: Record<string, any>): Record<string, any> {
  const safe: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PROTECTED_AUTHORIZATION_METADATA_KEYS.has(key)) continue;
    if (SECRET_AUTHORIZATION_METADATA_KEY.test(key)) continue;
    safe[key] = sanitizeAuthorizationMetadataValue(value);
  }
  return safe;
}

export class ClinicalService {
  constructor(private readonly deps: ClinicalServiceDependencies = defaultDependencies) {}

  stageOrder(
    input: {
      id?: string;
      patientId: string;
      type: "medication" | "lab";
      name: string;
      details?: Record<string, any>;
    },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): OrderRecord {
    assertPermission(actor, "stage_order");

    if (input.id) {
      const existing = this.deps.orders.getById(input.id);
      if (existing && existing.status !== "staged") {
        if (existing.patientId !== input.patientId || existing.type !== input.type) {
          throw new Error(
            `Order ${input.id} cannot be reassigned to another patient or order type.`,
          );
        }
        return existing;
      }
    }

    const patient = this.deps.patients.getById(input.patientId);
    if (!patient) throw new Error(`Patient not found: ${input.patientId}`);

    let details = input.details || {};
    let prescriptionReview: ReturnType<typeof reviewMedicationPrescriptionIntent> | undefined;
    if (input.type === "medication") {
      const intent = prescriptionIntentFromOrderInput({
        patientId: input.patientId,
        name: input.name,
        details,
        source: prescriptionSource(context),
        lifecycle: "staged",
      });
      prescriptionReview = reviewMedicationPrescriptionIntent({
        intent,
        medications: ClinicalRecordRepository.medications(input.patientId),
        stagedOrders: this.deps.orders.getByPatient(input.patientId).map((order) => ({
          id: order.id,
          patientId: order.patientId,
          status: order.status,
          details: order.details,
        })),
        currentOrderId: input.id,
      });
      details = {
        ...details,
        prescriptionIntent: intent,
        prescriptionReview,
      };
    }

    const staged = this.deps.orders.stageOrder({
      id: input.id,
      patientId: input.patientId,
      type: input.type,
      name: input.name,
      details,
      orderedBy: providerLabel(actor),
    });

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "order_staged",
      patientId: staged.patientId,
      description: `Staged ${staged.type} order for ${staged.name}.`,
      metadata: {
        orderId: staged.id,
        type: staged.type,
        prescriptionSource: prescriptionReview?.intent.source,
        prescriptionCanAuthorize: prescriptionReview?.canAuthorize,
        medicationTruthImpact: prescriptionReview?.truthImpact.kind,
        medicationTruthChanged: false,
        ...executionMetadata(context),
      },
    });

    return staged;
  }

  authorizeOrder(
    orderId: string,
    authMetadata: Record<string, any>,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): OrderRecord {
    if (context.source === "ai") {
      throw new Error("AI may draft prescription intent but cannot authorize clinical orders.");
    }
    assertPermission(actor, "authorize_order");

    const existing = this.deps.orders.getById(orderId);
    if (!existing) throw new Error(`Order not found: ${orderId}`);

    if (existing.status !== "staged") {
      return existing;
    }

    const requiresEpcs = Boolean(
      existing.details?.requiresEpcs ||
        (existing.details?.deaSchedule && existing.details.deaSchedule !== "None"),
    );

    if (requiresEpcs && !authMetadata.epcsAttested) {
      throw new Error("EPCS attestation is required before authorizing this order.");
    }

    let prescriptionReview: ReturnType<typeof reviewMedicationPrescriptionIntent> | undefined;
    if (existing.type === "medication") {
      const intent = prescriptionIntentFromOrderInput({
        patientId: existing.patientId,
        name: existing.name,
        details: existing.details,
        source: prescriptionSource(context),
        lifecycle: "staged",
        preserveStoredIntent: true,
      });
      prescriptionReview = reviewMedicationPrescriptionIntent({
        intent,
        medications: ClinicalRecordRepository.medications(existing.patientId),
        stagedOrders: this.deps.orders.getByPatient(existing.patientId).map((order) => ({
          id: order.id,
          patientId: order.patientId,
          status: order.status,
          details: order.details,
        })),
        currentOrderId: existing.id,
      });
      if (!prescriptionReview.canAuthorize) {
        const blocking = prescriptionReview.validationIssues
          .filter((issue) => issue.severity === "error")
          .map((issue) => issue.message)
          .join(" ");
        throw new Error(`Prescription intent failed authorization validation: ${blocking}`);
      }
    }

    const authorized = this.deps.orders.authorize(
      orderId,
      providerLabel(actor),
      {
        ...safeAuthorizationMetadata(authMetadata),
        ...(prescriptionReview ? {
          prescriptionIntent: { ...prescriptionReview.intent, lifecycle: "authorized" },
          prescriptionReview: {
            ...prescriptionReview,
            intent: { ...prescriptionReview.intent, lifecycle: "authorized" },
          },
        } : {}),
      },
    );
    if (!authorized) throw new Error(`Order not found: ${orderId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "order_authorized",
      patientId: authorized.patientId,
      description: `Authorized ${authorized.type} order for ${authorized.name}.`,
      metadata: {
        orderId: authorized.id,
        type: authorized.type,
        epcsAttested: Boolean(authMetadata.epcsAttested),
        target: authMetadata.target,
        medicationTruthImpact: prescriptionReview?.truthImpact.kind,
        medicationTruthChanged: false,
        ...executionMetadata(context),
      },
    });

    return authorized;
  }

  saveEncounterDraft(
    input: Partial<EncounterRecord> & { patientId: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): EncounterRecord {
    assertPermission(actor, "edit_draft");

    const patient = this.deps.patients.getById(input.patientId);
    if (!patient) throw new Error(`Patient not found: ${input.patientId}`);

    if (input.id) {
      const existing = this.deps.encounters.getById(input.id);
      if (existing?.status === "signed") {
        throw new Error(
          `Signed encounter ${input.id} is immutable; create an amendment instead of editing the signed record.`,
        );
      }
    }

    const saved = this.deps.encounters.saveDraft(input);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "note_drafted",
      patientId: saved.patientId,
      description: `Saved draft encounter ${saved.id}.`,
      metadata: {
        encounterId: saved.id,
        cptCode: saved.cptCode,
        emLevel: saved.emLevel,
        ...executionMetadata(context),
      },
    });

    return saved;
  }

  signEncounter(
    encounterId: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): EncounterRecord {
    assertPermission(actor, "sign_encounter");

    const existing = this.deps.encounters.getById(encounterId);
    if (!existing) throw new Error(`Encounter not found: ${encounterId}`);
    if (existing.status === "signed") {
      throw new Error(`Encounter is already signed: ${encounterId}`);
    }

    const signed = this.deps.encounters.sign(encounterId, providerLabel(actor));
    if (!signed) throw new Error(`Encounter not found: ${encounterId}`);

    this.deps.audit.log({
      ...auditActor(actor),
      eventType: "note_signed",
      patientId: signed.patientId,
      description: `Signed and locked encounter ${signed.id}.`,
      metadata: {
        encounterId: signed.id,
        cptCode: signed.cptCode,
        emLevel: signed.emLevel,
        immutableSnapshot: true,
        ...executionMetadata(context),
      },
    });

    return signed;
  }
}

export const clinicalService = new ClinicalService();
