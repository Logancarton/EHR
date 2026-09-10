import { NextResponse } from "next/server";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { ContextAssembler, type UserRole } from "../../../server/context/context-assembler";
import { ACTIVE_PATIENT_HEADER, clinicalActionError } from "../../../server/http/clinical-http";
import { PatientRepository } from "../../../server/repositories/patient-repository";
import { assertPatientAccess } from "../../../server/auth/patient-access";

function contextRole(role: "provider" | "clinical_assistant" | "staff"): UserRole {
  return role === "clinical_assistant" ? "clinical-assistant" : role;
}

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
    if (activePatientId && activePatientId.length > 160) throw new Error("Active patient request context is invalid.");
    if (requestedPatientId && activePatientId && requestedPatientId !== activePatientId) {
      throw new Error(
        `Patient binding mismatch: requested patient ${requestedPatientId} does not match active patient ${activePatientId}.`,
      );
    }

    const patientId = requestedPatientId || activePatientId;
    if (!patientId) {
      throw new Error("Patient-specific clinical search requires an active or requested patient context.");
    }
    if (!PatientRepository.getById(patientId)) throw new Error("Patient not found.");
    assertPatientAccess(actor, patientId);

    const rawLimit = searchParams.get("limit");
    const limit = rawLimit ? Number(rawLimit) : 10;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new Error("Clinical search limit must be an integer between 1 and 25.");
    }

    if (!query) {
      return NextResponse.json({ success: true, results: [], count: 0 });
    }

    const context = ContextAssembler.assemble({
      patientId,
      surface: "longitudinal-query",
      userRole: contextRole(actor.role),
      tokenBudget: 2500,
      searchQuery: query,
    });
    if (!context) throw new Error("Patient not found.");

    // The search endpoint exposes only the search-specific slice produced by the
    // shared ContextAssembler. This preserves its role filtering and provenance
    // rules instead of giving an AI route direct FTS/database access.
    const results = (context.searchMatches || []).slice(0, limit).map((match) => ({
      encounterId: match.encounterId,
      patientId,
      patientName: context.patient.name,
      date: match.date,
      chiefComplaint: match.chiefComplaint,
      snippet: match.snippet,
      provenanceRef: match.provenanceRef,
    }));

    return NextResponse.json({ success: true, results, count: results.length });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
