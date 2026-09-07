import { NextResponse } from "next/server";
import { AuthService } from "../../../server/auth/auth-service";
import {
  AuthenticationError,
  EHR_SESSION_COOKIE,
  getAuthenticatedSession,
} from "../../../server/auth/provider-context";

export async function POST(req: Request) {
  try {
    const session = getAuthenticatedSession(req);
    AuthService.logout(session.sessionId, session.actor);
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
    // Logout is intentionally idempotent. Missing/expired/tampered credentials
    // still result in the browser cookie being cleared.
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(EHR_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
