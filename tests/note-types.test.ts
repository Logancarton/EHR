import assert from "node:assert/strict";
import test from "node:test";
import {
  addCustomNoteType,
  BUILT_IN_NOTE_TYPES,
  isBlankNote,
  namedNoteType,
  normalizeCustomNoteTypes,
  noteTypeChoices,
} from "../app/domain/note-types";
import { builtInTemplates, createInitialEncounter } from "../app/lib/encounter-engine";

test("the voice menu offers intake, follow-up, phone call and psychotherapy, each on a real template", () => {
  assert.deepEqual(
    BUILT_IN_NOTE_TYPES.map((type) => type.label),
    ["Intake", "Follow-up", "Phone call", "Psychotherapy"],
  );
  for (const type of BUILT_IN_NOTE_TYPES) {
    assert.ok(
      builtInTemplates.some((template) => template.id === type.templateId),
      `${type.label} opens on a template that exists`,
    );
  }
});

test("a named note is recorded under the clinician's own words, and a built-in name resolves to the built-in", () => {
  assert.equal(namedNoteType("   "), null);
  const custom = namedNoteType("  Family   meeting ");
  assert.deepEqual(
    { label: custom?.label, visitType: custom?.visitType, custom: custom?.custom },
    { label: "Family meeting", visitType: "Family meeting", custom: true },
  );
  assert.equal(namedNoteType("phone CALL")?.id, "phone-call");
});

test("saved note types are cleaned: no blanks, duplicates, built-in names or non-strings", () => {
  assert.deepEqual(
    normalizeCustomNoteTypes(["Group session", "group session", "", 4, "Intake", " Collateral call "]),
    ["Group session", "Collateral call"],
  );
  assert.deepEqual(normalizeCustomNoteTypes("Group session"), []);
  assert.deepEqual(addCustomNoteType(["Group session"], "Group Session"), ["Group session"]);
  assert.deepEqual(addCustomNoteType(["Group session"], "Care conference"), ["Group session", "Care conference"]);
  assert.deepEqual(
    noteTypeChoices(["Care conference"]).map((type) => type.label),
    ["Intake", "Follow-up", "Phone call", "Psychotherapy", "Care conference"],
  );
});

test("a new note's own defaults still count as blank; anything the clinician wrote does not", () => {
  const fresh = createInitialEncounter("maya-chen");
  assert.equal(isBlankNote(fresh, fresh), true);
  assert.equal(isBlankNote({ ...fresh, plan: "Continue sertraline." }, fresh), false);
  assert.equal(isBlankNote({ ...fresh, chiefComplaint: "  " }, fresh), true);
});
