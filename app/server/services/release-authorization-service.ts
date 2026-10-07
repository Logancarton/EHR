import { assertPermission, providerLabel, type ProviderContext } from "../auth/provider-context";
import { assertPatientAccess } from "../auth/patient-access";
import { AuditRepository } from "../repositories/audit-repository";
import { IntakeRepository } from "../repositories/intake-repository";
import { ReleaseAuthorizationRepository } from "../repositories/release-authorization-repository";
import { releaseStatus, releaseTitle, type ReleaseAuthorization } from "../../domain/release-authorizations";
import type { ClinicalExecutionContext } from "./clinical-service";

export class ReleaseAuthorizationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Where a release stands for the chart: signed and in force, waiting on the
 * patient, never signed (its link closed), revoked, or expired.
 */
export type ReleaseDisplayStatus = "active" | "awaiting-signature" | "unsigned" | "revoked" | "expired";

export type ReleaseSummary = ReleaseAuthorization & { title: string; displayStatus: ReleaseDisplayStatus };

function summarize(release: ReleaseAuthorization, today: string): ReleaseSummary {
  const status = releaseStatus(release, today);
  let displayStatus: ReleaseDisplayStatus =
    status === "signed" ? "active" : status === "revoked" ? "revoked" : status === "expired" ? "expired" : "awaiting-signature";
  if (displayStatus === "awaiting-signature" && release.invitationId) {
    const invitation = IntakeRepository.getPortalInvitationById(release.invitationId);
    if (invitation && invitation.status !== "pending" && invitation.status !== "accessed") displayStatus = "unsigned";
  }
  return { ...release, title: releaseTitle(release), displayStatus };
}

export const releaseAuthorizationService = {
  list(actor: ProviderContext, patientId: string): ReleaseSummary[] {
    assertPatientAccess(actor, patientId);
    const today = new Date().toISOString().slice(0, 10);
    return ReleaseAuthorizationRepository.listForPatient(patientId).map((release) => summarize(release, today));
  },

  /**
   * Records that the patient revoked a release (in writing, per the
   * authorization's own terms). Information already shared under it stays
   * shared; from now on the practice must not act on it.
   */
  revoke(
    actor: ProviderContext,
    context: ClinicalExecutionContext,
    input: { patientId: string; releaseId: string; note: string },
  ): ReleaseSummary {
    assertPermission(actor, "edit_patient");
    assertPatientAccess(actor, input.patientId);
    const release = ReleaseAuthorizationRepository.get(input.releaseId);
    if (!release || release.patientId !== input.patientId) throw new ReleaseAuthorizationError("Release not found for this chart.", 404);
    const note = input.note.trim();
    if (!note) throw new ReleaseAuthorizationError("Say how the patient revoked it, for example 'Written request received 10/7'.");
    if (!ReleaseAuthorizationRepository.revoke(release.id, { byName: providerLabel(actor), note })) {
      throw new ReleaseAuthorizationError("This release is already revoked.", 409);
    }
    AuditRepository.log({
      userId: actor.userId,
      userName: providerLabel(actor),
      userRole: actor.role,
      eventType: "release_authorization_revoked",
      patientId: input.patientId,
      description: `Recorded revocation of ${releaseTitle(release)}.`,
      metadata: { releaseId: release.id, note, source: context.source, requestId: context.requestId },
    });
    return summarize(ReleaseAuthorizationRepository.get(release.id)!, new Date().toISOString().slice(0, 10));
  },
};
