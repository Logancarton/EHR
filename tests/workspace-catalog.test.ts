import test from "node:test";
import assert from "node:assert/strict";
import {
  WORKSPACE_CATALOG,
  getHomeWorkspaceDestinations,
  getLauncherWorkspaceDestinations,
  getWorkspaceCatalogEntry,
  isWorkspaceAvailable,
  type WorkspaceCatalogEntry,
} from "../app/lib/workspace-catalog";

test("UI-2: Home presents the three major suite entities (Clinical / Billing / Brand)", () => {
  const homeDestinations = getHomeWorkspaceDestinations();
  const ids = homeDestinations.map((d) => d.id);

  assert.equal(homeDestinations.length, 3, "Home must present exactly 3 major suite entities");
  assert.deepEqual(ids, ["clinical", "billing", "brand"], "Home entities must be Clinical, Billing, Brand in order");

  const clinical = homeDestinations.find((d) => d.id === "clinical");
  assert.ok(clinical);
  assert.equal(clinical.label, "Clinical");
  assert.equal(clinical.entity, "clinical");
  assert.equal(clinical.workspaceViewAttr, "today", "Clinical tile carries 1-click restore jump to Today");

  const billing = homeDestinations.find((d) => d.id === "billing");
  assert.ok(billing);
  assert.equal(billing.label, "Billing");
  assert.equal(billing.entity, "billing");

  const brand = homeDestinations.find((d) => d.id === "brand");
  assert.ok(brand);
  assert.equal(brand.label, "Brand");
  assert.equal(brand.entity, "brand");
});

test("UI-2/D-086/D-090/D-094: '+' launcher presents the major workspaces, Dashboard, HR and Labs among them", () => {
  const launcherDestinations = getLauncherWorkspaceDestinations();
  const ids = launcherDestinations.map((d) => d.id);

  assert.deepEqual(
    ids,
    ["home", "dashboard", "calendar", "patients", "intake", "documents", "labs", "hr", "billing", "brand"],
    "the launcher offers the major workspaces in canonical order",
  );
});

test("D-094: every destination the removed top navigation carried is offered by the launcher", () => {
  const launcher = getLauncherWorkspaceDestinations();
  const ids = launcher.map((d) => d.id);

  // UI-8 removed the top-bar row that carried Calendar, Intake and Dashboard. Two of
  // the three were already here; Dashboard was not, and adding it is what made the
  // removal a rehome rather than a deletion. This is the assertion that would have
  // failed before the entry existed.
  for (const destination of ["calendar", "intake", "dashboard"] as const) {
    assert.ok(ids.includes(destination), `${destination} must be reachable from the launcher`);
  }

  const dashboard = launcher.find((d) => d.id === "dashboard");
  assert.ok(dashboard, "Dashboard is offered as a major workspace in the `+` launcher");
  assert.equal(
    dashboard!.targetView,
    "today",
    "and it opens the same Today view the removed link opened",
  );
  assert.equal(
    dashboard!.workspaceViewAttr,
    "today",
    "carrying the 1-click workspace-view restore attribute the link carried",
  );
  assert.equal(dashboard!.entity, "clinical", "Dashboard stays a Clinical workspace");
  assert.ok(
    dashboard!.keywords?.includes("today"),
    "Dashboard should be findable by the view it opens, not only by its label",
  );

  // Home's Clinical tile opens the same view. That is two entries for one destination
  // and it is deliberate — but they must agree about where they go, because a catalog
  // that disagrees with itself is the second truth the catalog exists to prevent.
  const clinical = getWorkspaceCatalogEntry("clinical");
  assert.equal(
    clinical!.targetView,
    dashboard!.targetView,
    "Home's Clinical tile and the launcher's Dashboard resolve to one view",
  );
});

