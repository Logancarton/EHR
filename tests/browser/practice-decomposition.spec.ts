import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * UI-6 — decomposing the Practice menu one child at a time.
 *
 * Each child leaves the menu only once something else provably opens the same work.
 * These tests are that gate: they check the replacement path reaches the module, that
 * it focuses an already-open workspace instead of stacking a second tab, and that the
 * old menu entry is gone — in that order, so a passing run means the capability moved
 * rather than disappeared.
 */

const PRACTICE_MENU = "Practice options";

async function openPracticeMenu(page: Page) {
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  const menu = page.getByRole("region", { name: PRACTICE_MENU });
  await expect(menu).toBeVisible();
  return menu;
}

/** The account menu's own trigger, named for whoever is signed in. */
async function openAccountMenu(page: Page) {
  await page.locator(".current-user-menu .provider-avatar").click();
  const popover = page.locator(".current-user-popover");
  await expect(popover).toBeVisible();
  return popover;
}

/**
 * A member of the practice rather than an administrator. The shared fixture asserts
 * the provider role and resets the layout; this persona needs neither, and signing in
 * through it would reset a layout these tests do not depend on.
 */
async function signInAsMember(page: Page) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: "Alex Rivera · PMHNP", exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", {
    timeout: 20_000,
  });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 20_000 });
}

const ADMIN_ENTRY = "[data-account-action='organization-administration']";

async function openLauncher(page: Page) {
  await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
  const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
  await expect(popover).toBeVisible();
  return popover;
}

test.describe("UI-6a: Billing leaves the Practice menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("the `+` launcher opens Billing and the Practice menu no longer lists it", async ({
    page,
  }) => {
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='billing']").click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
    await expect(page.locator("[data-billing-surface='authoritative']")).toBeVisible({
      timeout: 20_000,
    });

    const menu = await openPracticeMenu(page);
    await expect(
      menu.getByRole("button", { name: "Billing", exact: true }),
      "Billing is retired from Practice now that the launcher owns it",
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("re-opening Billing from the launcher focuses the existing tab rather than duplicating it", async ({
    page,
  }) => {
    const first = await openLauncher(page);
    await first.locator("button[data-workspace-id='billing']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );

    const billingTabs = page.locator(".browser-tab").filter({ hasText: "Billing" });
    const openedCount = await billingTabs.count();
    expect(openedCount, "opening Billing should produce a workspace tab").toBeGreaterThan(0);

    // Leave and come back the same way a clinician would.
    await page.locator(".brand-home-button").click();
    const second = await openLauncher(page);
    await second.locator("button[data-workspace-id='billing']").click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
    await expect(
      billingTabs,
      "a singleton workspace is focused, not stacked a second time",
    ).toHaveCount(openedCount);
  });

  test("the Home suite tile still reaches Billing", async ({ page }) => {
    await page.locator(".brand-home-button").click();
    await page.locator(".zen-home-pane").getByRole("button", { name: /Billing/ }).first().click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "billing",
      { timeout: 20_000 },
    );
  });

  test("the children Practice still owns remain reachable", async ({ page }) => {
    const menu = await openPracticeMenu(page);
    await expect(
      menu.getByRole("button", { name: "Practice settings", exact: true }),
      "Practice settings has no replacement yet, so it must stay in Practice",
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

test.describe("UI-6b: Website and Social Media consolidate under Brand", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("Brand opens as its own workspace holding both sections", async ({ page }) => {
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='brand']").click();

    const shell = page.locator(".global-module-shell");
    await expect(shell, "Brand is its own destination, not the website module wearing its name").toHaveAttribute(
      "data-active-module",
      "brand",
      { timeout: 20_000 },
    );
    await expect(shell.getByRole("heading", { name: "Brand — Website & Social" })).toBeVisible();

    const website = page.locator("[data-brand-section='website']");
    const social = page.locator("[data-brand-section='social']");
    await expect(website).toBeVisible();
    await expect(social).toBeVisible();
    await expect(website).toHaveAttribute("aria-selected", "true");

    // Each section renders the real capability, honest gateway notice and all.
    await expect(page.locator("[data-website-cms='unconfigured']")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Clinic Website & Patient Portal CMS/ })).toBeVisible();

    await social.click();
    await expect(social).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { name: /Practice Social Media & Reputation Hub/ })).toBeVisible();
  });

  test("work in progress survives switching between Brand sections", async ({ page }) => {
    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='brand']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "brand", {
      timeout: 20_000,
    });

    const visiblePanel = page.locator(".brand-section-panel:not([hidden])");
    const headline = visiblePanel.locator("input.text-input").first();
    await headline.fill("Bond Psychiatry — Bay Area");

    await page.locator("[data-brand-section='social']").click();
    const postDraft = visiblePanel.locator("textarea").first();
    await postDraft.fill("Draft: Saturday telehealth slots now open.");

    await page.locator("[data-brand-section='website']").click();
    await expect(
      visiblePanel.locator("input.text-input").first(),
      "switching sections is a presentation change, not a teardown",
    ).toHaveValue("Bond Psychiatry — Bay Area");

    await page.locator("[data-brand-section='social']").click();
    await expect(
      visiblePanel.locator("textarea").first(),
      "an unsent post draft is still there on the way back",
    ).toHaveValue("Draft: Saturday telehealth slots now open.");
  });

  test("Brand focuses its existing tab instead of opening a second one", async ({ page }) => {
    const first = await openLauncher(page);
    await first.locator("button[data-workspace-id='brand']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "brand", {
      timeout: 20_000,
    });

    const brandTabs = page.locator(".browser-tab").filter({ hasText: "Brand" });
    const opened = await brandTabs.count();
    expect(opened).toBeGreaterThan(0);

    await page.locator(".brand-home-button").click();
    const second = await openLauncher(page);
    await second.locator("button[data-workspace-id='brand']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "brand", {
      timeout: 20_000,
    });
    await expect(brandTabs).toHaveCount(opened);
  });

  test("the Home Brand tile reaches the same workspace", async ({ page }) => {
    await page.locator(".brand-home-button").click();
    await page.locator(".zen-home-pane").getByRole("button", { name: /Brand/ }).first().click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "brand", {
      timeout: 20_000,
    });
  });
});

