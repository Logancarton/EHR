import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  AVAILABLE_WORKSPACE_TOOLS,
  DEFAULT_PINS,
  findTool,
  isAvailableTool,
  pinnedTools,
} from "../app/lib/workspace-tools";
import { GLOBAL_WORKSPACE_MODULES, isGlobalModuleAvailable } from "../app/lib/workspace-navigation";
import { googleWorkspaceApps } from "../app/domain/clinical-query";
import { DASHBOARD_MODULES } from "../app/domain/dashboard-modules";
import { BILLING_PREVIEW_ROUTE, isPreviewRoute } from "../app/lib/preview/preview-route";

/**
 * P9-0 containment.
 *
 * The defect these guard against is specific and was live on `main`: the Billing
 * destination rendered a prototype that held five invented claims in React state,
 * reported "Batch 837P transmitted 1 claim to Availity clearinghouse" after calling
 * `setState`, and showed a "98.2% clean claim rate" that came from nowhere. The
 * Financials destination did the same for bank deposits and accounting sync.
 *
 * Registry hiding alone was never evidence of containment — Billing was not even
 * marked planned in the tool registry while the dashboard registry said it was — so
 * these tests check the reachable paths rather than one list: the rails, the app
 * drawer, the home shortcuts, saved rails, and the source of every non-preview
 * module.
 */

const APP_ROOT = join(import.meta.dirname, "..", "app");
const PREVIEW_COMPONENT = join(APP_ROOT, "components", "preview", "BillingPrototypePreview.tsx");

/**
 * The file with its comments removed.
 *
 * Naming a fabrication in a comment is how the reason for a rule stays readable —
 * several files here explain exactly what "Batch 837P transmitted ... to Availity"
 * used to do. What must not exist is the phrase in code that can render. Stripping
 * line and block-continuation comments draws that line without weakening the ban.
 */
function codeOnly(contents: string): string {
  return contents
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.startsWith("//") ||
        trimmed.startsWith("*") ||
        trimmed.startsWith("/*")
      );
    })
    .join("\n");
}

