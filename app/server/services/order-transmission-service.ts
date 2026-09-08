import type { LabOrder, MedicationOrder, ProviderAuth } from "../../domain/orders";
import {
  defaultLabAdapter,
  defaultPrescribingAdapter,
  type EPrescribingAdapter,
  type LabRequisitionAdapter,
  type LabTransmissionResult,
  type PrescriptionTransmissionResult,
} from "../../adapters";
import {
  assertPermission,
  providerLabel,
  type ProviderContext,
} from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { PatientRepository } from "../repositories/patient-repository";
import type { ClinicalExecutionContext } from "./clinical-service";

export type OrderTransmissionReceipt = PrescriptionTransmissionResult | LabTransmissionResult;

export type OrderTransmissionOutcome = {
  order: OrderRecord;
  receipt?: OrderTransmissionReceipt;
  idempotent: boolean;
};

type OrderTransmissionDependencies = {
  orders: typeof OrderRepository;
  patients: typeof PatientRepository;
  audit: typeof AuditRepository;
  prescribingAdapter: EPrescribingAdapter;
  labAdapter: LabRequisitionAdapter;
};

const defaultDependencies: OrderTransmissionDependencies = {
  orders: OrderRepository,
  patients: PatientRepository,
  audit: AuditRepository,
  prescribingAdapter: defaultPrescribingAdapter,
  labAdapter: defaultLabAdapter,
};

function auditActor(actor: ProviderContext) {
  return {
    userId: actor.userId,
    userName: providerLabel(actor),
    userRole: actor.role,
  };
}

function providerAuth(actor: ProviderContext, metadata: Record<string, any>): ProviderAuth {
  return {
    providerName: providerLabel(actor),
    npi: typeof metadata.npi === "string" && metadata.npi ? metadata.npi : "0000000000",
    deaNumber:
      typeof metadata.deaNumber === "string" && metadata.deaNumber
        ? metadata.deaNumber
        : "TEST000000",
    stateLicense:
      typeof metadata.stateLicense === "string" && metadata.stateLicense
        ? metadata.stateLicense
        : "TEST-LICENSE",
    epcsPin: typeof metadata.epcsPin === "string" ? metadata.epcsPin : undefined,
    otpToken: typeof metadata.otpToken === "string" ? metadata.otpToken : undefined,
  };
}

function asMedicationOrder(order: OrderRecord): MedicationOrder {
  return {
    ...(order.details as MedicationOrder),
    id: order.id,
    patientId: order.patientId,
    type: "medication",
    medication:
      typeof order.details?.medication === "string" && order.details.medication
        ? order.details.medication
        : order.name,
    status: "authorized",
  };
}

function asLabOrder(order: OrderRecord): LabOrder {
  return {
    ...(order.details as LabOrder),
    id: order.id,
    patientId: order.patientId,
    type: "lab",
    testName:
      typeof order.details?.testName === "string" && order.details.testName
        ? order.details.testName
        : order.name,
    status: "authorized",
  };
}

function receiptSucceeded(receipt: OrderTransmissionReceipt): boolean {
  return receipt.success !== false;
}

export class OrderTransmissionService {
  constructor(private readonly deps: OrderTransmissionDependencies = defaultDependencies) {}

  async transmit(
    orderId: string,
    transmissionMetadata: Record<string, any>,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): Promise<OrderTransmissionOutcome> {
    if (context.source === "ai") {
      throw new Error("AI may draft order intent but cannot transmit clinical orders.");
    }
    assertPermission(actor, "transmit_order");

    const existing = this.deps.orders.getById(orderId);
    if (!existing) throw new Error(`Order not found: ${orderId}`);

    if (existing.status === "transmitted") {
      return {
        order: existing,
        receipt: existing.details?.transmissionReceipt as OrderTransmissionReceipt | undefined,
        idempotent: true,
      };
    }

    if (existing.status !== "authorized" && existing.status !== "transmission_failed") {
      throw new Error(`Order ${orderId} must be authorized before transmission.`);
    }

    const patient = this.deps.patients.getById(existing.patientId);
    if (!patient) throw new Error(`Patient not found: ${existing.patientId}`);

    const auth = providerAuth(actor, transmissionMetadata);

    try {
      let receipt: OrderTransmissionReceipt;
      if (existing.type === "medication") {
        receipt = await this.deps.prescribingAdapter.transmitPrescriptions(
          [asMedicationOrder(existing)],
          auth,
        );
      } else {
        receipt = await this.deps.labAdapter.transmitLabOrders(
          [asLabOrder(existing)],
          patient,
          auth,
        );
      }

      if (!receiptSucceeded(receipt)) {
        throw new Error(receipt.error || `${receipt.vendor} rejected order transmission.`);
      }

      const transmitted = this.deps.orders.markTransmitted(
        existing.id,
        receipt as unknown as Record<string, any>,
      );
      if (!transmitted) throw new Error(`Order not found: ${existing.id}`);

      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "order_transmitted",
        patientId: transmitted.patientId,
        description: `Transmitted ${transmitted.type} order for ${transmitted.name}.`,
        metadata: {
          orderId: transmitted.id,
          type: transmitted.type,
          vendor: receipt.vendor,
          transmissionId: receipt.transmissionId,
          source: context.source,
          requestId: context.requestId,
        },
      });

      return { order: transmitted, receipt, idempotent: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = this.deps.orders.markTransmissionFailed(existing.id, message);

      this.deps.audit.log({
        ...auditActor(actor),
        eventType: "order_transmission_failed",
        patientId: existing.patientId,
        description: `Transmission failed for ${existing.type} order ${existing.name}.`,
        metadata: {
          orderId: existing.id,
          type: existing.type,
          error: message,
          attempts: failed?.details?.transmissionAttempts,
          source: context.source,
          requestId: context.requestId,
        },
      });

      throw new Error(`Order transmission failed: ${message}`);
    }
  }
}

export const orderTransmissionService = new OrderTransmissionService();