test.describe("UI-6c: Website and Social media leave the Practice menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("both entries are gone from Practice and Brand reaches the same two surfaces", async ({
    page,
  }) => {
    const menu = await openPracticeMenu(page);
    for (const name of ["Website", "Social media"]) {
      await expect(
        menu.getByRole("button", { name, exact: true }),
        `${name} is retired from Practice now that Brand owns it`,
      ).toHaveCount(0);
    }
    await page.keyboard.press("Escape");

    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='brand']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "brand", {
      timeout: 20_000,
    });

    // The retired menu items opened these two workspaces; Brand still does.
    await expect(page.getByRole("heading", { name: /Clinic Website & Patient Portal CMS/ })).toBeVisible();
    await page.locator("[data-brand-section='social']").click();
    await expect(page.getByRole("heading", { name: /Practice Social Media & Reputation Hub/ })).toBeVisible();
  });

  test("Practice keeps only the children that still have no owner", async ({ page }) => {
    const menu = await openPracticeMenu(page);
    // The accessible name, not the rendered text: each item renders its icon glyph name
    // alongside the label, which is decoration rather than what the control is called.
    const labels = await menu
      .getByRole("button")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));

    expect(
      labels.sort(),
      "Practice should be down to the children UI-6 has not rehomed yet",
    ).toEqual(["Practice settings"]);
    await page.keyboard.press("Escape");
  });
});

