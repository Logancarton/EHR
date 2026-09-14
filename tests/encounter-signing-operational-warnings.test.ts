import test from "node:test";
import assert from "node:assert/strict";
import { formatSigningOutcomeMessage } from "../app/lib/encounter-engine";

/**
 * Validates that note signing outcome feedback protects clinicians from missing
 * incomplete operational follow-up (Logan's DB-1 review finding 3).
 */

test("signing outcome message returns full success when there are no operational warnings", () => {
  const message = formatSigningOutcomeMessage([]);
  assert.equal(message, "Encounter signed, integrity-snapshotted, and locked in the legal medical record.");
});

test("signing outcome message preserves appointment completion warning without being overwritten", () => {
  const warnings = ["visit could not be marked completed: HTTP 500 error"];
  const message = formatSigningOutcomeMessage(warnings);
  assert.ok(message.includes("Note signed and locked"));
  assert.ok(message.includes("Operational follow-up incomplete"));
  assert.ok(message.includes("visit could not be marked completed: HTTP 500 error"));
  assert.equal(
    message.includes("Encounter signed, integrity-snapshotted, and locked in the legal medical record."),
    false,
    "generic success must not mask the operational failure",
  );
});

test("signing outcome message combines multiple operational follow-up warnings", () => {
  const warnings = [
    "visit could not be marked completed: connection refused",
    "follow-up task was not created: patient access denied",
  ];
  const message = formatSigningOutcomeMessage(warnings);
  assert.ok(message.includes("Note signed and locked. Operational follow-up incomplete:"));
  assert.ok(message.includes("visit could not be marked completed: connection refused"));
  assert.ok(message.includes("follow-up task was not created: patient access denied"));
});
