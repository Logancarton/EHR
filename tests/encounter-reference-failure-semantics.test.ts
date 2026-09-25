import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

test("signing distinguishes failed reference retrieval from zero references", () => {
  const text = read("app/components/encounter/EncounterSignModal.tsx");
  assert.match(text, /referenceLoadState/);
  assert.match(text, /This is not the same as having no references/);
  assert.match(text, /referenceLoadState !== "loaded"/);
  assert.doesNotMatch(text, /res\.ok \? res\.json\(\) : \{ references: \[\] \}/);
});

test("reference decisions must persist before legal signing", () => {
  const text = read("app/components/encounter/EncounterSignModal.tsx");
  const persist = text.indexOf("await api.encounters.reviewReferences");
  const sign = text.indexOf("await Promise.resolve(onSignNote())");
  assert.ok(persist >= 0 && sign > persist);
  assert.match(text, /The note was not signed; retry the evidence step/);
  assert.equal(text.includes("Non-blocking: legal note signing proceeds"), false);
});

test("post-sign order refresh failure remains an operational warning and does not re-sign", () => {
  const text = read("app/components/encounter/EncounterSignModal.tsx");
  assert.match(text, /orderRefreshFailed/);
  assert.match(text, /The legal note is signed and remains immutable/);
  assert.equal((text.match(/await Promise\.resolve\(onSignNote\(\)\)/g) || []).length, 1);
});

test("encounter workspace labels degraded reference provenance instead of replacing failure with empty refs", () => {
  // D-100 moved the label from a loose line under the note into the visit-readiness
  // panel, where it is an item with a Retry. The workspace must still wire the
  // failure state through, and the readiness model must still say what it means.
  const text = read("app/components/encounter/EncounterWorkspace.tsx");
  assert.match(text, /noteReferenceStatus/);
  assert.match(text, /referenceRefreshFailed: noteReferenceStatus === "error"/);
  assert.doesNotMatch(text, /catch\(\(\) => \{\s*if \(!cancelled\) setNoteReferences\(\[\]\);/);
  const readiness = read("app/domain/visit-readiness.ts");
  assert.match(readiness, /Coding may be using note-text fallback/);
});
