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

test("UI-2/D-086: '+' launcher presents the major workspaces, HR among them", () => {
  const launcherDestinations = getLauncherWorkspaceDestinations();
  const ids = launcherDestinations.map((d) => d.id);

  assert.deepEqual(
    ids,
    ["home", "calendar", "patients", "intake", "documents", "hr", "billing", "brand"],
    "the launcher offers the major workspaces in canonical order",
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
