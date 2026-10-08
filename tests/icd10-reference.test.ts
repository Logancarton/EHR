import test from "node:test";
import assert from "node:assert/strict";
import { findIcd10Code, searchIcd10 } from "../app/server/reference/icd10";

test("ICD-10-CM reference finds codes by code and by words, psychiatric first", () => {
  assert.deepEqual(findIcd10Code("F3181"), { code: "F31.81", description: "Bipolar II disorder" });
  assert.equal(findIcd10Code("F41.1")?.description, "Generalized anxiety disorder");
  assert.equal(findIcd10Code("F41"), null, "a category header is not a valid code");

  assert.equal(searchIcd10("F31.8")[0].code, "F31.81");
  const gad = searchIcd10("generalized anxiety");
  assert.equal(gad[0].code, "F41.1");
  const hypothyroid = searchIcd10("hypothyroidism");
  assert.ok(hypothyroid.some((c) => c.code === "E03.9"), "medical codes are searchable too");
  assert.deepEqual(searchIcd10("f"), [], "one character is too short to search");
});
