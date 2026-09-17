import { getDatabase } from "../db/connection";
import type { ProspectivePerson, ProspectivePersonStatus, PromotionKind } from "../../domain/prospective-person";

function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function identifier(): string {
  return `prospect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function projection(r: any): ProspectivePerson {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    dob: text(r.dob),
    mobilePhone: text(r.mobile_phone),
    email: text(r.email),
    status: (r.status as ProspectivePersonStatus) || "active",
    promotedPatientId: text(r.promoted_patient_id),
    promotedAt: text(r.promoted_at),
    promotedBy: text(r.promoted_by),
    promotionKind: text(r.promotion_kind) as PromotionKind | undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type CreateProspectivePersonInput = {
  organizationId: string;
  name: string;
  dob?: string;
  mobilePhone?: string;
  email?: string;
};

export const ProspectivePersonRepository = {
  getById(id: string): ProspectivePerson | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM prospective_persons WHERE id = ?`).get(id) as any;
    return row ? projection(row) : null;
  },

  create(input: CreateProspectivePersonInput): ProspectivePerson {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier();
    db.prepare(
      `INSERT INTO prospective_persons (
        id, organization_id, name, dob, mobile_phone, email, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,'active',?,?)`,
    ).run(id, input.organizationId, input.name, input.dob ?? null, input.mobilePhone ?? null, input.email ?? null, at, at);
    return this.getById(id)!;
  },

  update(id: string, patch: { name?: string; dob?: string; mobilePhone?: string; email?: string }): ProspectivePerson | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const db = getDatabase();
    const merged = { ...existing, ...patch };
    db.prepare(
      `UPDATE prospective_persons SET name = ?, dob = ?, mobile_phone = ?, email = ?, updated_at = ? WHERE id = ?`,
    ).run(merged.name, merged.dob ?? null, merged.mobilePhone ?? null, merged.email ?? null, new Date().toISOString(), id);
    return this.getById(id);
  },

  /** Front-office candidates for possible-duplicate matching, scoped to one organization. */
  listActiveByOrganization(organizationId: string): ProspectivePerson[] {
    const db = getDatabase();
    const rows = db
      .prepare(`SELECT * FROM prospective_persons WHERE organization_id = ? AND status = 'active' ORDER BY created_at DESC`)
      .all(organizationId) as any[];
    return rows.map(projection);
  },

  markPromoted(
    id: string,
    input: { promotedPatientId: string; promotedBy: string; promotionKind: PromotionKind },
  ): ProspectivePerson | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const db = getDatabase();
    const at = new Date().toISOString();
    db.prepare(
      `UPDATE prospective_persons SET
        status = 'promoted', promoted_patient_id = ?, promoted_at = ?, promoted_by = ?, promotion_kind = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.promotedPatientId, at, input.promotedBy, input.promotionKind, at, id);
    return this.getById(id);
  },
};
