import { getDatabase } from "../db/connection";
import {
  type CareNetworkMember,
  type CareNetworkRole,
  type ContactConsentScope,
  type CoveragePolicy,
  type CoverageStatus,
  type CoverageType,
  type PatientPharmacy,
  type RelatedPerson,
  type RelatedPersonRole,
} from "../../domain/patient-administration";

/**
 * Related people and the outside care network.
 *
 * Both are their own rows rather than columns on the patient, because a chart can
 * carry two guardians, a legal representative, a caregiver and a school counsellor
 * at once — routine in adolescent psychiatry — and because each of them needs an
 * independent disclosure scope.
 *
 * Rows are retired by status rather than deleted: who was authorised to be told
 * what, and when that changed, is part of the record.
 */

export type RelatedPersonInput = {
  patientId: string;
  role: RelatedPersonRole;
  name: string;
  relationship?: string;
  phone?: string;
  alternatePhone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  consentScope?: ContactConsentScope;
  priority?: number;
  notes?: string;
};

export type RelatedPersonPatch = Partial<Omit<RelatedPersonInput, "patientId">> & {
  status?: "active" | "inactive";
};

export type CareNetworkInput = {
  patientId: string;
  role: CareNetworkRole;
  name: string;
  organization?: string;
  phone?: string;
  fax?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  npi?: string;
  relationshipNote?: string;
};

export type CareNetworkPatch = Partial<Omit<CareNetworkInput, "patientId">> & {
  status?: "active" | "inactive";
};

function text(value: unknown): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : undefined;
}

