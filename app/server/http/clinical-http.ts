import { NextResponse } from "next/server";
import { getProviderContext } from "../auth/provider-context";
import type { ClinicalExecutionContext } from "../services/clinical-service";

export const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

export function clinicalRequest(req: Request, expectedPatientId?: string) {
  const context: ClinicalExecutionContext = {
    source: "api",
    requestId: req.headers.get("x-request-id") || undefined,
  };

  return {
    actor: getProviderContext(req),
    context,
    expectedPatientId:
      expectedPatientId || req.headers.get(ACTIVE_PATIENT_HEADER) || undefined,
  };
}

export function clinicalActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const status = message.includes("lacks permission")
    ? 403
    : message.includes("Patient binding mismatch")
      ? 409
      : message.toLowerCase().includes("not found")
        ? 404
        : 400;

  return NextResponse.json({ success: false, error: message }, { status });
}
