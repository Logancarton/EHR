import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import type { ReleaseAuthorization, ReleaseCategory, ReleaseDraft, ReleaseStatus } from "../../domain/release-authorizations";

function projection(r: any): ReleaseAuthorization {
  const text = (value: unknown) => (value === null || value === undefined ? undefined : String(value));
  return {
    id: r.id,
    patientId: r.patient_id,
    direction: r.direction,
    partyName: r.party_name,
    partyOrganization: text(r.party_organization),
    partyPhone: text(r.party_phone),
    partyFax: text(r.party_fax),
    partyAddress: text(r.party_address),
    categories: JSON.parse(r.categories_json) as ReleaseCategory[],
    purpose: r.purpose,
    expiresOn: r.expires_on,
    authorizationText: r.authorization_text,
    status: r.status as ReleaseStatus,
    invitationId: text(r.invitation_id),
    signedAt: text(r.signed_at),
    signerName: text(r.signer_name),
    revokedAt: text(r.revoked_at),
    revokedByName: text(r.revoked_by_name),
    revocationNote: text(r.revocation_note),
    createdAt: r.created_at,
    createdByName: r.created_by_name,
  };
}

export const ReleaseAuthorizationRepository = {
  create(input: ReleaseDraft & { patientId: string; authorizationText: string; createdById: string; createdByName: string }): ReleaseAuthorization {
    const db = getDatabase();
    const id = `roi-${randomUUID()}`;
    db.prepare(`
      INSERT INTO release_authorizations (
        id, patient_id, direction, party_name, party_organization, party_phone, party_fax, party_address,
        categories_json, purpose, expires_on, authorization_text, status, created_by_id, created_by_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?)
    `).run(
      id, input.patientId, input.direction, input.partyName, input.partyOrganization ?? null, input.partyPhone ?? null,
      input.partyFax ?? null, input.partyAddress ?? null, JSON.stringify(input.categories), input.purpose, input.expiresOn,
      input.authorizationText, input.createdById, input.createdByName, new Date().toISOString(),
    );
    return this.get(id)!;
  },

  get(id: string): ReleaseAuthorization | null {
    const row = getDatabase().prepare(`SELECT * FROM release_authorizations WHERE id = ?`).get(id);
    return row ? projection(row) : null;
  },

  listForPatient(patientId: string): ReleaseAuthorization[] {
    return (getDatabase()
      .prepare(`SELECT * FROM release_authorizations WHERE patient_id = ? ORDER BY created_at DESC`)
      .all(patientId) as any[]).map(projection);
  },

  linkInvitation(ids: readonly string[], invitationId: string): void {
    const statement = getDatabase().prepare(`UPDATE release_authorizations SET invitation_id = ? WHERE id = ?`);
    for (const id of ids) statement.run(invitationId, id);
  },

  /** Records the patient's signature on a still-requested release. Returns false if it was not open. */
  sign(id: string, input: { signerName: string; method: string }): boolean {
    const result = getDatabase()
      .prepare(`UPDATE release_authorizations SET status = 'signed', signed_at = ?, signer_name = ?, signature_method = ? WHERE id = ? AND status = 'requested'`)
      .run(new Date().toISOString(), input.signerName, input.method, id);
    return Number(result.changes) > 0;
  },

  revoke(id: string, input: { byName: string; note: string }): boolean {
    const result = getDatabase()
      .prepare(`UPDATE release_authorizations SET status = 'revoked', revoked_at = ?, revoked_by_name = ?, revocation_note = ? WHERE id = ? AND status != 'revoked'`)
      .run(new Date().toISOString(), input.byName, input.note, id);
    return Number(result.changes) > 0;
  },
};
