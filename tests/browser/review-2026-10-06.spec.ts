import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * Owner review 2026-10-06: Tasks' + adds with a patient and due date, a lab
 * report entered together is one result set, History and Documents can be
 * organized, and a patient message can carry chart records (D-127).
 */

async function focusMaya(page: Page) {
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']", { hasText: "Maya Chen" }).first();
  if (!(await tab.count())) {
    await page.getByRole("textbox", { name: "Ask AI or search the EHR" }).fill("Maya Chen");
    const result = page.locator('.search-results button[data-omnibox-result="patient"]').filter({ hasText: "Maya Chen" }).first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();
  }
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await focusMaya(page);
});

test("Tasks: an empty + asks for the task, and the task is filed for the chosen patient and due date", async ({ page }) => {
  await page.locator('.companion-rail-btn[data-tool-id="tasks"]').click();
  const panel = page.locator('[data-companion-panel="tasks"]');
  const input = panel.getByRole("textbox", { name: "New task" });
  await expect(input).toBeEnabled({ timeout: 15_000 });

  await panel.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(panel.getByText("Type what needs doing, then press + or Enter.")).toBeVisible();
  await expect(input).toBeFocused();

  const text = `Review sleep log ${Date.now()}`;
  await input.fill(text);
  await panel.getByLabel("Who this task is for").selectOption("");
  await panel.getByLabel("When this task is due").selectOption("In 1 week");
  await expect(panel.getByTestId("task-draft-target")).toHaveText("New tasks are practice tasks — no patient");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/tasks") && r.request().method() === "POST");
  await panel.getByRole("button", { name: "Add task", exact: true }).click();
  const body = await (await created).json();
  expect(body.task.patientId ?? null, "a practice task names no patient").toBeNull();
  expect(body.task.due).toBe("In 1 week");
  await expect(panel.locator(".task-item").filter({ hasText: text })).toContainText("Practice task · In 1 week");
});

test("Labs: results entered from one report are filed and reviewed as one set", async ({ page }) => {
  await page.locator('.companion-rail-btn[data-tool-id="labs"]').click();
  await page.getByRole("tab", { name: "Record & review", exact: true }).click();
  await page.locator('[data-companion-panel="labs"]').getByRole("button", { name: "Expand to main canvas" }).click();
  await page.getByRole("button", { name: "Record result", exact: true }).click();
  const form = page.getByRole("form", { name: /Record a lab result for Maya Chen/ });
  const stamp = Date.now();
  await form.getByLabel("Test name", { exact: true }).fill(`Sodium ${stamp}`);
  await form.getByLabel("Result", { exact: true }).fill("138");
  await form.getByRole("button", { name: "+ Add another result from this report" }).click();
  await form.getByLabel("Test name (result 2)").fill(`Potassium ${stamp}`);
  await form.getByLabel("Result (result 2)").fill("3.2");
  await form.getByLabel("Interpretation (result 2)").selectOption("low");
  await form.getByRole("button", { name: "Save 2 results" }).click();

  await expect(page.locator(".lab-entry-saved")).toContainText("2 results saved together");
  const set = page.locator("tbody.lab-result-set").filter({ hasText: `Sodium ${stamp}` });
  await expect(set).toContainText(`Potassium ${stamp}`);
  await expect(set.locator(".lab-result-set-heading")).toContainText("2 results · one report");
});

test("History can be grouped by month and read compactly; entries expand in place", async ({ page }) => {
  await page.locator('.companion-rail-btn[data-tool-id="history"]').click();
  const organizer = page.getByRole("group", { name: "Organize history" });
  await expect(organizer).toBeVisible({ timeout: 15_000 });
  await organizer.getByLabel("Group").selectOption("month");
  await organizer.getByRole("button", { name: "Compact" }).click();
  const firstGroup = page.locator(".record-group").first();
  await expect(firstGroup.locator(".record-group-header")).toHaveAttribute("aria-expanded", "true");
  const row = firstGroup.locator(".timeline-compact-row").first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(firstGroup.locator(".timeline-compact-expanded .timeline-card")).toBeVisible();
  await firstGroup.locator(".record-group-header").click();
  await expect(firstGroup.locator(".record-group-items")).toHaveCount(0);
  // Back to the default so later specs see the usual feed.
  await organizer.getByLabel("Group").selectOption("none");
  await organizer.getByRole("button", { name: "Detailed" }).click();
});

test("A patient reply can carry a signed note and a rating scale", async ({ page }) => {
  await page.locator('.companion-rail-btn[data-tool-id="communication"]').click();
  const panel = page.locator('[data-companion-panel="communication"]');
  await panel.getByRole("tab", { name: "Patient", exact: true }).click();
  await panel.getByRole("button", { name: "Expand to main canvas" }).click();
  await panel.locator(".thread-item").first().click();

  await panel.getByRole("button", { name: /^Attach/ }).click();
  const chooser = panel.getByRole("group", { name: "Choose attachments" });
  await expect(chooser.locator(".message-attachment-option").first()).toBeVisible({ timeout: 15_000 });
  await chooser.locator(".message-attachment-option").first().locator("input").check();
  await chooser.getByRole("tab", { name: /Assessments/ }).click();
  await chooser.locator(".message-attachment-option").first().locator("input").check();
  await chooser.getByRole("button", { name: "Done" }).click();
  await expect(panel.getByRole("list", { name: "Attachments" }).locator("li")).toHaveCount(2);

  const text = `Records attached ${Date.now()}`;
  await panel.locator(".message-composer textarea").fill(text);
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/messages") && r.request().method() === "POST");
  await panel.getByRole("button", { name: "Send", exact: true }).click();
  const body = await (await sent).json();
  expect(body.message.attachments.map((item: { kind: string }) => item.kind).sort()).toEqual(["assessment", "encounter"]);

  const bubble = panel.locator(".message-bubble-row").filter({ hasText: text });
  await expect(bubble.getByRole("list", { name: "Attached" }).locator("li")).toHaveCount(2);
  await expect(panel.getByRole("list", { name: "Attachments" })).toHaveCount(0);
});
