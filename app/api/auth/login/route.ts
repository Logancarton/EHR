import { NextResponse } from "next/server";
import { AuthService } from "../../../server/auth/auth-service";
import {
  AuthenticationError,
  EHR_SESSION_COOKIE,
} from "../../../server/auth/provider-context";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const login = AuthService.login({
      username: typeof body.username === "string" ? body.username : undefined,
      password: typeof body.password === "string" ? body.password : undefined,
      devUserId: typeof body.userId === "string" ? body.userId : undefined,
    });

    const response = NextResponse.json({
      success: true,
      user: login.actor,
      expiresAt: new Date(login.expiresAt).toISOString(),
    });
    response.cookies.set(EHR_SESSION_COOKIE, login.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(login.expiresAt),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof AuthenticationError ? 401 : 400 },
    );
  }
}
