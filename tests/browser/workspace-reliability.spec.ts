import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

function patientTab(page: Page, name: string) {
  return page.locator(".browser-tab").filter({ hasText: name });
}

function detachedPatient(page: Page, name: string) {
  return page.locator(".detached-patient-pane").filter({ hasText: name });
}

function primarySectionButton(page: Page, name: string) {
  return page.locator(".primary-workspace-pane .section-tabs").getByRole("button", { name, exact: true });
}

async function ensureDockedPatient(page: Page, name: string) {
  const pane = detachedPatient(page, name);
  const tab = patientTab(page, name);

  if (await pane.count()) {
    await pane.locator(".dock-button").click();
    await expect(tab).toBeVisible();
    return tab;
  }

  if (await tab.count()) return tab;

  const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
  await omnibox.fill(name);
  const patientResult = page.locator(".search-results button:has(.avatar.small)").filter({ hasText: name }).first();
  // A generous budget on purpose: this is establishing a precondition, not measuring
  // the product. Opening a chart goes through the roster request and the omnibox, so
  // on a cold dev server the first search of a run can outlast the default timeout.
  await expect(patientResult).toBeVisible({ timeout: 15_000 });
  await patientResult.click();
  await expect(tab).toBeVisible();
  return tab;
}

async function activePatientHeading(page: Page, name: string) {
  await expect(page.locator(".primary-workspace-pane .patient-header h1")).toHaveText(name);
}

async function dragToDetach(tab: Locator, workspace: Locator) {
  const workspaceBox = await workspace.boundingBox();
  if (!workspaceBox) throw new Error("Workspace body did not have browser geometry.");
  await tab.dragTo(workspace, {
    targetPosition: {
      x: Math.min(320, Math.max(80, workspaceBox.width / 3)),
      y: Math.min(260, Math.max(120, workspaceBox.height / 3)),
    },
  });
}

