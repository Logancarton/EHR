import { NextResponse } from "next/server";
import { assertPermission, type ProviderContext } from "../../server/auth/provider-context";
import { ContextAssembler, type ClinicalSurface, type UserRole } from "../../server/context/context-assembler";
import { clinicalActionError, clinicalRequest } from "../../server/http/clinical-http";

function contextRole(role: ProviderContext["role"]): UserRole {
  return role === "clinical_assistant" ? "clinical-assistant" : role;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const patientId = typeof body.patientId === "string" ? body.patientId : "";

    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const request = clinicalRequest(req);
    assertPermission(request.actor, "read_clinical");
    if (!request.expectedPatientId) {
      throw new Error("Patient-bound context assembly requires active patient context.");
    }
    if (request.expectedPatientId !== patientId) {
      throw new Error(
        `Patient binding mismatch: active chart expects ${request.expectedPatientId}, but AI context was requested for ${patientId}.`,
      );
    }

    const surface = (body.surface as ClinicalSurface) || "general";
    const tokenBudget = body.tokenBudget ? Number(body.tokenBudget) : 2500;
    const searchQuery = body.searchQuery;

    const context = ContextAssembler.assemble({
      patientId,
      surface,
      userRole: contextRole(request.actor.role),
      tokenBudget,
      searchQuery,
    });

    if (!context) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, context });
  } catch (error) {
    return clinicalActionError(error);
  }
}
