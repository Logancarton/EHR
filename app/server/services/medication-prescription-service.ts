import type { MedicationRecord } from "../../domain/clinical-records";
import {
  prescriptionIntentFromOrderInput,
  reviewMedicationPrescriptionIntent,
  type MedicationPrescriptionReview,
} from "../../domain/medication-prescription-intent";
import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { AuditRepository } from "../repositories/audit-repository";
import { ClinicalRecordRepository } from "../repositories/clinical-record-repository";
import { OrderRepository, type OrderRecord } from "../repositories/order-repository";
import { clinicalRecordService } from "./clinical-record-service";
import type { ClinicalExecutionContext } from "./clinical-service";

export type PrescriptionMedicationTruthOperation = "add" | "update";

function prescriptionReview(order: OrderRecord, context: ClinicalExecutionContext): MedicationPrescriptionReview {
  const intent = prescriptionIntentFromOrderInput({
    patientId: order.patientId,
    name: order.name,
    details: order.details,
    source: context.source === "ai" ? "ai" : context.source === "ui" ? "clinician" : "api",
    lifecycle:
      order.status === "transmitted"
        ? "transmitted"
        : order.status === "transmission_failed"
          ? "transmission_failed"
          : order.status === "authorized"
            ? "authorized"
            : "staged",
  });
  return reviewMedicationPrescriptionIntent({
    intent,
    medications: ClinicalRecordRepository.medications(order.patientId),
    stagedOrders: OrderRepository.getByPatient(order.patientId).map((item) => ({
      id: item.id,
      patientId: item.patientId,
      status: item.status,
      details: item.details,
    })),
    currentOrderId: order.id,
  });
}

function existingConfirmation(order: OrderRecord): { operation: PrescriptionMedicationTruthOperation; medicationRecordId: string } | null {
  const value = order.details?.medicationTruthConfirmation;
  if (!value || typeof value !== "object") return null;
  if ((value.operation !== "add" && value.operation !== "update") || typeof value.medicationRecordId !== "string") return null;
  return { operation: value.operation, medicationRecordId: value.medicationRecordId };
}

function findMedication(patientId: string, medicationId: string): MedicationRecord | null {
  return ClinicalRecordRepository.medications(patientId).find((item) => item.id === medicationId) || null;
}

export const medicationPrescriptionService = {
  review(order: OrderRecord, context: ClinicalExecutionContext): MedicationPrescriptionReview {
    if (order.type !== "medication") throw new Error(`Order ${order.id} is not a medication prescription.`);
    return prescriptionReview(order, context);
  },

  confirmMedicationTruth(
    orderId: string,
    operation: PrescriptionMedicationTruthOperation,
    medicationId: string | undefined,
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): MedicationRecord {
    if (context.source === "ai") {
      throw new Error("AI may draft prescription intent but cannot change authoritative medication truth.");
    }
    assertPermission(actor, "authorize_order");
    assertPermission(actor, "manage_clinical_record");

    const order = OrderRepository.getById(orderId);
    if (!order) throw new Error(`Order not found: ${orderId}`);
    if (order.type !== "medication") throw new Error(`Order ${orderId} is not a medication prescription.`);
    if (!['authorized', 'transmitted', 'transmission_failed'].includes(order.status)) {
      throw new Error(`Prescription ${orderId} must be explicitly authorized before medication truth can be changed.`);
    }

    const replay = existingConfirmation(order);
    if (replay) {
      if (replay.operation !== operation || (operation === "update" && medicationId && replay.medicationRecordId !== medicationId)) {
        throw new Error(`Prescription ${orderId} already has a different medication-truth confirmation.`);
      }
      const existing = findMedication(order.patientId, replay.medicationRecordId);
      if (!existing) throw new Error(`Confirmed medication record not found: ${replay.medicationRecordId}`);
      return existing;
    }

    const review = prescriptionReview(order, context);
    const intent = review.intent;
    const source = { type: "prescription-intent", system: "ehr-local", ref: `orders/${order.id}` };
    let medication: MedicationRecord;

    if (operation === "add") {
      medication = clinicalRecordService.addMedication({
        patientId: order.patientId,
        displayText: [intent.medicationName, intent.strength, intent.frequency].filter(Boolean).join(" "),
        medicationName: intent.medicationName,
        genericName: intent.genericName,
        strength: intent.strength,
        dose: intent.dose,
        route: intent.route,
        frequency: intent.frequency,
        startDate: intent.startDate,
        prescriber: providerLabel(actor),
      }, actor, context, source);
    } else {
      if (!medicationId) {
        throw new Error("Updating medication truth requires an explicitly selected authoritative medication record.");
      }
      const target = findMedication(order.patientId, medicationId);
      if (!target) throw new Error(`Medication record not found for patient: ${medicationId}`);
      medication = clinicalRecordService.updateMedication(medicationId, {
        displayText: [intent.medicationName, intent.strength, intent.frequency].filter(Boolean).join(" "),
        medicationName: intent.medicationName,
        genericName: intent.genericName ?? null,
        strength: intent.strength ?? null,
        dose: intent.dose ?? null,
        route: intent.route ?? null,
        frequency: intent.frequency ?? null,
        startDate: intent.startDate ?? null,
        status: "active",
      }, actor, context, source);
    }

    OrderRepository.recordMedicationTruthConfirmation(order.id, {
      operation,
      medicationRecordId: medication.id,
      confirmedBy: providerLabel(actor),
      confirmedAt: new Date().toISOString(),
      advisoryImpact: review.truthImpact.kind,
    });

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "prescription_medication_truth_confirmed",
      patientId: order.patientId,
      description: `Explicitly confirmed ${operation} medication-truth action from prescription ${order.id}.`,
      metadata: {
        orderId: order.id,
        medicationRecordId: medication.id,
        operation,
        advisoryImpact: review.truthImpact.kind,
        source: context.source,
        requestId: context.requestId,
      },
    });
    return medication;
  },
};
