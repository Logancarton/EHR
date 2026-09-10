import { NextResponse } from "next/server";
import { AuthService } from "../../../server/auth/auth-service";
import {
  AuthenticationError,
  getAuthenticatedSession,
} from "../../../server/auth/provider-context";

/**
 * A signed-in user changing their own password.
 *
 * The current password is required even though the caller holds a valid session: a
 * live session alone must not be enough to replace the credential, or an unattended
 * workstation becomes a permanent account takeover. The change is always for the
 * authenticated user — there is no target parameter, so this can never be a way to
 * reset someone else's password.
 */
export async function POST(req: Request) {
  try {
    const session = getAuthenticatedSession(req);
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be an object.");
    }
    for (const key of Object.keys(body)) {
      if (!["currentPassword", "newPassword"].includes(key)) {
        throw new Error(`Request contains an unexpected field: ${key}.`);
      }
    }

    const result = AuthService.changeOwnPassword(
      {
        currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
        nextPassword: typeof body.newPassword === "string" ? body.newPassword : "",
      },
      session.actor,
      // The session doing the changing stays alive; every other one is ended.
      session.sessionId,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Password change failed.";
    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof AuthenticationError ? 401 : 400 },
    );
  }
}
