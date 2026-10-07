import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/**
 * A create repeated with the same Idempotency-Key — a retry after a lost response,
 * a second tab — writes once and answers with the first result. A key reused for a
 * different request is refused, a failed create releases its key, and keys are
 * per actor.
 */
test("a repeated create with the same key records one patient message, not two", async () => {
  const originalCwd = process.cwd();
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-idempotent-creates-"));
  process.chdir(isolatedRoot);

  try {
    const [{ ClinicalActionGateway }, { getDatabase }, { normalizeIdempotencyKey }] = await Promise.all([
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/db/connection"),
      import("../app/server/repositories/idempotent-request-repository"),
    ]);
    await grantSyntheticOrganizationAccess(["idem-provider", "idem-other"]);
    const actor = { userId: "idem-provider", displayName: "Idem Provider", credentials: "MD", role: "provider" as const };
    const other = { userId: "idem-other", displayName: "Other Provider", credentials: "MD", role: "provider" as const };
    const run = (action: any, idempotencyKey?: string, who = actor, bound: string | null = "idem-a") =>
      ClinicalActionGateway.execute({ actor: who, context: { source: "api", idempotencyKey }, expectedPatientId: bound ?? undefined, action });

    await run({
      type: "create_patient",
      payload: {
        id: "idem-a", name: "Idem Alpha", initials: "IA", dob: "01/01/1990", age: 36, pronouns: "they/them", mrn: "IDEM-A-1",
        status: "Established", allergies: [], diagnoses: [], meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
      },
    }, undefined, actor, null);
    const db = getDatabase();
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM messages WHERE patient_id = 'idem-a'").get() as { n: number }).n;

    const thread = { type: "create_message_thread", payload: { patientId: "idem-a", subject: "Labs", content: "Your labs are ready." } };
    const first = await run(thread, "draft-key-0001");
    const before = count();
    const replay = await run(thread, "draft-key-0001");
    assert.equal(replay.id, first.id, "the repeat answers with the thread already recorded");
    assert.equal(count(), before, "no second message was written");

    const reply = { type: "send_message", payload: { patientId: "idem-a", threadId: first.id, content: "Following up." } };
    await run(reply, "draft-key-0002");
    await run(reply, "draft-key-0002");
    assert.equal(count(), before + 1, "a retried reply is recorded once");

    await assert.rejects(
      run({ ...reply, payload: { ...reply.payload, content: "Different words." } }, "draft-key-0002"),
      (error: Error & { status?: number }) => error.name === "IdempotencyConflictError" && error.status === 422,
      "a key reused for a different message is refused, not replayed",
    );

    // Keys belong to their actor: another clinician's identical key is a new request.
    await run(reply, "draft-key-0002", other);
    assert.equal(count(), before + 2);

    // A refused create releases its key so a corrected retry can proceed.
    await assert.rejects(run({ type: "send_message", payload: { patientId: "idem-a", threadId: "no-such-thread", content: "x" } }, "draft-key-0003"));
    const reserved = db.prepare("SELECT COUNT(*) AS n FROM idempotent_requests WHERE idempotency_key = 'draft-key-0003'").get() as { n: number };
    assert.equal(reserved.n, 0);

    // Without a key the long-standing behaviour is unchanged: each call writes.
    await run(reply);
    await run(reply);
    assert.equal(count(), before + 4);

    assert.equal(normalizeIdempotencyKey(undefined), undefined);
    assert.throws(() => normalizeIdempotencyKey("bad key!"), /Idempotency-Key/);
  } finally {
    process.chdir(originalCwd);
  }
});
