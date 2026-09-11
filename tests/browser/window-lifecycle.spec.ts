import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetWorkspaceLayout, signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * Phase 0 browser lifecycle coverage that the two-patient continuity suite does not
 * reach: every resize direction, protected window controls, focus/z-order between
 * two floating charts, title-bar double-click, snap preview and placement, and a
 * clinical response that arrives after the clinician has already moved on.
 *
 * These suites share one server and one database, so each test normalizes the
 * workspace rather than assuming the state the previous test left behind.
 */

function patientTab(page: Page, name: string) {
  return page.locator(".browser-tab").filter({ hasText: name });
}

function detachedPatient(page: Page, name: string) {
  return page.locator(".detached-patient-pane").filter({ hasText: name });
}

function primaryPatientHeading(page: Page) {
  return page.locator(".primary-workspace-pane .patient-header h1");
}

async function openPatient(page: Page, name: string) {
  const tab = patientTab(page, name);
  const pane = detachedPatient(page, name);

  // Opening a chart from search does not re-dock an already-detached one, so a
  // floating chart has to be docked through its own control first.
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

/** Resets to the shared baseline, then guarantees the named patients are docked tabs. */
async function normalizeWorkspace(page: Page, names: readonly string[]): Promise<Locator[]> {
  await resetWorkspaceLayout(page);

  const tabs: Locator[] = [];
  for (const name of names) {
    const tab = await openPatient(page, name);
    await expect(tab, `${name} should be docked before the test begins`).toBeVisible();
    tabs.push(tab);
  }
  return tabs;
}

async function dragToDetach(tab: Locator, workspace: Locator, offset: { x: number; y: number }) {
  await tab.dragTo(workspace, { targetPosition: offset });
}

/**
 * Reads the window's geometry only once it has stopped changing. Window size and
 * position are animated, so measuring mid-transition would aim the next gesture at
 * an edge that has already moved — which reads as a controller bug rather than the
 * measurement race it actually is.
 */
async function boundsOf(pane: Locator) {
  let previous = await pane.boundingBox();
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await pane.page().waitForTimeout(50);
    const current = await pane.boundingBox();
    if (!current) throw new Error("Floating window lost its browser geometry.");
    if (
      previous &&
      Math.abs(current.x - previous.x) < 0.5 &&
      Math.abs(current.y - previous.y) < 0.5 &&
      Math.abs(current.width - previous.width) < 0.5 &&
      Math.abs(current.height - previous.height) < 0.5
    ) {
      return { ...current, right: current.x + current.width, bottom: current.y + current.height };
    }
    previous = current;
  }
  throw new Error("Floating window geometry never settled.");
}

async function moveWindowTo(page: Page, pane: Locator, x: number, y: number) {
  const header = await pane.locator(".detached-pane-header").boundingBox();
  const box = await boundsOf(pane);
  if (!header) throw new Error("Floating header disappeared before moving.");
  const grabX = header.x + header.width * 0.4;
  const grabY = header.y + Math.min(20, header.height / 2);
  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await expect(pane).toHaveAttribute("data-window-gesture-kind", "move");
  await page.mouse.move(grabX + (x - box.x), grabY + (y - box.y), { steps: 6 });
  await page.mouse.up();
  await expect(pane).not.toHaveAttribute("data-window-gesture-kind", "move");
}

const RESIZE_INSET = 8;

/**
 * Pulls the window down to a compact size so every subsequent direction has room to
 * grow inside the viewport. A window already filling the viewport height cannot
 * demonstrate that a south resize works.
 */
async function shrinkWindow(page: Page, pane: Locator, targetWidth: number, targetHeight: number) {
  const box = await boundsOf(pane);
  await page.mouse.move(box.right - RESIZE_INSET, box.bottom - RESIZE_INSET);
  await page.mouse.down();
  await expect(pane).toHaveAttribute("data-window-gesture-kind", "resize");
  await page.mouse.move(box.x + targetWidth, box.y + targetHeight, { steps: 8 });
  await page.mouse.up();
  await expect(pane).not.toHaveAttribute("data-window-gesture-kind", "resize");
}

