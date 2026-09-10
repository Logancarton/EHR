import { getDatabase } from "../db/connection";
import { DEFAULT_ORGANIZATION_ID } from "../db/migrations";
import type {
  OrganizationMembership,
  OrganizationMembershipStatus,
  PatientAccessScope,
} from "../../lib/patient-access-policy";

export type Organization = {
  id: string;
  name: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

function isMembershipStatus(value: unknown): value is OrganizationMembershipStatus {
  return value === "active" || value === "suspended" || value === "revoked";
}

function isAccessScope(value: unknown): value is PatientAccessScope {
  return value === "organization" || value === "assigned";
}

function mapMembership(row: any): OrganizationMembership {
  if (!isMembershipStatus(row.status)) {
    throw new Error(`Invalid stored organization membership status for ${row.id}.`);
  }
  if (!isAccessScope(row.patient_access_scope)) {
    throw new Error(`Invalid stored patient access scope for ${row.id}.`);
  }
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    status: row.status,
    patientAccessScope: row.patient_access_scope,
  };
}

export const OrganizationRepository = {
  defaultOrganizationId(): string {
    return DEFAULT_ORGANIZATION_ID;
  },

  getOrganization(id: string): Organization | null {
    const row = getDatabase().prepare("SELECT * FROM organizations WHERE id = ?").get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      status: row.status === "inactive" ? "inactive" : "active",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  createOrganization(id: string, name: string): Organization {
    const now = new Date().toISOString();
    getDatabase().prepare(`
      INSERT OR IGNORE INTO organizations (id, name, status, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?)
    `).run(id, name, now, now);
    const created = this.getOrganization(id);
    if (!created) throw new Error(`Organization ${id} could not be created.`);
    return created;
  },

  /**
   * Membership is the durable authority record. It is intentionally separate from
   * the `team_members` role: revoking membership removes patient reach without
   * changing what kind of clinician the person is.
   */
  upsertMembership(input: {
    organizationId: string;
    userId: string;
    status?: OrganizationMembershipStatus;
    patientAccessScope?: PatientAccessScope;
  }): OrganizationMembership {
    const db = getDatabase();
    const now = new Date().toISOString();
    const status = input.status ?? "active";
    const scope = input.patientAccessScope ?? "organization";
    db.prepare(`
      INSERT INTO organization_memberships (
        id, organization_id, user_id, status, patient_access_scope, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        status = excluded.status,
        patient_access_scope = excluded.patient_access_scope,
        updated_at = excluded.updated_at
    `).run(
      `membership-${input.organizationId}-${input.userId}`,
      input.organizationId,
      input.userId,
      status,
      scope,
      now,
      now,
    );
    return { organizationId: input.organizationId, userId: input.userId, status, patientAccessScope: scope };
  },

  membershipsForUser(userId: string): OrganizationMembership[] {
    const rows = getDatabase()
      .prepare(`
        SELECT m.* FROM organization_memberships m
        JOIN organizations o ON o.id = m.organization_id
        WHERE m.user_id = ? AND o.status = 'active'
      `)
      .all(userId) as any[];
    return rows.map(mapMembership);
  },

  organizationForPatient(patientId: string): string | null {
    const row = getDatabase()
      .prepare("SELECT organization_id FROM patient_organizations WHERE patient_id = ?")
      .get(patientId) as { organization_id?: string } | undefined;
    return row?.organization_id || null;
  },

  assignPatientToOrganization(patientId: string, organizationId: string): void {
    getDatabase().prepare(`
      INSERT INTO patient_organizations (patient_id, organization_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT (patient_id) DO NOTHING
    `).run(patientId, organizationId, new Date().toISOString());
  },

  /** Patient ids explicitly linked to a user's care team. */
  assignedPatientIds(userId: string): string[] {
    const rows = getDatabase()
      .prepare("SELECT patient_id FROM team_member_patients WHERE user_id = ?")
      .all(userId) as Array<{ patient_id: string }>;
    return rows.map((row) => row.patient_id);
  },

  /**
   * Resolves the exact patient population a user may reach, as a single query, so
   * roster/queue/search surfaces narrow at the database rather than post-filtering
   * a full load.
   */
  accessiblePatientIds(input: {
    userId: string;
    organizationIds: readonly string[];
    assignedScopeOrganizationIds: readonly string[];
  }): string[] {
    const db = getDatabase();
    const ids = new Set<string>();

    if (input.organizationIds.length > 0) {
      const placeholders = input.organizationIds.map(() => "?").join(", ");
      const rows = db
        .prepare(`SELECT patient_id FROM patient_organizations WHERE organization_id IN (${placeholders})`)
        .all(...input.organizationIds) as Array<{ patient_id: string }>;
      for (const row of rows) ids.add(row.patient_id);
    }

    if (input.assignedScopeOrganizationIds.length > 0) {
      const placeholders = input.assignedScopeOrganizationIds.map(() => "?").join(", ");
      const rows = db
        .prepare(`
          SELECT po.patient_id FROM patient_organizations po
          JOIN team_member_patients tmp ON tmp.patient_id = po.patient_id
          WHERE po.organization_id IN (${placeholders}) AND tmp.user_id = ?
        `)
        .all(...input.assignedScopeOrganizationIds, input.userId) as Array<{ patient_id: string }>;
      for (const row of rows) ids.add(row.patient_id);
    }

    return [...ids];
  },
};
