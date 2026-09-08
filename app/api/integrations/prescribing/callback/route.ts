import { handlePrescriptionCallbackRequest } from "../../../../server/http/prescription-callback-http";

/**
 * Public vendor ingress. Ordinary EHR session authentication is intentionally not
 * consulted here; the configured prescribing verification adapter is authoritative.
 * Vendor selection only chooses the verifier and can never choose a patient.
 */
export async function POST(request: Request) {
  return handlePrescriptionCallbackRequest(request);
}
