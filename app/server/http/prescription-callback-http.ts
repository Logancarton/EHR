import type { PrescriptionCallbackVerificationAdapter } from "../../adapters/prescribing/callback-verification";
import { resolvePrescriptionCallbackVerifier } from "../../adapters/prescribing/callback-verification";
import { AuditRepository } from "../repositories/audit-repository";
import {
  PrescriptionCallbackError,
  prescriptionCallbackService,
} from "../services/prescription-callback-service";

const MAX_CALLBACK_BYTES = 64 * 1024;
const ADAPTER_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

type VerifierResolver = (adapterId: string) => PrescriptionCallbackVerificationAdapter | undefined;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function auditBoundaryRejection(adapterId: string | undefined, failureCode: string) {
  AuditRepository.log({
    userId: adapterId ? `integration-route:${adapterId}` : "integration-route:unknown",
    userName: "Unverified prescribing callback attempt",
    userRole: "external-system-unverified",
    eventType: "prescription_callback_rejected",
    description: "Rejected inbound prescribing callback at the vendor verification boundary.",
    metadata: {
      adapterId,
      failureCode,
      verified: false,
      rawPayloadPersisted: false,
      medicationTruthChanged: false,
    },
  });
}

export function createPrescriptionCallbackHttpHandler(
  resolveVerifier: VerifierResolver = resolvePrescriptionCallbackVerifier,
) {
  return async function handlePrescriptionCallback(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const adapterId = url.searchParams.get("adapter")?.trim();
    if (!adapterId || !ADAPTER_ID.test(adapterId)) {
      auditBoundaryRejection(adapterId, "invalid_adapter_identifier");
      return json(400, { ok: false, error: "Invalid prescribing adapter identifier." });
    }

    const verifier = resolveVerifier(adapterId);
    if (!verifier) {
      auditBoundaryRejection(adapterId, "unsupported_adapter");
      return json(404, { ok: false, error: "Unsupported prescribing callback adapter." });
    }

    const declaredLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CALLBACK_BYTES) {
      auditBoundaryRejection(adapterId, "payload_too_large");
      return json(413, { ok: false, error: "Callback payload is too large." });
    }

    let body: Uint8Array;
    try {
      body = new Uint8Array(await request.arrayBuffer());
    } catch {
      auditBoundaryRejection(adapterId, "body_unreadable");
      return json(400, { ok: false, error: "Callback body could not be read." });
    }
    if (body.byteLength === 0 || body.byteLength > MAX_CALLBACK_BYTES) {
      auditBoundaryRejection(adapterId, body.byteLength === 0 ? "empty_payload" : "payload_too_large");
      return json(body.byteLength === 0 ? 400 : 413, {
        ok: false,
        error: body.byteLength === 0 ? "Callback body is required." : "Callback payload is too large.",
      });
    }

    let verification;
    try {
      verification = await verifier.verifyInboundCallback({
        adapterId,
        headers: request.headers,
        body,
        receivedAt: new Date().toISOString(),
      });
    } catch {
      auditBoundaryRejection(adapterId, "verification_error");
      return json(401, { ok: false, error: "Callback verification failed." });
    }

    if (!verification.verified) {
      auditBoundaryRejection(adapterId, "verification_failed");
      return json(401, { ok: false, error: "Callback verification failed." });
    }
    if (verification.callback.adapterId !== adapterId || verifier.id !== adapterId) {
      auditBoundaryRejection(adapterId, "verified_adapter_mismatch");
      return json(401, { ok: false, error: "Callback verification failed." });
    }

    try {
      const result = prescriptionCallbackService.processVerifiedCallback(verification.callback);
      return json(200, { ok: true, idempotent: result.idempotent });
    } catch (error) {
      if (error instanceof PrescriptionCallbackError) {
        AuditRepository.log({
          userId: `integration:${adapterId}`,
          userName: `External prescribing adapter (${adapterId})`,
          userRole: "external-system",
          eventType: "prescription_callback_rejected",
          description: "Rejected verified prescribing callback during normalized routing.",
          metadata: {
            adapterId,
            failureCode: error.code,
            verified: true,
            rawPayloadPersisted: false,
            medicationTruthChanged: false,
          },
        });
        return json(error.httpStatus, { ok: false, error: "Verified callback was rejected." });
      }

      AuditRepository.log({
        userId: `integration:${adapterId}`,
        userName: `External prescribing adapter (${adapterId})`,
        userRole: "external-system",
        eventType: "prescription_callback_rejected",
        description: "Failed to process verified prescribing callback.",
        metadata: {
          adapterId,
          failureCode: "processing_error",
          verified: true,
          rawPayloadPersisted: false,
          medicationTruthChanged: false,
        },
      });
      return json(500, { ok: false, error: "Callback processing failed." });
    }
  };
}

export const handlePrescriptionCallbackRequest = createPrescriptionCallbackHttpHandler();
