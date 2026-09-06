import { NextResponse } from "next/server";
import { getProviderContext } from "../auth/provider-context";
import type { ClinicalExecutionContext } from "../services/clinical-service";

export function clinicalRequest(req: Request) {
  const context: ClinicalExecutionContext = {
    source: "api",
    requestId: req.headers.get("x-request-id") || undefined,
  };

  return {
    actor: getProviderContext(req),
    context,
  };
}

export function clinicalActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown clinical action error";
  const status = message.includes("lacks permission")
    ? 403
    : message.toLowerCase().includes("not found")
      ? 404
      : 400;

  return NextResponse.json({ success: false, error: message }, { status });
}
