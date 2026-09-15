import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeClinicalTimestamp,
  withinWindow,
} from "../app/domain/clinical-timestamp";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * Reading a mixed-format signing timestamp without touching the record.
 *
 * `encounters.signed_at` is not uniformly formatted: the signing path writes an
 * ISO instant, while rows seeded before it carry a display date. Signed encounters
 * are immutable by database trigger, so the inconsistency cannot be cleaned up in
 * place — and it should not be, because the legal record says what it says.
 *
 * The defect that surfaced this: `signed_at BETWEEN '2026-…' AND '2026-…'` is a
 * string comparison in SQLite, and `"Aug 08, 2026"` sorts after every ISO value
 * because digits precede letters in ASCII. Every display-dated encounter fell out
 * of every window, silently. A count that drops records without saying so is the
 * same family of untruth P9-0 removed from the billing screen.
 */

test("timestamp normalization places known forms and refuses to guess at the rest", () => {
  // Already an instant: used as-is, and marked as such.
  const iso = normalizeClinicalTimestamp("2026-09-14T18:29:08.000Z");
  assert.equal(iso.status, "iso");
  assert.equal(iso.iso, "2026-09-14T18:29:08.000Z");

  // A bare calendar date is still an ISO form.
  assert.equal(normalizeClinicalTimestamp("2026-09-14").status, "iso");
  assert.equal(normalizeClinicalTimestamp("2026-09-14").iso, "2026-09-14T00:00:00.000Z");

  // The display forms this product actually wrote. They name a day rather than an
  // instant, so they resolve to midnight UTC and stay marked `parsed` — a stated
  // convention, not a recovered fact.
  for (const [raw, expected] of [
    ["Aug 08, 2026", "2026-08-08T00:00:00.000Z"],
    ["Sep 9, 2026", "2026-09-09T00:00:00.000Z"],
    ["August 8 2026", "2026-08-08T00:00:00.000Z"],
    ["08 Aug 2026", "2026-08-08T00:00:00.000Z"],
    ["09/14/2026", "2026-09-14T00:00:00.000Z"],
  ] as const) {
    const normalized = normalizeClinicalTimestamp(raw);
    assert.equal(normalized.status, "parsed", `${raw} should be recognised`);
    assert.equal(normalized.iso, expected, `${raw} should place at ${expected}`);
    assert.equal(normalized.raw, raw, "the recorded value travels with the derived one");
  }

  // Nothing is guessed. A permissive parser turns an unknown string into a
  // confident wrong date, which is worse than an admitted gap.
  for (const raw of ["", "   ", "sometime last week", "3", "2026-13-45", "Foo 08, 2026", "Feb 31, 2026"]) {
    const normalized = normalizeClinicalTimestamp(raw);
    assert.equal(normalized.status, "unparseable", `${JSON.stringify(raw)} must not be guessed at`);
    assert.equal(normalized.iso, null);
  }

  // An unplaceable value is in no window — the point being that it is *known* to be
  // in no window rather than absent from the query.
  assert.equal(
    withinWindow(normalizeClinicalTimestamp("sometime last week"), "2026-01-01T00:00:00.000Z", "2026-12-31T00:00:00.000Z"),
    false,
  );
  assert.equal(
    withinWindow(normalizeClinicalTimestamp("Aug 08, 2026"), "2026-08-01T00:00:00.000Z", "2026-08-31T00:00:00.000Z"),
    true,
  );
});

