import { NextResponse } from "next/server";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { ACTIVE_PATIENT_HEADER, clinicalActionError } from "../../../server/http/clinical-http";
import { ClinicalSearchRepository } from "../../../server/repositories/clinical-search-repository";
import { PatientRepository } from "../../../server/repositories/patient-repository";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
    if (query.length > 1000) throw new Error("Clinical search query is too long.");

    const requestedPatientId = searchParams.get("patientId")?.trim() || undefined;
    if (requestedPatientId && requestedPatientId.length > 160) throw new Error("Patient reference is invalid.");
    const activePatientId = req.headers.get(ACTIVE_PATIENT_HEADER)?.trim() || undefined;
    if (requestedPatientId && activePatientId && requestedPatientId !== activePatientId) {
      throw new Error(
        `Patient binding mismatch: requested patient ${requestedPatientId} does not match active patient ${activePatientId}.`,
      );
    }
    const patientId = requestedPatientId || activePatientId;
    if (patientId && !PatientRepository.getById(patientId)) throw new Error("Patient not found.");

    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? Number(rawLimit) : 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error("Clinical search limit must be an integer between 1 and 25.");
    }

    if (!query) {
      return NextResponse.json({ success: true, results: [], count: 0 });
    }

    const results = ClinicalSearchRepository.searchEncounters(query, patientId, limit);
    return NextResponse.json({ success: true, results, count: results.length });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
