import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * CB-6h — a refresh asks before it throws away an unsent companion draft.
 *
 * Drafts are held in memory, not in browser storage (owner decision, 2026-09-27),
 * so the browser's own "Leave site?" prompt is the protection. It must cover every
 * patient's drafts, not only the chart in front, and it must not nag when nothing
 * is unsent.
 */

async function focusChart(page: Page, patientName: string) {
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']", { hasText: patientName }).first();
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);
}

async function openCompanion(page: Page, label: string) {
  const button = page.locator(`.companion-rail-btn[aria-label='${label}']`).first();
  // Unpinned tools (Scratchpad by default) open from the rail's More menu, which is
  // how a clinician reaches them; pinned ones keep their rail button.
  await expect(page.locator(".companion-rail-btn").first()).toBeVisible({ timeout: 15_000 });
  if (!(await button.count())) {
    await page.getByRole("button", { name: "More companion tools", exact: true }).click();
    await page.locator(".companion-add-menu").getByRole("button", { name: `Open ${label}`, exact: true }).click();
    // Opening from More shows the tool without pinning it, so there is no rail
    // button to be pressed; the open panel is the evidence.
    await expect(page.locator(`[data-companion-panel="${label.toLowerCase()}"]`)).toBeVisible({ timeout: 15_000 });
    return;
  }
  await expect(button).toBeVisible({ timeout: 15_000 });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** Reloads, and reports whether the browser asked first. Dismissing keeps the page. */
async function reloadAndSeeIfAsked(page: Page, answer: "stay" | "leave") {
  let asked = false;
  const onDialog = async (dialog: import("@playwright/test").Dialog) => {
    if (dialog.type() !== "beforeunload") return;
    asked = true;
    if (answer === "stay") await dialog.dismiss();
    else await dialog.accept();
  };
  page.on("dialog", onDialog);
  await page.reload({ timeout: 5_000 }).catch(() => undefined);
  page.off("dialog", onDialog);
  return asked;
}

test.describe("CB-6h a refresh does not silently discard companion drafts", () => {
  test("an unsent task on another patient's chart makes the browser ask, and staying keeps it", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const text = `CB6h task ${Date.now()}`;
    await focusChart(page, "Maya Chen");
    await openCompanion(page, "Tasks");
    const input = page.getByRole("textbox", { name: "New task" });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill(text);

    // The draft is Maya's; Jordan's chart is in front when the refresh happens.
    await focusChart(page, "Jordan Reed");
    expect(await reloadAndSeeIfAsked(page, "stay"), "the browser asks before discarding it").toBe(true);

    await focusChart(page, "Maya Chen");
    await expect(input, "staying keeps the draft").toHaveValue(text);
  });

  test("an unsent Scratchpad note makes the browser ask", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await focusChart(page, "Maya Chen");
    await openCompanion(page, "Scratchpad");
    const composer = page.locator(".scratchpad-composer textarea");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill(`CB6h note ${Date.now()}`);
    expect(await reloadAndSeeIfAsked(page, "leave")).toBe(true);
  });

  test("nothing unsent, or the draft saved, means no prompt", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    await focusChart(page, "Maya Chen");
    await openCompanion(page, "Tasks");
    const input = page.getByRole("textbox", { name: "New task" });
    await expect(input).toBeEnabled({ timeout: 15_000 });

    // Typed and then cleared is no draft.
    await input.fill("half a thought");
    await input.fill("");
    expect(await reloadAndSeeIfAsked(page, "leave"), "an empty composer does not nag").toBe(false);

    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
    await focusChart(page, "Maya Chen");
    await openCompanion(page, "Tasks");
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill(`CB6h saved ${Date.now()}`);
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(input).toHaveValue("");
    expect(await reloadAndSeeIfAsked(page, "leave"), "a saved task leaves nothing to warn about").toBe(false);
  });
});
