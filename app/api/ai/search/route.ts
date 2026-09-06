import { NextResponse } from "next/server";
import { ClinicalSearchRepository } from "../../../server/repositories/clinical-search-repository";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || searchParams.get("query") || "";
    const patientId = searchParams.get("patientId") || undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : 10;

    if (!query.trim()) {
      return NextResponse.json({ success: true, results: [] });
    }

    const results = ClinicalSearchRepository.searchEncounters(query, patientId, limit);
    return NextResponse.json({ success: true, results, count: results.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
