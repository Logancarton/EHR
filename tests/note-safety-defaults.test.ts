import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_AUTOFILLED_MSE,
  NORMAL_MSE_PHRASES,
  calculateEncounterCoding,
  createInitialEncounter,
  fillBlankMseWithNormal,
  withoutLegacyAutofilledMse,
} from "../app/lib/encounter-engine";
import { currentSafetyFlags, type AssessmentRecord } from "../app/domain/clinical-measurements";
import {
  buildVisitReadiness,
  type ReadinessDraftFacts,
  type VisitReadinessServerView,
} from "../app/domain/visit-readiness";
import { formatDateAge, formatCalendarDate, toCalendarDate } from "../app/lib/clinical-date";
import { DatabaseSync } from "node:sqlite";
import { migration as clearUnauthoredMse } from "../app/server/db/migrations/2026-09-25-003-clear-unauthored-draft-mse";

/**
 * NOTE-SAFE-1 (D-104). A new note used to open with a complete normal mental
 * status exam — "no suicidal ideation" included — which was saved with the draft
 * and satisfied the safety goal by keyword, for a patient whose chart showed a
 * positive PHQ-9 item 9. These tests hold the replacement: nothing clinical is
 * assumed, safety is met only by a written risk assessment, and a current safety
 * flag leads the note until it is.
 */

function goal(draft: ReturnType<typeof createInitialEncounter>, id: string) {
  return calculateEncounterCoding(draft, 0, []).goals.find((entry) => entry.id === id);
}

test("a brand-new note assumes no findings and claims no exam or safety assessment", () => {
  const draft = createInitialEncounter("maya-chen");
  for (const [dimension, text] of Object.entries(draft.mse)) {
    assert.equal(text, "", `MSE ${dimension} must start blank`);
  }
  assert.equal(draft.chiefComplaint, "", "the chief complaint is the patient's, not a template's or a demo script's");
  assert.equal(goal(draft, "mse")?.met, false);
  assert.equal(goal(draft, "safety")?.met, false);
});

test("safety is met by a written risk assessment, never by thought-content keywords", () => {
  const base = createInitialEncounter("synthetic-patient");
  const keywordsOnly = { ...base, mse: { ...base.mse, thoughtContent: "Denies SI/HI. No safety concerns." } };
  assert.equal(goal(keywordsOnly, "safety")?.met, false);

  const assessed = {
    ...base,
    riskAssessment: "Passive SI last month, none today; no plan or intent; firearms absent; safety plan reviewed.",
  };
  assert.equal(goal(assessed, "safety")?.met, true);
  assert.equal(goal(assessed, "safety")?.evidence, "clinician-authored");
});

test("an unsigned draft loses only the old unauthored defaults, never what a clinician wrote", () => {
  const cleaned = withoutLegacyAutofilledMse({
    ...LEGACY_AUTOFILLED_MSE,
    moodAffect: "Anxious, affect constricted.",
  });
  assert.equal(cleaned.thoughtContent, "", "the pre-filled 'no suicidal ideation' is not a finding");
  assert.equal(cleaned.appearance, "");
  assert.equal(cleaned.moodAffect, "Anxious, affect constricted.");
});

