import { expect, test, type Page } from "@playwright/test";
import { resetWorkspaceLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * HR in the browser (D-086).
 *
 * The server-side boundary is covered by `tests/hr-access-boundary.test.ts`. These are
 * the assertions only a running page can make: that the People tab is not rendered for
 * someone who may not use it, that a refusal reaching the page is shown as a refusal,
 * and that both presentations — the launcher tab and the rail companion — reach the
 * same record.
 *
 * `Alex Rivera · PMHNP` is the load-bearing persona: a provider, the highest clinical
 * role in the system, who must still see only their own record.
 *
 * The assignment tests run last and put back what they change. The suite shares one
 * database across specs, so a designation left granted would quietly hand Alex the
 * access the boundary tests above exist to deny.
 */

const HR_RAIL_BUTTON = ".companion-rail-btn[data-tool-id='hr']";
const HR_COMPANION = ".companion-panel[data-companion-panel='hr']";

/**
 * The shared fixture asserts a provider role. HR deliberately spans roles — the
 * designated-HR persona is a clinical assistant — so the expected role is a parameter
 * here rather than an assumption.
 */
async function signInAs(page: Page, buttonName: string, expectedRole: string) {
  await page.context().clearCookies();
  await page.goto("/");
  await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
  const login = page.getByRole("button", { name: buttonName, exact: true });
  await expect(login).toBeVisible({ timeout: 20_000 });
  await login.click();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", expectedRole, {
    timeout: 20_000,
  });
  await waitForAuthenticatedShell(page);
}

async function openHrWorkspace(page: Page) {
  await page.locator("button[data-workspace-control='open-workspace-launcher']").click();
  const popover = page.locator("[data-testid='open-workspace-launcher-popover']");
  await expect(popover).toBeVisible();
  await popover.locator("button[data-workspace-id='hr']").click();
  await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "hr", {
    timeout: 20_000,
  });
}

