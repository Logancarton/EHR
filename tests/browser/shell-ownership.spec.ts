import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

const panelSelector = '[data-companion-panel="communication"]';

test("legacy Messages pins and active state restore one Communication owner without a left rail", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.goto("about:blank");
  await page.request.put("/api/preferences/rails", { data: { left: ["today", "messages", "calendar"], right: ["messages", "communication"] } });
  const response = await page.request.get("/api/preferences");
  const { preferences } = await response.json();
  await page.request.put("/api/preferences", { data: { preferences: { ...preferences, rails: { ...preferences.rails, activeRightPanel: "messages", rightPanelOpen: true } } } });
  await page.goto("/");
  await waitForAuthenticatedShell(page);
  await expect(page.locator('.dynamic-left-rail, .app-sidebar')).toHaveCount(0);
  await expect(page.locator('.companion-rail-btn[data-tool-id="messages"]')).toHaveCount(0);
  await expect(page.locator('.companion-rail-btn[data-tool-id="communication"]')).toHaveCount(1);
  await expect(page.locator(panelSelector)).toBeVisible();
  await page.locator(panelSelector).getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "messages" } })));
  await expect(page.locator(panelSelector)).toBeVisible();
});

test("Team leaves patient scope and sends only to the explicit staff recipient", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator('.companion-rail-btn[data-tool-id="communication"]').click();
  const panel = page.locator(panelSelector);
  await panel.getByRole("tab", { name: "Patient", exact: true }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
  await expect(panel).toHaveAttribute("data-communication-scope", "patient");
  await panel.getByRole("tab", { name: "Team", exact: true }).click();
  await expect(panel).toHaveAttribute("data-bound-patient-id", "");
  await expect(panel.getByLabel("Tag patient chart")).toHaveValue("");
  const chips = panel.locator(".comm-partner-chip");
  await expect(chips.nth(1)).toBeVisible();
  const firstTitle = await chips.first().getAttribute("title");
  await panel.locator(".comm-composer textarea").fill("Synthetic staff draft A");
  await chips.nth(1).click();
  await expect(panel.locator(".comm-composer textarea")).toHaveValue("");
  await panel.locator(".comm-composer textarea").fill("Synthetic staff draft B");
  await chips.first().click();
  await expect(panel.locator(".comm-composer textarea")).toHaveValue("Synthetic staff draft A");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Jordan Reed" }).click();
  await expect(panel.getByLabel("Tag patient chart")).toHaveValue("");
  await expect(chips.first()).toHaveAttribute("title", firstTitle!);
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(panel.locator(".comm-composer textarea")).toHaveValue("Synthetic staff draft A");
  let sent: Record<string, unknown> | undefined;
  await page.route("**/api/team/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { success: false, error: "Synthetic transport failure" } });
  });
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Synthetic transport failure");
  expect(sent?.patientId).toBeUndefined();
  expect(sent?.partnerId).toBeTruthy();
  expect(sent?.content).toBe("Synthetic staff draft A");
  await expect(panel.locator(".comm-composer textarea")).toHaveValue("Synthetic staff draft A");
});

test("practice queue labels distinguish their patient tools and viewport shell remains reachable", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  for (const [width, height, zoom] of [[1440, 900, 1], [1280, 800, 1], [1024, 800, 1], [1440, 900, 2]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.style.zoom = String(value); }, zoom);
    await expect(page.locator('.primary-workspace-pane .patient-chart-sidebar')).toHaveCount(0);
    for (const name of ["Overview", "Encounter"]) await expect(page.locator('.patient-header-actions').getByRole("button", { name, exact: true })).toBeVisible();
    const button = page.locator('.companion-rail-btn[data-tool-id="communication"]');
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const panel = page.locator(panelSelector);
    await expect(panel.getByRole("tab", { name: "Patient", exact: true })).toBeVisible();
    await panel.getByRole("tab", { name: "Patient", exact: true }).click();
    await expect(panel).toHaveAttribute("data-bound-patient-id", "maya-chen");
    await expect(panel.locator('.companion-panel-header small')).toContainText('DOB');
    await page.screenshot({ path: `output/playwright/d117-shell-${width}-${zoom}x.png`, animations: "disabled" });
    await panel.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.evaluate(() => { document.documentElement.style.zoom = "1"; });
  await page.locator('[data-workspace-control="open-workspace-launcher"]').click();
  const launcher = page.getByTestId("open-workspace-launcher-popover");
  await expect(launcher.locator('[data-workspace-id="labs"]')).toContainText("Results Queue");
  await expect(launcher.locator('[data-workspace-id="documents"]')).toContainText("Document Inbox");
  await launcher.locator('[data-workspace-id="labs"]').click();
  await expect(page.getByRole("heading", { name: "Results Queue", exact: true })).toBeVisible();
});

test("a dashboard staff shortcut preserves the explicit recipient and opens one owner", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const card = page.locator('.team-member-card').first();
  await expect(card).toBeVisible();
  const name = (await card.getAttribute("aria-label"))!.replace("Collaborate with ", "");
  await card.click();
  await expect(page.locator('#team-quick-message')).toHaveCount(0);
  await page.getByRole("button", { name: "Open in Team Chat", exact: true }).click();
  const panel = page.locator(panelSelector);
  await expect(panel.locator('.comm-composer textarea')).toHaveAttribute("placeholder", `Message ${name}…`);
  await expect(panel.getByLabel("Tag patient chart")).toHaveValue("");
  await expect(page.getByLabel("Communications and collaboration dock")).toHaveCount(0);
});

test("late staff conversation responses cannot replace a different recipient's conversation", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.locator('.companion-rail-btn[data-tool-id="communication"]').click();
  const panel = page.locator(panelSelector);
  await panel.getByRole("tab", { name: "Team", exact: true }).click();
  const chips = panel.locator('.comm-partner-chip');
  await expect(chips.nth(1)).toBeVisible();
  const snapshot = (await (await page.request.get('/api/team')).json()).team;
  const lateId = snapshot.partners[1].member.id;
  let release!: () => void;
  let observed = false;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/api\/team\/messages\?partnerId=/, async (route) => {
    const id = new URL(route.request().url()).searchParams.get('partnerId');
    if (id === lateId) { observed = true; await held; }
    await route.fulfill({ json: { success: true, messages: [{ id: `synthetic-${id}`, threadId: `synthetic-thread-${id}`, senderId: id, senderName: 'Synthetic staff', content: id === lateId ? 'Late foreign conversation' : 'Current bound conversation', createdAt: '2026-10-03T12:00:00Z' }] } });
  });
  await chips.nth(1).click();
  await expect.poll(() => observed).toBe(true);
  await chips.first().click();
  await expect(panel.locator('.comm-messages-scroll')).toContainText('Current bound conversation');
  release();
  await expect(panel.locator('.comm-messages-scroll')).not.toContainText('Late foreign conversation');
});
