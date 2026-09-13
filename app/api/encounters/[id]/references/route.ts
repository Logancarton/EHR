import { NextResponse } from "next/server";
import { assertPermission, providerLabel } from "../../../../server/auth/provider-context";
import { EncounterRepository } from "../../../../server/repositories/encounter-repository";
import { NoteReferenceRepository } from "../../../../server/repositories/note-reference-repository";
import { ActionDerivedReferenceService } from "../../../../server/services/action-derived-reference-service";
import { NoteExtractionService } from "../../../../server/services/note-extraction-service";
import {
  authenticatedClinicalRequest,
  clinicalActionError,
} from "../../../../server/http/clinical-http";

/**
 * The references an encounter note carries.
 *
 * The action-derived set is recomputed before reading. That is a write during a
 * GET, and it is deliberate: these rows are a view over authoritative records —
 * orders placed against this encounter and the medication truth they produced —
 * not clinical truth of their own, the same way the full-text index is derived
 * from note content rather than being note content. Recomputing on read is what
 * makes the view self-healing when a mutation-side refresh failed.
 *
 * Nothing clinical is created here. A reference can only point at a record that
 * already exists, and extraction proposals and clinician links are untouched.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const encounter = EncounterRepository.getById(id);
    if (!encounter) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    const { actor } = authenticatedClinicalRequest(req, encounter.patientId);
    assertPermission(actor, "read_clinical");

    try {
      ActionDerivedReferenceService.deriveForEncounter(id, {
        userId: actor.userId,
        displayName: providerLabel(actor),
      });
    } catch {
      // A stale derived view is still readable. Never fail the read over it.
    }

    return NextResponse.json({
      success: true,
      references: NoteReferenceRepository.listForEncounter(id),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}

/**
 * Propose references for one section of the draft note.
 *
 * Gated on `edit_draft`, because that is what this is: a consequence of the
 * clinician writing their note. Everything it writes is a proposal that counts
 * toward nothing until confirmed at signing, and the extractor can only point at
 * records this patient already has.
 *
 * Unchanged text is a no-op server-side, so calling this on a debounce is cheap.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const encounter = EncounterRepository.getById(id);
    if (!encounter) {
      return NextResponse.json({ success: false, error: "Encounter not found" }, { status: 404 });
    }

    const { actor } = authenticatedClinicalRequest(req, encounter.patientId);
    assertPermission(actor, "edit_draft");

    const body = await req.json();
    if (typeof body?.section !== "string" || typeof body?.text !== "string") {
      return NextResponse.json(
        { success: false, error: "section and text are required" },
        { status: 400 },
      );
    }

    await NoteExtractionService.extractSection(id, body.section, body.text, {
      userId: actor.userId,
      displayName: providerLabel(actor),
    });

    return NextResponse.json({
      success: true,
      references: NoteReferenceRepository.listForEncounter(id),
    });
  } catch (error) {
    return clinicalActionError(error);
  }
}
