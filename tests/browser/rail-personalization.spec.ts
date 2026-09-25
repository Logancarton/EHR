import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("companion personalization remains scoped to supported tools", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator(".companion-rail-btn.add-btn").click();
  const menu = page.locator("[data-pin-menu-origin='right']");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".col-side-label")).toHaveText("Right Rail");
  await expect(menu.getByRole("button", { name: /Left Sidebar/ })).toHaveCount(0);
  for (const name of ["Dashboard", "Schedule", "Billing"]) {
    await expect(menu.locator(".tool-pin-row").filter({ hasText: name })).toHaveCount(0);
  }
  const toggle = menu.getByRole("button", { name: "Unpin Calculators from Right Rail" });
  await toggle.click();
  await expect(page.locator(".companion-rail-btn[aria-label='Calculators']")).toHaveCount(0);
  await menu.getByRole("button", { name: "Pin Calculators to Right Rail" }).click();
  await expect(page.locator(".companion-rail-btn[aria-label='Calculators']")).toBeVisible();
});


test("companion selection and open state survive rail collapse and reload", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");

  const calculatorButton = page.getByRole("button", { name: "Calculators", exact: true });
  const panel = page.locator(".companion-panel").filter({ hasText: "Clinical Rating Scales" });

  const openSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await calculatorButton.click();
  await openSaved;
  await expect(panel).toBeVisible();
  await expect(calculatorButton).toHaveAttribute("aria-pressed", "true");

  const hideSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Hide companion tools" }).click();
  await hideSaved;
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show companion tools" })).toBeVisible();

  const showSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await page.getByRole("button", { name: "Show companion tools" }).click();
  await showSaved;
  await expect(panel).toBeVisible();
  await expect(calculatorButton).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Calculators", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  const closeSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await closeSaved;
  await expect(panel).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".companion-panel")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculators", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

/**
 * Unpinning Calendar sticks (UI-8b).
 *
 * The owner's report listed the right icon rail among four competing routes to the
 * same domains, naming Calendar first. It was not merely that the rail offered a
 * workspace destination — it was that a clinician could not stop it. Two separate
 * mechanisms put Calendar back:
 *
 * 1. `rails.right` was spliced to re-insert it at the head of every read, in
 *    `preference-engine` and twice in `workspace-tools`. It is a one-time backfill now.
 * 2. A display-preferences write carrying a stale rail overwrote the rails endpoint's
 *    write, so even once the splice was gone the unpin was lost on the next load. The
 *    four pinned-rail fields are now taken from the stored record, as `workspaceState`
 *    already was.
 *
 * Both had to go, and this drives the clinician's path through both: unpin, reload
 * with the local cache cleared so the result can only have come from the server, and
 * confirm the rail and the server agree.
 */
test("unpinning Calendar from the companion rail survives a reload, from the server alone", async ({
  page,
}) => {
  await signInWithDefaultLayout(page, "Prototype provider");

  const railTools = () =>
    page.locator(".companion-rail-btn[data-tool-id]").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.toolId ?? ""),
    );

  const calendarButton = page.locator(".companion-rail-btn[data-tool-id='calendar']");
  await expect(calendarButton, "Calendar starts pinned, as it always has been").toBeVisible();

  const unpinSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/preferences/rails") &&
      response.request().method() === "PUT" &&
      response.ok(),
  );
  await calendarButton.click({ button: "right" });
  await page.getByText("Unpin from Companion Rail", { exact: true }).click();
  await unpinSaved;

  await expect(calendarButton, "the rail drops it immediately").toHaveCount(0);

  // The server is the thing under test, so the browser is given no way to answer from
  // its own cache. Before this fix the reload brought Calendar back.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator(".companion-rail-btn").first()).toBeVisible({ timeout: 20_000 });

  await expect(
    page.locator(".companion-rail-btn[data-tool-id='calendar']"),
    "an unpinned Calendar stays unpinned across a reload",
  ).toHaveCount(0);

  const stored = await page.evaluate(async () => {
    const body = await fetch("/api/preferences").then((response) => response.json());
    return body.preferences.rails.right as string[];
  });
  expect(stored, "and the server agrees, so the choice follows the clinician").not.toContain(
    "calendar",
  );

  // Nothing else was lost on the way: the rail shows exactly what the server holds.
  expect(await railTools(), "the rail renders the stored pins, no more and no less").toEqual(
    stored,
  );

  // It can be pinned back from the rail's own menu, so the removal is not one-way.
  await page.locator(".companion-rail-btn.add-btn").click();
  const menu = page.locator("[data-pin-menu-origin='right']");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Pin Calendar to Right Rail" }).click();
  await expect(page.locator(".companion-rail-btn[data-tool-id='calendar']")).toBeVisible();
});
