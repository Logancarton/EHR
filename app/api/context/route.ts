import { NextResponse } from "next/server";
import { ContextAssembler, type ClinicalSurface, type UserRole } from "../../server/context/context-assembler";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const patientId = body.patientId;

    if (!patientId) {
      return NextResponse.json({ success: false, error: "patientId is required" }, { status: 400 });
    }

    const surface = (body.surface as ClinicalSurface) || "general";
    const userRole = (body.userRole as UserRole) || "provider";
    const tokenBudget = body.tokenBudget ? Number(body.tokenBudget) : 2500;
    const searchQuery = body.searchQuery;

    const context = ContextAssembler.assemble({
      patientId,
      surface,
      userRole,
      tokenBudget,
      searchQuery,
    });

    if (!context) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, context });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
