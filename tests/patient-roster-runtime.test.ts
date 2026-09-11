import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The runtime patient roster boundary.
 *
 * Server-side access filtering is covered by `organization-access-boundary.test.ts`
 * (organization scope, assigned scope, revocation) and `api-authority-boundary.test.ts`
 * (an unauthenticated roster read fails). What is asserted here is the other half:
 * the client holds exactly one roster, it comes from that authenticated boundary, and
 * nothing falls back to the synthetic patients compiled into the bundle.
 */

const APP_ROOT = fileURLToPath(new URL("../app", import.meta.url));

type RosterModule = typeof import("../app/lib/patient-roster");

const ROSTER_RESPONSE = [
  { id: "maya-chen", name: "Maya Chen", initials: "MC", mrn: "P-10482", dob: "04/18/1992" },
  { id: "jordan-reed", name: "Jordan Reed", initials: "JR", mrn: "P-10917", dob: "11/03/1986" },
];

/** Answers `GET /api/patients` the way the route does, counting the calls made. */
function stubRosterFetch(
  patients: unknown[],
  options: { failWith?: string; hold?: Promise<void> } = {},
): { calls: () => number; restore: () => void } {
  const original = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls += 1;
    assert.equal(String(input), "/api/patients", "the roster must come from the authenticated roster route");
    if (options.hold) await options.hold;
    if (options.failWith) {
      return new Response(JSON.stringify({ success: false, error: options.failWith }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true, patients }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("the runtime roster is loaded once from the authenticated API and shared by every surface", async () => {
  const roster: RosterModule = await import("../app/lib/patient-roster");
  const stub = stubRosterFetch(ROSTER_RESPONSE);

  try {
    roster.resetPatientRoster();
    assert.equal(roster.patientRosterState().status, "idle");
    assert.deepEqual(roster.rosterPatients(), [], "nothing is known before the backend answers");

    // The shell, the global queues and workspace restoration all ask at once.
    const [first, second, third] = await Promise.all([
      roster.loadPatientRoster(),
      roster.loadPatientRoster(),
      roster.loadPatientRoster(),
    ]);

    assert.equal(stub.calls(), 1, "concurrent callers share one roster request");
    assert.deepEqual(
      first.map((patient) => patient.id),
      ["maya-chen", "jordan-reed"],
    );
    assert.equal(second, first, "every caller gets the same snapshot");
    assert.equal(third, first);
    assert.equal(roster.patientRosterState().status, "ready");

    // A later caller reuses the cached roster rather than re-reading it.
    await roster.loadPatientRoster();
    assert.equal(stub.calls(), 1);

    // A mutation that changed the chart can force a re-read.
    await roster.refreshPatientRoster();
    assert.equal(stub.calls(), 2, "a forced refresh re-reads the authoritative roster");
  } finally {
    stub.restore();
    roster.resetPatientRoster();
  }
});

test("a failed roster load is an empty failed roster, never a fall back to synthetic patients", async () => {
  const roster: RosterModule = await import("../app/lib/patient-roster");
  const { patients: syntheticPatients } = await import("../app/domain/patient");
  const stub = stubRosterFetch([], { failWith: "Authentication required" });

  try {
    roster.resetPatientRoster();
    const loaded = await roster.loadPatientRoster();

    assert.deepEqual(loaded, [], "a rejected roster read produces no patients");
    const state = roster.patientRosterState();
    assert.equal(state.status, "error");
    assert.match(state.error, /Authentication required/);
    assert.notEqual(
      state.patients.length,
      syntheticPatients.length,
      "a failed roster must not be quietly replaced by the seed fixtures",
    );
    assert.equal(
      roster.resolveRosterPatientFromCommand("open maya chen"),
      undefined,
      "no chart is resolvable from a failed roster",
    );
  } finally {
    stub.restore();
    roster.resetPatientRoster();
  }
});

test("a roster response that arrives after sign-out never repopulates the store", async () => {
  const roster: RosterModule = await import("../app/lib/patient-roster");
  const gate = deferred();
  const stub = stubRosterFetch(ROSTER_RESPONSE, { hold: gate.promise });

  try {
    roster.resetPatientRoster();
    const inFlight = roster.loadPatientRoster();

    // The clinician signs out while their roster is still on the wire.
    roster.resetPatientRoster();
    assert.equal(roster.patientRosterState().status, "idle");

    gate.release();
    await inFlight;

    assert.deepEqual(
      roster.rosterPatients(),
      [],
      "a response for a session that has ended must not restore that session's patients",
    );
    assert.equal(roster.patientRosterState().status, "idle");
  } finally {
    stub.restore();
    roster.resetPatientRoster();
  }
});

test("saved workspaces keep only charts the roster still reaches, and otherwise restore nothing", async () => {
  const roster: RosterModule = await import("../app/lib/patient-roster");
  const stub = stubRosterFetch(ROSTER_RESPONSE);

  try {
    roster.resetPatientRoster();
    const accessible = await roster.loadPatientRoster();

    // A saved tab for a patient who moved organizations, or whose assignment was
    // withdrawn, is discarded rather than opened against a chart the API will refuse.
    assert.deepEqual(
      roster.retainAccessiblePatientIds(["jordan-reed", "rival-patient", "maya-chen"], accessible),
      ["jordan-reed", "maya-chen"],
      "inaccessible ids are dropped and the clinician's own order is preserved",
    );

    assert.deepEqual(
      roster.retainAccessiblePatientIds(["rival-patient"], accessible),
      [],
      "with nothing restorable there is no chart to open, so the workspace stays on Today",
    );

    assert.equal(roster.findRosterPatient("rival-patient", accessible), undefined);
    assert.equal(roster.rosterPatientIdForName("Rival Patient", accessible), null);
    assert.equal(roster.rosterPatientNameForId("maya-chen", accessible), "Maya Chen");
  } finally {
    stub.restore();
    roster.resetPatientRoster();
  }
});

test("omnibox and cross-patient answers resolve against the accessible roster only", async () => {
  const roster: RosterModule = await import("../app/lib/patient-roster");
  const { executeClinicalQuery } = await import("../app/domain/clinical-query");
  const { defaultPreferences } = await import("../app/lib/preference-engine");
  const { patients: syntheticPatients } = await import("../app/domain/patient");

  // One accessible chart, while the seed fixtures know about several more.
  const accessible = [syntheticPatients[0]];
  assert.ok(syntheticPatients.length > 1, "the fixture set must be wider than this roster to be a real test");

  const reachable = roster.resolveRosterPatientFromCommand("open maya chen", accessible);
  assert.equal(reachable?.id, "maya-chen");

  const unreachable = roster.resolveRosterPatientFromCommand(
    `open ${syntheticPatients[1].name.toLowerCase()}`,
    accessible,
  );
  assert.equal(
    unreachable,
    undefined,
    "a patient outside the accessible roster is not openable by name, even though the bundle knows the name",
  );

  const splitAnswer = executeClinicalQuery(
    `split screen with ${syntheticPatients[1].name}`,
    syntheticPatients[0],
    defaultPreferences,
    accessible,
  );
  assert.equal(
    splitAnswer?.patientId,
    "maya-chen",
    "a cross-patient answer may only name a chart inside the roster it was given",
  );
  assert.ok(
    !splitAnswer?.body.includes(syntheticPatients[1].name),
    "an inaccessible patient is never named back to the clinician",
  );
});

test("the synthetic patient array is seed data that runtime code cannot write to or read as a roster", async () => {
  const { patients: syntheticPatients } = await import("../app/domain/patient");

  assert.ok(Object.isFrozen(syntheticPatients), "the fixture roster is frozen");
  assert.throws(
    () => {
      // Signing an encounter used to write the visit date straight onto this object,
      // creating a chart fact that existed only in one browser tab.
      (syntheticPatients[0] as { lastVisit: string }).lastVisit = "Signed in the browser";
    },
    TypeError,
    "a runtime write to the fixture chart must fail rather than create a second truth",
  );

  // The exit gate for this phase: nothing outside seeding may import the array.
  const allowed = new Set([join(APP_ROOT, "server", "db", "seed.ts")]);
  const offenders: string[] = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (path === join(APP_ROOT, "domain", "patient.ts")) continue;

      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/import\s*{([^}]*)}\s*from\s*["'][^"']*domain\/patient["']/g)) {
        const bindings = match[1].split(",").map((binding) => binding.trim());
        if (bindings.includes("patients") && !allowed.has(path)) offenders.push(path);
      }
    }
  };

  walk(APP_ROOT);
  assert.deepEqual(
    offenders,
    [],
    "runtime code must resolve patients through app/lib/patient-roster, not the seed fixtures",
  );
});
