import { NextResponse } from "next/server";
import { ClinicalActionGateway } from "../../../server/actions/clinical-action-gateway";
import { clinicalActionError, clinicalRequest } from "../../../server/http/clinical-http";

export async function POST(req: Request) {
  try {
    const { actor, context } = clinicalRequest(req);
    const body = await req.json();
    if (!body.partnerId) {
      return NextResponse.json({ success: false, error: "partnerId is required" }, { status: 400 });
    }

    const agreement = await ClinicalActionGateway.execute({
      actor,
      context,
      action: {
        type: "team_request_task_agreement",
        payload: { partnerId: body.partnerId },
      },
    });
    return NextResponse.json({ success: true, agreement }, { status: 201 });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { actor, context } = clinicalRequest(req);
    const body = await req.json();
    if (!body.partnerId || !body.action) {
      return NextResponse.json(
        { success: false, error: "partnerId and action are required" },
        { status: 400 },
      );
    }

    const actionType = body.action === "accept"
      ? "team_accept_task_agreement"
      : body.action === "revoke"
        ? "team_revoke_task_agreement"
        : null;
    if (!actionType) {
      return NextResponse.json({ success: false, error: "action must be accept or revoke" }, { status: 400 });
    }

    const agreement = await ClinicalActionGateway.execute({
      actor,
      context,
      action: { type: actionType, payload: { partnerId: body.partnerId } },
    });
    return NextResponse.json({ success: true, agreement });
  } catch (error) {
    return clinicalActionError(error);
  }
}
