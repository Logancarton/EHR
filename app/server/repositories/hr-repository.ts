import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/connection";

/**
 * Storage for per-member HR records (D-086).
 *
 * This layer answers "what is stored" and nothing else. It performs no permission
 * checks on purpose: every caller reaches it through `HRService`, which is where the
 * own-record / other-people's-records boundary lives. A repository that sometimes
 * enforced access would invite callers to assume it always does.
 */

export type HrItemCategory = "insurance" | "license" | "coaching" | "goal" | "other";

export type HrRecordItem = {
  id: string;
  category: HrItemCategory;
  title: string;
  detail: string;
  status: string;
  /** ISO date the item comes due, when it has a deadline at all. */
  dueOn: string | null;
  assignedBy: string;
  updatedAt: string;
  /**
   * Whether a person assigned this item or the development seed authored it. The seed
   * refreshes only its own rows, so an assignment is never silently overwritten by a
   * fixture on the next boot.
   */
  source: "seed" | "assigned";
};

export type HrRecord = {
  id: string;
  organizationId: string;
  userId: string;
  employmentType: string;
  startedOn: string | null;
  assignedBy: string;
  items: HrRecordItem[];
};

const KNOWN_CATEGORIES: ReadonlySet<string> = new Set([
  "insurance",
  "license",
  "coaching",
  "goal",
  "other",
]);

function mapItem(row: any): HrRecordItem {
  return {
    id: row.id,
    // An unrecognized stored category reads as "other" rather than throwing: an item
    // added by a later build should still be visible to the person it belongs to.
    category: (KNOWN_CATEGORIES.has(row.category) ? row.category : "other") as HrItemCategory,
    title: row.title,
    detail: row.detail || "",
    status: row.status || "active",
    dueOn: row.due_on || null,
    assignedBy: row.assigned_by || "",
    updatedAt: row.updated_at,
    // Anything not explicitly seeded counts as somebody's work.
    source: row.source === "seed" ? "seed" : "assigned",
  };
}

export const HRRepository = {
  /** The member's record, or null when the practice has not set one up for them. */
  recordFor(organizationId: string, userId: string): HrRecord | null {
    const db = getDatabase();
    const row = db
      .prepare("SELECT * FROM hr_records WHERE organization_id = ? AND user_id = ?")
      .get(organizationId, userId) as any;
    if (!row) return null;

    const itemRows = db
      .prepare(
        `SELECT * FROM hr_record_items
         WHERE record_id = ?
         ORDER BY CASE WHEN due_on IS NULL THEN 1 ELSE 0 END, due_on, title`,
      )
      .all(row.id) as any[];

    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      employmentType: row.employment_type || "",
      startedOn: row.started_on || null,
      assignedBy: row.assigned_by || "",
      items: itemRows.map(mapItem),
    };
  },

  /** Every member of the organization who has an HR record. */
  recordsFor(organizationId: string): HrRecord[] {
    const rows = getDatabase()
      .prepare("SELECT user_id FROM hr_records WHERE organization_id = ?")
      .all(organizationId) as Array<{ user_id: string }>;
    return rows
      .map((row) => HRRepository.recordFor(organizationId, row.user_id))
      .filter((record): record is HrRecord => record !== null);
  },

  /** A record by its own id, used after a write to return the authoritative result. */
  recordById(recordId: string): HrRecord | null {
    const row = getDatabase()
      .prepare("SELECT organization_id, user_id FROM hr_records WHERE id = ?")
      .get(recordId) as { organization_id?: string; user_id?: string } | undefined;
    if (!row?.organization_id || !row.user_id) return null;
    return HRRepository.recordFor(row.organization_id, row.user_id);
  },

  upsertRecord(input: {
    organizationId: string;
    userId: string;
    employmentType?: string;
    startedOn?: string | null;
    assignedBy: string;
  }): HrRecord {
    const db = getDatabase();
    const now = new Date().toISOString();
    const existing = db
      .prepare("SELECT id FROM hr_records WHERE organization_id = ? AND user_id = ?")
      .get(input.organizationId, input.userId) as { id?: string } | undefined;
    const id = existing?.id ?? `hr-${input.organizationId}-${input.userId}`;

    db.prepare(
      `INSERT INTO hr_records (
         id, organization_id, user_id, employment_type, started_on, assigned_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(organization_id, user_id) DO UPDATE SET
         employment_type = excluded.employment_type,
         started_on = excluded.started_on,
         assigned_by = excluded.assigned_by,
         updated_at = excluded.updated_at`,
    ).run(
      id,
      input.organizationId,
      input.userId,
      input.employmentType ?? "",
      input.startedOn ?? null,
      input.assignedBy,
      now,
      now,
    );

    return HRRepository.recordFor(input.organizationId, input.userId)!;
  },

  addItem(input: {
    recordId: string;
    category: HrItemCategory;
    title: string;
    detail?: string;
    status?: string;
    dueOn?: string | null;
    assignedBy: string;
    source?: "seed" | "assigned";
  }): HrRecordItem {
    const db = getDatabase();
    const now = new Date().toISOString();
    const id = `hri-${randomUUID()}`;
    db.prepare(
      `INSERT INTO hr_record_items (
         id, record_id, category, title, detail, status, due_on, assigned_by, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.recordId,
      input.category,
      input.title,
      input.detail ?? "",
      input.status ?? "active",
      input.dueOn ?? null,
      input.assignedBy,
      input.source ?? "assigned",
      now,
      now,
    );
    return mapItem(
      db.prepare("SELECT * FROM hr_record_items WHERE id = ?").get(id) as any,
    );
  },
};