test("the normal exam is inserted on request, into blank rows only, with no quotation attributed to the patient", () => {
  const draft = createInitialEncounter("synthetic-patient");
  const filled = fillBlankMseWithNormal({ ...draft.mse, thoughtContent: "Passive SI, no plan." });
  assert.equal(filled.thoughtContent, "Passive SI, no plan.", "a written finding is never overwritten");
  assert.equal(filled.appearance, NORMAL_MSE_PHRASES.appearance);
  for (const text of Object.values(NORMAL_MSE_PHRASES)) assert.doesNotMatch(text, /['"]/);
});

function assessment(overrides: Partial<AssessmentRecord>): AssessmentRecord {
  return {
    id: "a",
    patientId: "p",
    instrument: "phq-9",
    instrumentVersion: "1.0",
    title: "PHQ-9",
    totalScore: 0,
    maxScore: 27,
    severity: "",
    responses: {},
    flags: [],
    source: "clinician",
    administeredBy: "x",
    administeredAt: "2026-01-01T00:00:00Z",
    reviewStatus: "reviewed",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

test("only the latest administration of each instrument carries a current safety flag", () => {
  const march = assessment({ id: "phq-march", administeredAt: "2026-03-15T14:30:00Z", flags: ["POSITIVE ITEM 9"] });
  const may = assessment({ id: "phq-may", administeredAt: "2026-05-19T10:15:00Z" });
  assert.deepEqual(currentSafetyFlags([may, march]), [], "a later negative PHQ-9 supersedes the March flag");

  const cssrs = assessment({ id: "cssrs", instrument: "cssrs", title: "C-SSRS", administeredAt: "2026-02-01T00:00:00Z", flags: ["Ideation with intent"] });
  assert.deepEqual(currentSafetyFlags([may, march, cssrs]).map((flag) => flag.assessmentId), ["cssrs"]);
});

const draftFacts: ReadinessDraftFacts = {
  sections: { chiefComplaint: "Follow-up", intervalHistory: "", assessment: "", plan: "", followUp: "", riskAssessment: "" },
  goals: [
    { id: "hpi", label: "Interval History Documented", detail: "", met: false, codeImpact: "" },
    { id: "safety", label: "Safety & Suicidality Assessed", detail: "", met: false, codeImpact: "" },
  ],
  primaryCode: "99212",
  addonCodes: [],
  evidenceBasis: "inferred",
  noteTemplateId: "psych-followup-99214",
  templateExpectsPsychotherapy: false,
  psychotherapyMinutes: 0,
};

function server(safety: VisitReadinessServerView["safety"]): VisitReadinessServerView {
  return {
    patientId: "p",
    encounterId: "e",
    resolvedAt: "",
    care: { items: [] },
    safety,
    monitoring: { items: [] },
    coverage: { findings: [] },
    diagnosis: null,
    billing: { chargeTemplates: [], feeCodes: [], rendering: { hasNpi: true } },
  };
}

test("a current safety flag is the first open note item until the risk assessment is written", () => {
  const flag = { assessmentId: "cssrs", instrument: "cssrs" as const, title: "C-SSRS", administeredAt: "2026-09-20T00:00:00Z", flag: "Ideation with intent." };
  const open = buildVisitReadiness({ draft: draftFacts, server: server({ flags: [flag] }), serverError: null, referenceRefreshFailed: false });
  const note = open.groups.find((group) => group.id === "note")!;
  assert.equal(note.items[0].id, "safety:cssrs:0");
  assert.equal(note.items[0].state, "open");
  assert.deepEqual(note.items[0].action, { kind: "focus-section", section: "riskAssessment", label: "Go to Risk Assessment" });
  assert.equal(note.items.some((item) => item.id === "goal:safety"), false, "one safety item, not two");

  const written = buildVisitReadiness({
    draft: {
      ...draftFacts,
      sections: { ...draftFacts.sections, riskAssessment: "Ideation with intent reviewed; safety plan updated; crisis line given." },
    },
    server: server({ flags: [flag] }),
    serverError: null,
    referenceRefreshFailed: false,
  });
  assert.equal(written.groups[0].items.find((item) => item.id === "safety:cssrs:0")?.state, "complete");
});

test("safety history that could not be read is stated, never read as no concern", () => {
  const result = buildVisitReadiness({ draft: draftFacts, server: server({ error: "database locked" }), serverError: null, referenceRefreshFailed: false });
  const unavailable = result.groups[0].items.find((item) => item.id === "safety:unavailable");
  assert.equal(unavailable?.state, "unavailable");
  assert.match(unavailable?.detail ?? "", /database locked/);
});

test("clinical dates read the same whichever shape they arrive in, with their age", () => {
  assert.equal(toCalendarDate("2026-05-19T07:00:00.000Z"), "2026-05-19");
  assert.equal(toCalendarDate("Sep 24, 2026"), "2026-09-24");
  assert.equal(formatCalendarDate("2026-05-19T07:00:00.000Z"), "May 19, 2026");
  assert.equal(formatCalendarDate("Sep 24, 2026"), "Sep 24, 2026");
  assert.equal(formatDateAge("2026-09-25", "2026-09-25"), "today");
  assert.equal(formatDateAge("Sep 24, 2026", "2026-09-25"), "yesterday");
  assert.equal(formatDateAge("2026-05-19", "2026-09-25"), "4 mo ago");
  assert.equal(formatDateAge("2026-10-02", "2026-09-25"), "in 7 days");
});

test("the migration clears the stored default from unsigned drafts only, and records that it did", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE encounters (id TEXT PRIMARY KEY, patient_id TEXT, status TEXT, mse_json TEXT);
    CREATE TABLE provenance_events (id TEXT PRIMARY KEY, patient_id TEXT, entity_type TEXT, entity_id TEXT,
      activity TEXT, source_type TEXT, source_system TEXT, source_ref TEXT, actor_id TEXT, actor_name TEXT,
      payload_sha256 TEXT, metadata_json TEXT, created_at TEXT);
  `);
  const edited = { ...LEGACY_AUTOFILLED_MSE, moodAffect: "Anxious." };
  const insert = db.prepare("INSERT INTO encounters VALUES (?, 'p', ?, ?)");
  insert.run("draft-1", "draft", JSON.stringify(edited));
  insert.run("signed-1", "signed", JSON.stringify(LEGACY_AUTOFILLED_MSE));

  clearUnauthoredMse.apply(db);
  clearUnauthoredMse.apply(db); // idempotent

  const read = (id: string) =>
    JSON.parse((db.prepare("SELECT mse_json FROM encounters WHERE id = ?").get(id) as { mse_json: string }).mse_json);
  assert.equal(read("draft-1").thoughtContent, "");
  assert.equal(read("draft-1").moodAffect, "Anxious.", "clinician-edited text is kept");
  assert.equal(read("signed-1").thoughtContent, LEGACY_AUTOFILLED_MSE.thoughtContent, "a signed note is never rewritten");
  const events = db.prepare("SELECT entity_id, metadata_json FROM provenance_events").all() as Array<{ entity_id: string; metadata_json: string }>;
  assert.equal(events.length, 1);
  assert.equal(events[0].entity_id, "draft-1");
  assert.equal(JSON.parse(events[0].metadata_json).cleared.includes("thoughtContent"), true);
});

test("a patient's encounters come back newest first by calendar date, not alphabetically", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const originalCwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), "ehr-encounter-order-")));
  try {
    const [{ getDatabase }, { EncounterRepository }] = await Promise.all([
      import("../app/server/db/connection"),
      import("../app/server/repositories/encounter-repository"),
    ]);
    getDatabase();
    const dates = EncounterRepository.getByPatient("maya-chen").map((encounter) => toCalendarDate(encounter.date));
    assert.ok(dates.length >= 3, "the synthetic chart has several visits");
    assert.deepEqual(dates, [...dates].sort().reverse(), `got ${dates.join(", ")}`);
  } finally {
    process.chdir(originalCwd);
  }
});
