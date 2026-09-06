import { NextResponse } from "next/server";
import { extractCandidateEntities } from "../../../lib/entity-extraction";
import { type TranscriptUtterance } from "../../../lib/encounter-engine";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const utterances = (body.utterances as TranscriptUtterance[]) || [];
    const activeMedications = (body.activeMedications as string[]) || [];

    if (!Array.isArray(utterances)) {
      return NextResponse.json({ success: false, error: "utterances array is required" }, { status: 400 });
    }

    const candidateActions = extractCandidateEntities(utterances, activeMedications);
    return NextResponse.json({ success: true, candidateActions });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
