import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";
import type {
  CareCompletionDeferralReasonCode,
  CareCompletionRuleId,
} from "../../domain/care-completion";

/**
 * The only two things care completion owns.
 *
 * Everything else on the board is projected from records that already exist, so
 * this repository is deliberately small: a personal pin, and a recorded reason
 * that a piece of unresolved work is waiting. Neither is clinical truth, and
 * neither can say a workflow finished.
 */

export class CareCompletionConcurrencyError extends Error {
  readonly serverVersion: number;

  constructor(itemKey: string, serverVersion: number) {
    super(
      `Care-completion deferral version conflict on ${itemKey}: expected version does not match current server version ${serverVersion}`,
    );
    this.name = "CareCompletionConcurrencyError";
    this.serverVersion = serverVersion;
  }
}

export type WorklistPinRecord = {
  id: string;
  organizationId: string;
  userId: string;
  patientId: string;
  pinnedBy: string;
  pinnedAt: string;
  source: string;
  createdAt: string;
  updatedAt: string;
};

export type CareCompletionDeferralRecord = {
  id: string;
  organizationId: string;
  userId: string;
  patientId: string;
  ruleId: CareCompletionRuleId;
  itemKey: string;
  status: "deferred" | "resumed";
  reasonCode: CareCompletionDeferralReasonCode;
  reasonText: string | null;
  deferredBy: string;
  deferredByName: string;
  deferredAt: string;
  resumeAt: string | null;
  encounterId: string | null;
  resolvedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

function pinRow(row: any): WorklistPinRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    patientId: row.patient_id,
    pinnedBy: row.pinned_by,
    pinnedAt: row.pinned_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deferralRow(row: any): CareCompletionDeferralRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    patientId: row.patient_id,
    ruleId: row.rule_id as CareCompletionRuleId,
    itemKey: row.item_key,
    status: row.status,
    reasonCode: row.reason_code as CareCompletionDeferralReasonCode,
    reasonText: row.reason_text ?? null,
    deferredBy: row.deferred_by,
    deferredByName: row.deferred_by_name,
    deferredAt: row.deferred_at,
    resumeAt: row.resume_at ?? null,
    encounterId: row.encounter_id ?? null,
    resolvedAt: row.resolved_at ?? null,
    version: typeof row.version === "number" ? row.version : 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const CareCompletionRepository = {
  /* --- Pins ------------------------------------------------------------- */

  listPins(userId: string): WorklistPinRecord[] {
    return (
      getDatabase()
        .prepare(
          "SELECT * FROM provider_patient_worklist_pins WHERE user_id = ? ORDER BY pinned_at DESC",
        )
        .all(userId) as any[]
    ).map(pinRow);
  },

  getPin(userId: string, patientId: string): WorklistPinRecord | null {
    const row = getDatabase()
      .prepare("SELECT * FROM provider_patient_worklist_pins WHERE user_id = ? AND patient_id = ?")
      .get(userId, patientId) as any;
    return row ? pinRow(row) : null;
  },

  /**
   * Idempotent: pinning an already-pinned patient is not an error and does not
   * move them to the top of the board. A double-click on "Pin" should not
   * reorder somebody's working set.
   */
  pin(input: {
    organizationId: string;
    userId: string;
    patientId: string;
    pinnedBy: string;
    source?: string;
  }): WorklistPinRecord {
    const existing = CareCompletionRepository.getPin(input.userId, input.patientId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const record: WorklistPinRecord = {
      id: `wlp-${randomUUID()}`,
      organizationId: input.organizationId,
      userId: input.userId,
      patientId: input.patientId,
      pinnedBy: input.pinnedBy,
      pinnedAt: now,
      source: input.source || "manual",
      createdAt: now,
      updatedAt: now,
    };

    getDatabase()
      .prepare(
        `INSERT INTO provider_patient_worklist_pins (
          id, organization_id, user_id, patient_id, pinned_by, pinned_at, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.organizationId,
        record.userId,
        record.patientId,
        record.pinnedBy,
        record.pinnedAt,
        record.source,
        record.createdAt,
        record.updatedAt,
      );

    return record;
  },

  unpin(userId: string, patientId: string): boolean {
    const result = getDatabase()
      .prepare("DELETE FROM provider_patient_worklist_pins WHERE user_id = ? AND patient_id = ?")
      .run(userId, patientId);
    return Number(result.changes) > 0;
  },

  /* --- Deferrals -------------------------------------------------------- */

  listDeferrals(userId: string, patientIds: readonly string[]): CareCompletionDeferralRecord[] {
    if (patientIds.length === 0) return [];
    const placeholders = patientIds.map(() => "?").join(", ");
    return (
      getDatabase()
        .prepare(
          `SELECT * FROM care_completion_deferrals
           WHERE user_id = ? AND status = 'deferred' AND patient_id IN (${placeholders})`,
        )
        .all(userId, ...patientIds) as any[]
    ).map(deferralRow);
  },

  getDeferral(
    userId: string,
    patientId: string,
    itemKey: string,
  ): CareCompletionDeferralRecord | null {
    const row = getDatabase()
      .prepare(
        "SELECT * FROM care_completion_deferrals WHERE user_id = ? AND patient_id = ? AND item_key = ?",
      )
      .get(userId, patientId, itemKey) as any;
    return row ? deferralRow(row) : null;
  },

  /**
   * Records or replaces this user's deferral of one work item.
   *
   * `expectedVersion` is optional and enforced when supplied: two windows open
   * on the same board can both be looking at the same deferred item, and the
   * second one to act should be told the reason changed rather than silently
   * overwriting it.
   */
  defer(input: {
    organizationId: string;
    userId: string;
    patientId: string;
    ruleId: CareCompletionRuleId;
    itemKey: string;
    reasonCode: CareCompletionDeferralReasonCode;
    reasonText?: string | null;
    deferredBy: string;
    deferredByName: string;
    resumeAt?: string | null;
    encounterId?: string | null;
    expectedVersion?: number;
  }): CareCompletionDeferralRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = CareCompletionRepository.getDeferral(
      input.userId,
      input.patientId,
      input.itemKey,
    );

    if (existing && input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
      throw new CareCompletionConcurrencyError(input.itemKey, existing.version);
    }

    if (existing) {
      const version = existing.version + 1;
      db.prepare(
        `UPDATE care_completion_deferrals
         SET status = 'deferred', reason_code = ?, reason_text = ?, deferred_by = ?, deferred_by_name = ?,
             deferred_at = ?, resume_at = ?, encounter_id = ?, resolved_at = NULL, version = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        input.reasonCode,
        input.reasonText ?? null,
        input.deferredBy,
        input.deferredByName,
        now,
        input.resumeAt ?? null,
        input.encounterId ?? null,
        version,
        now,
        existing.id,
      );
      return { ...existing, status: "deferred", reasonCode: input.reasonCode, reasonText: input.reasonText ?? null, deferredBy: input.deferredBy, deferredByName: input.deferredByName, deferredAt: now, resumeAt: input.resumeAt ?? null, encounterId: input.encounterId ?? null, resolvedAt: null, version, updatedAt: now };
    }

    const record: CareCompletionDeferralRecord = {
      id: `ccd-${randomUUID()}`,
      organizationId: input.organizationId,
      userId: input.userId,
      patientId: input.patientId,
      ruleId: input.ruleId,
      itemKey: input.itemKey,
      status: "deferred",
      reasonCode: input.reasonCode,
      reasonText: input.reasonText ?? null,
      deferredBy: input.deferredBy,
      deferredByName: input.deferredByName,
      deferredAt: now,
      resumeAt: input.resumeAt ?? null,
      encounterId: input.encounterId ?? null,
      resolvedAt: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    db.prepare(
      `INSERT INTO care_completion_deferrals (
        id, organization_id, user_id, patient_id, rule_id, item_key, status,
        reason_code, reason_text, deferred_by, deferred_by_name, deferred_at,
        resume_at, encounter_id, resolved_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      record.id,
      record.organizationId,
      record.userId,
      record.patientId,
      record.ruleId,
      record.itemKey,
      record.status,
      record.reasonCode,
      record.reasonText,
      record.deferredBy,
      record.deferredByName,
      record.deferredAt,
      record.resumeAt,
      record.encounterId,
      record.resolvedAt,
      record.version,
      record.createdAt,
      record.updatedAt,
    );

    return record;
  },

  /**
   * Resumes a deferred item: the reason is retained as history, but the item
   * returns to pending. Resuming is not completing — completion still has to
   * come from the authoritative workflow.
   */
  resume(
    userId: string,
    patientId: string,
    itemKey: string,
    expectedVersion?: number,
  ): CareCompletionDeferralRecord | null {
    const existing = CareCompletionRepository.getDeferral(userId, patientId, itemKey);
    if (!existing || existing.status !== "deferred") return null;
    if (expectedVersion !== undefined && expectedVersion !== existing.version) {
      throw new CareCompletionConcurrencyError(itemKey, existing.version);
    }

    const now = new Date().toISOString();
    const version = existing.version + 1;
    getDatabase()
      .prepare(
        `UPDATE care_completion_deferrals
         SET status = 'resumed', resolved_at = ?, version = ?, updated_at = ? WHERE id = ?`,
      )
      .run(now, version, now, existing.id);

    return { ...existing, status: "resumed", resolvedAt: now, version, updatedAt: now };
  },

  /** Every user currently pinning this patient. Used only for access cleanup. */
  pinHoldersForPatient(patientId: string): string[] {
    return (
      getDatabase()
        .prepare("SELECT user_id FROM provider_patient_worklist_pins WHERE patient_id = ?")
        .all(patientId) as Array<{ user_id: string }>
    ).map((row) => row.user_id);
  },
};
