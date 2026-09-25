import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import {
  accessSelectionForActor,
  assertPatientAccess,
  canAccessPatient,
} from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { OrganizationRepository } from "../repositories/organization-repository";
import { ScratchNoteRepository, type StoredScratchNote } from "../repositories/scratch-note-repository";
import type { ScratchNote } from "../../domain/tasks";
import type { ClinicalExecutionContext } from "./clinical-service";

const MAX_NOTE_LENGTH = 4000;
const NOTE_COLORS = new Set(["note-yellow", "note-blue", "note-green", "note-purple"]);

export class ScratchNoteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ScratchNoteError";
  }
}

function practicesFor(actor: ProviderContext): string[] {
  const selection = accessSelectionForActor(actor);
  return [...new Set([...selection.organizationIds, ...selection.assignedScopeOrganizationIds])];
}

function toClient(note: StoredScratchNote): ScratchNote {
  const { organizationId: _organizationId, authorUserId: _authorUserId, ...rest } = note;
  return rest;
}

function auditActor(actor: ProviderContext) {
  return { userId: actor.userId, userName: providerLabel(actor), userRole: actor.role };
}

/**
 * A scratchpad is the clinician's own. Notes are read and written only by their
 * author, inside a practice the author belongs to, and a note about a patient is
 * shown only while the author can still open that patient's chart.
 */
export const scratchNoteService = {
  list(actor: ProviderContext): ScratchNote[] {
    assertPermission(actor, "manage_tasks");
    return ScratchNoteRepository.listVisible({ organizationIds: practicesFor(actor), authorUserId: actor.userId })
      .filter((note) => !note.patientId || canAccessPatient(actor, note.patientId))
      .map(toClient);
  },

  create(
    input: { text: string; color?: string; patientId?: string },
    actor: ProviderContext,
    context: ClinicalExecutionContext,
  ): ScratchNote {
    assertPermission(actor, "manage_tasks");
    const text = (input.text ?? "").trim();
    if (!text) throw new ScratchNoteError("A scratchpad note needs text.", 400);
    if (text.length > MAX_NOTE_LENGTH) {
      throw new ScratchNoteError(`A scratchpad note is limited to ${MAX_NOTE_LENGTH} characters.`, 400);
    }
    const color = input.color && NOTE_COLORS.has(input.color) ? input.color : "note-yellow";

    let organizationId: string | undefined;
    if (input.patientId) {
      assertPatientAccess(actor, input.patientId);
      organizationId = OrganizationRepository.organizationForPatient(input.patientId) ?? undefined;
      if (!organizationId) {
        throw new ScratchNoteError("That patient is not assigned to a practice.", 409);
      }
    } else {
      organizationId = practicesFor(actor)[0];
    }
    if (!organizationId) throw new ScratchNoteError("You do not belong to an active practice.", 403);

    const note = ScratchNoteRepository.create({
      organizationId,
      authorUserId: actor.userId,
      patientId: input.patientId,
      text,
      color,
    });
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "scratchpad_created",
      patientId: note.patientId,
      description: `Created scratchpad note ${note.id}.`,
      metadata: { noteId: note.id, organizationId, source: context.source, requestId: context.requestId },
    });
    return toClient(note);
  },

  delete(noteId: string, actor: ProviderContext, context: ClinicalExecutionContext): true {
    assertPermission(actor, "manage_tasks");
    const note = ScratchNoteRepository.get(noteId);
    // Another clinician's note answers exactly like a missing one: its existence
    // is not this actor's to learn.
    const visible =
      note &&
      practicesFor(actor).includes(note.organizationId) &&
      (note.authorUserId === actor.userId || note.authorUserId === null) &&
      (!note.patientId || canAccessPatient(actor, note.patientId));
    if (!note || !visible) throw new ScratchNoteError(`Scratchpad note not found: ${noteId}`, 404);

    ScratchNoteRepository.delete(noteId);
    AuditRepository.log({
      ...auditActor(actor),
      eventType: "scratchpad_deleted",
      patientId: note.patientId,
      description: `Deleted scratchpad note ${noteId}.`,
      metadata: { noteId, organizationId: note.organizationId, source: context.source, requestId: context.requestId },
    });
    return true;
  },
};
