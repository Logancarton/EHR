import { NextResponse } from "next/server";
import { getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { PreferenceRepository } from "../../../server/repositories/preference-repository";
import { clinicalActionError } from "../../../server/http/clinical-http";

/**
 * Rail layout, owned by its own endpoint.
 *
 * The rails are edited from the sidebar, which renders in the root layout —
 * outside the workspace that owns the rest of the preference record. Giving
 * rail state its own writer means the sidebar never has to round-trip the whole
 * preference object, which it does not hold and could only send back stale.
 *
 * This mirrors how `workspaceState` is carved out of the same record.
 */

const MAX_PINS = 24;
const MAX_ID_LENGTH = 64;

function toolIds(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_PINS) {
    throw new Error(`${field} must be an array of at most ${MAX_PINS} tool ids.`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim() || entry.length > MAX_ID_LENGTH) {
      throw new Error(`${field} contains an invalid tool id.`);
    }
  }
  // De-duplicate rather than reject: a repeated id is a client bug, not an
  // attack, and a rail that renders each tool once is the intended result.
  return [...new Set(value as string[])];
}

function railWidth(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1200) {
    throw new Error(`${field} must be a width in pixels between 0 and 1200.`);
  }
  return Math.round(value);
}

export async function PUT(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "rails object is required" }, { status: 400 });
    }

    const existing = PreferenceRepository.getPreferences(actor.userId);
    const incoming = body as Record<string, unknown>;

    // Each field is optional so a width drag does not have to restate the pins.
    const rails = {
      ...existing.rails,
      ...(toolIds(incoming.left, "left") !== undefined ? { left: toolIds(incoming.left, "left")! } : {}),
      ...(toolIds(incoming.right, "right") !== undefined ? { right: toolIds(incoming.right, "right")! } : {}),
      ...(railWidth(incoming.leftWidth, "leftWidth") !== undefined
        ? { leftWidth: railWidth(incoming.leftWidth, "leftWidth")! }
        : {}),
      ...(railWidth(incoming.rightWidth, "rightWidth") !== undefined
        ? { rightWidth: railWidth(incoming.rightWidth, "rightWidth")! }
        : {}),
    };

    const saved = PreferenceRepository.savePreferences({ ...existing, rails }, actor.userId);
    return NextResponse.json({ success: true, rails: saved.rails });
  } catch (error) {
    return clinicalActionError(error);
  }
}
