import assert from "node:assert/strict";
import test from "node:test";
import {
  ROSTER_FIELDS,
  DEFAULT_ROSTER_FIELDS,
  getRosterFieldDefinition,
  isPermanentAnchor,
  sanitizeRosterFields,
  filterRosterFieldsByCapabilities,
  type RosterFieldId,
} from "../app/domain/roster-fields";
import { defaultPreferences, mergeStoredPreferences } from "../app/lib/preference-engine";
import type { ClinicalPermission } from "../app/server/auth/provider-context";

test("roster fields registry defines permanent anchors and ordered defaults", () => {
  assert.equal(isPermanentAnchor("time"), true);
  assert.equal(isPermanentAnchor("patientName"), true);
  assert.equal(isPermanentAnchor("modality"), false);
  assert.equal(isPermanentAnchor("reason"), false);

  assert.ok(getRosterFieldDefinition("time"));
  assert.ok(getRosterFieldDefinition("patientName"));
  assert.ok(getRosterFieldDefinition("visitType"));
  assert.ok(getRosterFieldDefinition("modality"));
  assert.ok(getRosterFieldDefinition("status"));
  assert.ok(getRosterFieldDefinition("room"));
  assert.ok(getRosterFieldDefinition("provider"));
  assert.ok(getRosterFieldDefinition("assignment"));
  assert.ok(getRosterFieldDefinition("reason"));
  assert.ok(getRosterFieldDefinition("intake"));
  assert.ok(getRosterFieldDefinition("alerts"));
  assert.ok(getRosterFieldDefinition("mrn"));
  assert.ok(getRosterFieldDefinition("coverage"));

  // Defaults should start with time and include patientName
  assert.equal(DEFAULT_ROSTER_FIELDS[0], "time");
  assert.ok(DEFAULT_ROSTER_FIELDS.includes("patientName"));
});

test("sanitizeRosterFields enforces anchors and filters invalid or duplicate field IDs", () => {
  const fullPermissions: ClinicalPermission[] = [
    "read_clinical",
    "edit_draft",
    "sign_encounter",
    "stage_order",
    "authorize_order",
    "transmit_order",
    "send_message",
    "manage_tasks",
    "read_schedule",
    "manage_appointments",
    "edit_patient",
    "manage_clinical_record",
    "acknowledge_result",
    "amend_signed_record",
    "collaborate_team",
    "manage_team_tasks",
    "manage_integrations",
    "manage_organization",
    "manage_templates",
    "view_financial",
  ];

  // Missing anchors are automatically prepended
  const fieldsWithoutAnchors: RosterFieldId[] = ["status", "room", "modality"];
  const sanitized = sanitizeRosterFields(fieldsWithoutAnchors, fullPermissions);
  assert.equal(sanitized[0], "time");
  assert.equal(sanitized[1], "patientName");
  assert.ok(sanitized.includes("status"));
  assert.ok(sanitized.includes("room"));
  assert.ok(sanitized.includes("modality"));

  // Duplicates are deduplicated
  const fieldsWithDups = ["time", "patientName", "status", "status", "room", "time"] as RosterFieldId[];
  const deduped = sanitizeRosterFields(fieldsWithDups, fullPermissions);
  assert.equal(deduped.filter((f) => f === "status").length, 1);
  assert.equal(deduped.filter((f) => f === "time").length, 1);

  // Invalid IDs are removed
  const invalidFields = ["time", "patientName", "nonexistent_field" as any, "room"];
  const cleaned = sanitizeRosterFields(invalidFields, fullPermissions);
  assert.ok(!cleaned.includes("nonexistent_field" as any));
  assert.ok(cleaned.includes("room"));
});

test("filterRosterFieldsByCapabilities and sanitizeRosterFields enforce permission gating", () => {
  const frontDeskPermissions: ClinicalPermission[] = [
    "read_schedule",
    "manage_appointments",
    "send_message",
    "manage_tasks",
  ];

  // Reason and Intake require read_clinical
  const filtered = filterRosterFieldsByCapabilities(ROSTER_FIELDS, frontDeskPermissions);
  const ids = filtered.map((f) => f.id);
  assert.ok(!ids.includes("reason"), "Non-clinical front desk cannot see clinical reason / chief complaint");
  assert.ok(!ids.includes("intake"), "Non-clinical front desk cannot see clinical intake status");
  assert.ok(ids.includes("time"));
  assert.ok(ids.includes("patientName"));
  assert.ok(ids.includes("status"));
  assert.ok(ids.includes("room"));
  assert.ok(ids.includes("modality"));

  // Sanitizing with non-clinical permissions strips restricted fields
  const requestedWithClinical: RosterFieldId[] = ["time", "patientName", "reason", "intake", "status"];
  const sanitizedForStaff = sanitizeRosterFields(requestedWithClinical, frontDeskPermissions);
  assert.ok(!sanitizedForStaff.includes("reason"));
  assert.ok(!sanitizedForStaff.includes("intake"));
  assert.ok(sanitizedForStaff.includes("status"));
});

test("provider preferences round-trip and sanitize rosterFields setting", () => {
  const defaultPrefs = defaultPreferences;
  assert.ok(Array.isArray(defaultPrefs.today.rosterFields));
  assert.equal(defaultPrefs.today.rosterFields[0], "time");
  assert.ok(defaultPrefs.today.rosterFields.includes("patientName"));

  // Merge stored preferences with custom rosterFields
  const custom = {
    today: {
      rosterFields: ["time", "patientName", "modality", "room", "status"],
    },
  };
  const merged = mergeStoredPreferences(custom as any);
  assert.ok(merged.today.rosterFields);
  assert.deepEqual(merged.today.rosterFields, ["time", "patientName", "modality", "room", "status"]);

  // Stored preferences with omitted anchors get them restored
  const withoutAnchors = {
    today: {
      rosterFields: ["room", "modality"],
    },
  };
  const mergedWithAnchors = mergeStoredPreferences(withoutAnchors as any);
  assert.ok(mergedWithAnchors.today.rosterFields);
  assert.equal(mergedWithAnchors.today.rosterFields[0], "time");
  assert.equal(mergedWithAnchors.today.rosterFields[1], "patientName");
  assert.ok(mergedWithAnchors.today.rosterFields.includes("room"));
});