test("D-090: the two practice queues are offered together and reach their own modules", () => {
  const launcher = getLauncherWorkspaceDestinations();
  const ids = launcher.map((d) => d.id);

  // UI-7c's whole argument is that Labs and Documents are one kind of destination:
  // both are practice queues `PracticeQueueWorkspaceShell` renders, neither is
  // tab-eligible, and each publishes a standing count. Offering them apart would be
  // the drift to catch.
  assert.equal(
    ids.indexOf("labs"),
    ids.indexOf("documents") + 1,
    "Labs is offered beside Documents, not somewhere else in the list",
  );

  const labs = launcher.find((d) => d.id === "labs");
  assert.ok(labs, "Labs is offered as a major workspace in the `+` launcher");
  assert.equal(labs!.targetModule, "labs", "and it opens the practice lab queue module");
  assert.equal(
    labs!.entity,
    "clinical",
    "Labs stays a Clinical workspace; only the surface that offers it changed",
  );
  assert.ok(
    labs!.keywords?.includes("results"),
    "Labs should be findable by what it holds, not only by its name",
  );

  // The chart has a Labs *section* and the practice has a Labs *queue*. D-088 is the
  // record of what conflating those two cost; the description has to say which.
  assert.match(
    labs!.description,
    /practice/i,
    "the description distinguishes the practice queue from a chart's Labs section",
  );
});

test("UI-2: Home and '+' agree on destination identity for shared workspaces (Billing & Brand)", () => {
  const homeDestinations = getHomeWorkspaceDestinations();
  const launcherDestinations = getLauncherWorkspaceDestinations();

  const homeBilling = homeDestinations.find((d) => d.id === "billing");
  const launcherBilling = launcherDestinations.find((d) => d.id === "billing");
  assert.ok(homeBilling && launcherBilling);
  assert.equal(homeBilling.id, launcherBilling.id);
  assert.equal(homeBilling.label, launcherBilling.label);
  assert.equal(homeBilling.icon, launcherBilling.icon);
  assert.equal(homeBilling.tone, launcherBilling.tone);
  assert.equal(homeBilling.targetModule, launcherBilling.targetModule);

  const homeBrand = homeDestinations.find((d) => d.id === "brand");
  const launcherBrand = launcherDestinations.find((d) => d.id === "brand");
  assert.ok(homeBrand && launcherBrand);
  assert.equal(homeBrand.id, launcherBrand.id);
  assert.equal(homeBrand.label, launcherBrand.label);
  assert.equal(homeBrand.icon, launcherBrand.icon);
  assert.equal(homeBrand.tone, launcherBrand.tone);
  assert.equal(homeBrand.targetModule, launcherBrand.targetModule);
});

test("D-086: HR is a launcher workspace but still not a Home major entity", () => {
  const homeDestinations = getHomeWorkspaceDestinations();
  const launcherDestinations = getLauncherWorkspaceDestinations();

  // D-086 amends only the launcher half of D-085's LEFT-02. Home's three major
  // entities are unchanged, so HR appearing there would be the drift to catch.
  assert.deepEqual(
    homeDestinations.map((d) => d.id),
    ["clinical", "billing", "brand"],
    "Home still presents exactly Clinical, Billing and Brand",
  );

  const hr = launcherDestinations.find((d) => d.id === "hr");
  assert.ok(hr, "HR is offered as a major workspace in the '+' launcher");
  assert.equal(hr!.targetModule, "hr");
  assert.ok(
    hr!.keywords?.includes("licensing"),
    "HR should be findable by what it holds, not only by its name",
  );
});

test("UI-2: Planned and withdrawn destinations cannot leak through Home or '+'", () => {
  const homeDestinations = getHomeWorkspaceDestinations();
  const launcherDestinations = getLauncherWorkspaceDestinations();

  const forbiddenIds = ["financial_integration", "reports"];

  for (const forbidden of forbiddenIds) {
    assert.ok(
      !homeDestinations.some((d) => (d.id as string) === forbidden),
      `Withdrawn/planned destination ${forbidden} must NOT leak into Home`,
    );
    assert.ok(
      !launcherDestinations.some((d) => (d.id as string) === forbidden),
      `Withdrawn/planned destination ${forbidden} must NOT leak into '+' launcher`,
    );
  }
});

test("UI-2: isWorkspaceAvailable accurately filters unavailable or non-available entries", () => {
  const plannedEntry: WorkspaceCatalogEntry = {
    id: "billing",
    label: "Test Planned",
    description: "test",
    icon: "circle",
    tone: "blue",
    entity: "billing",
    surfaces: ["home"],
    status: "planned",
  };
  assert.equal(isWorkspaceAvailable(plannedEntry), false);

  const withdrawnEntry: WorkspaceCatalogEntry = {
    id: "brand",
    label: "Test Withdrawn",
    description: "test",
    icon: "circle",
    tone: "purple",
    entity: "brand",
    surfaces: ["home"],
    status: "withdrawn",
  };
  assert.equal(isWorkspaceAvailable(withdrawnEntry), false);
});
