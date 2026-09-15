import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { OmniboxPlan } from "../app/domain/omnibox";
import { grantSyntheticOrganizationAccess, assignSyntheticPatients } from "./helpers/organization-access";

/**
 * The home launcher's assistant must not answer from itself.
 *
 * It used to. `ZenHomeWindow.handleQuerySubmit` matched the typed query against a
 * list of substrings in the browser and returned invented clinical findings for
 * named patients: "Marcus Vance's Serum Lithium drawn on 09/11 returned 0.9 mEq/L
 * (therapeutic range: 0.6–1.2 mEq/L)", a PHQ-9 of 14 for Elena Rostova, a Maya Chen
 * refill request with "Safety surveillance protocols are satisfied", a four-visit
 * summary with a Lamotrigine titration, and a fallback that asserted "No urgent
 * safety contraindications identified". Because no request was made, no permission
 * check, patient-access check or provenance rule could have stopped any of it.
 *
 * Four properties are asserted here, and each names a way an assistant can lie:
 *
 * 1. **An unsupported question is refused,** not answered with a plausible example.
 * 2. **A record that does not exist stays missing** — the answer says the context
 *    does not contain it rather than producing a value.
 * 3. **Patient identity is resolved server-side, never assumed.** A question naming
 *    nobody asks which patient; a question naming someone unknown says not found
 *    and does not fall back to whoever is open.
 * 4. **An unreachable chart is unreachable through the assistant too.** Another
 *    organization's patient is not resolvable, answerable or nameable.
 *
 * Existing coverage in `omnibox-planning-boundary.test.ts` proves the endpoint's
 * authentication, permission and mutation-freedom. This file is about what an
 * *answer* may contain, and about the home surface specifically having no second
 * path to one.
 */

type PlanResponse = { success: boolean; plan?: OmniboxPlan; error?: string };

const APP_ROOT = join(import.meta.dirname, "..", "app");

function sourceFiles(root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Comments may describe a removed fabrication; rendering code may not contain one. */
function codeOnly(contents: string): string {
  return contents
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*"));
    })
    .join("\n");
}

