import test from "node:test";
import assert from "node:assert/strict";
import { dateOfBirthSearchText, formatDateOfBirth, normalizeDateOfBirth, sameDateOfBirth } from "../app/domain/patient-administration";
import { findPossibleDuplicates } from "../app/domain/prospective-person";

test("both stored date-of-birth shapes name the same calendar day", () => {
  assert.equal(normalizeDateOfBirth("04/18/1992"), "1992-04-18");
  assert.equal(normalizeDateOfBirth("4/8/1992"), "1992-04-08");
  assert.equal(normalizeDateOfBirth("1992-04-18"), "1992-04-18");
  assert.equal(normalizeDateOfBirth("02/30/1992"), null);
  assert.equal(normalizeDateOfBirth(""), null);
  assert.equal(sameDateOfBirth(" 1992-04-18 ", "04/18/1992"), true);
  assert.equal(sameDateOfBirth("1992-04-19", "04/18/1992"), false);
  // Two unreadable values are not a match.
  assert.equal(sameDateOfBirth("", ""), false);
  assert.equal(sameDateOfBirth("unknown", "unknown"), false);
});

test("dates of birth display in one shape", () => {
  assert.equal(formatDateOfBirth("1991-05-14"), "05/14/1991");
  assert.equal(formatDateOfBirth("04/18/1992"), "04/18/1992");
  assert.equal(formatDateOfBirth("4/8/1992"), "04/08/1992");
  assert.equal(formatDateOfBirth("unknown"), "unknown");
});

test("a prospect's ISO date of birth still finds an existing chart stored as MM/DD/YYYY", () => {
  const matches = findPossibleDuplicates(
    { name: "M. Chen", dob: "1992-04-18" },
    [{ id: "maya-chen", name: "Maya Chen", dob: "04/18/1992", mrn: "P-10482" }],
  );
  assert.deepEqual(matches.map((match) => [match.patientId, match.matchedOn]), [["maya-chen", ["dob"]]]);
});

test("a date of birth is searchable as stored, as displayed and as ISO", () => {
  const text = dateOfBirthSearchText("1993-07-21");
  assert.ok(text.includes("07/21/1993"));
  assert.ok(text.includes("1993-07-21"));
  assert.ok(dateOfBirthSearchText("04/18/1992").includes("1992-04-18"));
  assert.equal(dateOfBirthSearchText(undefined).trim(), "");
});
