import type { OmniboxPlan, OmniboxSurface } from "../domain/omnibox";

/**
 * The single client path to the permission-aware planner.
 *
 * Both callers — the workspace omnibox and the home launcher — go through here, so
 * there is one request shape, one validation of the response, and one place where
 * a failure becomes a sentence. The home screen previously had no request at all:
 * it matched the query against a list of substrings in the browser and returned
 * invented clinical findings, which no server-side permission or patient-access
 * check could have prevented because none was consulted.
 *
 * This throws on failure rather than returning a fallback. A caller must render
 * the failure; substituting an example answer is the defect.
 */

export type OmniboxPlanRequest = {
  query: string;
  activePatientId?: string;
  activeSurface?: OmniboxSurface;
};

export class OmniboxPlanError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OmniboxPlanError";
    this.status = status;
  }
}

export async function requestOmniboxPlan(request: OmniboxPlanRequest): Promise<OmniboxPlan> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // The active chart travels as a header as well as a field so the server can
  // reject a mismatch rather than silently trusting the body.
  if (request.activePatientId) headers["x-ehr-patient-id"] = request.activePatientId;

  const response = await fetch("/api/ai/omnibox/plan", {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: request.query,
      activePatientId: request.activePatientId,
      activeSurface: request.activeSurface,
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new OmniboxPlanError(
      "Clinical AI could not be reached, so this request was not answered.",
      response.status,
    );
  }

  if (!payload || typeof payload !== "object") {
    throw new OmniboxPlanError("Clinical AI returned an invalid response, so nothing is shown.", response.status);
  }

  const record = payload as Record<string, unknown>;
  if (!response.ok || record.success === false) {
    throw new OmniboxPlanError(
      typeof record.error === "string" ? record.error : "Clinical AI could not answer this request.",
      response.status,
    );
  }
  if (!record.plan || typeof record.plan !== "object") {
    throw new OmniboxPlanError("Clinical AI returned no plan, so nothing is shown.", response.status);
  }

  return record.plan as OmniboxPlan;
}

/**
 * The sentence a clinician sees when planning failed.
 *
 * Stated as a refusal with its reason, never as an absence of findings: "no results"
 * and "I could not look" mean opposite things in a chart, and the second one must
 * not be able to read as the first.
 */
export function omniboxPlanFailureMessage(error: unknown): string {
  if (error instanceof OmniboxPlanError) {
    if (error.status === 401) {
      return "Your session has expired, so this request could not be answered. Sign in again and retry.";
    }
    if (error.status === 403) {
      return `This information could not be retrieved: ${error.message} No result was substituted.`;
    }
    return `This information could not be retrieved. ${error.message}`;
  }
  return "This information could not be retrieved, and no result was substituted.";
}
