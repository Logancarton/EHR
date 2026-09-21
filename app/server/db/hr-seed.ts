import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_ORGANIZATION_ID } from "./migrations";

/**
 * Synthetic HR records for the development practice (D-086).
 *
 * Fictional throughout, and deliberately so: personnel data carries its own legal
 * obligations, and real employee material is prohibited here for the same reason real
 * PHI is. License numbers are not invented — a made-up DEA number that looks real is
 * worse than an honest placeholder, because a screen showing one teaches people to
 * believe the next one.
 *
 * The seed **establishes**; it never overwrites. A record it has already created is
 * left alone, and only the items it authored (`source = 'seed'`) are refreshed, so
 * anything an owner or manager assigns through the interface survives the next boot.
 * The HR designation is likewise applied once, when the record is first created — a
 * fixture that re-asserted an authority grant on every restart would silently revoke
 * a real one.
 *
 * The four members cover the whole authorization matrix the owner described:
 *
 * - `prototype-provider` — organization owner, sees everyone inherently
 * - `team-morgan` — organization manager, sees everyone inherently
 * - `team-pmhnp` — a provider with no HR designation, sees only their own record,
 *   which is the case that proves clinical role grants nothing here
 * - `team-casey` — a plain member designated as HR personnel, sees everyone without
 *   holding organization administration
 */

type SeedItem = {
  category: "insurance" | "license" | "coaching" | "goal";
  title: string;
  detail: string;
  status: string;
  /** Days from today, so the deadline list stays meaningful as the fixture ages. */
  dueInDays: number | null;
};

type SeedRecord = {
  userId: string;
  employmentType: string;
  startedOn: string;
  hrDesignation?: "designated";
  items: SeedItem[];
};

const RECORDS: SeedRecord[] = [
  {
    userId: "prototype-provider",
    employmentType: "1.0 FTE — Attending psychiatrist & medical director",
    startedOn: "2019-04-01",
    items: [
      {
        category: "insurance",
        title: "Health plan — practice group PPO",
        detail: "Employee + spouse tier. Open enrollment closes the same week it comes due.",
        status: "active",
        dueInDays: 47,
      },
      {
        category: "license",
        title: "State medical license renewal",
        detail: "Renewal window opens 90 days before expiry. Primary-source verification pending.",
        status: "active",
        dueInDays: 212,
      },
      {
        category: "goal",
        title: "Cut unsigned-note turnaround to under 48 hours",
        detail: "Reviewed each quarter against signed-encounter timestamps.",
        status: "in_progress",
        dueInDays: 74,
      },
    ],
  },
  {
    userId: "team-morgan",
    employmentType: "1.0 FTE — Practice manager & billing coordinator",
    startedOn: "2021-09-13",
    items: [
      {
        category: "insurance",
        title: "Health plan — practice group PPO",
        detail: "Employee-only tier.",
        status: "active",
        dueInDays: 47,
      },
      {
        category: "license",
        title: "Certified professional biller — continuing education",
        detail: "36 CEUs per two-year cycle. 22 recorded so far.",
        status: "attention",
        dueInDays: 31,
      },
      {
        category: "coaching",
        title: "Quarterly coaching — claim denial follow-up",
        detail: "Next session scheduled with the owner. Prior session notes on file.",
        status: "scheduled",
        dueInDays: 12,
      },
    ],
  },
  {
    userId: "team-pmhnp",
    employmentType: "1.0 FTE — Psychiatric nurse practitioner",
    startedOn: "2022-06-06",
    items: [
      {
        category: "license",
        title: "Nurse practitioner license renewal",
        detail: "Expiring within the quarter. Renewal packet not yet submitted.",
        status: "attention",
        dueInDays: 24,
      },
      {
        category: "license",
        title: "Controlled-substance registration",
        detail: "Registration number pending primary-source verification.",
        status: "active",
        dueInDays: 168,
      },
      {
        category: "insurance",
        title: "Malpractice coverage — claims made",
        detail: "Certificate on file with the practice administrator.",
        status: "active",
        dueInDays: 133,
      },
      {
        category: "coaching",
        title: "Coaching — documentation depth on complex titrations",
        detail: "Assigned by the practice manager after a chart review.",
        status: "in_progress",
        dueInDays: 21,
      },
      {
        category: "goal",
        title: "Complete the adolescent psychopharmacology module",
        detail: "Counts toward this year's continuing education requirement.",
        status: "in_progress",
        dueInDays: 96,
      },
    ],
  },
  {
    userId: "team-casey",
    employmentType: "0.8 FTE — Clinical assistant, HR administration",
    startedOn: "2023-02-20",
    hrDesignation: "designated",
    items: [
      {
        category: "insurance",
        title: "Health plan — practice group PPO",
        detail: "Employee-only tier. Waiting period completed.",
        status: "active",
        dueInDays: 47,
      },
      {
        category: "coaching",
        title: "Coaching — front-desk escalation handling",
        detail: "Second of three sessions.",
        status: "in_progress",
        dueInDays: 9,
      },
      {
        category: "goal",
        title: "Own the licensing deadline board for the practice",
        detail: "Assigned with the HR designation.",
        status: "in_progress",
        dueInDays: 60,
      },
    ],
  },
];

function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function ensureHrSeed(db: DatabaseSync) {
  const now = new Date().toISOString();

  // `DO NOTHING`, not `DO UPDATE`: employment type and start date are not date-relative,
  // so there is no freshness reason to rewrite them, and an owner who corrects one
  // through the interface must not find it reverted on the next boot.
  const insertRecord = db.prepare(`
    INSERT INTO hr_records (
      id, organization_id, user_id, employment_type, started_on, assigned_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, user_id) DO NOTHING
  `);

  const clearSeededItems = db.prepare(
    "DELETE FROM hr_record_items WHERE record_id = ? AND source = 'seed'",
  );
  const insertItem = db.prepare(`
    INSERT INTO hr_record_items (
      id, record_id, category, title, detail, status, due_on, assigned_by, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)
  `);
  const designate = db.prepare(`
    UPDATE organization_memberships SET hr_access = ?, updated_at = ?
    WHERE organization_id = ? AND user_id = ?
  `);

  for (const record of RECORDS) {
    const exists = db.prepare("SELECT 1 FROM team_members WHERE id = ?").get(record.userId);
    if (!exists) continue;

    const recordId = `hr-${DEFAULT_ORGANIZATION_ID}-${record.userId}`;
    const created = Number(
      insertRecord.run(
        recordId,
        DEFAULT_ORGANIZATION_ID,
        record.userId,
        record.employmentType,
        record.startedOn,
        "team-morgan",
        now,
        now,
      ).changes,
    ) > 0;

    // Seeded items are rewritten rather than merged: these are fixtures whose due
    // dates are relative to today, so a stale row from an earlier boot would read as
    // overdue. Assigned items are not touched — see the note at the top of this file.
    clearSeededItems.run(recordId);
    for (const [index, item] of record.items.entries()) {
      insertItem.run(
        `hri-${record.userId}-${index}`,
        recordId,
        item.category,
        item.title,
        item.detail,
        item.status,
        item.dueInDays === null ? null : isoDaysFromNow(item.dueInDays),
        "team-morgan",
        now,
        now,
      );
    }

    // Only when this record is new. Re-running the fixture's designation on every boot
    // would revoke a designation an owner granted through the interface, and would
    // restore one they revoked — a fixture must never outrank a real authority grant.
    if (created) {
      designate.run(
        record.hrDesignation ?? "none",
        now,
        DEFAULT_ORGANIZATION_ID,
        record.userId,
      );
    }
  }
}
