import { NextResponse } from "next/server";
import { AuthService } from "../../../server/auth/auth-service";
import { AuthenticationError } from "../../../server/auth/provider-context";

/**
 * Redeeming an activation token: a provisioned user sets their own username and
 * password from a single-use token handed to them out-of-band.
 *
 * This route is deliberately unauthenticated — the person redeeming it has no
 * account credential yet, which is the whole point. The token is the only thing
 * that authorizes it, so it is single-use, expiring, matched by hash, and every
 * failure reports the same message: an anonymous caller must not be able to tell
 * an unknown token from an expired or already-spent one.
 *
 * It establishes no session. The user signs in normally afterwards, so activation
 * cannot become a second, weaker way to obtain one.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be an object.");
    }
    for (const key of Object.keys(body)) {
      if (!["token", "username", "password"].includes(key)) {
        throw new Error(`Request contains an unexpected field: ${key}.`);
      }
    }

    const actor = AuthService.activateAccount({
      token: typeof body.token === "string" ? body.token : "",
      username: typeof body.username === "string" ? body.username : "",
      password: typeof body.password === "string" ? body.password : "",
    });

    return NextResponse.json({
      success: true,
      // Enough to confirm which account was activated, and nothing more.
      user: { userId: actor.userId, displayName: actor.displayName },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Activation failed.";
    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof AuthenticationError ? 401 : 400 },
    );
  }
}
