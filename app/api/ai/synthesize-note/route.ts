import { NextResponse } from "next/server";
import { defaultAdaptiveScribingModel } from "../../../server/ai/ollama-scribe";
import type { TranscriptUtterance } from "../../../lib/encounter-engine";
import { assertPermission, getAuthenticatedProviderContext } from "../../../server/auth/provider-context";
import { clinicalActionError } from "../../../server/http/clinical-http";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateUtterance(value: unknown): TranscriptUtterance {
  if (!isObject(value)) throw new Error("Each transcript utterance must be an object.");
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
    if (!isObject(body)) throw new Error("Note synthesis request body must be an object.");

    if (!Array.isArray(body.utterances) || body.utterances.length > 500) {
      throw new Error("utterances must be an array with no more than 500 entries.");
    }

    const utterances = body.utterances.map(validateUtterance);

    let patientContext: {
      patientId?: string;
      name?: string;
      activeMedications?: string[];
      activeDiagnoses?: string[];
    } | undefined;

    if (body.patientContext !== undefined) {
      if (!isObject(body.patientContext)) throw new Error("patientContext must be an object when provided.");
      patientContext = {
        patientId: typeof body.patientContext.patientId === "string" ? body.patientContext.patientId : undefined,
        name: typeof body.patientContext.name === "string" ? body.patientContext.name : undefined,
        activeMedications: Array.isArray(body.patientContext.activeMedications)
          ? body.patientContext.activeMedications.filter((m): m is string => typeof m === "string")
          : [],
        activeDiagnoses: Array.isArray(body.patientContext.activeDiagnoses)
          ? body.patientContext.activeDiagnoses.filter((d): d is string => typeof d === "string")
          : [],
      };
    }

    let scenarioSynthesizedNote: any = undefined;
    if (body.scenarioSynthesizedNote !== undefined) {
      if (!isObject(body.scenarioSynthesizedNote)) throw new Error("scenarioSynthesizedNote must be an object when provided.");
      scenarioSynthesizedNote = body.scenarioSynthesizedNote;
    }

    const result = await defaultAdaptiveScribingModel.synthesizeNote({
      utterances,
      patientContext,
      scenarioSynthesizedNote,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
