import { NextResponse } from "next/server";
import {
  AuthenticationError,
  getAuthenticatedProviderContext,
  getProviderContext,
} from "../auth/provider-context";
import { PatientAccessError, assertPatientAccess } from "../auth/patient-access";
import { ProspectiveAccessError, assertProspectivePersonAccess } from "../auth/prospective-access";
import type { ClinicalExecutionContext } from "../services/clinical-service";
import { isNonPatientEvent, isProspectivePersonId } from "../../lib/schedule-data";

/** D-076: a bound id may be a prospective person rather than a chart. */
function assertSubjectAccess(actor: Parameters<typeof assertPatientAccess>[0], id: string): void {
  if (isProspectivePersonId(id)) assertProspectivePersonAccess(actor, id);
  else assertPatientAccess(actor, id);
}

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
  const patientId = patientBinding(req, expectedPatientId);
  const isNonPatient = isNonPatientEvent(patientId);
  // Patient-access scope is checked at the request boundary as well as inside the
  // action gateway. A read route that never reaches the gateway is still scoped.
  if (patientId && !isNonPatient) assertSubjectAccess(actor, patientId);
  return {
    actor,
    context: executionContext(req),
    expectedPatientId: isNonPatient ? undefined : patientId,
  };
}

export function authenticatedClinicalRequest(req: Request, expectedPatientId?: string) {
  const actor = getAuthenticatedProviderContext(req);
  const patientId = patientBinding(req, expectedPatientId);
  const isNonPatient = isNonPatientEvent(patientId);
  if (patientId && !isNonPatient) assertSubjectAccess(actor, patientId);
  return {
    actor,
    context: executionContext(req),
    expectedPatientId: isNonPatient ? undefined : patientId,
  };
}

export function clinicalActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const normalized = message.toLowerCase();
  const name = error instanceof Error ? error.name : "";
  // A refused vendor transport is not a bad request. It is the product telling the
  // caller that the capability does not exist here, and it has to be
  // distinguishable from a validation failure so no screen can retry it into a
  // success. Duplicate and version conflicts are 409 for the same reason.
  const status = name === "BillingTransportUnavailableError"
    ? 503
    : name === "BillingChargeConcurrencyError" ||
        name === "DuplicateBillingChargeError" ||
        name === "AppointmentScheduleConflictError"
    ? 409
    : error instanceof AuthenticationError
    ? 401
    : error instanceof PatientAccessError || error instanceof ProspectiveAccessError
      ? 403
      // D-086: refusing another member's HR record is a permission answer, not a
      // malformed request. It has to be distinguishable so no screen can present a
      // refusal as an empty directory.
      : name === "HRAccessError"
      ? 403
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
