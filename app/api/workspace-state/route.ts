import { NextResponse } from "next/server";
import { getProviderContext } from "../../server/auth/provider-context";
import { PreferenceRepository } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { sanitizeWorkspaceState, type WorkspacePatientScrollPositions } from "../../lib/workspace-state";

const WORKSPACE_STATE_KEY = "workspaceState";

function authenticationStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Authentication required") ? 401 : 500;
}

function providerWorkspaceState(userId: string) {
  const preferences = PreferenceRepository.getPreferences(userId) as Record<string, unknown>;
  return {
    preferences,
    state: sanitizeWorkspaceState(preferences[WORKSPACE_STATE_KEY]),
  };
}

export async function GET(req: Request) {
  try {
    const actor = getProviderContext(req);
    const { state } = providerWorkspaceState(actor.userId);
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
    const { preferences: current, state: currentState } = providerWorkspaceState(actor.userId);
    const sourceState = body?.state;
    const sourceIsObject = sourceState && typeof sourceState === "object";
    const hasScrollPositions = sourceIsObject &&
      Object.prototype.hasOwnProperty.call(sourceState, "patientScrollPositions");
    const candidateState = sourceIsObject && !hasScrollPositions && currentState?.patientScrollPositions
      ? { ...sourceState, patientScrollPositions: currentState.patientScrollPositions }
      : sourceState;
    const state = sanitizeWorkspaceState(candidateState);
    if (!state) {
      return NextResponse.json({ success: false, error: "Valid workspace state is required" }, { status: 400 });
    }

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

export async function PATCH(req: Request) {
  try {
    const actor = getProviderContext(req);
    const body = await req.json();
    if (!body?.patientScrollPositions || typeof body.patientScrollPositions !== "object") {
      return NextResponse.json({ success: false, error: "Patient scroll positions are required" }, { status: 400 });
    }

    const { preferences: current, state: currentState } = providerWorkspaceState(actor.userId);
    if (!currentState) {
      return NextResponse.json({ success: false, error: "Workspace state must exist before scroll state can be saved" }, { status: 409 });
    }

    const merged = new Map<string, WorkspacePatientScrollPositions[string]>(
      Object.entries(currentState.patientScrollPositions ?? {}),
    );
    for (const [patientId, sections] of Object.entries(body.patientScrollPositions as Record<string, unknown>)) {
      if (!sections || typeof sections !== "object") continue;
      merged.set(patientId, {
        ...(merged.get(patientId) ?? {}),
        ...(sections as WorkspacePatientScrollPositions[string]),
      });
    }

    const state = sanitizeWorkspaceState({
      ...currentState,
      patientScrollPositions: Object.fromEntries(merged),
      savedAt: new Date().toISOString(),
    });
    if (!state) {
      return NextResponse.json({ success: false, error: "Unable to sanitize workspace scroll state" }, { status: 400 });
    }

    PreferenceRepository.savePreferences({
      ...current,
      [WORKSPACE_STATE_KEY]: state,
    } as never, actor.userId);

    return NextResponse.json({
      success: true,
      patientScrollPositions: state.patientScrollPositions,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save workspace scroll state";
    return NextResponse.json({ success: false, error: message }, { status: authenticationStatus(error) });
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
