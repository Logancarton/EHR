import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
  clinicalRequest,
} from "../../../server/http/clinical-http";
import { HandoffRepository } from "../../../server/repositories/handoff-repository";
import { filterToAccessiblePatients } from "../../../server/auth/patient-access";
import type { HandoffStatus } from "../../../lib/schedule-data";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const appointmentId = searchParams.get("appointmentId") || undefined;
    const patientId = searchParams.get("patientId") || undefined;
    const toUserId = searchParams.get("toUserId") || undefined;
    const fromUserId = searchParams.get("fromUserId") || undefined;
    const status = (searchParams.get("status") as HandoffStatus) || undefined;

    const { actor } = authenticatedClinicalRequest(req, patientId);

    const handoffs = HandoffRepository.listHandoffs({
      appointmentId,
      patientId,
      toUserId,
      fromUserId,
      status,
    });

    const accessibleHandoffs = filterToAccessiblePatients(
      actor,
      handoffs,
      (handoff) => handoff.patientId,
    );

    return NextResponse.json({ success: true, handoffs: accessibleHandoffs });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action || "initiate";

    if (action === "initiate") {
      if (!body.appointmentId || !body.patientId || !body.toUserId || !body.reason) {
        return NextResponse.json(
          {
            success: false,
            error: "appointmentId, patientId, toUserId, and reason are required to initiate handoff",
          },
          { status: 400 },
        );
      }

      const handoff = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, body.patientId),
        action: {
          type: "initiate_appointment_handoff",
          payload: {
            appointmentId: body.appointmentId,
            patientId: body.patientId,
            toUserId: body.toUserId,
            toUserName: body.toUserName || body.toUserId,
            reason: body.reason,
            clinicalSummary: body.clinicalSummary || "",
          },
        },
      });

      return NextResponse.json({ success: true, handoff }, { status: 201 });
    }

    if (action === "accept") {
      if (!body.handoffId) {
        return NextResponse.json(
          { success: false, error: "handoffId is required to accept handoff" },
          { status: 400 },
        );
      }

      const existing = HandoffRepository.getHandoff(body.handoffId);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Handoff not found: ${body.handoffId}` },
          { status: 404 },
        );
      }

      const handoff = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "accept_appointment_handoff",
          payload: {
            handoffId: body.handoffId,
            note: body.note,
          },
        },
      });

      return NextResponse.json({ success: true, handoff });
    }

    if (action === "decline") {
      if (!body.handoffId || !body.declineReason) {
        return NextResponse.json(
          {
            success: false,
            error: "handoffId and declineReason are required to decline handoff",
          },
          { status: 400 },
        );
      }

      const existing = HandoffRepository.getHandoff(body.handoffId);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Handoff not found: ${body.handoffId}` },
          { status: 404 },
        );
      }

      const handoff = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "decline_appointment_handoff",
          payload: {
            handoffId: body.handoffId,
            declineReason: body.declineReason,
          },
        },
      });

      return NextResponse.json({ success: true, handoff });
    }

    if (action === "cancel") {
      if (!body.handoffId) {
        return NextResponse.json(
          { success: false, error: "handoffId is required to cancel handoff" },
          { status: 400 },
        );
      }

      const existing = HandoffRepository.getHandoff(body.handoffId);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: `Handoff not found: ${body.handoffId}` },
          { status: 404 },
        );
      }

      const handoff = await ClinicalActionGateway.execute({
        ...clinicalRequest(req, existing.patientId),
        action: {
          type: "cancel_appointment_handoff",
          payload: {
            handoffId: body.handoffId,
            note: body.note,
          },
        },
      });

      return NextResponse.json({ success: true, handoff });
    }

    return NextResponse.json(
      { success: false, error: `Unknown handoff action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    return clinicalActionError(error);
  }
}