function relatedPersonProjection(r: any): RelatedPerson {
  return {
    id: r.id,
    patientId: r.patient_id,
    role: r.role as RelatedPersonRole,
    relationship: text(r.relationship),
    name: r.name,
    phone: text(r.phone),
    alternatePhone: text(r.alternate_phone),
    email: text(r.email),
    addressLine1: text(r.address_line1),
    city: text(r.city),
    state: text(r.state),
    postalCode: text(r.postal_code),
    consentScope: (r.consent_scope as ContactConsentScope) || "none",
    priority: Number(r.priority) || 1,
    notes: text(r.notes),
    status: r.status === "inactive" ? "inactive" : "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function careNetworkProjection(r: any): CareNetworkMember {
  return {
    id: r.id,
    patientId: r.patient_id,
    role: r.role as CareNetworkRole,
    name: r.name,
    organization: text(r.organization),
    phone: text(r.phone),
    fax: text(r.fax),
    email: text(r.email),
    addressLine1: text(r.address_line1),
    city: text(r.city),
    state: text(r.state),
    postalCode: text(r.postal_code),
    npi: text(r.npi),
    relationshipNote: text(r.relationship_note),
    status: r.status === "inactive" ? "inactive" : "active",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const PatientAdministrationRepository = {
  listRelatedPeople(patientId: string, includeInactive = false): RelatedPerson[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT * FROM patient_related_people
         WHERE patient_id = ?${includeInactive ? "" : " AND status = 'active'"}
         ORDER BY priority ASC, created_at ASC`,
      )
      .all(patientId) as any[];
    return rows.map(relatedPersonProjection);
  },

  getRelatedPerson(id: string): RelatedPerson | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM patient_related_people WHERE id = ?`).get(id) as any;
    return row ? relatedPersonProjection(row) : null;
  },

  addRelatedPerson(input: RelatedPersonInput): RelatedPerson {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("rel");
    db.prepare(
      `INSERT INTO patient_related_people (
        id, patient_id, role, relationship, name, phone, alternate_phone, email,
        address_line1, city, state, postal_code, consent_scope, priority, notes, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
    ).run(
      id,
      input.patientId,
      input.role,
      input.relationship ?? null,
      input.name,
      input.phone ?? null,
      input.alternatePhone ?? null,
      input.email ?? null,
      input.addressLine1 ?? null,
      input.city ?? null,
      input.state ?? null,
      input.postalCode ?? null,
      input.consentScope ?? "none",
      input.priority ?? 1,
      input.notes ?? null,
      at,
      at,
    );
    return this.getRelatedPerson(id)!;
  },

  updateRelatedPerson(id: string, patch: RelatedPersonPatch): RelatedPerson | null {
    const existing = this.getRelatedPerson(id);
    if (!existing) return null;
    const db = getDatabase();
    const merged = { ...existing, ...patch };
    db.prepare(
      `UPDATE patient_related_people SET
        role=?, relationship=?, name=?, phone=?, alternate_phone=?, email=?,
        address_line1=?, city=?, state=?, postal_code=?, consent_scope=?, priority=?, notes=?, status=?, updated_at=?
       WHERE id = ?`,
    ).run(
      merged.role,
      merged.relationship ?? null,
      merged.name,
      merged.phone ?? null,
      merged.alternatePhone ?? null,
      merged.email ?? null,
      merged.addressLine1 ?? null,
      merged.city ?? null,
      merged.state ?? null,
      merged.postalCode ?? null,
      merged.consentScope,
      merged.priority,
      merged.notes ?? null,
      merged.status,
      new Date().toISOString(),
      id,
    );
    return this.getRelatedPerson(id);
  },

  listCareNetwork(patientId: string, includeInactive = false): CareNetworkMember[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT * FROM patient_care_network
         WHERE patient_id = ?${includeInactive ? "" : " AND status = 'active'"}
         ORDER BY created_at ASC`,
      )
      .all(patientId) as any[];
    return rows.map(careNetworkProjection);
  },

  getCareNetworkMember(id: string): CareNetworkMember | null {
    const db = getDatabase();
    const row = db.prepare(`SELECT * FROM patient_care_network WHERE id = ?`).get(id) as any;
    return row ? careNetworkProjection(row) : null;
  },

  addCareNetworkMember(input: CareNetworkInput): CareNetworkMember {
    const db = getDatabase();
    const at = new Date().toISOString();
    const id = identifier("care");
    db.prepare(
      `INSERT INTO patient_care_network (
        id, patient_id, role, name, organization, phone, fax, email,
        address_line1, city, state, postal_code, npi, relationship_note, status, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`,
    ).run(
      id,
      input.patientId,
      input.role,
      input.name,
      input.organization ?? null,
      input.phone ?? null,
      input.fax ?? null,
      input.email ?? null,
      input.addressLine1 ?? null,
      input.city ?? null,
      input.state ?? null,
      input.postalCode ?? null,
      input.npi ?? null,
      input.relationshipNote ?? null,
      at,
      at,
    );
    return this.getCareNetworkMember(id)!;
  },

  updateCareNetworkMember(id: string, patch: CareNetworkPatch): CareNetworkMember | null {
    const existing = this.getCareNetworkMember(id);
    if (!existing) return null;
    const db = getDatabase();
    const merged = { ...existing, ...patch };
    db.prepare(
      `UPDATE patient_care_network SET
        role=?, name=?, organization=?, phone=?, fax=?, email=?,
        address_line1=?, city=?, state=?, postal_code=?, npi=?, relationship_note=?, status=?, updated_at=?
       WHERE id = ?`,
    ).run(
      merged.role,
      merged.name,
      merged.organization ?? null,
      merged.phone ?? null,
      merged.fax ?? null,
      merged.email ?? null,
      merged.addressLine1 ?? null,
      merged.city ?? null,
      merged.state ?? null,
      merged.postalCode ?? null,
      merged.npi ?? null,
      merged.relationshipNote ?? null,
      merged.status,
      new Date().toISOString(),
      id,
    );
    return this.getCareNetworkMember(id);
  },

  /**
   * Coverage for one chart, primary first. Terminated and errored policies stay
   * readable: a claim filed last month went somewhere, and that has to be
   * reconstructable.
   */
  listCoverage(patientId: string): CoveragePolicy[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT * FROM insurance_policies
         WHERE patient_id = ?
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, coverage_priority ASC, created_at ASC`,
      )
      .all(patientId) as any[];

    return rows.map((r) => ({
      id: r.id,
      patientId: r.patient_id,
      payerName: r.payer_name,
      planName: text(r.plan_name),
      memberId: text(r.member_id),
      groupNumber: text(r.group_number),
      subscriberName: text(r.subscriber_name),
      subscriberDob: text(r.subscriber_dob),
      relationship: text(r.relationship),
      coverageType: (text(r.coverage_type) as CoverageType) || "commercial",
      isSelfPay: Number(r.is_self_pay) === 1,
      priority: Number(r.coverage_priority) || 1,
      status: (text(r.status) as CoverageStatus) || "active",
      effectiveDate: text(r.effective_date),
      terminationDate: text(r.termination_date),
    }));
  },

  /** The pharmacies this patient uses, preferred destination first. */
  listPharmacies(patientId: string, includeInactive = false): PatientPharmacy[] {
    const db = getDatabase();
    const rows = db
      .prepare(
        `SELECT p.*, link.priority AS link_priority, link.status AS link_status
         FROM patient_pharmacies link
         JOIN pharmacies p ON p.id = link.pharmacy_id
         WHERE link.patient_id = ?${includeInactive ? "" : " AND link.status = 'active'"}
         ORDER BY link.priority ASC, p.name ASC`,
      )
      .all(patientId) as any[];

    return rows.map((r) => ({
      pharmacyId: r.id,
      name: r.name,
      ncpdpId: text(r.ncpdp_id),
      phone: text(r.phone),
      fax: text(r.fax),
      addressLine1: text(r.address_line1),
      city: text(r.city),
      state: text(r.state),
      postalCode: text(r.postal_code),
      priority: Number(r.link_priority) || 1,
      status: r.link_status === "inactive" ? "inactive" : "active",
    }));
  },

  /** True when another patient already holds this MRN. */
  mrnTakenByAnotherPatient(mrn: string, patientId?: string): boolean {
    const db = getDatabase();
    const row = db.prepare(`SELECT id FROM patients WHERE mrn = ?`).get(mrn) as { id?: string } | undefined;
    return Boolean(row?.id && row.id !== patientId);
  },
};