test.describe("D-086: HR is everyone's, other people's records are not", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("a provider without HR access sees their own record and no People tab", async ({ page }) => {
    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);

    await expect(page.locator("[data-hr-tab='mine']")).toBeVisible();
    await expect(
      page.locator("[data-hr-tab='people']"),
      "clinical role must not open the door to other employees' records",
    ).toHaveCount(0);

    // Their own record is fully present — the point is the boundary, not a thin screen.
    for (const section of ["license", "insurance", "coaching", "goal"]) {
      await expect(page.locator(`[data-hr-section='${section}']`)).toBeVisible();
    }

    // The dates are recorded, not verified, and the page says so.
    await expect(page.locator("[data-hr-credentialing='unconfigured']")).toBeVisible();
  });

  test("the directory refuses a provider at the API, not just in the UI", async ({ page }) => {
    await signInAs(page, "Alex Rivera · PMHNP", "provider");

    const refused = await page.request.get("/api/hr/directory");
    expect(refused.status(), "the refusal is a 403, never an empty directory").toBe(403);
    const body = await refused.json();
    expect(body.error).toContain("owner, manager, or designated HR administrator");

    const own = await page.request.get("/api/hr");
    expect(own.status(), "their own record needs no permission").toBe(200);
    const ownBody = await own.json();
    expect(ownBody.canReadOthers).toBe(false);
    expect(ownBody.record.items.length).toBeGreaterThan(0);
  });

  test("an owner reaches every employee record", async ({ page }) => {
    await signInAs(page, "Prototype provider", "provider");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);

    await page.locator("[data-hr-tab='people']").click();
    const people = page.locator(".hr-person");
    await expect(people.first()).toBeVisible();
    expect(await people.count(), "the practice's members are listed").toBeGreaterThan(3);

    await page.locator("[data-hr-person='team-pmhnp']").click();
    await expect(page.locator("[data-hr-section='license']")).toBeVisible();
  });

  test("a designated member reaches the directory without being a manager", async ({ page }) => {
    // Casey is a clinical assistant with no organization administration, carrying only
    // the HR designation — the case that proves the designation is its own grant.
    await signInAs(page, "Casey · Clinical assistant", "clinical_assistant");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);

    await expect(page.locator("[data-hr-tab='people']")).toBeVisible();
    await page.locator("[data-hr-tab='people']").click();
    await expect(page.locator(".hr-person").first()).toBeVisible();

    const directory = await page.request.get("/api/hr/directory");
    expect(directory.status()).toBe(200);
  });

  test("the companion shows the viewer's own deadlines and opens the full workspace", async ({
    page,
  }) => {
    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    await resetWorkspaceLayout(page, []);

    const rail = page.locator(HR_RAIL_BUTTON);
    await expect(rail, "HR is pinned to the companion rail by default").toBeVisible();

    // Keyboard reachable, like every other companion.
    await rail.focus();
    await expect(rail).toBeFocused();
    await page.keyboard.press("Enter");

    const panel = page.locator(HR_COMPANION);
    await expect(panel).toBeVisible();
    await expect(panel.locator(".hr-item").first()).toBeVisible();

    // Soonest first: the companion is a deadline view.
    const deadlines = await panel.locator(".hr-item .hr-item-deadline").allInnerTexts();
    const days = deadlines
      .map((text) => /Due in (\d+)d/.exec(text)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    expect(days.length, "the seeded record has dated items").toBeGreaterThan(1);
    expect([...days].sort((a, b) => a - b), "items are ordered by what is due first").toEqual(days);

    // The companion escalates to the same workspace rather than duplicating it.
    await panel.getByRole("button", { name: /Open Full HR Workspace/i }).click();
    await expect(page.locator(".global-module-shell")).toHaveAttribute("data-active-module", "hr", {
      timeout: 20_000,
    });
  });

  test("the companion expands to the canvas and redocks, keeping the rail reachable", async ({
    page,
  }) => {
    await signInAs(page, "Prototype provider", "provider");
    await resetWorkspaceLayout(page, []);
    await page.locator(HR_RAIL_BUTTON).click();

    const panel = page.locator(HR_COMPANION);
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");

    await panel.getByRole("button", { name: /Expand to main canvas/i }).click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "expanded");
    await expect(
      page.locator(HR_RAIL_BUTTON),
      "the rail stays reachable while a companion fills the canvas (RIGHT-05)",
    ).toBeVisible();

    await panel.getByRole("button", { name: /Redock to companion rail/i }).click();
    await expect(panel).toHaveAttribute("data-companion-presentation", "docked");
  });

  /**
   * Assignment (D-086). The service boundary is covered by
   * `tests/hr-assignment-authority.test.ts`; these are the assertions only a running
   * page makes — that the forms exist for exactly the people allowed to use them, that
   * an assignment reaches the employee's own record, and that a designation granted
   * here is a real grant rather than a label.
   */
  test("an owner sets up a record, assigns to it, and the employee sees it", async ({ page }) => {
    await signInAs(page, "Prototype provider", "provider");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);
    await page.locator("[data-hr-tab='people']").click();

    // Taylor is the one seeded member the HR fixture leaves without a record, so on a
    // fresh database this is a real create. The suite's database is reused between
    // runs and nothing deletes a personnel record, so the precondition is read rather
    // than assumed — and the create-only assertions are made only when it holds.
    const existing = await page.request.get("/api/hr?userId=team-taylor");
    expect(existing.status()).toBe(200);
    const hadRecord = Boolean((await existing.json()).record);

    await page.locator("[data-hr-person='team-taylor']").click();
    const assign = page.locator("[data-hr-assign='team-taylor']");
    await expect(assign).toBeVisible();
    if (!hadRecord) {
      await expect(
        assign.locator("[data-hr-action='assign-item']"),
        "assigning into a record that does not exist yet is not offered",
      ).toHaveCount(0);
    }

    await assign.locator("[data-hr-field='employmentType']").fill("0.6 FTE — Psychiatric nurse practitioner");
    await assign.locator("[data-hr-field='startedOn']").fill("2024-03-04");
    await assign.locator("[data-hr-action='save-record']").click();
    await expect(page.locator("[data-hr-assign-notice='']")).toContainText(
      hadRecord ? "Updated" : "Created an HR record",
    );

    // The record now exists, so the item form appears alongside it.
    const itemForm = page.locator("[data-hr-assign='team-taylor'] [data-hr-action='assign-item']");
    await expect(itemForm).toBeVisible();
    const title = `Browser-assigned licensing deadline ${Date.now()}`;
    await page.locator("[data-hr-field='category']").selectOption("license");
    await page.locator("[data-hr-field='title']").fill(title);
    await page.locator("[data-hr-field='detail']").fill("Assigned from the People tab.");
    await page.locator("[data-hr-field='status']").selectOption("attention");
    await page.locator("[data-hr-field='dueOn']").fill("2027-01-15");
    await itemForm.click();

    await expect(page.locator("[data-hr-assign-notice='']")).toContainText(title);
    // Re-read from the server, not from the form that submitted it.
    await expect(
      page.locator(".hr-person-detail [data-hr-section='license']").getByText(title),
    ).toBeVisible();

    const stored = await page.request.get("/api/hr?userId=team-taylor");
    expect(stored.status()).toBe(200);
    const body = await stored.json();
    expect(body.record.employmentType).toBe("0.6 FTE — Psychiatric nurse practitioner");
    expect(
      body.record.items.some((item: { title: string; source: string }) =>
        item.title === title && item.source === "assigned",
      ),
      "the item is stored as somebody's assignment, not as fixture",
    ).toBe(true);
  });

  test("a designated HR administrator assigns but cannot designate anyone", async ({ page }) => {
    await signInAs(page, "Casey · Clinical assistant", "clinical_assistant");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);
    await page.locator("[data-hr-tab='people']").click();
    await page.locator("[data-hr-person='team-pmhnp']").click();

    await expect(
      page.locator("[data-hr-assign='team-pmhnp'] [data-hr-action='assign-item']"),
      "the designation exists so HR work can be done",
    ).toBeVisible();
    await expect(
      page.locator("[data-hr-designation='']"),
      "HR access must not be grantable by someone who only holds it",
    ).toHaveCount(0);

    // And the server refuses the request itself, not merely the control.
    const refused = await page.request.patch("/api/hr/designation", {
      data: { userId: "team-pmhnp", designated: true },
    });
    expect(refused.status()).toBe(403);
    expect(await refused.text()).toContain("only an owner or manager");
  });

  test("an owner grants and revokes the HR designation, and it takes effect", async ({ page }) => {
    await signInAs(page, "Prototype provider", "provider");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);
    await page.locator("[data-hr-tab='people']").click();

    // An owner already holds HR access inherently; the toggle must not pretend to grant it.
    await page.locator("[data-hr-person='team-morgan']").click();
    await expect(page.locator("[data-hr-designation='']")).toContainText("already reads every employee record");
    await expect(page.locator("[data-hr-action='toggle-designation']")).toHaveCount(0);

    await page.locator("[data-hr-person='team-pmhnp']").click();
    const toggle = page.locator("[data-hr-action='toggle-designation']");
    await expect(toggle).toHaveAttribute("data-hr-designated", "false");
    await toggle.click();
    await expect(page.locator("[data-hr-assign-notice='']")).toContainText("now HR personnel");
    await expect(toggle).toHaveAttribute("data-hr-designated", "true");

    // A real grant: the granted member reaches the directory the server previously refused.
    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    const granted = await page.request.get("/api/hr/directory");
    expect(granted.status(), "the grant is an access change, not a label").toBe(200);

    // Put the practice back the way the fixture describes it, so the boundary tests
    // above keep meaning what they say on the next run.
    await signInAs(page, "Prototype provider", "provider");
    const revoked = await page.request.patch("/api/hr/designation", {
      data: { userId: "team-pmhnp", designated: false },
    });
    expect(revoked.status()).toBe(200);

    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    expect((await page.request.get("/api/hr/directory")).status()).toBe(403);
  });

  test("a provider is offered no assignment controls and is refused the writes", async ({ page }) => {
    await signInAs(page, "Alex Rivera · PMHNP", "provider");
    await resetWorkspaceLayout(page, []);
    await openHrWorkspace(page);

    await expect(page.locator("[data-hr-assign]")).toHaveCount(0);

    // An employee does not author their own HR record, and the refusal is the server's.
    const record = await page.request.post("/api/hr", {
      data: { userId: "team-pmhnp", employmentType: "Self-declared 1.0 FTE" },
    });
    expect(record.status()).toBe(403);

    const item = await page.request.post("/api/hr/items", {
      data: { userId: "team-pmhnp", category: "goal", title: "Self-assigned goal" },
    });
    expect(item.status()).toBe(403);
  });
});
