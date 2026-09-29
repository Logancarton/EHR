import { NextResponse } from "next/server";
import { IntakeError, intakeService } from "../../../server/services/intake-service";
import type { IntakeSelfServiceSubmission } from "../../../domain/intake";

/**
 * Dedicated Patient-Facing Self-Service Endpoint (P7-F).
 *
 * Strict Authority Boundary Invariant:
 * This route operates completely outside staff/provider session authentication.
 * It authenticates solely by validating a single-subject cryptographic invitation
 * token. Patients cannot view other charts, execute clinical actions, or access
 * internal provider APIs.
 */

function selfServiceErrorResponse(error: unknown) {
  if (error instanceof IntakeError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "An unexpected error occurred.";
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || "";
    const dob = searchParams.get("dob") || undefined;

    if (!token.trim()) {
      return NextResponse.json({ success: false, error: "An invitation token is required." }, { status: 400 });
    }

    const packageData = intakeService.getSelfServicePackage(token, dob);
    return NextResponse.json({ success: true, package: packageData });
  } catch (error) {
    return selfServiceErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as IntakeSelfServiceSubmission;
    if (!body || !body.token) {
      return NextResponse.json({ success: false, error: "An invitation token and payload are required." }, { status: 400 });
    }

    const result = intakeService.submitSelfServicePackage(body);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return selfServiceErrorResponse(error);
  }
}