/** A promise the test resolves by hand, used to hold an API response open. */
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

/** Grabs the 10px resize hit zone for one direction and drags it outward. */
async function resizeFrom(
  page: Page,
  pane: Locator,
  direction: "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw",
  delta: number,
) {
  const before = await boundsOf(pane);

  const grabX = direction.includes("w")
    ? before.x + RESIZE_INSET
    : direction.includes("e")
      ? before.right - RESIZE_INSET
      : before.x + before.width / 2;
  const grabY = direction.includes("n")
    ? before.y + RESIZE_INSET
    : direction.includes("s")
      ? before.bottom - RESIZE_INSET
      : before.y + before.height / 2;

  const dx = direction.includes("w") ? -delta : direction.includes("e") ? delta : 0;
  const dy = direction.includes("n") ? -delta : direction.includes("s") ? delta : 0;

  await page.mouse.move(grabX, grabY);
  await page.mouse.down();
  await expect(
    pane,
    `grabbing the ${direction} edge should start a resize, not a move`,
  ).toHaveAttribute("data-window-gesture-kind", "resize");
  await page.mouse.move(grabX + dx, grabY + dy, { steps: 6 });
  await page.mouse.up();
  await expect(pane).not.toHaveAttribute("data-window-gesture-kind", "resize");

  return { before, after: await boundsOf(pane) };
}

test.describe("workspace chrome", () => {
  test("collapses both rails in place, gives their space back, and keeps a way back", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const sidebar = page.locator(".dynamic-left-rail");
    const companionRail = page.locator(".companion-rail");
    const sidebarHandle = page.locator(".sidebar-reopen-handle");
    const companionHandle = page.locator(".companion-reopen-handle");
    const workspace = page.locator(".workspace");

    await expect(sidebar).toBeVisible();
    await expect(companionRail).toBeVisible();

    const fullWidth = (await workspace.boundingBox())!.width;

    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(sidebar).toHaveCount(0);
    await expect(sidebarHandle, "a hidden sidebar leaves a handle rather than vanishing").toBeVisible();

    await page.getByRole("button", { name: "Hide companion tools" }).click();
    await expect(companionRail).toHaveCount(0);
    await expect(companionHandle).toBeVisible();

    // The workspace animates its reclaimed width, so a single measurement taken the
    // instant the rail unmounts reads a frame of the transition rather than the
    // layout the clinician ends up with.
    await expect
      .poll(async () => (await workspace.boundingBox())!.width, {
        message: "hiding both rails must give their space back rather than leaving empty strips",
      })
      .toBeGreaterThan(fullWidth + 60);

    // Hiding chrome is a clinician preference, so it survives a reload.
    await page.reload();
    await waitForAuthenticatedShell(page);
    await expect(sidebar).toHaveCount(0);
    await expect(companionRail).toHaveCount(0);
    await expect(sidebarHandle).toBeVisible();
    await expect(companionHandle).toBeVisible();

    await sidebarHandle.click();
    await expect(sidebar).toBeVisible();
    await companionHandle.click();
    await expect(companionRail).toBeVisible();
    await expect(sidebarHandle).toHaveCount(0);
    await expect(companionHandle).toHaveCount(0);
  });

  test("hides and restores Today sections, and remembers both across a reload", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const briefing = page.locator(".morning-briefing-card");
    const metricsGrid = page.locator(".today-metrics-grid");
    const restoreBar = page.locator(".hidden-sections-bar");

    await expect(briefing).toBeVisible();
    await expect(metricsGrid).toBeVisible();
    await expect(restoreBar, "nothing is hidden, so no restore bar").toHaveCount(0);

    await page.getByRole("button", { name: "Hide morning briefing" }).click();
    await expect(briefing).toHaveCount(0);
    await expect(restoreBar).toBeVisible();
    await expect(restoreBar).toContainText("morning briefing");

    await page.getByRole("button", { name: "Collapse practice cockpit" }).click();
    await expect(metricsGrid, "collapsing folds the body away but keeps the header").toHaveCount(0);
    await expect(page.locator(".today-metrics-container")).toBeVisible();

    await page.reload();
    await waitForAuthenticatedShell(page);
    await expect(briefing, "a hidden section stays hidden").toHaveCount(0);
    await expect(metricsGrid, "a collapsed section stays collapsed").toHaveCount(0);
    await expect(restoreBar).toBeVisible();

    await restoreBar.locator(".hidden-section-chip").first().click();
    await expect(briefing).toBeVisible();
    await expect(restoreBar, "the bar disappears once nothing is hidden").toHaveCount(0);

    await page.getByRole("button", { name: "Expand practice cockpit" }).click();
    await expect(metricsGrid).toBeVisible();
  });
});

