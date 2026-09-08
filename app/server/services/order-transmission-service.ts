import {
  sanitizePrescriptionTransactionErrorMessage,
  type PrescriptionTransaction,
} from "../../domain/prescription-transactions";
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
import { isIntegrationOutcomeUncertain } from "../integrations/reliability";
import type { IntegrationPurpose } from "../integrations/types";
import { AuditRepository } from "../repositories/audit-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { PatientRepository } from "../repositories/patient-repository";
import type { ClinicalExecutionContext } from "./clinical-service";
import { integrationConfigurationService } from "./integration-configuration-service";
import { prescriptionRecoveryService } from "./prescription-recovery-service";
import { prescriptionTransportReliabilityService } from "./prescription-transport-reliability-service";
import {
  prescriptionTransactionService,
  type PrescriptionTransactionService,
} from "./prescription-transaction-service";

export type OrderTransmissionReceipt = PrescriptionTransmissionResult | LabTransmissionResult;

export type OrderTransmissionOutcome = {
  order: OrderRecord;
  receipt?: OrderTransmissionReceipt;
  transaction?: PrescriptionTransaction;
  idempotent: boolean;
};

export type PrescriptionCancellationOutcome = {
  transaction: PrescriptionTransaction;
  targetTransactionId: string;
  idempotent: boolean;
  medicationTruthChanged: false;
};

type IntegrationReadinessGate = {
  assertReadyForAdapter(adapterId: string, purpose: IntegrationPurpose): Promise<unknown>;
};

type OrderTransmissionDependencies = {
  orders: typeof OrderRepository;
  patients: typeof PatientRepository;
  audit: typeof AuditRepository;
  prescribingAdapter: EPrescribingAdapter;
  labAdapter: LabRequisitionAdapter;
  prescriptionTransactions: PrescriptionTransactionService;
  integrationReadiness?: IntegrationReadinessGate;
};

const defaultIntegrationReadiness: IntegrationReadinessGate = {
  assertReadyForAdapter(adapterId, purpose) {
    return integrationConfigurationService.assertReadyForAdapter(adapterId, purpose);
  },
};

