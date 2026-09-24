import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../server/auth/provider-context";
import { clinicalActionError } from "../../server/http/clinical-http";
import {
  ClinicalMonitoringPolicyError,
  ClinicalMonitoringPolicyService,
} from "../../server/services/clinical-monitoring-policy-service";
import type { MonitoringPolicyScope } from "../../server/repositories/clinical-monitoring-policy-repository";

function policyError(error: unknown) {
  if (error instanceof ClinicalMonitoringPolicyError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  return clinicalActionError(error);
}

function scope(value: unknown): MonitoringPolicyScope {
  if (value === "practice" || value === "provider" || value === "patient") return value;
  throw new ClinicalMonitoringPolicyError("scope must be practice, provider, or patient.", 400);
}

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const patientId = searchParams.get("patientId") || undefined;
    return NextResponse.json({
      success: true,
      state: ClinicalMonitoringPolicyService.read(actor, patientId),
    });
  } catch (error) {
    return policyError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A policy object is required." }, { status: 400 });
    }

    const result = ClinicalMonitoringPolicyService.save(actor, {
      scope: scope(body.scope),
      patientId: typeof body.patientId === "string" ? body.patientId : undefined,
      ruleId: typeof body.ruleId === "string" ? body.ruleId : "",
      intervalDays: body.intervalDays,
      dueSoonDays: body.dueSoonDays,
      overdueGraceDays: body.overdueGraceDays,
      enabled: body.enabled,
      reason: body.reason,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return policyError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get("ruleId") || "";
    const patientId = searchParams.get("patientId") || undefined;
    const state = ClinicalMonitoringPolicyService.reset(actor, {
      scope: scope(searchParams.get("scope")),
      patientId,
      ruleId,
    });
    return NextResponse.json({ success: true, state });
  } catch (error) {
    return policyError(error);
  }
}
