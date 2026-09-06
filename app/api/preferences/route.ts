import { NextResponse } from "next/server";
import { PreferenceRepository } from "../../server/repositories/preference-repository";
import { AuditRepository } from "../../server/repositories/audit-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("providerId") || "dr-carton";

    const preferences = PreferenceRepository.getPreferences(providerId);
    return NextResponse.json({ success: true, preferences });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const providerId = body.providerId || "dr-carton";

    if (!body.preferences) {
      return NextResponse.json({ success: false, error: "preferences object is required" }, { status: 400 });
    }

    const updated = PreferenceRepository.savePreferences(body.preferences, providerId);

    AuditRepository.log({
      userId: providerId,
      eventType: "preference_updated",
      description: `Updated workspace display preferences: density=${updated.density}, preset=${updated.activePresetId}`,
      metadata: { density: updated.density, activePresetId: updated.activePresetId },
    });

    return NextResponse.json({ success: true, preferences: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Alias for PUT to support clients posting preferences
  return PUT(req);
}
