import { NextResponse } from "next/server";
import { getProviderContext } from "../../server/auth/provider-context";
import { PreferenceRepository } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { sanitizeWorkspaceState } from "../../lib/workspace-state";

const WORKSPACE_STATE_KEY = "workspaceState";

function authenticationStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Authentication required") ? 401 : 500;
}

export async function GET(req: Request) {
  try {
    const actor = getProviderContext(req);
    const preferences = PreferenceRepository.getPreferences(actor.userId) as Record<string, unknown>;
    const state = sanitizeWorkspaceState(preferences[WORKSPACE_STATE_KEY]);
    return NextResponse.json({ success: true, state });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load workspace state";
    return NextResponse.json({ success: false, error: message }, { status: authenticationStatus(error) });
  }
}

export async function PUT(req: Request) {
  try {
    const actor = getProviderContext(req);
    const body = await req.json();
    const state = sanitizeWorkspaceState(body?.state);
    if (!state) {
      return NextResponse.json({ success: false, error: "Valid workspace state is required" }, { status: 400 });
    }

    const current = PreferenceRepository.getPreferences(actor.userId) as Record<string, unknown>;
    const updated = {
      ...current,
      [WORKSPACE_STATE_KEY]: state,
    };

    PreferenceRepository.savePreferences(updated as never, actor.userId);
    AuditRepository.log({
      userId: actor.userId,
      userName: actor.displayName,
      userRole: actor.role,
      eventType: "preference_updated",
      description: "Updated provider workspace restoration state",
      metadata: {
        dockedWindowCount: state.dockedPatientIds.length,
        detachedWindowCount: state.detachedPatientIds.length,
        activeView: state.activeView,
        activeCompanionPanel: state.activeCompanionPanel,
      },
    });

    return NextResponse.json({ success: true, state });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save workspace state";
    return NextResponse.json({ success: false, error: message }, { status: authenticationStatus(error) });
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
