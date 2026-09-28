import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

test("Labs companion panel reaches longitudinal results and ordering from the same surface", () => {
  const source = read("app/components/companion/LabsCompanionPanel.tsx");

  assert.match(
    source,
    /calculateMonitoringStatus/,
    "must evaluate medication surveillance status",
  );
  assert.match(
    source,
    /monitoringEvidenceFromRecord/,
    "must derive monitoring evidence from authoritative clinical records",
  );
  assert.match(
    source,
    /psychiatricLabCatalog/,
    "must offer the psychiatric lab catalog for order composition",
  );
  assert.match(
    source,
    /onStageLabFor/,
    "must stage orders into the shared cart rather than creating a separate order truth",
  );
  assert.match(
    source,
    /practiceQueueApi/,
    "must reach the practice queue for unacknowledged results when no patient is selected",
  );
});

test("Labs companion panel maintains patient identity boundaries and mismatch indicators", () => {
  const source = read("app/components/companion/LabsCompanionPanel.tsx");

  assert.match(source, /selectedPatient\.mrn/, "must display patient MRN");
  assert.match(source, /selectedPatient\.dob/, "must display patient DOB");
  assert.match(
    source,
    /differsFromActiveChart/,
    "must clearly state when viewing a patient different from the active foreground chart",
  );
  assert.match(
    source,
    /ensurePatientOpen/,
    "must allow opening the patient chart directly from the companion identity header",
  );
});

test("CompanionPanelHost wires up workspace escalation for the Labs companion", () => {
  const host = read("app/components/workspace/CompanionPanelHost.tsx");

  assert.match(
    host,
    /onOpenWorkspace=\{[^}]*view:\s*"labs"[^}]*\}/,
    "CompanionPanelHost must pass onOpenWorkspace for labs escalation",
  );
});