test.describe("workspace browser reliability", () => {
  test("keeps two patient workspaces bound through detach, gestures, docking, and reload", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const mayaTab = await ensureDockedPatient(page, "Maya Chen");
    const jordanTab = await ensureDockedPatient(page, "Jordan Reed");

    await mayaTab.click();
    await activePatientHeading(page, "Maya Chen");
    await primarySectionButton(page, "Meds").click();
    await expect(mayaTab).toHaveAttribute("data-patient-section", "Meds");

    await jordanTab.click();
    await activePatientHeading(page, "Jordan Reed");
    await primarySectionButton(page, "Labs").click();
    await expect(jordanTab).toHaveAttribute("data-patient-section", "Labs");

    await mayaTab.click();
    await activePatientHeading(page, "Maya Chen");
    await expect(primarySectionButton(page, "Meds")).toHaveClass(/active/);
    await expect(jordanTab).toHaveAttribute("data-patient-section", "Labs");

    await jordanTab.click();
    await activePatientHeading(page, "Jordan Reed");
    await dragToDetach(jordanTab, page.locator(".workspace-body"));

    const jordanPane = detachedPatient(page, "Jordan Reed");
    await expect(jordanPane).toBeVisible();
    await expect(jordanPane).toHaveClass(/floating-patient-window/);
    await activePatientHeading(page, "Maya Chen");
    await expect(primarySectionButton(page, "Meds")).toHaveClass(/active/);
    await expect(jordanPane.locator(".compact-section-tabs button.active")).toHaveText("Labs");

    await jordanPane.locator(".compact-section-tabs").getByRole("button", { name: "Documents", exact: true }).click();
    await expect(jordanPane.locator(".compact-section-tabs button.active")).toHaveText("Documents");
    await jordanPane.locator(".floating-back-button").click();
    await expect(jordanPane.locator(".compact-section-tabs button.active")).toHaveText("Labs");
    await jordanPane.locator(".floating-forward-button").click();
    await expect(jordanPane.locator(".compact-section-tabs button.active")).toHaveText("Documents");

    const beforeMove = await jordanPane.boundingBox();
    const headerBox = await jordanPane.locator(".detached-pane-header").boundingBox();
    if (!beforeMove || !headerBox) throw new Error("Floating window did not expose move geometry.");

    await page.mouse.move(headerBox.x + headerBox.width * 0.45, headerBox.y + Math.min(24, headerBox.height / 2));
    await page.mouse.down();
    await expect(jordanPane).toHaveAttribute("data-window-gesture-kind", "move");
    await page.mouse.move(headerBox.x + headerBox.width * 0.45 + 80, headerBox.y + Math.min(24, headerBox.height / 2) + 55, { steps: 5 });
    await page.mouse.up();
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", "move");

    const afterMove = await jordanPane.boundingBox();
    if (!afterMove) throw new Error("Floating window disappeared after moving.");
    expect(Math.abs(afterMove.x - beforeMove.x) + Math.abs(afterMove.y - beforeMove.y)).toBeGreaterThan(30);

    // Stay inside the painted rounded corner while remaining within the 10 px resize hit zone.
    await page.mouse.move(afterMove.x + afterMove.width - 8, afterMove.y + afterMove.height - 8);
    await page.mouse.down();
    await expect(jordanPane).toHaveAttribute("data-window-gesture-kind", "resize");
    await page.mouse.move(afterMove.x + afterMove.width + 70, afterMove.y + afterMove.height + 55, { steps: 5 });
    await page.mouse.up();
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", "resize");

    const afterResize = await jordanPane.boundingBox();
    if (!afterResize) throw new Error("Floating window disappeared after resizing.");
    expect(afterResize.width).toBeGreaterThan(beforeMove.width + 30);
    expect(afterResize.height).toBeGreaterThan(beforeMove.height + 20);

    const cancelHeader = await jordanPane.locator(".detached-pane-header").boundingBox();
    if (!cancelHeader) throw new Error("Floating header disappeared before cancellation test.");
    await page.mouse.move(cancelHeader.x + cancelHeader.width * 0.45, cancelHeader.y + Math.min(24, cancelHeader.height / 2));
    await page.mouse.down();
    await expect(jordanPane).toHaveAttribute("data-window-gesture-kind", "move");
    await jordanPane.evaluate((element) => {
      const pointerId = Number((element as HTMLElement).dataset.windowGesturePointerId);
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
    });
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", "move");
    await expect(jordanPane).not.toHaveClass(/moving/);
    await page.mouse.up();

    await jordanPane.locator(".window-minimize-button").click();
    await expect(jordanPane).toHaveAttribute("data-minimized", "true");
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", /.+/);
    const trayRestoreButton = page.locator(".window-tray-restore").filter({ hasText: "Jordan Reed" });
    await expect(trayRestoreButton).toBeVisible();
    await trayRestoreButton.click();
    await expect(jordanPane).toHaveAttribute("data-minimized", "false");

    await jordanPane.locator(".window-maximize-button").click();
    await expect(jordanPane).toHaveAttribute("data-maximized", "true");
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", /.+/);
    await jordanPane.locator(".window-maximize-button").click();
    await expect(jordanPane).toHaveAttribute("data-maximized", "false");

    await jordanPane.locator(".dock-button").click();
    await expect(jordanPane).toHaveCount(0);
    await expect(patientTab(page, "Jordan Reed")).toBeVisible();
    await activePatientHeading(page, "Jordan Reed");

    const persistedSave = page.waitForResponse(
      (response) => response.url().endsWith("/api/workspace-state") && response.request().method() === "PUT" && response.ok(),
      { timeout: 8_000 },
    );
    await primarySectionButton(page, "History").click();
    await persistedSave;

    await page.reload();
    await page.locator(".auth-checking").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-ehr-role", "provider", { timeout: 15_000 });
    await expect(page.locator(".app-shell")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });

    const restoredJordan = patientTab(page, "Jordan Reed");
    const restoredMaya = patientTab(page, "Maya Chen");
    await expect(restoredJordan).toBeVisible();
    await expect(restoredMaya).toBeVisible();
    await restoredJordan.click();
    await activePatientHeading(page, "Jordan Reed");
    await expect(primarySectionButton(page, "History")).toHaveClass(/active/);
    await restoredMaya.click();
    await activePatientHeading(page, "Maya Chen");
    await expect(primarySectionButton(page, "Meds")).toHaveClass(/active/);
  });

  test("keeps floating work reachable in a smaller viewport and preserves keyboard access", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 650 });
    await signInWithDefaultLayout(page, "Taylor · Provider");

    const mayaTab = await ensureDockedPatient(page, "Maya Chen");
    const jordanTab = await ensureDockedPatient(page, "Jordan Reed");
    await mayaTab.click();
    await jordanTab.click();
    await dragToDetach(jordanTab, page.locator(".workspace-body"));

    const jordanPane = detachedPatient(page, "Jordan Reed");
    await expect(jordanPane).toBeVisible();
    const bounds = await jordanPane.boundingBox();
    if (!bounds) throw new Error("Floating window did not expose viewport geometry.");
    expect(bounds.x).toBeGreaterThanOrEqual(84);
    expect(bounds.y).toBeGreaterThanOrEqual(64);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(900);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(650);

    await jordanPane.locator(".window-maximize-button").click();
    const maximized = await jordanPane.boundingBox();
    if (!maximized) throw new Error("Maximized window lost browser geometry.");
    expect(maximized.x).toBeGreaterThanOrEqual(84);
    expect(maximized.y).toBeGreaterThanOrEqual(64);
    expect(maximized.x + maximized.width).toBeLessThanOrEqual(900);
    expect(maximized.y + maximized.height).toBeLessThanOrEqual(650);
    await jordanPane.locator(".window-maximize-button").click();

    const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
    await page.keyboard.press("Control+K");
    await expect(omnibox).toBeFocused();
    await omnibox.fill("Maya medications");
    await page.keyboard.press("Escape");
    await expect(omnibox).toHaveValue("");
  });
});
