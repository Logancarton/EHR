/**
 * Test fixture for the patient-access boundary.
 *
 * Production actors always originate from an authoritative `team_members` record and
 * an organization membership. Tests that construct a `ProviderContext` literal skip
 * both, so they must declare the same facts explicitly rather than being exempted
 * from the boundary they are exercising.
 *
 * Import this only after the test has chdir'd into its isolated database root.
 */
export async function grantSyntheticOrganizationAccess(
  userIds: readonly string[],
  options: { organizationId?: string; patientAccessScope?: "organization" | "assigned"; role?: string } = {},
): Promise<string> {
  const [{ getDatabase }, { OrganizationRepository }] = await Promise.all([
    import("../../app/server/db/connection"),
    import("../../app/server/repositories/organization-repository"),
  ]);

  const organizationId = options.organizationId ?? OrganizationRepository.defaultOrganizationId();
  if (!OrganizationRepository.getOrganization(organizationId)) {
    OrganizationRepository.createOrganization(organizationId, `Synthetic Organization ${organizationId}`);
  }

  const db = getDatabase();
  const now = new Date().toISOString();
  const insertMember = db.prepare(`
    INSERT OR IGNORE INTO team_members (
      id, display_name, credentials, role, initials, presence, active, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, 'SY', 'offline', 1, ?, ?)
  `);

  for (const userId of userIds) {
    insertMember.run(userId, `Synthetic ${userId}`, options.role ?? "provider", now, now);
    OrganizationRepository.upsertMembership({
      organizationId,
      userId,
      patientAccessScope: options.patientAccessScope ?? "organization",
    });
  }

  return organizationId;
}

/** Places already-created synthetic patients under a specific organization. */
export async function assignSyntheticPatients(
  patientIds: readonly string[],
  organizationId: string,
): Promise<void> {
  const [{ getDatabase }] = await Promise.all([import("../../app/server/db/connection")]);
  const db = getDatabase();
  const now = new Date().toISOString();
  const assign = db.prepare(`
    INSERT INTO patient_organizations (patient_id, organization_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT (patient_id) DO UPDATE SET organization_id = excluded.organization_id
  `);
  for (const patientId of patientIds) assign.run(patientId, organizationId, now);
}
