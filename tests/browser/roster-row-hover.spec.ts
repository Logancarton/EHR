import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Hovering a dashboard roster row reveals the front-desk status labels
 * (Tentative / Scheduled / Confirmed / In Office). That used to widen the status
 * column, so on a normal laptop screen with a companion docked the options and the
 * Start button were pushed past the edge of the row (owner report, 2026-09-27).
 * Revealing the labels must not move or clip anything.
 */

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1600, height: 900 },
];

for (const viewport of VIEWPORTS) {
  test(`hovering a roster row keeps its status options inside the row (${viewport.width}px, companion docked)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    await page.getByRole("button", { name: "Home Launchpad" }).click().catch(() => undefined);
    const dashboardTab = page.locator(".browser-tab", { hasText: "Dashboard" }).first();
    if (await dashboardTab.count()) await dashboardTab.click();

    // A docked companion is the everyday case that narrows the dashboard.
    const tasks = page.locator(".companion-rail-btn[data-tool-id='tasks']");
    if ((await tasks.getAttribute("aria-pressed")) !== "true") await tasks.click();

    // Find a day with visits: step forward until the roster has rows.
    const rows = page.locator(".roster-row");
    for (let i = 0; i < 10 && (await rows.count()) === 0; i += 1) {
      await page.getByRole("button", { name: /next day|next/i }).first().click().catch(() => undefined);
      await page.waitForTimeout(250);
    }
    const count = await rows.count();
    expect(count, "a day with visits to hover").toBeGreaterThan(0);

    const problems: string[] = [];
    for (let i = 0; i < Math.min(count, 6); i += 1) {
      const row = rows.nth(i);
      await row.scrollIntoViewIfNeeded();
      const before = await row.boundingBox();
      await row.hover({ position: { x: 20, y: 10 } });
      await page.waitForTimeout(120);
      const m = await row.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const box = (sel: string) => {
          const n = el.querySelector(sel);
          return n ? n.getBoundingClientRect() : null;
        };
        const opts = box(".roster-frontdesk-options") ?? box(".roster-frontdesk");
        const actions = box(".roster-actions");
        const card = el.closest(".dashboard-window, .dashboard-card, section")?.getBoundingClientRect() ?? r;
        return {
          rowRight: r.right,
          rowLeft: r.left,
          cardRight: card.right,
          optsRight: opts?.right ?? 0,
          optsLeft: opts?.left ?? r.left,
          actionsRight: actions?.right ?? 0,
          name: el.querySelector(".roster-name")?.textContent?.trim() ?? `row ${i}`,
        };
      });
      const after = await row.boundingBox();
      if (m.optsRight > m.rowRight + 1) problems.push(`${m.name}: status options run ${Math.round(m.optsRight - m.rowRight)}px past the row`);
      if (m.optsLeft < m.rowLeft - 1) problems.push(`${m.name}: status options run past the row's left edge`);
      if (m.actionsRight > m.rowRight + 1) problems.push(`${m.name}: actions run ${Math.round(m.actionsRight - m.rowRight)}px past the row`);
      if (m.rowRight > m.cardRight + 1) problems.push(`${m.name}: the row runs ${Math.round(m.rowRight - m.cardRight)}px past its card`);
      if (before && after && Math.abs(after.height - before.height) > 1) problems.push(`${m.name}: the row changes height on hover`);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
