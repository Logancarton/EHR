import { expect, test } from "@playwright/test";
import { signInDevelopmentUser, signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";
import { DEFAULT_PINS } from "../../app/lib/workspace-tools";

/**
 * Server preference ownership has always been the authenticated session (see
 * `/api/preferences`). But the browser also keeps a local cache of rails and full
 * display preferences for instant first-paint and offline resilience, and that
 * cache used to live under one unscoped localStorage key. On a shared browser, a
 * clinician who signed in after another one could inherit — and, for rails, even
 * have silently re-uploaded to their own server record — the previous clinician's
 * cached layout. This proves that no longer happens.
 */
test("a shared browser never lets one clinician's cached layout reach another's account", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");

  // Give the prototype provider a distinctive, non-default rail arrangement.
  await page.locator(".companion-rail-btn.add-btn").click();
  const menu = page.locator("[data-pin-menu-origin='right']");
  await expect(menu).toBeVisible();
  await menu.getByRole("button", { name: "Unpin Calculators from Right Rail" }).click();
  await expect(page.locator(".companion-rail-btn[aria-label='Calculators']")).toHaveCount(0);

  // A different clinician signs in on the same browser. Reset her own server-side
  // rails to their true default first so the assertion below does not depend on
  // what any other spec happened to leave behind for this account.
  await page.context().clearCookies();
  const pmhnpLogin = await page.request.post("/api/auth/login", {
    data: { userId: "team-pmhnp" },
  });
  expect(pmhnpLogin.ok()).toBeTruthy();
  const railsReset = await page.request.put("/api/preferences/rails", {
    data: { left: DEFAULT_PINS.left, right: DEFAULT_PINS.right },
  });
  expect(railsReset.ok()).toBeTruthy();

  await page.goto("/");
  await waitForAuthenticatedShell(page);

  // She must see her own default rails, not the prototype provider's cached ones.
  await expect(page.locator(".companion-rail-btn[aria-label='Calculators']")).toBeVisible();

  // And her own server record must still be untouched — the cached arrangement
  // left by the previous clinician must never have been uploaded as hers.
  const pmhnpPreferences = await page.request.get("/api/preferences");
  expect(pmhnpPreferences.ok()).toBeTruthy();
  const pmhnpBody = await pmhnpPreferences.json();
  expect(pmhnpBody.preferences.rails.right).toContain("calc");

  // Switching back, the prototype provider's own customization is exactly as they
  // left it — restored from their own server record, not lost with the cache.
  await signInDevelopmentUser(page, "Prototype provider");
  await expect(page.locator(".companion-rail-btn[aria-label='Calculators']")).toHaveCount(0);
});
