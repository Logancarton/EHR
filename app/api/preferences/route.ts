import { NextResponse } from "next/server";
import {
  getAuthenticatedProviderContext,
  providerLabel,
} from "../../server/auth/provider-context";
import { PreferenceRepository } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";
import { clinicalActionError } from "../../server/http/clinical-http";

export async function GET(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const preferences = PreferenceRepository.getPreferences(actor.userId);
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();

    if (!body.preferences || typeof body.preferences !== "object" || Array.isArray(body.preferences)) {
      return NextResponse.json({ success: false, error: "preferences object is required" }, { status: 400 });
    }

    // Preference ownership is the authenticated session, never a client-supplied providerId.
    const updated = PreferenceRepository.savePreferences(body.preferences, actor.userId);

    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "preference_updated",
      description: `Updated workspace display preferences: density=${updated.density}, preset=${updated.activePresetId}`,
      metadata: { density: updated.density, activePresetId: updated.activePresetId },
    });

    return NextResponse.json({ success: true, preferences: updated });
  } catch (error) {
    return clinicalActionError(error);
  }
}

export async function POST(req: Request) {
  return PUT(req);
}
