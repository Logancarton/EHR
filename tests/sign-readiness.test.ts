import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acknowledgementKey,
  acknowledgementLabel,
  draftReadinessStatusText,
  parseReadinessAcknowledgement,
  readinessAcknowledgementFor,
  summarizeSignReadiness,
} from "../app/domain/sign-readiness";
import type { ReadinessGroup, ReadinessItem } from "../app/domain/visit-readiness";
import { grantSyntheticOrganizationAccess } from "./helpers/organization-access";

/** D-124: readiness read for signing — warn plus acknowledgement, never a block. */

function item(id: string, state: ReadinessItem["state"], group: ReadinessItem["group"] = "note"): ReadinessItem {
  return { id, group, state, label: `Label ${id}`, source: "note" };
}

function group(id: ReadinessGroup["id"], items: ReadinessItem[], extra: Partial<ReadinessGroup> = {}): ReadinessGroup {
  return { id, label: id, items, open: items.filter((entry) => entry.state === "open").length, ...extra };
}

test("clear readiness says Ready for review and needs no acknowledgement", () => {
  const summary = summarizeSignReadiness([
    group("note", [item("a", "complete")]),
    group("billing", [item("b", "info", "billing")]),
    group("labs", []),
  ]);
  assert.equal(summary.status, "clear");
  assert.equal(summary.requiresAcknowledgement, false);
  assert.equal(draftReadinessStatusText(summary), "Ready for review");
  assert.equal(readinessAcknowledgementFor(summary), null);
  assert.deepEqual(summary.groups, []);
});

test("open items are counted, grouped, and require acknowledgement", () => {
  const summary = summarizeSignReadiness([
    group("note", [item("section:mse", "open"), item("section:risk", "open"), item("c", "complete")]),
    group("billing", [item("billing:diagnosis", "open", "billing")]),
    group("labs", []),
  ]);
  assert.equal(summary.status, "open");
  assert.equal(summary.openCount, 3);
  assert.deepEqual(summary.openItemIds, ["section:mse", "section:risk", "billing:diagnosis"]);
  assert.deepEqual(summary.groups.map((entry) => [entry.id, entry.open.length]), [["note", 2], ["billing", 1]]);
  assert.equal(summary.requiresAcknowledgement, true);
  assert.equal(draftReadinessStatusText(summary), "3 open items");
  assert.equal(acknowledgementLabel(summary), "I've reviewed 3 open readiness items and choose to sign.");
  assert.deepEqual(readinessAcknowledgementFor(summary), {
    status: "open",
    openCount: 3,
    openItemIds: ["section:mse", "section:risk", "billing:diagnosis"],
    unavailableParts: [],
  });
  const one = summarizeSignReadiness([group("note", [item("x", "open")])]);
  assert.equal(draftReadinessStatusText(one), "1 open item");
});

test("a failed source is unavailable, never Ready, and still requires acknowledgement", () => {
  const failed = summarizeSignReadiness([
    group("note", []),
    group("labs", [], { error: "synthetic outage" }),
    group("meds", [], { error: "synthetic outage" }),
  ]);
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.requiresAcknowledgement, true);
  assert.equal(draftReadinessStatusText(failed), "Readiness unavailable");
  assert.deepEqual(failed.unavailableParts, ["labs", "meds"]);
  assert.match(acknowledgementLabel(failed), /could not be fully checked/);

  const partial = summarizeSignReadiness([
    group("note", [item("a", "open")]),
    group("billing", [item("billing:coverage-error", "unavailable", "billing")]),
  ]);
  assert.equal(partial.status, "unavailable");
  assert.equal(draftReadinessStatusText(partial), "1 open item · some checks unavailable");
});

test("loading never reads as Ready", () => {
  const loading = summarizeSignReadiness([group("note", []), group("labs", [], { loading: true })]);
  assert.equal(loading.status, "loading");
  assert.equal(loading.requiresAcknowledgement, true);
  assert.equal(draftReadinessStatusText(loading), "Checking readiness…");
});