function sourceFiles(root: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(root, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

test("the withdrawn financial prototype is offered nowhere a clinician navigates", () => {
  const financials = findTool("financial_integration");
  assert.ok(financials, "the registry still records the intended destination");
  assert.equal(isAvailableTool(financials!), false, "no accounting or banking integration exists");

  assert.ok(
    !AVAILABLE_WORKSPACE_TOOLS.some((tool) => tool.id === "financial_integration"),
    "a withdrawn destination must not be offered in the launcher",
  );
  assert.ok(
    !DEFAULT_PINS.left.includes("financial_integration") &&
      !DEFAULT_PINS.right.includes("financial_integration"),
    "a withdrawn destination must not be pinned by default",
  );

  // The specific stale-state case P9-0 asks about: a rail saved while the tile was
  // still offered must not bring it back.
  const stale = { left: ["today", "financial_integration", "inbox"], right: [] };
  assert.deepEqual(
    pinnedTools(stale, "left").map((tool) => tool.id),
    ["today", "inbox"],
    "a rail saved before the tile was withdrawn renders without it",
  );
});

test("every destination list agrees with one registry", () => {
  // Three hard-coded lists used to disagree with the registry and with each other.
  // The drawer offered Reports after the registry withdrew it, and offered the
  // Financials prototype throughout.
  for (const app of googleWorkspaceApps) {
    const tool = findTool(app.id);
    if (!tool) continue;
    assert.ok(isAvailableTool(tool), `the app drawer must not offer the withdrawn ${app.id}`);
  }

  for (const module of GLOBAL_WORKSPACE_MODULES) {
    const tool = findTool(module);
    assert.equal(
      isGlobalModuleAvailable(module),
      tool ? isAvailableTool(tool) : true,
      `${module} availability must come from the registry, not from a local list`,
    );
  }

  const home = readFileSync(join(APP_ROOT, "components", "home", "ZenHomeWindow.tsx"), "utf8");
  assert.ok(
    home.includes("isGlobalModuleAvailable"),
    "the home launcher must filter its shortcuts through the registry rather than hard-coding them",
  );
});

test("the workspace shell cannot render a withdrawn module's component", () => {
  const shell = readFileSync(join(APP_ROOT, "components", "GlobalWorkspaceShell.tsx"), "utf8");

  assert.ok(
    !shell.includes("FinancialIntegrationWorkspace"),
    "the withdrawn financial prototype must not be imported or rendered by the workspace shell",
  );
  // The guard runs before any renderer branch, so re-adding a branch for a planned
  // module does not reopen the hole. That ordering is the actual protection.
  const guardIndex = shell.indexOf("!isGlobalModuleAvailable(activeModule)");
  const firstBranchIndex = shell.indexOf('activeModule === "inbox"');
  assert.ok(guardIndex > 0, "the shell must check registry availability before rendering a module");
  assert.ok(
    guardIndex < firstBranchIndex,
    "the availability guard must run before the module renderer branches, not after them",
  );
});

test("the retained prototype lives behind the preview rule and nowhere else", () => {
  assert.ok(isPreviewRoute(BILLING_PREVIEW_ROUTE), "the prototype must sit under the preview prefix");

  const preview = readFileSync(PREVIEW_COMPONENT, "utf8");
  const previewCode = codeOnly(preview);
  // A preview that could issue a request is not a preview. This is the same rule the
  // dashboard prototype is held to.
  for (const forbidden of ["api-client", "fetch(", "/api/"]) {
    assert.ok(
      !previewCode.includes(forbidden),
      `the billing prototype must not be able to reach the server (found ${forbidden})`,
    );
  }
  assert.ok(
    preview.includes("data-preview-banner"),
    "the prototype must carry the preview banner that names it as synthetic",
  );
  // A banner does not survive a screenshot of one tile, so each figure is marked too.
  assert.ok(
    preview.includes("billing-demo-tag"),
    "each invented figure must be marked demo where it is rendered",
  );
});

test("no normal surface reports a transmission, a payer response, or invented money", () => {
  /**
   * Phrases that can only be true if a payer, a clearinghouse or a bank talked to
   * this product. None of them has. The preview is the one place entitled to show
   * the shapes, and it labels every one.
   */
  const fabrications = [
    "Availity",
    "98.2%",
    "42,850",
    "837P",
    "Synced 12 transactions",
    "EFT deposited",
    "clean claim rate",
    "Auto-payout scheduled",
  ];

  const offenders: string[] = [];
  for (const file of sourceFiles(APP_ROOT)) {
    if (file === PREVIEW_COMPONENT) continue;
    const contents = codeOnly(readFileSync(file, "utf8"));
    for (const phrase of fabrications) {
      if (contents.includes(phrase)) offenders.push(`${relative(APP_ROOT, file)}: ${phrase}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `only the labelled preview may carry simulated financial evidence:\n${offenders.join("\n")}`,
  );
});

test("the live billing surface carries no seeded claims", () => {
  const workspace = readFileSync(join(APP_ROOT, "components", "workspaces", "BillingWorkspace.tsx"), "utf8");

  // The prototype's shape: a module-level array of claim literals with amounts.
  assert.ok(
    !/const\s+[A-Z_]*CLAIMS[A-Z_]*\s*:/.test(workspace),
    "the billing workspace must not declare a claims fixture",
  );
  assert.ok(
    !/billedAmount|expectedAmount/.test(workspace),
    "the billing workspace must not carry invented monetary fields",
  );
  assert.ok(
    workspace.includes("api.billing.worklist"),
    "every row on the billing surface must come from the authorized API",
  );
  assert.ok(
    workspace.includes("disabledReason"),
    "an action the product cannot perform must be disabled with a stated reason",
  );
});

test("the dashboard billing window stays planned and explains itself accurately", () => {
  const billing = DASHBOARD_MODULES.find((module) => module.id === "billing");
  assert.ok(billing, "the dashboard registry still records the intended window");
  assert.equal(billing!.status, "planned", "claim and payment state does not exist yet");
  assert.ok(
    billing!.unavailableReason && billing!.unavailableReason.trim().length > 0,
    "a deferred window must say why rather than rendering an empty card",
  );
  assert.ok(
    !/Phase P7/.test(billing!.unavailableReason!),
    "the deferral reason must name the phase that actually owns the work",
  );
});

test("the preview route is not reachable from workspace navigation", () => {
  // The prototype is a repository-owned page for design review. A control inside
  // the product that opened it would put the demo back into the clinical path by
  // another door.
  const offenders = sourceFiles(APP_ROOT)
    .filter((file) => !file.includes(`${sep}preview${sep}`) && !file.endsWith("preview-route.ts"))
    .filter((file) => codeOnly(readFileSync(file, "utf8")).includes("/preview/billing"));

  assert.deepEqual(
    offenders,
    [],
    `no workspace surface may link to the billing prototype:\n${offenders.join("\n")}`,
  );
});
