import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * CB-6g — every companion tool survives being resized.
 *
 * The docked panel can be dragged (or arrow-keyed) from 260px up to 840px or the
 * available space beside a readable chart, and the preference is shared by every tool. Each tool is checked
 * at the narrowest and widest docked width: the panel takes the width it was given,
 * its header controls (close, expand) stay on screen, nothing inside is wider than
 * the panel, and a width chosen in one tool carries to the next and across a reload.
 */

/** A field a clinician can type a draft into. */
const composerSelector =
  "textarea:enabled:visible, input[type='text']:enabled:visible, input:not([type]):enabled:visible";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
];

/** Pins every panel-capable tool, so tools that are off the rail by default are checked too. */
async function pinAllPanelTools(page: Page) {
  const { AVAILABLE_WORKSPACE_TOOLS } = await import("../../app/lib/workspace-tools");
  const { defaultPreferences } = await import("../../app/lib/preference-engine");
  const panelTools = AVAILABLE_WORKSPACE_TOOLS.filter((t) => t.surfaces.includes("panel")).map((t) => t.id);
  const pinned = await page.request.put("/api/preferences/rails", {
    data: { left: defaultPreferences.rails.left, right: panelTools },
  });
  expect(pinned.ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
  return panelTools;
}

async function toolIds(page: Page) {
  return page
    .locator(".companion-rail-btn[data-tool-id]")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-tool-id") ?? ""));
}

async function openTool(page: Page, id: string) {
  const button = page.locator(`.companion-rail-btn[data-tool-id='${id}']`);
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Everything the resize contract promises, measured in the page. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const panels = [...document.querySelectorAll<HTMLElement>(".companion-panel")].filter(
      (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
    );
    const panel = panels[0];
    if (!panel) return null;
    const box = panel.getBoundingClientRect();
    const onScreen = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 && r.right <= window.innerWidth + 1;
    };
    // Any descendant that pokes out past the panel's right edge, and is not inside
    // a deliberate horizontal scroller, is content the clinician cannot reach.
    const overflowing = [...panel.querySelectorAll<HTMLElement>("*")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        if (r.right <= box.right + 2) return false;
        for (let p = el.parentElement; p && p !== panel; p = p.parentElement) {
          const s = getComputedStyle(p);
          if ((s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") && p.getBoundingClientRect().right <= box.right + 2) return false;
        }
        return true;
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} +${Math.round(el.getBoundingClientRect().right - box.right)}px`);
    return {
      width: Math.round(box.width),
      right: Math.round(box.right),
      viewport: window.innerWidth,
      closeVisible: onScreen(panel.querySelector(".companion-close-btn")),
      overflowing,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`every companion tool holds together at its narrowest and widest (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    const panelTools = await pinAllPanelTools(page);
    const ids = await toolIds(page);
    expect([...ids].sort(), "every panel tool is on the rail").toEqual([...panelTools].sort());
    // On a chart, so patient tools (Labs, AI, Calculators, Messages) show their
    // working forms rather than an empty state.
    const chart = page.locator(".browser-tab[data-workspace-tab='patient']", { hasText: "Maya Chen" }).first();
    await expect(chart).toBeVisible({ timeout: 15_000 });
    await chart.click();
    await expect(chart).toHaveClass(/active/);
    const problems: string[] = [];

    for (const id of ids) {
      await openTool(page, id);
      const handle = page.locator(".companion-resize-border");
      if (viewport.width < 1032) {
        await expect(handle, `${id}: single surface has no misleading splitter`).toBeHidden();
        const panel = page.locator(".companion-panel:visible").first();
        await expect(panel.getByRole("button", { name: "Return to workspace" })).toBeInViewport();
        const m = await measure(page);
        expect(m?.width).toBe(viewport.width - 52);
        expect(m?.closeVisible).toBe(true);
        expect(m?.overflowing).toEqual([]);
        continue;
      }
      await expect(handle, `${id} has a resize handle`).toBeVisible();

      for (const edge of ["narrowest", "widest"] as const) {
        await handle.focus();
        if (edge === "widest") {
          await page.keyboard.press("End");
        } else {
          // Step down to the minimum without passing the collapse threshold.
          for (let i = 0; i < 25; i += 1) {
            const now = Number(await handle.getAttribute("aria-valuenow"));
            if (now - 32 < 260) break;
            await page.keyboard.press("ArrowRight");
          }
        }
        const expected = Number(await handle.getAttribute("aria-valuenow"));
        await page.waitForTimeout(150);
        const m = await measure(page);
        if (!m) {
          problems.push(`${id} ${edge}: panel not visible`);
          continue;
        }
        if (Math.abs(m.width - expected) > 4) problems.push(`${id} ${edge}: panel ${m.width}px, handle says ${expected}px`);
        if (m.right > m.viewport + 1) problems.push(`${id} ${edge}: panel runs ${m.right - m.viewport}px off screen`);
        if (!m.closeVisible) problems.push(`${id} ${edge}: close button not fully on screen`);
        if (m.overflowing.length) problems.push(`${id} ${edge}: content past the edge — ${m.overflowing.join(", ")}`);
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("a chosen width carries from tool to tool and across a reload", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const [first, second] = await toolIds(page);
  await openTool(page, first);
  const handle = page.locator(".companion-resize-border");
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  const chosen = Number(await handle.getAttribute("aria-valuenow"));

  await openTool(page, second);
  await expect(handle).toHaveAttribute("aria-valuenow", String(chosen));

  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
  await openTool(page, first);
  await expect(page.locator(".companion-resize-border")).toHaveAttribute("aria-valuenow", String(chosen));
});

test("every tool that can expand redocks with its draft and its patient intact", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await pinAllPanelTools(page);
  const chart = page.locator(".browser-tab[data-workspace-tab='patient']", { hasText: "Maya Chen" }).first();
  await chart.click();
  await expect(chart).toHaveClass(/active/);

  const expandable: string[] = [];
  for (const id of await toolIds(page)) {
    await openTool(page, id);
    const panel = page.locator(".companion-panel:visible").first();
    await expect(panel.locator(".companion-close-btn").first(), `${id} renders`).toBeVisible();
    const expand = panel.locator("button[data-action='expand-companion']");
    // Some panels render their frame a beat after the rail button; give it that beat.
    const canExpand = await expand.first().waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false);
    if (!canExpand) continue;
    expandable.push(id);

    // MED-HIER-1 (e0fd3b1) collapsed Medications' reconciliation, whose report field is
    // that tool's composer. Open the disclosure so its draft still makes the round trip.
    const reconciliation = panel.locator("details:not([open]) > summary").filter({ hasText: "Medication reconciliation" });
    if ((await reconciliation.count()) > 0) await reconciliation.first().click();

    // A composer's text, when the tool has one, must survive the round trip. Only a
    // visible field is one a clinician can type into.
    const composer = panel.locator(composerSelector).first();
    const draft = `CB6 expand ${id} ${Date.now()}`;
    const hasComposer = (await composer.count()) > 0 && (await composer.isEditable());
    if (hasComposer) await composer.fill(draft);

    await expand.click();
    const expanded = page.locator(".companion-panel.companion-expanded-canvas");
    await expect(expanded, `${id} expands`).toBeVisible();
    await expect(page.locator(`.companion-rail-btn[data-tool-id='${id}']`), `${id}: the rail stays reachable`).toBeVisible();
    await expanded.locator("button[data-action='redock-companion']").click();
    await expect(expanded, `${id} redocks`).toHaveCount(0);
    await expect(page.locator(`.companion-rail-btn[data-tool-id='${id}']`)).toHaveAttribute("aria-pressed", "true");
    if (hasComposer) {
      await expect(page.locator(".companion-panel:visible").first().locator(composerSelector).first(), `${id} keeps its draft`).toHaveValue(draft);
      await page.locator(".companion-panel:visible").first().locator(composerSelector).first().fill("");
    }
    await expect(chart, `${id}: the chart in front did not change`).toHaveClass(/active/);
  }
  // All right-rail tools support the companion lifecycle: expand to full view and redock.
  expect(expandable.sort()).toEqual(
    ["ai", "calc", "calendar", "communication", "documents", "history", "hr", "labs", "medications", "orders", "scratchpad", "tasks"],
  );
});