test("the acknowledgement key changes when the acknowledged set changes", () => {
  const before = summarizeSignReadiness([group("note", [item("a", "open"), item("b", "open")])]);
  const same = summarizeSignReadiness([group("note", [item("a", "open"), item("b", "open")])]);
  const after = summarizeSignReadiness([group("note", [item("a", "open"), item("b", "complete")])]);
  assert.equal(acknowledgementKey(before), acknowledgementKey(same));
  assert.notEqual(acknowledgementKey(before), acknowledgementKey(after));
});

test("the server accepts only a well-formed acknowledgement", () => {
  assert.equal(parseReadinessAcknowledgement(undefined), null);
  assert.equal(parseReadinessAcknowledgement({ status: "clear", openCount: 0, openItemIds: [] }), null);
  assert.equal(parseReadinessAcknowledgement({ status: "open", openCount: -1, openItemIds: [] }), null);
  assert.equal(parseReadinessAcknowledgement({ status: "open", openCount: 1, openItemIds: [5] }), null);
  assert.deepEqual(parseReadinessAcknowledgement({ status: "open", openCount: 1, openItemIds: ["a"] }), {
    status: "open",
    openCount: 1,
    openItemIds: ["a"],
    unavailableParts: [],
  });
  const many = parseReadinessAcknowledgement({ status: "open", openCount: 500, openItemIds: Array.from({ length: 500 }, (_, i) => `x${i}`) });
  assert.equal(many?.openItemIds.length, 100);
});

test("signing records an acknowledgement in the note_signed audit, and signs without one", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-sign-readiness-")));
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-sign-readiness-secret-0123456789";
  try {
    const [{ PATCH: signPatch }, { POST: loginPost }, { ClinicalActionGateway }, { AuditRepository }] = await Promise.all([
      import("../app/api/encounters/[id]/route"),
      import("../app/api/auth/login/route"),
      import("../app/server/actions/clinical-action-gateway"),
      import("../app/server/repositories/audit-repository"),
    ]);
    await grantSyntheticOrganizationAccess(["team-taylor"]);
    const login = await loginPost(new Request("http://ehr.local/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "team-taylor" }),
    }));
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0];
    const actor = { userId: "team-taylor", displayName: "Dr. Taylor", role: "provider" as const };
    const patientId = "maya-chen";

    async function draftAndSign(encounterId: string, body: unknown) {
      await ClinicalActionGateway.execute({
        actor,
        context: { source: "api" as const, requestId: `draft-${encounterId}` },
        expectedPatientId: patientId,
        action: { type: "save_encounter_draft", payload: { id: encounterId, patientId, assessment: "Synthetic assessment.", plan: "Synthetic plan." } },
      });
      const response = await signPatch(
        new Request(`http://ehr.local/api/encounters/${encounterId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie, "x-ehr-patient-id": patientId },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: encounterId }) },
      );
      assert.equal(response.status, 200, await response.clone().text());
      const audit = AuditRepository.getRecent(100, patientId).find(
        (entry) => entry.eventType === "note_signed" && (entry.metadata as { encounterId?: string }).encounterId === encounterId,
      );
      assert.ok(audit, "note_signed audit must exist");
      return audit.metadata as Record<string, unknown>;
    }

    const acknowledged = await draftAndSign("enc-sign-readiness-ack", {
      signedBy: "ignored",
      readinessAcknowledgement: { status: "open", openCount: 2, openItemIds: ["section:mse", "billing:diagnosis"], unavailableParts: [] },
    });
    assert.deepEqual(acknowledged.readinessAcknowledgement, {
      status: "open",
      openCount: 2,
      openItemIds: ["section:mse", "billing:diagnosis"],
      unavailableParts: [],
    });

    const clear = await draftAndSign("enc-sign-readiness-clear", { signedBy: "ignored" });
    assert.equal("readinessAcknowledgement" in clear, false);

    // A malformed acknowledgement is dropped, never a reason to refuse signing.
    const malformed = await draftAndSign("enc-sign-readiness-bad", { readinessAcknowledgement: { status: "open", openCount: "lots" } });
    assert.equal("readinessAcknowledgement" in malformed, false);
  } finally {
    process.chdir(originalCwd);
    env.NODE_ENV = originalNodeEnv;
    env.EHR_SESSION_SECRET = originalSecret;
  }
});