test.describe("UI-6d: Staff directory leaves the Practice menu for HR", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInWithDefaultLayout(page, "Prototype provider");
  });

  test("the entry is gone and the launcher reaches HR instead", async ({ page }) => {
    const menu = await openPracticeMenu(page);
    await expect(
      menu.getByRole("button", { name: "Staff directory", exact: true }),
      "Staff directory is retired now that HR is a workspace of its own (D-086)",
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    const launcher = await openLauncher(page);
    await launcher.locator("button[data-workspace-id='hr']").click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "hr", {
      timeout: 20_000,
    });

    // The capability the old entry opened is still here, now behind the access check
    // the directory always should have had.
    await page.locator("[data-hr-tab='people']").click();
    await expect(page.locator(".hr-person").first()).toBeVisible();
  });
});

/**
 * UI-6f — Practice settings becomes Organization administration in the account menu.
 *
 * The roadmap expected a three-way split here (preferences / organization
 * administration / HR). The diagnosis at `6981f52` found no split to make: the
 * practice's default layouts already live under profile/preferences, HR owns
 * personnel material behind its own permission, and what `settings` renders is
 * organization administration alone. So this is a rehome and a rename, and these
 * tests are the proof the capability moved rather than disappeared.
 *
 * `Prototype provider` is the organization owner in the synthetic practice;
 * `Alex Rivera · PMHNP` is a member — the highest clinical role, and still not an
 * administrator, which is the distinction the entry has to respect.
 */
test.describe("UI-6f: organization administration moves to the account menu", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("an owner opens organization administration from the account menu", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    await openAccountMenu(page);
    await page.locator(ADMIN_ENTRY).click();

    const shell = page.locator(".global-module-shell");
    await expect(shell, "the account menu reaches the same module the Practice entry did").toHaveAttribute(
      "data-active-module",
      "settings",
      { timeout: 20_000 },
    );
    await expect(
      shell.getByRole("heading", { name: "Organization administration" }),
      "the destination is named for what it administers, not 'Settings'",
    ).toBeVisible();

    // The capability itself, not just the route: the roster loads and the
    // administration controls are on screen.
    await expect(page.getByRole("heading", { name: "People in this practice" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator(".staff-add-btn")).toBeVisible();
  });

  test("re-opening from the account menu focuses the existing tab rather than duplicating it", async ({
    page,
  }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    await openAccountMenu(page);
    await page.locator(ADMIN_ENTRY).click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "settings",
      { timeout: 20_000 },
    );

    const tabs = page.locator(".browser-tab").filter({ hasText: "Organization administration" });
    const openedCount = await tabs.count();
    expect(openedCount, "opening it should produce a workspace tab").toBeGreaterThan(0);

    await page.locator(".brand-home-button").click();
    await openAccountMenu(page);
    await page.locator(ADMIN_ENTRY).click();

    await expect(page.locator(".global-module-shell")).toHaveAttribute(
      "data-active-module",
      "settings",
      { timeout: 20_000 },
    );
    await expect(
      tabs,
      "a singleton workspace is focused, not stacked a second time",
    ).toHaveCount(openedCount);
  });

  test("a member is not offered the entry, and the server refuses them anyway", async ({ page }) => {
    await signInAsMember(page);

    await openAccountMenu(page);
    await expect(
      page.locator(ADMIN_ENTRY),
      "clinical seniority is not practice administration",
    ).toHaveCount(0);
    await page.keyboard.press("Escape");

    // Hiding the entry is a courtesy; the boundary is the server's.
    const refused = await page.request.get("/api/organization/members");
    expect(refused.status(), "the roster is refused with a 403, never an empty list").toBe(403);
  });

  test("the activation link this surface issues stays behind the same permission", async ({
    page,
  }) => {
    await signInAsMember(page);

    // The one response here that carries a secret. Its new home must not be reachable
    // more loosely than the retired menu entry was.
    const refused = await page.request.post("/api/organization/members", {
      data: { displayName: "Should Not Exist", role: "provider" },
    });
    expect(refused.status(), "provisioning — and the activation link with it — is refused").toBe(403);
  });
});
