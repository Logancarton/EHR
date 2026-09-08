import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import {
  PRESCRIPTION_RECOVERY_DISPOSITIONS,
  prescriptionRecoveryService,
  type PrescriptionRecoveryDisposition,
} from "../../server/services/prescription-recovery-service";
import { prescriptionRefillService } from "../../server/services/prescription-refill-service";
import { prescriptionTransactionService } from "../../server/services/prescription-transaction-service";

const REFILL_REQUEST_SOURCES = new Set(["patient", "pharmacy", "clinician"]);
const RECOVERY_DISPOSITIONS = new Set<string>(PRESCRIPTION_RECOVERY_DISPOSITIONS);

export async function GET(req: Request) {
  try {
    const request = clinicalRequest(req);
    const patientId = request.expectedPatientId;
    if (!patientId) {
      return NextResponse.json(
        { success: false, error: "Prescription transaction reads require an active patient context." },
        { status: 400 },
      );
    }

    const params = new URL(req.url).searchParams;
    const refillRequestId = params.get("refillRequestId");
    if (refillRequestId) {
      return NextResponse.json({
        success: true,
        refillRequest: prescriptionRefillService.status(refillRequestId, patientId, request.actor),
      });
    }

    const transactionId = params.get("transactionId");
    if (transactionId) {
      const status = prescriptionTransactionService.status(transactionId, patientId, request.actor);
      const refillRequests = prescriptionRefillService
        .listStatus(patientId, request.actor)
        .filter((item) => item.priorTransactionId === transactionId || item.renewalOrderId === status.orderId);
      return NextResponse.json({
        success: true,
        status,
        recovery: prescriptionRecoveryService.status(transactionId, patientId, request.actor),
        refillRequests,
      });
    }

    return NextResponse.json({
      success: true,
      statuses: prescriptionTransactionService.listStatus(patientId, request.actor),
      recoveryStatuses: prescriptionRecoveryService.listByPatient(patientId, request.actor),
      refillRequests: prescriptionRefillService.listStatus(patientId, request.actor),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      operation?: string;
      transactionId?: string;
      reason?: string;
      refillRequestId?: string;
      requestSource?: string;
      sourceReference?: string;
      note?: string;
      disposition?: string;
      evidenceSource?: string;
      supersedingTransactionId?: string;
    };

    if (body.operation === "cancel") {
      if (!body.transactionId || typeof body.transactionId !== "string") {
        return NextResponse.json(
          { success: false, error: "transactionId is required." },
          { status: 400 },
        );
      }
      if (!body.reason || typeof body.reason !== "string" || !body.reason.trim()) {
        return NextResponse.json(
          { success: false, error: "A cancellation reason is required." },
          { status: 400 },
        );
      }

      const outcome = await ClinicalActionGateway.execute({
        action: {
          type: "cancel_prescription",
          payload: { transactionId: body.transactionId, reason: body.reason },
        },
        ...clinicalRequest(req),
      });
      return NextResponse.json({ success: true, outcome });
    }

    if (body.operation === "record_recovery_evidence") {
      if (!body.transactionId || typeof body.transactionId !== "string") {
        return NextResponse.json(
          { success: false, error: "transactionId is required." },
          { status: 400 },
        );
      }
      if (!body.disposition || !RECOVERY_DISPOSITIONS.has(body.disposition)) {
        return NextResponse.json(
          { success: false, error: "Unsupported prescription recovery disposition." },
          { status: 400 },
        );
      }
      if (!body.evidenceSource || typeof body.evidenceSource !== "string" || !body.evidenceSource.trim()) {
        return NextResponse.json(
          { success: false, error: "evidenceSource is required." },
          { status: 400 },
        );
      }
      if (!body.note || typeof body.note !== "string" || !body.note.trim()) {
        return NextResponse.json(
          { success: false, error: "A manual recovery note is required." },
          { status: 400 },
        );
      }
      if (body.supersedingTransactionId !== undefined && typeof body.supersedingTransactionId !== "string") {
        return NextResponse.json(
          { success: false, error: "supersedingTransactionId must be a string when provided." },
          { status: 400 },
        );
      }

      const outcome = await ClinicalActionGateway.execute({
        action: {
          type: "record_prescription_recovery_evidence",
          payload: {
            transactionId: body.transactionId,
            disposition: body.disposition as PrescriptionRecoveryDisposition,
            evidenceSource: body.evidenceSource,
            note: body.note,
            supersedingTransactionId: body.supersedingTransactionId,
          },
        },
        ...clinicalRequest(req),
      });
      return NextResponse.json({ success: true, outcome });
    }

    if (body.operation === "request_refill") {
      if (!body.transactionId || typeof body.transactionId !== "string") {
        return NextResponse.json(
          { success: false, error: "transactionId is required." },
          { status: 400 },
        );
      }
      if (!body.requestSource || !REFILL_REQUEST_SOURCES.has(body.requestSource)) {
        return NextResponse.json(
          { success: false, error: "requestSource must be patient, pharmacy, or clinician." },
          { status: 400 },
        );
      }
      if (body.sourceReference !== undefined && typeof body.sourceReference !== "string") {
        return NextResponse.json(
          { success: false, error: "sourceReference must be a string when provided." },
          { status: 400 },
        );
      }
      if (body.note !== undefined && typeof body.note !== "string") {
        return NextResponse.json(
          { success: false, error: "note must be a string when provided." },
          { status: 400 },
        );
      }

      const outcome = await ClinicalActionGateway.execute({
        action: {
          type: "request_prescription_refill",
          payload: {
            transactionId: body.transactionId,
            requestSource: body.requestSource as "patient" | "pharmacy" | "clinician",
            sourceReference: body.sourceReference,
            note: body.note,
          },
        },
        ...clinicalRequest(req),
      });
      return NextResponse.json({ success: true, outcome });
    }

    if (body.operation === "renew") {
      if (!body.refillRequestId || typeof body.refillRequestId !== "string") {
        return NextResponse.json(
          { success: false, error: "refillRequestId is required." },
          { status: 400 },
        );
      }

      const outcome = await ClinicalActionGateway.execute({
        action: {
          type: "renew_prescription",
          payload: { refillRequestId: body.refillRequestId },
        },
        ...clinicalRequest(req),
      });
      return NextResponse.json({ success: true, outcome });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported prescription transaction operation." },
      { status: 400 },
    );
  } catch (error) {
    return clinicalActionError(error);
  }
}
