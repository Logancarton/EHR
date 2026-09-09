import { NextResponse } from "next/server";
import {
  AuthenticationError,
  getAuthenticatedProviderContext,
  getProviderContext,
} from "../auth/provider-context";
import type { ClinicalExecutionContext } from "../services/clinical-service";

export const ACTIVE_PATIENT_HEADER = "x-ehr-patient-id";

function executionContext(req: Request): ClinicalExecutionContext {
  return {
    source: "api",
    requestId: req.headers.get("x-request-id") || undefined,
  };
}

function patientBinding(req: Request, requestedPatientId?: string) {
  const activePatientId = req.headers.get(ACTIVE_PATIENT_HEADER)?.trim() || undefined;
  const requested = requestedPatientId?.trim() || undefined;
  if (requested && activePatientId && requested !== activePatientId) {
    throw new Error(
      `Patient binding mismatch: active chart expects ${activePatientId}, but request targets ${requested}.`,
    );
  }
  return requested || activePatientId;
}

export function clinicalRequest(req: Request, expectedPatientId?: string) {
  const actor = getProviderContext(req);
  return {
    actor,
    context: executionContext(req),
    expectedPatientId: patientBinding(req, expectedPatientId),
  };
}

export function authenticatedClinicalRequest(req: Request, expectedPatientId?: string) {
  const actor = getAuthenticatedProviderContext(req);
  return {
    actor,
    context: executionContext(req),
    expectedPatientId: patientBinding(req, expectedPatientId),
  };
}

export function clinicalActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const normalized = message.toLowerCase();
  const status = error instanceof AuthenticationError
    ? 401
    : message.includes("lacks permission")
      ? 403
      : message.includes("Patient binding mismatch") ||
          message.includes("Actor binding mismatch") ||
          normalized.includes("encounter draft conflict")
        ? 409
        : normalized.includes("not found")
          ? 404
          : 400;

  return NextResponse.json({ success: false, error: message }, { status });
}
