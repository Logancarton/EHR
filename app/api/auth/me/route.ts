import { NextResponse } from "next/server";
import {
  AuthenticationError,
  getAuthenticatedProviderContext,
  permissionsForActor,
} from "../../../server/auth/provider-context";

export async function GET(req: Request) {
  try {
    const user = getAuthenticatedProviderContext(req);
    return NextResponse.json({
      success: true,
      user,
      permissions: permissionsForActor(user),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Authentication required.";
    return NextResponse.json(
      { success: false, error: message },
      { status: error instanceof AuthenticationError ? 401 : 400 },
    );
  }
}