const defaultDependencies: OrderTransmissionDependencies = {
  orders: OrderRepository,
  patients: PatientRepository,
  audit: AuditRepository,
  prescribingAdapter: defaultPrescribingAdapter,
  labAdapter: defaultLabAdapter,
  prescriptionTransactions: prescriptionTransactionService,
  integrationReadiness: defaultIntegrationReadiness,
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

function persistedPrescriptionReceipt(receipt: PrescriptionTransmissionResult): PrescriptionTransmissionResult {
  return {
    success: receipt.success,
    transmissionId: receipt.transmissionId,
    vendor: receipt.vendor,
    standard: receipt.standard,
    transmittedCount: receipt.transmittedCount,
    pharmacyRouting: receipt.pharmacyRouting,
    timestamp: receipt.timestamp,
    epcsVerified: receipt.epcsVerified,
    warnings: receipt.warnings?.map(sanitizePrescriptionTransactionErrorMessage),
    error: receipt.error ? sanitizePrescriptionTransactionErrorMessage(receipt.error) : undefined,
  };
}

function isAmbiguousAttempt(transaction: PrescriptionTransaction | undefined): transaction is PrescriptionTransaction {
  return Boolean(
    transaction && (
      transaction.state === "outcome_uncertain" ||
      (transaction.state === "prepared" && transaction.attemptCount > 0)
    ),
  );
}

export class OrderTransmissionService {
  private readonly deps: OrderTransmissionDependencies;

  constructor(dependencies: Partial<OrderTransmissionDependencies> = {}) {
    const merged: OrderTransmissionDependencies = { ...defaultDependencies, ...dependencies };
    // Existing tests and explicit dependency injection remain a narrow adapter test seam.
    // Production/default wiring is always gated by durable integration configuration.
    if (dependencies.prescribingAdapter && dependencies.integrationReadiness === undefined) {
      merged.integrationReadiness = undefined;
    }
    this.deps = merged;
  }

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
        transaction:
          existing.type === "medication"
            ? this.deps.prescriptionTransactions.getLatestForOrder(existing.id)
            : undefined,
        idempotent: true,
      };
    }

    let recoveryTransaction: PrescriptionTransaction | undefined;
    if (existing.type === "medication") {
      const latest = this.deps.prescriptionTransactions.getLatestForOrder(existing.id);
      if (isAmbiguousAttempt(latest)) {
        const recovery = prescriptionRecoveryService.inspect(latest.id);
        if (!recovery.retryAllowed) {
          throw new Error(
            `Prescription transaction ${latest.id} has an ambiguous external outcome and cannot be retried until reconciled; current evidence must explicitly unlock retry.`,
          );
        }
        recoveryTransaction = latest;
      }
    }

    if (existing.status === "transmission_uncertain" && !recoveryTransaction) {
      throw new Error(`Order ${orderId} has an uncertain external transmission outcome and cannot be retried until reconciled.`);
    }
    if (!["authorized", "transmission_failed", "transmission_uncertain"].includes(existing.status)) {
      throw new Error(`Order ${orderId} must be authorized before transmission.`);
    }

    const patient = this.deps.patients.getById(existing.patientId);
    if (!patient) throw new Error(`Patient not found: ${existing.patientId}`);

    if (existing.type === "medication") {
      await this.deps.integrationReadiness?.assertReadyForAdapter(this.deps.prescribingAdapter.id, "prescribing");
    }

    const auth = providerAuth(actor, transmissionMetadata);
    let prescriptionTransaction: PrescriptionTransaction | undefined;

    if (existing.type === "medication") {
      prescriptionTransaction = recoveryTransaction
        ? prescriptionRecoveryService.prepareRecoveredAttempt(recoveryTransaction.id, actor, context)
        : this.deps.prescriptionTransactions.prepareOutbound(
            existing,
            { id: this.deps.prescribingAdapter.id, name: this.deps.prescribingAdapter.name },
            actor,
            context,
          );
    }

    let receipt: OrderTransmissionReceipt;
    try {
      if (existing.type === "medication") {
        receipt = await this.deps.prescribingAdapter.transmitPrescriptions(
          [asMedicationOrder(existing)],
          auth,
          prescriptionTransaction
            ? {
                internalTransactionId: prescriptionTransaction.id,
                correlationId: prescriptionTransaction.correlationId,
                idempotencyKey: prescriptionTransaction.idempotencyKey,
                attempt: prescriptionTransaction.attemptCount,
              }
            : undefined,
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
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = sanitizePrescriptionTransactionErrorMessage(rawMessage);
      const outcomeUncertain = isIntegrationOutcomeUncertain(error);

      if (prescriptionTransaction) {
        if (outcomeUncertain) {
          prescriptionTransportReliabilityService.recordOutcomeUncertain(
            prescriptionTransaction.id,
            new Error(message),
            actor,
            context,
          );
        } else {
          this.deps.prescriptionTransactions.recordFailure(
            prescriptionTransaction.id,
            new Error(message),
            actor,
            context,
          );
        }
      }

      const failed = outcomeUncertain
        ? this.deps.orders.markTransmissionUncertain(existing.id, message)
        : this.deps.orders.markTransmissionFailed(existing.id, message);

      this.deps.audit.log({
        ...auditActor(actor),
        eventType: outcomeUncertain ? "order_transmission_uncertain" : "order_transmission_failed",
        patientId: existing.patientId,
        description: outcomeUncertain
          ? `Transmission outcome is uncertain for ${existing.type} order ${existing.name}; retry is blocked pending reconciliation.`
          : `Transmission failed for ${existing.type} order ${existing.name}.`,
        metadata: {
          orderId: existing.id,
          type: existing.type,
          error: message,
          attempts: failed?.details?.transmissionAttempts,
          transactionId: prescriptionTransaction?.id,
          transportState: prescriptionTransaction ? (outcomeUncertain ? "outcome_uncertain" : "failed") : undefined,
          retryBlocked: outcomeUncertain || undefined,
          source: context.source,
          requestId: context.requestId,
        },
      });

      if (outcomeUncertain) {
        throw new Error(`Order transmission outcome is uncertain: ${message}. Reconciliation is required before retry.`);
      }
      throw new Error(`Order transmission failed: ${message}`);
    }

    const durableReceipt = existing.type === "medication"
      ? persistedPrescriptionReceipt(receipt as PrescriptionTransmissionResult)
      : receipt;
    const transmitted = this.deps.orders.markTransmitted(
      existing.id,
      durableReceipt as unknown as Record<string, any>,
    );
    if (!transmitted) throw new Error(`Order not found: ${existing.id}`);

    if (existing.type === "medication" && prescriptionTransaction) {
      prescriptionTransaction = this.deps.prescriptionTransactions.recordSubmitted(
        prescriptionTransaction.id,
        receipt as PrescriptionTransmissionResult,
        actor,
        context,
      );
    }

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
        transactionId: prescriptionTransaction?.id,
        transportState: prescriptionTransaction?.state,
        medicationTruthChanged: false,
        source: context.source,
        requestId: context.requestId,
      },
    });

    return { order: transmitted, receipt, transaction: prescriptionTransaction, idempotent: false };
  }

  async cancelPrescription(
    targetTransactionId: string,
    reason: string,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): Promise<PrescriptionCancellationOutcome> {
    if (context.source === "ai") {
      throw new Error("AI may propose prescription cancellation but cannot execute cancellation.");
    }
    assertPermission(actor, "transmit_order");
    await this.deps.integrationReadiness?.assertReadyForAdapter(this.deps.prescribingAdapter.id, "prescribing");

    const requested = this.deps.prescriptionTransactions.requestCancellation(
      targetTransactionId,
      reason,
      actor,
      context,
    );
    let cancellation = requested.transaction;

    if (["submitted", "cancellation_acknowledged", "canceled"].includes(cancellation.state)) {
      return {
        transaction: cancellation,
        targetTransactionId,
        idempotent: true,
        medicationTruthChanged: false,
      };
    }

    let recoveredCancellation = false;
    if (isAmbiguousAttempt(cancellation)) {
      const recovery = prescriptionRecoveryService.inspect(cancellation.id);
      if (!recovery.retryAllowed) {
        throw new Error(
          `Prescription cancellation ${cancellation.id} has an ambiguous external outcome and cannot be retried until reconciled; current evidence must explicitly unlock retry.`,
        );
      }
      recoveredCancellation = true;
    }

    const targetStatus = this.deps.prescriptionTransactions.status(
      targetTransactionId,
      cancellation.patientId,
      actor,
    );
    const safeReason = sanitizePrescriptionTransactionErrorMessage(reason).trim().slice(0, 500);
    const attempt = recoveredCancellation
      ? prescriptionRecoveryService.prepareRecoveredAttempt(cancellation.id, actor, context)
      : this.deps.prescriptionTransactions.prepareCancellationAttempt(
          cancellation.id,
          actor,
          context,
        );

    try {
      const submittedToAdapter = await this.deps.prescribingAdapter.cancelPrescription(
        attempt.orderId,
        safeReason,
        {
          internalTransactionId: attempt.id,
          correlationId: attempt.correlationId,
          idempotencyKey: attempt.idempotencyKey,
          attempt: attempt.attemptCount,
          relatedTransactionId: targetTransactionId,
          relatedExternalReferenceId: targetStatus.externalReferenceId,
        },
      );
      if (!submittedToAdapter) {
        throw new Error(
          `${this.deps.prescribingAdapter.name} did not submit the cancellation; cancellation transport is unavailable or rejected.`,
        );
      }
      cancellation = this.deps.prescriptionTransactions.recordCancellationSubmitted(
        attempt.id,
        actor,
        context,
      );
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = sanitizePrescriptionTransactionErrorMessage(rawMessage);
      if (isIntegrationOutcomeUncertain(error)) {
        prescriptionTransportReliabilityService.recordOutcomeUncertain(
          attempt.id,
          new Error(message),
          actor,
          context,
        );
        throw new Error(`Prescription cancellation outcome is uncertain: ${message}. Reconciliation is required before retry.`);
      }
      this.deps.prescriptionTransactions.recordCancellationFailure(
        attempt.id,
        new Error(message),
        actor,
        context,
      );
      throw new Error(`Prescription cancellation failed: ${message}`);
    }

    return {
      transaction: cancellation,
      targetTransactionId,
      idempotent: false,
      medicationTruthChanged: false,
    };
  }
}

export const orderTransmissionService = new OrderTransmissionService();