test.describe("floating window lifecycle", () => {
  test("resizes from all eight directions and leaves opposite edges anchored", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // One chart must stay docked, so a second patient keeps Jordan detachable.
    const [, jordanTab] = await normalizeWorkspace(page, ["Maya Chen", "Jordan Reed"]);
    await jordanTab.click();
    await dragToDetach(jordanTab, page.locator(".workspace-body"), { x: 420, y: 300 });

    const pane = detachedPatient(page, "Jordan Reed");
    await expect(pane).toBeVisible();

    // Pin the pane to Overview. A focusable control sitting under an edge correctly
    // wins over the resize hit zone, so leaving the section to whatever a previous
    // test selected would make this geometry test depend on that section's content.
    await pane.locator(".compact-section-tabs").getByRole("button", { name: "Overview", exact: true }).click();
    await expect(pane.locator(".compact-section-tabs button.active")).toHaveText("Overview");

    const directions = ["e", "s", "w", "n", "se", "sw", "ne", "nw"] as const;
    for (const direction of directions) {
      // Re-establish a compact, centred window so no direction runs out of room.
      await moveWindowTo(page, pane, 480, 280);
      await shrinkWindow(page, pane, 520, 400);

      // Every edge must be inside the viewport, or the gesture would be aimed at a
      // point the pointer can never reach and the failure would look like a
      // controller bug rather than an unreachable window.
      const staged = await boundsOf(pane);
      expect(staged.x, `${direction}: the window must start inside the viewport`).toBeGreaterThan(84);
      expect(staged.y, `${direction}: the window must start inside the viewport`).toBeGreaterThan(100);
      expect(staged.right, `${direction}: the window must start inside the viewport`).toBeLessThan(1590);
      expect(staged.bottom, `${direction}: the window must start inside the viewport`).toBeLessThan(990);

      const { before, after } = await resizeFrom(page, pane, direction, 60);

      const tolerance = 12;
      if (direction.includes("e")) {
        expect(after.width, `${direction} should widen the window`).toBeGreaterThan(before.width + 20);
        expect(Math.abs(after.x - before.x), `${direction} must anchor the left edge`).toBeLessThanOrEqual(tolerance);
      }
      if (direction.includes("w")) {
        expect(after.width, `${direction} should widen the window`).toBeGreaterThan(before.width + 20);
        expect(Math.abs(after.right - before.right), `${direction} must anchor the right edge`).toBeLessThanOrEqual(tolerance);
      }
      if (direction.includes("s")) {
        expect(after.height, `${direction} should heighten the window`).toBeGreaterThan(before.height + 20);
        expect(Math.abs(after.y - before.y), `${direction} must anchor the top edge`).toBeLessThanOrEqual(tolerance);
      }
      if (direction.includes("n")) {
        expect(after.height, `${direction} should heighten the window`).toBeGreaterThan(before.height + 20);
        expect(Math.abs(after.bottom - before.bottom), `${direction} must anchor the bottom edge`).toBeLessThanOrEqual(tolerance);
      }
      if (direction === "e" || direction === "w") {
        expect(Math.abs(after.height - before.height), "a horizontal resize must not change height").toBeLessThanOrEqual(tolerance);
      }
      if (direction === "n" || direction === "s") {
        expect(Math.abs(after.width - before.width), "a vertical resize must not change width").toBeLessThanOrEqual(tolerance);
      }
    }

    // The chart survived every gesture as the same chart.
    await expect(pane.locator(".detached-pane-header")).toContainText("Jordan Reed");
  });

  test("protects window controls, orders focus between charts, and honours title-bar double-click", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    // Two charts detach, so a third must stay docked in the main workspace.
    const [mayaTab, jordanTab] = await normalizeWorkspace(page, ["Maya Chen", "Jordan Reed", "Elena Rostova"]);

    await jordanTab.click();
    await dragToDetach(jordanTab, page.locator(".workspace-body"), { x: 320, y: 220 });
    const jordanPane = detachedPatient(page, "Jordan Reed");
    await expect(jordanPane).toBeVisible();

    await mayaTab.click();
    await dragToDetach(mayaTab, page.locator(".workspace-body"), { x: 760, y: 440 });
    const mayaPane = detachedPatient(page, "Maya Chen");
    await expect(mayaPane).toBeVisible();

    // Lay the two charts out side by side. Overlapping windows would let whichever
    // is on top swallow pointer events meant for the other, which would make the
    // focus assertions below measure occlusion rather than z-order. Maya is on top
    // after detaching second, so it moves first.
    await shrinkWindow(page, mayaPane, 560, 420);
    await moveWindowTo(page, mayaPane, 860, 200);
    await shrinkWindow(page, jordanPane, 560, 420);
    await moveWindowTo(page, jordanPane, 140, 200);

    // ---- Protected controls -----------------------------------------------
    // A clinician reaching for Minimize must not drag the chart instead.
    const minimize = jordanPane.locator(".window-minimize-button");
    const minimizeBox = await minimize.boundingBox();
    if (!minimizeBox) throw new Error("Minimize control had no geometry.");
    await page.mouse.move(minimizeBox.x + minimizeBox.width / 2, minimizeBox.y + minimizeBox.height / 2);
    await page.mouse.down();
    await expect(jordanPane).not.toHaveAttribute("data-window-gesture-kind", /.+/);
    await page.mouse.up();
    await expect(jordanPane).toHaveAttribute("data-minimized", "true");
    await page.locator(".window-tray-restore").filter({ hasText: "Jordan Reed" }).click();
    await expect(jordanPane).toHaveAttribute("data-minimized", "false");

    // ---- Focus and z-order -------------------------------------------------
    const zIndexOf = async (pane: Locator) =>
      Number(await pane.evaluate((element) => (element as HTMLElement).style.zIndex || "0"));

    await mayaPane.locator(".detached-pane-header").click({ position: { x: 120, y: 12 } });
    const mayaRaised = await zIndexOf(mayaPane);
    expect(mayaRaised, "activating a chart raises it above the other").toBeGreaterThan(await zIndexOf(jordanPane));

    await jordanPane.locator(".detached-pane-header").click({ position: { x: 120, y: 12 } });
    expect(
      await zIndexOf(jordanPane),
      "activating the other chart raises it in turn",
    ).toBeGreaterThan(mayaRaised);

    // Raising a window must not change which chart either window owns.
    await expect(jordanPane.locator(".detached-pane-header")).toContainText("Jordan Reed");
    await expect(mayaPane.locator(".detached-pane-header")).toContainText("Maya Chen");

    // ---- Title-bar double-click -------------------------------------------
    await expect(mayaPane).toHaveAttribute("data-maximized", "false");
    await mayaPane.locator(".detached-pane-header").dblclick({ position: { x: 140, y: 12 } });
    await expect(mayaPane).toHaveAttribute("data-maximized", "true");
    await expect(mayaPane).not.toHaveAttribute("data-window-gesture-kind", /.+/);
    await mayaPane.locator(".detached-pane-header").dblclick({ position: { x: 140, y: 12 } });
    await expect(mayaPane).toHaveAttribute("data-maximized", "false");
  });

  test("previews and places an edge snap, then releases it on the next move", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const [, jordanTab] = await normalizeWorkspace(page, ["Maya Chen", "Jordan Reed"]);
    await jordanTab.click();
    await dragToDetach(jordanTab, page.locator(".workspace-body"), { x: 520, y: 340 });

    const pane = detachedPatient(page, "Jordan Reed");
    await expect(pane).toBeVisible();
    await expect(pane).not.toHaveAttribute("data-snap-target", /.+/);

    const header = await pane.locator(".detached-pane-header").boundingBox();
    if (!header) throw new Error("Floating header disappeared before the snap gesture.");
    const grabX = header.x + header.width * 0.4;
    const grabY = header.y + Math.min(20, header.height / 2);

    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await expect(pane).toHaveAttribute("data-window-gesture-kind", "move");

    // Workspace bounds start at x = 84 and the snap edge band is 30px wide.
    await page.mouse.move(96, 500, { steps: 8 });
    const preview = page.locator("#ehr-window-snap-preview");
    await expect(preview, "the left edge shows a snap preview before release").toHaveClass(/visible/);

    await page.mouse.up();
    await expect(pane).not.toHaveAttribute("data-window-gesture-kind", "move");
    await expect(preview).not.toHaveClass(/visible/);
    await expect(pane).toHaveAttribute("data-snap-target", "left");

    const snapped = await boundsOf(pane);
    expect(snapped.x, "a left snap sits against the workspace edge").toBeLessThan(120);
    expect(snapped.width, "a left snap takes about half the workspace").toBeLessThan(1600 * 0.62);
    expect(snapped.height, "a left snap takes the full workspace height").toBeGreaterThan(700);

    await expect(pane.locator(".detached-pane-header")).toContainText("Jordan Reed");

    await moveWindowTo(page, pane, 620, 360);
    await expect(pane, "moving away from the edge releases the snap").not.toHaveAttribute("data-snap-target", /.+/);
  });

  test("a late clinical response never lands in the chart the clinician moved to", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signInWithDefaultLayout(page, "Prototype provider");

    const [mayaTab, jordanTab] = await normalizeWorkspace(page, ["Maya Chen", "Jordan Reed"]);

    // Interception is installed only after both charts are open, so it holds the
    // refetch triggered by switching back to Maya rather than the initial load.
    const mayaRecords = deferred();
    let held = false;

    await page.route("**/api/clinical-records?patientId=maya-chen*", async (route) => {
      if (!held) {
        held = true;
        await mayaRecords.promise;
      }
      await route.continue();
    });

    await mayaTab.click();
    await expect(primaryPatientHeading(page)).toHaveText("Maya Chen");

    // Switch charts while Maya's records are still in flight.
    await jordanTab.click();
    await expect(primaryPatientHeading(page)).toHaveText("Jordan Reed");

    const clinicalFacts = page.locator(".primary-workspace-pane").getByLabel("Active problems and allergies");
    await expect(clinicalFacts).toBeVisible();
    const jordanFactsBefore = await clinicalFacts.innerText();

    mayaRecords.release();
    // Give the resolved request time to be applied if the guard were missing.
    await page.waitForTimeout(1_200);

    await expect(
      primaryPatientHeading(page),
      "a late response must not switch the active chart",
    ).toHaveText("Jordan Reed");
    expect(
      await clinicalFacts.innerText(),
      "a late response for another patient must not repaint the active chart's clinical facts",
    ).toBe(jordanFactsBefore);

    // Returning to Maya still shows Maya's own chart.
    await page.unroute("**/api/clinical-records?patientId=maya-chen*");
    await mayaTab.click();
    await expect(primaryPatientHeading(page)).toHaveText("Maya Chen");
  });
});
