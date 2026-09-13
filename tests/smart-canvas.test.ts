import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSmartChipCatalog,
  detectSmartChipsInText,
  segmentTextBySpans,
  insertSmartChipAtCursor,
} from "../app/domain/smart-canvas";

test("builds a catalog with patient medications, diagnoses, and lab reference data", () => {
  const catalog = buildSmartChipCatalog(
    {
      name: "Marcus Vance",
      meds: ["Lisdexamfetamine 40 mg daily", "Melatonin 3 mg nightly"],
      diagnoses: ["ADHD, combined presentation"],
    },
    ["Penicillin"]
  );

  assert.ok(catalog.length > 15, "catalog should contain rich standard items");
  const medItem = catalog.find((c) => c.label.includes("Lisdexamfetamine"));
  assert.ok(medItem, "medication should be present in catalog");
  assert.ok(medItem?.meta?.sig?.includes("40 mg"), "SIG should reflect dosage");

  const labItem = catalog.find((c) => c.label.includes("TSH"));
  assert.ok(labItem, "lab item should be present");
  assert.equal(labItem?.meta?.labFlag, "normal");

  const allergyItem = catalog.find((c) => c.type === "allergy");
  assert.ok(allergyItem, "allergy item should be present");
  assert.equal(allergyItem?.label, "Penicillin");
});

test("detects smart chips in clean clinical text without special markup", () => {
  const catalog = buildSmartChipCatalog({
    meds: ["Lisdexamfetamine 40 mg daily"],
    diagnoses: ["ADHD, combined presentation"],
  });

  const noteText =
    "Patient reports stability on Lisdexamfetamine 40 mg daily. Diagnosis of ADHD, combined presentation was reassessed.";

  const spans = detectSmartChipsInText(noteText, catalog);
  assert.equal(spans.length, 2);

  assert.equal(spans[0].type, "med");
  assert.equal(spans[0].label, "Lisdexamfetamine 40 mg daily");
  assert.equal(spans[0].start, noteText.indexOf("Lisdexamfetamine 40 mg daily"));

  assert.equal(spans[1].type, "dx");
  assert.equal(spans[1].label, "ADHD, combined presentation");
  assert.equal(spans[1].start, noteText.indexOf("ADHD, combined presentation"));
});

test("segments text into alternating prose and chip elements", () => {
  const catalog = buildSmartChipCatalog({
    meds: ["Lisdexamfetamine 40 mg daily"],
  });

  const text = "Titrated to Lisdexamfetamine 40 mg daily with good response.";
  const spans = detectSmartChipsInText(text, catalog);
  const segments = segmentTextBySpans(text, spans);

  assert.equal(segments.length, 3);
  assert.equal(segments[0].isChip, false);
  assert.equal(segments[0].text, "Titrated to ");

  assert.equal(segments[1].isChip, true);
  if (segments[1].isChip) {
    assert.equal(segments[1].text, "Lisdexamfetamine 40 mg daily");
    assert.equal(segments[1].span.type, "med");
  }

  assert.equal(segments[2].isChip, false);
  assert.equal(segments[2].text, " with good response.");
});

test("inserts selected smart chip text replacing the @ trigger", () => {
  const current = "Patient was prescribed @lis";
  const cursor = current.length;
  const triggerLength = 4; // '@lis'

  const catalog = buildSmartChipCatalog({
    meds: ["Lisdexamfetamine 40 mg daily"],
  });
  const medItem = catalog.find((c) => c.label.includes("Lisdexamfetamine"))!;

  const result = insertSmartChipAtCursor(current, cursor, medItem, triggerLength);
  assert.equal(result.nextText, "Patient was prescribed Lisdexamfetamine 40 mg daily ");
  assert.equal(result.newCursorIndex, "Patient was prescribed Lisdexamfetamine 40 mg daily ".length);
});
