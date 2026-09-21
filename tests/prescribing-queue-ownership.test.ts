import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PINS, WORKSPACE_TOOLS } from "../app/lib/workspace-tools";
import { defaultPreferences, mergeStoredPreferences } from "../app/lib/preference-engine";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

/**
 * Who owns the practice prescribing queue (UI-7d, D-090).
 *
 * The Clinical menu's Prescribing opened `PrescriptionOperationsWorkspace` as a
 * full-canvas module. Its replacement is the right companion, for a reason that is
 * a property of the shell rather than of the data: every action the queue offers is
 * gated on the patient's chart being the *active* execution context, and a
 * full-canvas module and a chart cannot both own the active tab.
 *
 * These read source because the invariant is about ownership. The behaviour is
 * exercised in `tests/browser/clinical-decomposition.spec.ts`; the parts of it that
 * need a non-empty queue are not reachable in any checkout of this repository, and
 * D-092 records which those are.
 */

test("the companion and the module render one queue, not two", () => {
  const shell = read("app/components/GlobalWorkspaceShell.tsx");
  const companion = read("app/components/companion/PrescribingPanel.tsx");

  for (const [name, source] of [
    ["the module shell", shell],
    ["the companion", companion],
  ] as const) {
    assert.match(
      source,
      /import PrescriptionOperationsWorkspace/,
      `${name} must render the authoritative queue rather than its own copy`,
    );
  }

  // A companion that reimplemented the retry and evidence rules could disagree with
  // the authoritative surface about what a clinician may do to a prescription. The
  // panel is a container: a header, the workspace, and the escalation to the tab.
  assert.doesNotMatch(
    companion,
    /prescriptionOperationsApi|patientContextMatches|recordEvidence/,
    "the companion must not carry a second copy of the queue's rules",
  );
});

test("Prescribing is a companion surface, pinned by default and backfilled into saved rails", () => {
  const tool = WORKSPACE_TOOLS.find((candidate) => candidate.id === "prescribing");
  assert.ok(tool, "prescribing must stay in the tool registry");
  assert.ok(
    tool.surfaces.includes("panel"),
    "the companion rail can only offer a tool the registry says has a panel",
  );
  assert.ok(
    tool.surfaces.includes("full"),
    "the workspace tab stays reachable, so a saved layout holding it is not stranded",
  );

  assert.ok(
    DEFAULT_PINS.right.includes("prescribing"),
    "a new clinician gets the queue's only remaining route without configuring anything",
  );
  assert.ok(
    defaultPreferences.rails.right.includes("prescribing"),
    "and so does a clinician whose preferences are the defaults",
  );

  // The backfill is the part that matters for anyone already using the product: the
  // Clinical menu was their last route, and it is gone.
  const legacy = {
    ...defaultPreferences,
    appliedRailBackfills: ["communication", "hr"],
    rails: { ...defaultPreferences.rails, right: ["calendar", "ai", "communication", "hr", "calc"] },
  } as never;
  assert.ok(
    mergeStoredPreferences(legacy).rails.right.includes("prescribing"),
    "a rail saved before the companion existed receives it rather than losing the capability",
  );
});

test("activating a patient chart from the queue puts the queue somewhere that survives it", () => {
  const workspace = read("app/components/PrescriptionOperationsWorkspace.tsx");

  // The open defect D-090 recorded: `openPatient` clears the active module, which
  // unmounted this component when it was rendered full-canvas. The repair is the
  // move — ask for the companion first, then bring the chart up beside it.
  const activate = /async function activatePatientContext\(\)[\s\S]*?\n  \}/.exec(workspace)?.[0];
  assert.ok(activate, "the patient-context activation should be readable from source");
  const askedForCompanion = activate.indexOf("WORKSPACE_OPEN_COMPANION_EVENT");
  const openedChart = activate.indexOf("ensurePatientOpen");
  assert.ok(askedForCompanion >= 0, "the queue must ask for the companion before losing its canvas");
  assert.ok(
    askedForCompanion < openedChart,
    "it must ask before activating the chart, not after the module has already gone",
  );
});

/**
 * Picking a patient in the companion (D-093).
 *
 * The practice queue is empty in every checkout, so a companion that offered only
 * the queue offered nothing to do with a prescription. The selector reaches the
 * per-patient prescribing work that was previously only available by navigating
 * into the chart's Medications section.
 */
test("the companion reaches per-patient prescribing work through the same component the chart uses", () => {
  const panel = read("app/components/companion/PrescribingPanel.tsx");
  const chart = read("app/components/patient/PatientMedications.tsx");

  for (const [name, source] of [
    ["the chart's Medications section", chart],
    ["the companion", panel],
  ] as const) {
    assert.match(
      source,
      /import PatientPrescriptionWork/,
      `${name} must render the shared per-patient surface rather than its own copy`,
    );
  }

  // Still a container. The rules stay in the components it hosts, so the two
  // surfaces cannot disagree about what a clinician may do to a prescription.
  assert.doesNotMatch(
    panel,
    /prescriptionOperationsApi|patientPrescribingWorkspaceApi|patientContextMatches/,
    "the companion must not carry a second copy of either queue's rules",
  );
});

test("a companion showing a patient carries that patient's identity, and says when it differs from the chart", () => {
  const panel = read("app/components/companion/PrescribingPanel.tsx");

  // A single identity label for the whole application is exactly what this rule
  // forbids: the companion can be on a different patient from the chart in front
  // of the clinician, which is the point of being able to pick one.
  assert.match(panel, /prescribing-patient-identity/, "the pane names its own patient");
  for (const fact of ["selectedPatient.name", "selectedPatient.mrn", "selectedPatient.dob"]) {
    assert.ok(
      panel.includes(fact),
      `the pane's identity header must carry ${fact}`,
    );
  }
  assert.match(
    panel,
    /differsFromActiveChart/,
    "a mismatch with the active chart is stated rather than left to be noticed",
  );
});

test("the composer opens for the patient the companion is showing, not for the active chart", () => {
  const host = read("app/components/workspace/CompanionPanelHost.tsx");
  const workspace = read("app/components/PatientWorkspace.tsx");

  assert.match(
    host,
    /onOpenPrescribeFor/,
    "the host must pass a patient-explicit composer callback",
  );
  // `onOpenOrderCart` resolves the *active* chart, so reusing it here would open
  // the composer on the wrong patient whenever the companion is showing another.
  assert.match(
    workspace,
    /onOpenPrescribeFor=\{\(patientId\) => orders\.openComposer\(patientId, "prescribe"\)\}/,
    "the workspace must bind the composer to the id the companion supplies",
  );
});

test("staging an order tells the surfaces showing that patient's prescribing work", () => {
  const composer = read("app/components/orders/OrderCartModal.tsx");
  const panel = read("app/components/companion/PrescribingPanel.tsx");

  // The event was declared with the rest of the workspace events and never
  // dispatched. Without it the clinician stages from the companion and the
  // companion goes on saying the patient has no prescribing history.
  assert.match(
    composer,
    /dispatchWorkspaceEvent\(\s*WORKSPACE_ORDER_CREATED_EVENT/,
    "staging a prescription must announce that the patient's orders changed",
  );
  assert.match(
    panel,
    /subscribeWorkspaceEvent\(WORKSPACE_ORDER_CREATED_EVENT/,
    "the companion must reload the patient's work when it does",
  );
  assert.match(
    panel,
    /detail\?\.patientId && detail\.patientId !== selectedPatientId/,
    "and only for the patient it is showing",
  );
});
