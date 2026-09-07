import { NextResponse } from "next/server";
import type { OmniboxSurface } from "../../../../domain/omnibox";
import { omniboxPlannerService } from "../../../../server/ai/omnibox-planner";
import { assertPermission, getAuthenticatedProviderContext } from "../../../../server/auth/provider-context";
import { ACTIVE_PATIENT_HEADER, clinicalActionError } from "../../../../server/http/clinical-http";

const VALID_SURFACES = new Set<OmniboxSurface>([
  "general",
  "encounter",
  "labs",
  "medications",
  "messages",
  "history",
  "orders",
  "tasks",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalPatientId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 160) {
    throw new Error("activePatientId is invalid.");
  }
  return value.trim();
}

function optionalSurface(value: unknown): OmniboxSurface | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !VALID_SURFACES.has(value as OmniboxSurface)) {
    throw new Error("activeSurface is invalid.");
  }
  return value as OmniboxSurface;
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const body: unknown = await req.json();
    if (!isObject(body)) throw new Error("Omnibox planning request body must be an object.");
    for (const key of Object.keys(body)) {
      if (key !== "query" && key !== "activePatientId" && key !== "activeSurface") {
        throw new Error(`Omnibox planning request contains an unexpected field: ${key}.`);
      }
    }

    if (typeof body.query !== "string" || !body.query.trim()) throw new Error("Omnibox query is required.");
    if (body.query.length > 4000) throw new Error("Omnibox query is too long.");

    const activePatientId = optionalPatientId(body.activePatientId);
    const activeSection = optionalSurface(body.activeSurface);
    const expectedPatientId = req.headers.get(ACTIVE_PATIENT_HEADER)?.trim() || undefined;
    if (expectedPatientId && expectedPatientId.length > 160) throw new Error("Active patient request context is invalid.");

    const plan = await omniboxPlannerService.plan({
      query: body.query,
      activePatientId,
      activeSection,
      expectedPatientId,
    }, actor);

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
