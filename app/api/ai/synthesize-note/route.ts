import { NextResponse } from "next/server";
import { defaultAdaptiveScribingModel } from "../../../server/ai/ollama-scribe";
import type { TranscriptUtterance } from "../../../lib/encounter-engine";
import { assertPermission } from "../../../server/auth/provider-context";
import { ContextAssembler, type UserRole } from "../../../server/context/context-assembler";
import { authenticatedClinicalRequest, clinicalActionError } from "../../../server/http/clinical-http";

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

function contextRole(role: string): UserRole {
  if (role === "provider") return "provider";
  if (role === "clinical_assistant") return "clinical-assistant";
  return "staff";
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isObject(body)) throw new Error("Note synthesis request body must be an object.");

    if (!Array.isArray(body.utterances) || body.utterances.length > 500) {
      throw new Error("utterances must be an array with no more than 500 entries.");
    }

    const utterances = body.utterances.map(validateUtterance);
    if (utterances.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one transcript utterance is required before the note can be synthesized." },
        { status: 400 },
      );
    }

    // Compatibility boundary: the existing client still sends patientContext, but
    // the server accepts only its patient id. Names, medications, and diagnoses sent
    // by the browser are deliberately ignored; clinical context is rebuilt from the
    // authorized chart below.
    if (!isObject(body.patientContext)) {
      throw new Error("patientContext with patientId is required.");
    }
    const patientId = typeof body.patientContext.patientId === "string"
      ? body.patientContext.patientId.trim()
      : "";
    if (!patientId) throw new Error("patientContext.patientId is required.");

    const request = authenticatedClinicalRequest(req, patientId);
    assertPermission(request.actor, "read_clinical");

    const context = ContextAssembler.assemble({
      patientId,
      surface: "encounter-scribe",
      userRole: contextRole(request.actor.role),
      tokenBudget: 1800,
    });
    if (!context) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    const result = await defaultAdaptiveScribingModel.synthesizeNote({
      utterances,
      patientContext: {
        patientId: context.patient.id,
        name: context.patient.name,
        activeMedications: context.activeMedications,
        activeDiagnoses: context.activeDiagnoses,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    return clinicalActionError(error);
  }
}
