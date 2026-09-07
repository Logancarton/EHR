import { NextResponse } from "next/server";
import { extractCandidateEntities } from "../../../lib/entity-extraction";
import { type TranscriptUtterance } from "../../../lib/encounter-engine";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateUtterance(value: unknown): TranscriptUtterance {
  if (!isObject(value)) throw new Error("Each transcript utterance must be an object.");
  const allowed = new Set(["id", "speaker", "speakerName", "text", "timestamp"]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Transcript utterance contains an unexpected field: ${key}.`);
  }
  if (typeof value.id !== "string" || !value.id.trim() || value.id.length > 160) throw new Error("Transcript utterance id is invalid.");
  if (value.speaker !== "clinician" && value.speaker !== "patient") throw new Error("Transcript utterance speaker is invalid.");
  if (typeof value.speakerName !== "string" || !value.speakerName.trim() || value.speakerName.length > 200) throw new Error("Transcript speaker name is invalid.");
  if (typeof value.text !== "string" || !value.text.trim() || value.text.length > 5000) throw new Error("Transcript utterance text is invalid.");
  if (typeof value.timestamp !== "string" || !value.timestamp.trim() || value.timestamp.length > 160) throw new Error("Transcript utterance timestamp is invalid.");
  return {
    id: value.id,
    speaker: value.speaker,
    speakerName: value.speakerName,
    text: value.text,
    timestamp: value.timestamp,
  };
}

export async function POST(req: Request) {
  try {
    const actor = getAuthenticatedProviderContext(req);
    assertPermission(actor, "read_clinical");

    const body: unknown = await req.json();
    if (!isObject(body)) throw new Error("AI extraction request body must be an object.");
    for (const key of Object.keys(body)) {
      if (key !== "utterances" && key !== "activeMedications") {
        throw new Error(`AI extraction request contains an unexpected field: ${key}.`);
      }
    }
    if (!Array.isArray(body.utterances) || body.utterances.length > 500) {
      throw new Error("utterances must be an array with no more than 500 entries.");
    }
    if (body.activeMedications !== undefined && !Array.isArray(body.activeMedications)) {
      throw new Error("activeMedications must be an array when provided.");
    }

    const utterances = body.utterances.map(validateUtterance);
    const activeMedications = (body.activeMedications || []).map((value) => {
      if (typeof value !== "string" || !value.trim() || value.length > 240) {
        throw new Error("activeMedications contains an invalid medication value.");
      }
      return value;
    });
    if (activeMedications.length > 100) throw new Error("activeMedications contains too many entries.");

    const candidateActions = extractCandidateEntities(utterances, activeMedications);
    return NextResponse.json({ success: true, candidateActions });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