test("the projection normalizes for reading while the signed record stays untouched", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-signed-date-projection-"));
  process.chdir(isolatedRoot);

  try {
    const [
      { getDatabase },
      { SignedEncounterDateRepository },
      { BillingRepository },
      { ClinicalActionGateway },
      { ensureClinicalRecordFoundation },
    ] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/signed-encounter-date-repository"),
      import("../app/server/repositories/billing-repository"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/clinical-record-foundation"),
    ]);

    const db = getDatabase();
    ensureClinicalRecordFoundation(db);
    await grantSyntheticOrganizationAccess(["team-taylor"]);

    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const context = { source: "api" as const, requestId: "signed-date-projection-test" };
    const patientId = "maya-chen";

    // The seed writes display-formatted signing timestamps, so the mixed state
    // this exists for is already present. Confirm that before relying on it.
    SignedEncounterDateRepository.refresh();
    const seeded = db.prepare(`
      SELECT parse_status, COUNT(*) AS total
      FROM encounter_signed_at_projection GROUP BY parse_status
    `).all() as Array<{ parse_status: string; total: number }>;
    const byStatus = Object.fromEntries(seeded.map((row) => [row.parse_status, Number(row.total)]));
    assert.ok(
      (byStatus.parsed || 0) > 0,
      `the fixture practice should contain display-dated signed notes, saw ${JSON.stringify(byStatus)}`,
    );

    // A note signed through the product lands as a true instant.
    const encounterId = "enc-projection-1";
    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: {
        type: "save_encounter_draft",
        payload: { id: encounterId, patientId, assessment: "Stable.", plan: "Continue." },
      },
    });
    await ClinicalActionGateway.execute({
      actor, context, expectedPatientId: patientId,
      action: { type: "sign_encounter", payload: { encounterId } },
    });

    SignedEncounterDateRepository.refresh();
    const projected = SignedEncounterDateRepository.get(encounterId);
    assert.ok(projected, "a newly signed note is projected");
    assert.equal(projected!.parseStatus, "iso");
    assert.ok(projected!.signedAtIso, "an ISO signing timestamp places directly");

    // ------------------------------------------------- the record is never rewritten
    const before = db.prepare("SELECT signed_at FROM encounters WHERE id = ?").get(encounterId) as { signed_at: string };
    const displayDated = db.prepare(`
      SELECT e.id, e.signed_at FROM encounters e
      JOIN encounter_signed_at_projection d ON d.encounter_id = e.id
      WHERE d.parse_status = 'parsed' LIMIT 1
    `).get() as { id: string; signed_at: string };

    SignedEncounterDateRepository.refresh();
    SignedEncounterDateRepository.refresh();

    assert.equal(
      (db.prepare("SELECT signed_at FROM encounters WHERE id = ?").get(encounterId) as { signed_at: string }).signed_at,
      before.signed_at,
      "refreshing the projection does not rewrite a signed record",
    );
    assert.equal(
      (db.prepare("SELECT signed_at FROM encounters WHERE id = ?").get(displayDated.id) as { signed_at: string }).signed_at,
      displayDated.signed_at,
      "a display-dated signed record keeps the value it was signed with",
    );
    // The immutability trigger is still in force, which is why normalizing in place
    // was never an option.
    assert.throws(
      () => db.prepare("UPDATE encounters SET signed_at = ? WHERE id = ?").run("2026-08-08T00:00:00.000Z", displayDated.id),
      /immutable/i,
      "a signed encounter cannot be updated, so the projection is the only way to read it uniformly",
    );

    // ------------------------------------------------ an unparseable value is counted
    const brokenId = "enc-projection-unparseable";
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO encounters (
        id, patient_id, date, type, status, chief_complaint, hpi, interval_history,
        review_of_symptoms, treatment_response, side_effects, mse_json, assessment,
        risk_assessment, follow_up, plan, cpt_code, em_level, signed_by, signed_at,
        created_at, updated_at
      ) VALUES (?, ?, 'sometime last week', 'Follow-Up', 'signed', '', '', '', '', '', '', '{}',
        '', '', '', '', '99214', 'Moderate Complexity (99214)', 'Legacy Import', 'sometime last week', ?, ?)
    `).run(brokenId, patientId, now, now);

    SignedEncounterDateRepository.refresh();
    const broken = SignedEncounterDateRepository.get(brokenId);
    assert.equal(broken?.parseStatus, "unparseable");
    assert.equal(broken?.signedAtIso, null, "an unrecognised value is not given an invented instant");
    assert.equal(broken?.signedAtRaw, "sometime last week", "the raw value is preserved for inspection");
    assert.ok(
      SignedEncounterDateRepository.unplaceable().some((row) => row.encounterId === brokenId),
      "an unplaceable record is listable, so someone can go and look at it",
    );

    // ------------------------------------ a window counts through the projection and discloses
    const until = new Date();
    const since = new Date(until.getTime() - 365 * 24 * 60 * 60 * 1000);
    const counts = BillingRepository.counts({
      since: since.toISOString(),
      until: until.toISOString(),
    });

    assert.ok(
      counts.signedEncounters > 1,
      `a year-long window must include display-dated notes, saw ${counts.signedEncounters}`,
    );
    assert.equal(
      counts.signedEncountersUnplaceable,
      1,
      "the one record that cannot be placed is reported rather than silently dropped",
    );

    // The regression this all exists to prevent: comparing the raw column directly
    // loses the display-dated rows, and loses them without complaint.
    const naive = db.prepare(`
      SELECT COUNT(*) AS total FROM encounters
      WHERE status = 'signed' AND signed_at >= ? AND signed_at <= ?
    `).get(since.toISOString(), until.toISOString()) as { total: number };
    assert.ok(
      Number(naive.total) < counts.signedEncounters,
      "the projection must recover records a direct string comparison drops",
    );

    // The backlog is unwindowed, so nothing unbilled is hidden by a date at all —
    // including the record that cannot be placed in time.
    const awaiting = BillingRepository.signedEncountersAwaitingCharge({});
    assert.ok(
      awaiting.some((row) => row.encounterId === brokenId),
      "an unplaceable record still appears as unbilled work",
    );
  } finally {
    process.chdir(originalCwd);
  }
});
