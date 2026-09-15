import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import { SignedEncounterDateRepository } from "./signed-encounter-date-repository";
import {
  type BillingChargeRecord,
  type BillingChargeStatus,
  type BillingCoverageBasis,
  type BillingDiagnosisCode,
  type BillingProcedureCode,
} from "../../domain/billing";

/**
 * Durable storage for charge records (roadmap P9-B).
 *
 * The rows here are financial evidence, so the repository does two things the
 * removed React-state prototype could not: it persists, and it refuses. A second
 * preparation for the same encounter is rejected by the table's own uniqueness
 * constraint, and every state change is version-checked, so two people working the
 * same worklist cannot both advance the same charge and both be told it worked.
 */

export class BillingChargeConcurrencyError extends Error {
  readonly serverVersion: number;

  constructor(serverVersion: number) {
    super(
      `Billing charge version conflict: expected version does not match current server version ${serverVersion}. Reload the charge and retry.`,
    );
    this.name = "BillingChargeConcurrencyError";
    this.serverVersion = serverVersion;
  }
}

export class DuplicateBillingChargeError extends Error {
  readonly encounterId: string;
  readonly existingChargeId: string;

  constructor(encounterId: string, existingChargeId: string) {
    super(`A billing charge already exists for encounter ${encounterId}: ${existingChargeId}`);
    this.name = "DuplicateBillingChargeError";
    this.encounterId = encounterId;
    this.existingChargeId = existingChargeId;
  }
}

export type PrepareBillingChargeInput = {
  organizationId: string;
  patientId: string;
  encounterId: string;
  encounterSnapshotSha256: string;
  serviceDate: string;
  procedureCodes: BillingProcedureCode[];
  diagnosisCodes: BillingDiagnosisCode[];
  coverageBasis: BillingCoverageBasis;
  coverageId: string | null;
  coveragePayerName: string | null;
  preparedBy: string;
  preparedByName: string;
};

