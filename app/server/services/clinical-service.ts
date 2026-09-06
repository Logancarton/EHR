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

function medicationDisplayText(order: OrderRecord): string {
  const displayText = order.details?.displayText;
  return typeof displayText === "string" && displayText.trim()
    ? displayText.trim()
    : order.name;
}

function medicationDetail(order: OrderRecord, key: string): string | undefined {
  const value = order.details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

    const patient = this.deps.patients.getById(input.patientId);
    if (!patient) throw new Error(`Patient not found: ${input.patientId}`);

    const staged = this.deps.orders.stageOrder({
      id: input.id,
      patientId: input.patientId,
      type: input.type,
      name: input.name,
      details: input.details || {},
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
    assertPermission(actor, "authorize_order");

    const existing = this.deps.orders.getById(orderId);
    if (!existing) throw new Error(`Order not found: ${orderId}`);

    const requiresEpcs = Boolean(
      existing.details?.requiresEpcs ||
        (existing.details?.deaSchedule && existing.details.deaSchedule !== "None"),
    );

    if (requiresEpcs && !authMetadata.epcsAttested) {
      throw new Error("EPCS attestation is required before authorizing this order.");
    }

    const authorized = this.deps.orders.authorize(
      orderId,
      providerLabel(actor),
      authMetadata,
    );
    if (!authorized) throw new Error(`Order not found: ${orderId}`);

    let medicationRecordId: string | undefined;
    if (authorized.type === "medication") {
      const orderRef = `orders/${authorized.id}`;
      const existingMedication = ClinicalRecordRepository
        .medications(authorized.patientId)
        .find((row) => row.source_ref === orderRef && row.status !== "entered-in-error");

      if (existingMedication) {
        medicationRecordId = existingMedication.id;
      } else {
        const medicationName =
          medicationDetail(authorized, "medicationName") ||
          medicationDetail(authorized, "medication") ||
          authorized.name;

        const medication = ClinicalRecordRepository.addMedication(
          {
            patientId: authorized.patientId,
            displayText: medicationDisplayText(authorized),
            medicationName,
            genericName: medicationDetail(authorized, "genericName"),
            strength: medicationDetail(authorized, "strength"),
            dose: medicationDetail(authorized, "dose"),
            route: medicationDetail(authorized, "route"),
            frequency: medicationDetail(authorized, "frequency"),
            startDate: medicationDetail(authorized, "startDate"),
            prescriber: providerLabel(actor),
          },
          { userId: actor.userId, displayName: providerLabel(actor) },
          {
            type: "prescription-order",
            system: "ehr-local",
            ref: orderRef,
          },
        );
        medicationRecordId = medication.id;
      }
    }

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
        medicationRecordId,
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