test("the home assistant answers only from the permission-aware planner", async () => {
  const originalCwd = process.cwd();
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.EHR_SESSION_SECRET;
  const isolatedRoot = mkdtempSync(join(tmpdir(), "ehr-home-assistant-"));

  process.chdir(isolatedRoot);
  env.NODE_ENV = "test";
  env.EHR_SESSION_SECRET = "synthetic-home-assistant-secret-0123456789";

  try {
    const [
      { POST: planPost },
      { AuthRepository },
      { EHR_SESSION_COOKIE, createProviderSessionToken },
      { PatientRepository },
      { getDatabase },
    ] = await Promise.all([
      import("../app/api/ai/omnibox/plan/route"),
      import("../app/server/repositories/auth-repository"),
      import("../app/server/auth/provider-context"),
      import("../app/server/repositories/patient-repository"),
      import("../app/server/db/connection"),
    ]);

    const db = getDatabase();
    await grantSyntheticOrganizationAccess(["team-taylor"]);

    // A second practice with its own patient. Nothing about this chart may reach
    // the first practice's clinician through the assistant.
    const outsideOrganization = await grantSyntheticOrganizationAccess(["home-outsider"], {
      organizationId: "org-home-outsider",
      membershipRole: "owner",
    });
    PatientRepository.create({
      id: "outside-patient", name: "Priya Raman", initials: "PR", dob: "02/02/1988", age: 38,
      pronouns: "she/her", mrn: "OUT-HOME-1", status: "Established", allergies: [], diagnoses: [],
      meds: [], vitals: {}, lastVisit: "Initial", nextVisit: "Unscheduled",
    });
    await assignSyntheticPatients(["outside-patient"], outsideOrganization);

    function cookieFor(userId: string, sessionId: string): string {
      const expiresAt = Date.now() + 60 * 60 * 1000;
      AuthRepository.createSession({ id: sessionId, userId, expiresAt: new Date(expiresAt).toISOString() });
      return `${EHR_SESSION_COOKIE}=${createProviderSessionToken(sessionId, expiresAt)}`;
    }

    const providerCookie = cookieFor("team-taylor", "home-assistant-provider");

    /** The home launcher's exact request shape: no active patient, general surface. */
    async function askFromHome(query: string, cookie = providerCookie): Promise<PlanResponse & { status: number }> {
      const response = await planPost(new Request("http://ehr.local/api/ai/omnibox/plan", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ query, activeSurface: "general" }),
      }));
      return { status: response.status, ...(await response.json() as PlanResponse) };
    }

    // ------------------------------------------------------- 1. unsupported question
    // Phrasing the deterministic planner cannot map to a typed intent. It must come
    // back as unrecognized with nothing attached, so the surface renders "could not
    // be retrieved" rather than an example.
    const unsupported = await askFromHome("kfjdlsa qpwoeiruty zzz");
    assert.equal(unsupported.status, 200);
    assert.equal(unsupported.plan?.intent.kind, "unrecognized");
    assert.equal(unsupported.plan?.answer, undefined, "an unsupported request produces no answer");
    assert.equal(unsupported.plan?.evidence.length, 0, "an unsupported request cites nothing");
    assert.equal(unsupported.plan?.proposals.length, 0);
    assert.equal(unsupported.plan?.navigation, undefined);
    assert.equal(unsupported.plan?.restrictedAction, undefined);

    // Same shape for a question about something the product does not model at all.
    const outOfScope = await askFromHome("What is the practice's month-to-date revenue?");
    assert.equal(outOfScope.status, 200);
    assert.ok(
      !outOfScope.plan?.answer || !/\$|revenue|collected/i.test(outOfScope.plan.answer),
      `a financial question must not be answered with a figure, got: ${outOfScope.plan?.answer}`,
    );

    // ------------------------------------------------------------ 2. missing records
    // Maya Chen exists and is reachable, but has no lithium result. The answer must
    // say the assembled context does not contain one; it must not produce a value,
    // a unit or a reference range.
    const missingLab = await askFromHome("What was Maya Chen's last lithium level?");
    assert.equal(missingLab.status, 200);
    assert.equal(missingLab.plan?.patient.resolved?.id, "maya-chen", "the named patient is resolved");
    const missingAnswer = missingLab.plan?.answer || "";
    assert.ok(missingAnswer.length > 0, "a resolvable question still gets a stated outcome");
    assert.ok(
      /no .*result|does not contain|not .*present|could not/i.test(missingAnswer),
      `a missing record must be reported as missing, got: ${missingAnswer}`,
    );
    assert.ok(
      !/\d+(\.\d+)?\s*(mEq\/L|mg\/dL|ng\/mL|mmol\/L)/i.test(missingAnswer),
      `a missing record must not come back with a measured value, got: ${missingAnswer}`,
    );
    assert.ok(
      !/therapeutic range/i.test(missingAnswer),
      `a missing record must not come back with a reference range, got: ${missingAnswer}`,
    );

    // ----------------------------------------------------------- 3. patient identity
    // The launcher is not a chart, so a clinical question naming nobody has no
    // patient to fall back on. It must ask rather than choose one.
    const noPatient = await askFromHome("What medications is the patient taking?");
    assert.equal(noPatient.status, 200);
    assert.equal(noPatient.plan?.patient.resolution, "required");
    assert.equal(noPatient.plan?.patient.resolved, undefined, "no chart is assumed from the home screen");
    assert.equal(noPatient.plan?.clarification?.reason, "patient_required");
    assert.equal(noPatient.plan?.answer, undefined, "an unidentified patient yields no clinical answer");

    // A name nobody in reach carries never resolves, whichever way it is phrased.
    //
    // The two phrasings take different paths and both have to be safe. A question
    // carries no explicit patient reference, so resolution is "required" — the
    // roster held no match to mention. A request with a trailing "for <Name>" does
    // carry one, so resolution is "not_found". Neither borrows another chart.
    const unknownInQuestion = await askFromHome("What medications is Nobody Atall taking?");
    assert.equal(unknownInQuestion.status, 200);
    assert.equal(
      unknownInQuestion.plan?.patient.resolution,
      "required",
      "an unmatched name is not silently attached to some other chart",
    );
    assert.equal(unknownInQuestion.plan?.patient.resolved, undefined);
    assert.equal(unknownInQuestion.plan?.answer, undefined);

    const unknownNamed = await askFromHome("Draft a CMP for Nobody Atall");
    assert.equal(unknownNamed.status, 200);
    assert.equal(unknownNamed.plan?.patient.resolution, "not_found");
    assert.equal(unknownNamed.plan?.patient.resolved, undefined);
    assert.equal(unknownNamed.plan?.clarification?.reason, "patient_not_found");
    assert.equal(unknownNamed.plan?.proposals.length, 0, "a proposal cannot be bound to a patient that was not found");

    // An answer that does resolve is bound to the patient it resolved, and the
    // context it was assembled from is that patient's.
    const identified = await askFromHome("What medications is Maya Chen taking?");
    assert.equal(identified.plan?.patient.resolved?.id, "maya-chen");
    assert.equal(identified.plan?.context?.patientId, "maya-chen", "context is assembled for the resolved patient only");
    assert.ok(
      !/jordan|marcus|elena|sofia|david/i.test(identified.plan?.answer || ""),
      `an answer must not name a chart it was not asked about, got: ${identified.plan?.answer}`,
    );

    // ------------------------------------------------------- 4. unauthorized access
    // The outside practice's patient exists in the database and is named exactly.
    // The planner resolves names only within the caller's accessible roster, so this
    // is "not found" rather than a permission error that would confirm she exists.
    for (const query of [
      "What medications is Priya Raman taking?",
      "Draft a CMP for Priya Raman",
    ]) {
      const unauthorized = await askFromHome(query);
      assert.equal(unauthorized.status, 200);
      assert.equal(
        unauthorized.plan?.patient.resolved,
        undefined,
        `a chart outside the practice must not resolve: ${query}`,
      );
      assert.ok(
        unauthorized.plan?.patient.resolution === "not_found" ||
          unauthorized.plan?.patient.resolution === "required",
        `an unreachable chart resolves to nothing, got ${unauthorized.plan?.patient.resolution}`,
      );
      assert.equal(unauthorized.plan?.answer, undefined);
      assert.equal(unauthorized.plan?.context, undefined, "no context may be assembled for an unreachable chart");
      assert.equal(unauthorized.plan?.proposals.length, 0);
      assert.ok(
        !JSON.stringify(unauthorized.plan).includes("outside-patient"),
        "an unreachable patient's identifier must not appear anywhere in the plan",
      );
      // The refusal must not confirm she exists either: an outside chart is absent,
      // not forbidden, so a probe cannot use the wording to enumerate patients.
      assert.ok(
        !/permission|denied|not authorized|another organization/i.test(
          JSON.stringify(unauthorized.plan?.clarification || {}),
        ),
        "an unreachable chart reads as absent rather than as a confirmed, protected record",
      );
    }

    // And the same question asked by that practice's own owner does resolve, which
    // is what proves the refusal above was an access decision and not a broken query.
    const outsiderCookie = cookieFor("home-outsider", "home-assistant-outsider");
    const insideOwnPractice = await askFromHome("What medications is Priya Raman taking?", outsiderCookie);
    assert.equal(insideOwnPractice.plan?.patient.resolved?.id, "outside-patient");

    // Planning never writes. Asserted here as well as in the boundary test because
    // the home screen is a new caller of the same endpoint.
    const encounters = Number(
      (db.prepare("SELECT COUNT(*) AS n FROM encounters").get() as { n: number }).n,
    );
    const orders = Number((db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n);
    await askFromHome("Draft a CMP for Maya Chen");
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n),
      orders,
      "proposing an order from the home screen creates no order",
    );
    assert.equal(
      Number((db.prepare("SELECT COUNT(*) AS n FROM encounters").get() as { n: number }).n),
      encounters,
    );
  } finally {
    process.chdir(originalCwd);
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.EHR_SESSION_SECRET;
    else env.EHR_SESSION_SECRET = originalSecret;
  }
});

