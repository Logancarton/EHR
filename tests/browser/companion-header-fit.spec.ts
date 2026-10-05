import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

// Every right-rail tool renders the shared CompanionPanelHeader. At a narrow
// pane the title/context block was squeezed by the labeled header controls
// until the bound-context line wrapped one letter per row. These checks measure
// the rendered header rather than the presence of a class.

const TOOLS = [
  { id: "communication", panel: ".companion-panel[data-companion-panel='communication']" },
  { id: "history", panel: '[data-patient-record-tool="history"]' },
  { id: "labs", panel: ".companion-frame[data-companion-panel='labs']" },
] as const;

async function openOnMaya(page: Page, toolId: string, selector: string) {
  await page.locator('.browser-tab[data-workspace-tab="patient"]').filter({ hasText: "Maya Chen" }).click();
  await page.locator(`.companion-rail-btn[data-tool-id="${toolId}"]`).click();
  const panel = page.locator(selector).first();
  await expect(panel.locator(".companion-panel-header strong")).toBeVisible();
  await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  return panel;
}

async function expectHeaderFits(panel: Locator, label: string) {
  const report = await panel.evaluate((root) => {
    const header = root.querySelector<HTMLElement>(":scope > .companion-panel-header")!;
    const bounds = root.getBoundingClientRect();
    const textBlock = header.querySelector<HTMLElement>(":scope > div:first-child > div")!;
    const measure = document.createElement("canvas").getContext("2d")!;
    const texts = [...textBlock.querySelectorAll<HTMLElement>("strong, small")].map((element) => {
      const style = getComputedStyle(element);
      measure.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const words = (element.textContent ?? "").split(/\s+/).filter(Boolean);
      const longestWord = Math.max(0, ...words.map((word) => measure.measureText(word).width));
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
      const rect = element.getBoundingClientRect();
      return { text: element.textContent, width: rect.width, height: rect.height, longestWord, lineHeight };
    });
    const controls = [...header.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) => button.getClientRects().length > 0)
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          name: button.getAttribute("aria-label") || button.textContent?.trim() || "",
          inside: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.width > 0,
        };
      });
    return { paneWidth: bounds.width, texts, controls };
  });

  expect(report.texts.length, `${label}: header renders a title`).toBeGreaterThan(0);
  for (const text of report.texts) {
    // A word may only break when it cannot fit; the block must be at least as
    // wide as the longest word (or the pane), never one glyph wide.
    expect(text.width, `${label}: "${text.text}" is not squeezed below its longest word`)
      .toBeGreaterThanOrEqual(Math.min(text.longestWord, report.paneWidth - 80) - 1);
    expect(text.height, `${label}: "${text.text}" wraps to a readable number of lines`)
      .toBeLessThanOrEqual(text.lineHeight * 3 + 2);
  }
  expect(report.controls.length, `${label}: header keeps its controls`).toBeGreaterThanOrEqual(2);
  for (const control of report.controls) {
    expect(control.name, `${label}: every header control is labeled`).not.toBe("");
    expect(control.inside, `${label}: "${control.name}" fits within the pane`).toBe(true);
  }
  await expect(panel.getByRole("button", { name: /^Close/ }).first()).toBeVisible();
}

// 1024x800 puts the pane in single layout with a labeled Return to workspace
// control; 395 wide reproduces the ~343px pane where the defect was observed.
for (const viewport of [{ width: 1024, height: 800 }, { width: 395, height: 800 }]) {
  test(`Companion headers stay readable at ${viewport.width}x${viewport.height} with Return to workspace beside them`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    for (const tool of TOOLS) {
      const panel = await openOnMaya(page, tool.id, tool.panel);
      await expect(panel.getByRole("button", { name: "Return to workspace" })).toBeVisible();
      await expectHeaderFits(panel, `${tool.id} @${viewport.width}`);
      await page.screenshot({ path: `output/playwright/companion-header-${tool.id}-${viewport.width}.png` });
      await panel.getByRole("button", { name: /^Close/ }).last().click();
      await expect(panel).toHaveCount(0);
    }
  });
}

test("Companion headers stay readable at the minimum dock and expand/redock keeps a Communication draft", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  // The width preference already has an owner; reload only establishes the minimum-dock precondition.
  await page.evaluate(() => window.localStorage.setItem("ehr-companion-panel-width-v1", "260"));
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true");

  for (const tool of TOOLS.filter((candidate) => candidate.id !== "communication")) {
    const panel = await openOnMaya(page, tool.id, tool.panel);
    await expectHeaderFits(panel, `${tool.id} @min-dock`);
    await page.screenshot({ path: `output/playwright/companion-header-${tool.id}-min-dock.png` });
    await panel.getByRole("button", { name: /^Close/ }).last().click();
    await expect(panel).toHaveCount(0);
  }

  const panel = await openOnMaya(page, "communication", TOOLS[0].panel);
  await expectHeaderFits(panel, "communication @min-dock");
  await page.screenshot({ path: "output/playwright/companion-header-communication-min-dock.png" });

  await panel.getByRole("tab", { name: "Team", exact: true }).click();
  const draft = panel.locator(".comm-composer textarea").first();
  await draft.fill("Synthetic header-fit draft");
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await expect(panel.getByRole("button", { name: "Redock to companion rail" })).toBeVisible();
  await expectHeaderFits(panel, "communication expanded");
  await expect(draft).toHaveValue("Synthetic header-fit draft");
  await panel.getByRole("button", { name: "Redock to companion rail" }).click();
  await expect(panel.getByRole("button", { name: "Expand to main canvas" })).toBeVisible();
  await expect(draft).toHaveValue("Synthetic header-fit draft");
  await expectHeaderFits(panel, "communication redocked");
});
