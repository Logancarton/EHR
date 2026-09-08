import type { VerifiedPrescriptionCallback } from "../../domain/prescription-callbacks";
import { availablePrescribingAdapters } from "../index";

export type PrescriptionCallbackVerificationInput = {
  adapterId: string;
  headers: Headers;
  body: Uint8Array;
  receivedAt: string;
};

export type PrescriptionCallbackVerificationResult =
  | { verified: true; callback: VerifiedPrescriptionCallback }
  | { verified: false; reason: string };

/**
 * Vendor-specific authenticity boundary. Implementations may inspect signatures,
 * mTLS-derived headers, timestamps, or other contracted vendor mechanisms, but must
 * return only the bounded vendor-neutral callback type to core EHR code.
 */
export interface PrescriptionCallbackVerificationAdapter {
  id: string;
  verifyInboundCallback(
    input: PrescriptionCallbackVerificationInput,
  ): Promise<PrescriptionCallbackVerificationResult>;
}

function isCallbackVerifier(
  value: unknown,
): value is PrescriptionCallbackVerificationAdapter {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PrescriptionCallbackVerificationAdapter>;
  return typeof candidate.id === "string" && typeof candidate.verifyInboundCallback === "function";
}

/**
 * Existing development prescribing adapters are recognized but deliberately fail
 * closed until a real adapter implements contracted callback verification.
 */
function failClosedVerifier(adapterId: string): PrescriptionCallbackVerificationAdapter {
  return {
    id: adapterId,
    async verifyInboundCallback() {
      return {
        verified: false,
        reason: `Inbound callback verification is not configured for prescribing adapter ${adapterId}.`,
      };
    },
  };
}

export function resolvePrescriptionCallbackVerifier(
  adapterId: string,
): PrescriptionCallbackVerificationAdapter | undefined {
  const adapter = availablePrescribingAdapters.find((candidate) => candidate.id === adapterId);
  if (!adapter) return undefined;
  return isCallbackVerifier(adapter) ? adapter : failClosedVerifier(adapter.id);
}