test("no module asserts a clinical judgement it could not have made", () => {
  /**
   * Sentences that assert something about a patient rather than naming a concept.
   *
   * Deliberately not a list of units. `mEq/L` appears legitimately in the drug
   * interaction engine, the psychiatric vocabulary and the lab protocols, which
   * define what a lithium level *is* — that is reference data, not a finding. What
   * cannot exist as a literal is a claim: that surveillance was satisfied, that no
   * contraindication was found, that a score improved. Each of these was in the
   * home screen's answer ladder.
   */
  const assertedJudgements = [
    "PHQ-9 is",
    "GAD-7 improving",
    "Safety surveillance protocols are satisfied",
    "No urgent safety contraindications identified",
    "visits completed and signed",
    "Found 2 related records",
  ];

  const offenders: string[] = [];
  for (const file of sourceFiles(APP_ROOT)) {
    const contents = codeOnly(readFileSync(file, "utf8"));
    for (const finding of assertedJudgements) {
      if (contents.includes(finding)) offenders.push(`${relative(APP_ROOT, file)}: ${finding}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a clinical judgement must come from a record, not a string literal:\n${offenders.join("\n")}`,
  );
});

test("the answer surfaces carry no clinical values of their own", () => {
  /**
   * Narrower than the scan above and aimed at the files that *render answers*.
   *
   * A vocabulary module may name a unit; a component whose job is to display what
   * the server returned may not contain one, because the only place a value can
   * legitimately come from is the response. This is what would have caught the home
   * screen's "0.9 mEq/L (therapeutic range: 0.6–1.2 mEq/L)" the day it was written.
   */
  const answerSurfaces = [
    join(APP_ROOT, "components", "home", "ZenHomeWindow.tsx"),
    join(APP_ROOT, "components", "omnibox", "OmniboxPlanCard.tsx"),
    join(APP_ROOT, "components", "OmniboxPlannerBridge.tsx"),
    join(APP_ROOT, "lib", "omnibox-plan-client.ts"),
  ];

  const valueLiteral = /\d+(?:\.\d+)?\s*(?:mEq\/L|mg\/dL|ng\/mL|mmol\/L|mcg|mg\b)/i;
  const offenders: string[] = [];

  for (const file of answerSurfaces) {
    const code = codeOnly(readFileSync(file, "utf8"));
    if (valueLiteral.test(code)) offenders.push(`${relative(APP_ROOT, file)}: clinical value literal`);
    if (/therapeutic range/i.test(code)) offenders.push(`${relative(APP_ROOT, file)}: reference range`);
  }

  assert.deepEqual(
    offenders,
    [],
    `an answer surface renders what the server returned and holds no values of its own:\n${offenders.join("\n")}`,
  );
});

test("the home launcher holds no local answer path", () => {
  const home = readFileSync(join(APP_ROOT, "components", "home", "ZenHomeWindow.tsx"), "utf8");
  const code = codeOnly(home);

  assert.ok(
    code.includes("requestOmniboxPlan"),
    "the home launcher must ask the server planner",
  );
  assert.ok(
    code.includes("omniboxPlanFailureMessage"),
    "a planning failure must render as a stated refusal rather than an empty card",
  );
  // The removed shape: a local branch that assigns prose to be shown as an answer.
  assert.ok(
    !/responseText\s*=/.test(code),
    "the home launcher must not compose an answer locally",
  );
  assert.ok(
    !/setChatHistory|AiChatInteraction/.test(code),
    "the local answer state that held the fabricated responses must be gone",
  );
});

test("both answer surfaces render one card, so neither can drift", () => {
  const bridge = readFileSync(join(APP_ROOT, "components", "OmniboxPlannerBridge.tsx"), "utf8");
  const home = readFileSync(join(APP_ROOT, "components", "home", "ZenHomeWindow.tsx"), "utf8");

  for (const [name, contents] of [["workspace omnibox", bridge], ["home launcher", home]] as const) {
    assert.ok(
      codeOnly(contents).includes("OmniboxPlanCard"),
      `${name} must render the shared plan card rather than its own answer layout`,
    );
  }
});
