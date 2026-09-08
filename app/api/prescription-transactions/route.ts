import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";
import { prescriptionTransactionService } from "../../server/services/prescription-transaction-service";

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

    const transactionId = new URL(req.url).searchParams.get("transactionId");
    if (transactionId) {
      return NextResponse.json({
        success: true,
        status: prescriptionTransactionService.status(transactionId, patientId, request.actor),
      });
    }

    return NextResponse.json({
      success: true,
      statuses: prescriptionTransactionService.listStatus(patientId, request.actor),
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
    };
    if (body.operation !== "cancel") {
      return NextResponse.json(
        { success: false, error: "Unsupported prescription transaction operation." },
        { status: 400 },
      );
    }
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
  } catch (error) {
    return clinicalActionError(error);
  }
}