export type BillingChargeRow = BillingChargeRecord & {
  patientName: string;
  patientMrn: string;
  patientInitials: string;
  encounterType: string;
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asCharge(row: any): BillingChargeRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    encounterSnapshotSha256: row.encounter_snapshot_sha256,
    serviceDate: row.service_date,
    status: row.status as BillingChargeStatus,
    procedureCodes: parseJson<BillingProcedureCode[]>(row.procedure_codes_json, []),
    diagnosisCodes: parseJson<BillingDiagnosisCode[]>(row.diagnosis_codes_json, []),
    coverageBasis: row.coverage_basis as BillingCoverageBasis,
    coverageId: row.coverage_id || null,
    coveragePayerName: row.coverage_payer_name || null,
    preparedBy: row.prepared_by,
    preparedByName: row.prepared_by_name,
    preparedAt: row.prepared_at,
    reviewedBy: row.reviewed_by || null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at || null,
    reviewNote: row.review_note || null,
    voidedBy: row.voided_by || null,
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || null,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function asChargeRow(row: any): BillingChargeRow | null {
  const charge = asCharge(row);
  if (!charge) return null;
  return {
    ...charge,
    patientName: row.patient_name || "",
    patientMrn: row.patient_mrn || "",
    patientInitials: row.patient_initials || "",
    encounterType: row.encounter_type || "",
  };
}

/**
 * Cross-patient financial listings must be narrowed to the caller's reachable
 * population before a row is returned. `undefined` means "no narrowing asked for";
 * an empty list means "this actor reaches nothing" and must return nothing rather
 * than everything — the same distinction `PracticeQueueRepository` makes.
 */
function scopeClause(column: string, patientIds: readonly string[] | undefined) {
  if (!patientIds) return { sql: "", params: [] as string[] };
  if (patientIds.length === 0) return { sql: " AND 1 = 0", params: [] as string[] };
  return {
    sql: ` AND ${column} IN (${patientIds.map(() => "?").join(", ")})`,
    params: [...patientIds],
  };
}

export const BillingRepository = {
  getById(id: string): BillingChargeRecord | null {
    return asCharge(getDatabase().prepare("SELECT * FROM billing_charges WHERE id = ?").get(id));
  },

  getByEncounterId(encounterId: string): BillingChargeRecord | null {
    return asCharge(
      getDatabase().prepare("SELECT * FROM billing_charges WHERE encounter_id = ?").get(encounterId),
    );
  },

  prepare(input: PrepareBillingChargeInput): BillingChargeRecord {
    const db = getDatabase();
    const existing = this.getByEncounterId(input.encounterId);
    if (existing) throw new DuplicateBillingChargeError(input.encounterId, existing.id);

    const id = `chg-${randomUUID()}`;
    const at = new Date().toISOString();

    try {
      db.prepare(`
        INSERT INTO billing_charges (
          id, organization_id, patient_id, encounter_id, encounter_snapshot_sha256, service_date,
          status, procedure_codes_json, diagnosis_codes_json, coverage_basis, coverage_id,
          coverage_payer_name, prepared_by, prepared_by_name, prepared_at, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        input.organizationId,
        input.patientId,
        input.encounterId,
        input.encounterSnapshotSha256,
        input.serviceDate,
        JSON.stringify(input.procedureCodes),
        JSON.stringify(input.diagnosisCodes),
        input.coverageBasis,
        input.coverageId,
        input.coveragePayerName,
        input.preparedBy,
        input.preparedByName,
        at,
        at,
        at,
      );
    } catch (error) {
      // The unique index is the real guard: a concurrent preparation that passed the
      // read above still loses here, and loses as a duplicate rather than as a
      // generic write failure the caller might report as success.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("UNIQUE") || message.includes("constraint")) {
        const winner = this.getByEncounterId(input.encounterId);
        throw new DuplicateBillingChargeError(input.encounterId, winner?.id ?? "unknown");
      }
      throw error;
    }

    const created = this.getById(id);
    if (!created) throw new Error(`Billing charge ${id} could not be read back after preparation.`);
    return created;
  },

  review(
    id: string,
    reviewer: { userId: string; displayName: string },
    options: { note?: string; expectedVersion?: number } = {},
  ): BillingChargeRecord {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) throw new Error(`Billing charge not found: ${id}`);
    if (options.expectedVersion !== undefined && existing.version !== options.expectedVersion) {
      throw new BillingChargeConcurrencyError(existing.version);
    }

    const at = new Date().toISOString();
    const nextVersion = existing.version + 1;
    const result = db.prepare(`
      UPDATE billing_charges
      SET status = 'reviewed', reviewed_by = ?, reviewed_by_name = ?, reviewed_at = ?, review_note = ?,
          version = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(
      reviewer.userId,
      reviewer.displayName,
      at,
      options.note ?? null,
      nextVersion,
      at,
      id,
      existing.version,
    );

    // A zero-row update means another writer moved first. Reporting success here is
    // exactly the failure mode P9-0 exists to remove, so it is raised instead.
    if (Number(result.changes) === 0) {
      throw new BillingChargeConcurrencyError(this.getById(id)?.version ?? existing.version);
    }

    return this.getById(id)!;
  },

  void(
    id: string,
    actor: { userId: string; displayName: string },
    options: { reason: string; expectedVersion?: number },
  ): BillingChargeRecord {
    const db = getDatabase();
    const existing = this.getById(id);
    if (!existing) throw new Error(`Billing charge not found: ${id}`);
    if (options.expectedVersion !== undefined && existing.version !== options.expectedVersion) {
      throw new BillingChargeConcurrencyError(existing.version);
    }

    const at = new Date().toISOString();
    const nextVersion = existing.version + 1;
    const result = db.prepare(`
      UPDATE billing_charges
      SET status = 'void', voided_by = ?, voided_at = ?, void_reason = ?, version = ?, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(actor.userId, at, options.reason, nextVersion, at, id, existing.version);

    if (Number(result.changes) === 0) {
      throw new BillingChargeConcurrencyError(this.getById(id)?.version ?? existing.version);
    }

    return this.getById(id)!;
  },

  listCharges(options: {
    patientIds?: readonly string[];
    organizationId?: string;
    status?: BillingChargeStatus;
    limit?: number;
  } = {}): BillingChargeRow[] {
    const scope = scopeClause("c.patient_id", options.patientIds);
    const params: any[] = [...scope.params];
    let organizationSql = "";
    if (options.organizationId) {
      organizationSql = " AND c.organization_id = ?";
      params.push(options.organizationId);
    }
    let statusSql = "";
    if (options.status) {
      statusSql = " AND c.status = ?";
      params.push(options.status);
    }
    const limit = Math.max(1, Math.min(options.limit ?? 500, 2000));
    params.push(limit);

    const rows = getDatabase().prepare(`
      SELECT c.*,
             p.name AS patient_name,
             p.mrn AS patient_mrn,
             p.initials AS patient_initials,
             e.type AS encounter_type
      FROM billing_charges c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN encounters e ON e.id = c.encounter_id
      WHERE 1 = 1${scope.sql}${organizationSql}${statusSql}
      ORDER BY c.service_date DESC, c.created_at DESC
      LIMIT ?
    `).all(...params) as any[];

    return rows.map(asChargeRow).filter((row): row is BillingChargeRow => Boolean(row));
  },

  /**
   * Every signed encounter no charge has been prepared from.
   *
   * Deliberately not window-scoped, unlike the activity counts. Unbilled work is a
   * backlog, not a period metric: an encounter signed two months ago that nobody
   * has billed is *more* urgent than one signed yesterday, and a 30-day window
   * would quietly hide it. It is a count of records rather than a dollar figure
   * precisely because the dollar figure is not known.
   *
   * It is also what keeps a legacy row visible. `encounters.signed_at` is not
   * uniformly formatted — demonstration rows seeded before the column was written
   * by the signing path carry a display date like "Aug 08, 2026" rather than an ISO
   * timestamp, and signed encounters are immutable, so they cannot be normalised in
   * place. Those rows sort outside any ISO window and would disappear from a
   * windowed query. Everything the application itself signs writes ISO.
   */
  signedEncountersAwaitingCharge(options: {
    patientIds?: readonly string[];
    limit?: number;
  }): Array<{
    encounterId: string;
    patientId: string;
    patientName: string;
    patientMrn: string;
    patientInitials: string;
    encounterType: string;
    serviceDate: string;
    signedAt: string;
    signedBy: string;
    cptCode: string;
  }> {
    const scope = scopeClause("e.patient_id", options.patientIds);
    const limit = Math.max(1, Math.min(options.limit ?? 500, 2000));

    const rows = getDatabase().prepare(`
      SELECT e.id AS encounter_id, e.patient_id, e.type AS encounter_type, e.date AS service_date,
             e.signed_at, e.signed_by, e.cpt_code,
             p.name AS patient_name, p.mrn AS patient_mrn, p.initials AS patient_initials
      FROM encounters e
      JOIN patients p ON p.id = e.patient_id
      LEFT JOIN billing_charges c ON c.encounter_id = e.id
      WHERE e.status = 'signed'
        AND c.id IS NULL${scope.sql}
      ORDER BY e.signed_at DESC
      LIMIT ?
    `).all(...scope.params, limit) as any[];

    return rows.map((row) => ({
      encounterId: row.encounter_id,
      patientId: row.patient_id,
      patientName: row.patient_name || "",
      patientMrn: row.patient_mrn || "",
      patientInitials: row.patient_initials || "",
      encounterType: row.encounter_type || "",
      serviceDate: row.service_date || "",
      signedAt: row.signed_at || "",
      signedBy: row.signed_by || "",
      cptCode: row.cpt_code || "",
    }));
  },

  /**
   * Raw counts for the summary.
   *
   * Three scopes, and they are different on purpose.
   *
   * - Charge activity is taken over the stated window, against `prepared_at`,
   *   which this product writes and is therefore always an ISO instant.
   * - The signed-encounter denominator is taken over the window through the
   *   normalized date projection rather than against `encounters.signed_at`
   *   directly. That column is not uniformly formatted and a string comparison
   *   drops the display-formatted rows without saying so.
   * - The unbilled backlog is not windowed at all, for the reason
   *   `signedEncountersAwaitingCharge` gives.
   *
   * `signedEncountersUnplaceable` travels with the denominator. A window that
   * excludes records must disclose how many it could not place, or the figure is
   * unverifiable.
   */
  counts(options: { patientIds?: readonly string[]; since: string; until: string }): {
    signedEncounters: number;
    signedEncountersUnplaceable: number;
    chargesPrepared: number;
    chargesReviewed: number;
    chargesVoided: number;
    encountersAwaitingCharge: number;
  } {
    const db = getDatabase();
    // Self-healing: a note signed since the last read is projected before it is
    // counted, so the denominator cannot silently fall behind the chart.
    SignedEncounterDateRepository.refresh();

    const encounterScope = scopeClause("e.patient_id", options.patientIds);
    const chargeScope = scopeClause("c.patient_id", options.patientIds);
    const projectionScope = scopeClause("d.patient_id", options.patientIds);

    const signed = db.prepare(`
      SELECT COUNT(*) AS total
      FROM encounter_signed_at_projection d
      WHERE d.signed_at_iso IS NOT NULL
        AND d.signed_at_iso >= ? AND d.signed_at_iso <= ?${projectionScope.sql}
    `).get(options.since, options.until, ...projectionScope.params) as any;

    const charges = db.prepare(`
      SELECT
        SUM(CASE WHEN c.status = 'prepared' THEN 1 ELSE 0 END) AS prepared,
        SUM(CASE WHEN c.status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
        SUM(CASE WHEN c.status = 'void' THEN 1 ELSE 0 END) AS voided
      FROM billing_charges c
      WHERE c.prepared_at >= ? AND c.prepared_at <= ?${chargeScope.sql}
    `).get(options.since, options.until, ...chargeScope.params) as any;

    const awaiting = db.prepare(`
      SELECT COUNT(*) AS total
      FROM encounters e
      LEFT JOIN billing_charges c ON c.encounter_id = e.id
      WHERE e.status = 'signed' AND c.id IS NULL${encounterScope.sql}
    `).get(...encounterScope.params) as any;

    return {
      signedEncounters: Number(signed?.total || 0),
      signedEncountersUnplaceable: SignedEncounterDateRepository.unplaceableCount(options.patientIds),
      chargesPrepared: Number(charges?.prepared || 0),
      chargesReviewed: Number(charges?.reviewed || 0),
      chargesVoided: Number(charges?.voided || 0),
      encountersAwaitingCharge: Number(awaiting?.total || 0),
    };
  },
};
