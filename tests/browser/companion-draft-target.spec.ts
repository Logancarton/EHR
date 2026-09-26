import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * CB-6c — a companion draft belongs to the patient it was typed for.
 *
 * The right-rail companion stays open while the clinician moves between charts.
 * A draft typed into it on one chart must never be saved against the next chart
 * brought to the foreground: that is a wrong-patient write, and nothing on screen
 * tells the clinician it happened (the text is unchanged; only the header moved).
 *
 * Each case types on Maya Chen, switches to Jordan Reed, and then checks both
 * halves of the contract against the server rather than the DOM:
 * - Jordan's composer does not carry Maya's words, so acting there cannot file them
 *   against Jordan;
 * - returning to Maya brings the draft back, and saving it files it against Maya.
 */

const MAYA = { id: "maya-chen", name: "Maya Chen" };
const JORDAN = { id: "jordan-reed", name: "Jordan Reed" };

async function focusChart(page: Page, patientName: string) {
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']", { hasText: patientName }).first();
  // Workspace restore does not always bring back both default charts on a cold
  // server; open a missing one the way a clinician would (window-lifecycle does
  // the same). This is establishing a precondition, not the behaviour under test.
  if (!(await tab.count())) {
    await page.getByRole("textbox", { name: "Ask AI or search the EHR" }).fill(patientName);
    const result = page
      .locator('.search-results button[data-omnibox-result="patient"]')
      .filter({ hasText: patientName })
      .first();
    await expect(result).toBeVisible({ timeout: 15_000 });
    await result.click();
  }
  await expect(tab).toBeVisible({ timeout: 15_000 });
  await tab.click();
  await expect(tab).toHaveClass(/active/);
}

async function openCompanion(page: Page, label: string) {
  const button = page.locator(`.companion-rail-btn[aria-label='${label}']`).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

test.describe("CB-6c companion drafts stay with their patient", () => {
  test("a Tasks draft typed on one chart is not added to the next chart", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const text = `CB6c task ${Date.now()}`;

    await focusChart(page, MAYA.name);
    await openCompanion(page, "Tasks");
    const input = page.getByRole("textbox", { name: "New task" });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByTestId("task-draft-target")).toHaveText(`Links to ${MAYA.name}`);
    await input.fill(text);

    await focusChart(page, JORDAN.name);
    await expect(input, "Jordan's composer must not carry Maya's task").toHaveValue("");
    await expect(page.getByTestId("task-draft-target")).toHaveText(`Links to ${JORDAN.name}`);

    await focusChart(page, MAYA.name);
    await expect(input, "Maya's task draft comes back with her chart").toHaveValue(text);
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/tasks") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    const body = await (await created).json();
    expect(body.task?.patientId, "the task is filed against Maya").toBe(MAYA.id);
    await expect(input).toHaveValue("");
  });

  test("a Scratchpad draft typed on one chart is not filed against the next chart", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const text = `CB6c scratch ${Date.now()}`;

    await focusChart(page, MAYA.name);
    await openCompanion(page, "Scratchpad");
    const composer = page.locator(".scratchpad-composer textarea");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill(text);

    await focusChart(page, JORDAN.name);
    await expect(composer, "Jordan's composer must not carry Maya's note").toHaveValue("");
    await expect(page.getByLabel("Who this note is about")).toHaveValue(JORDAN.id);

    await focusChart(page, MAYA.name);
    await expect(composer, "Maya's note draft comes back with her chart").toHaveValue(text);
    await expect(page.getByLabel("Who this note is about")).toHaveValue(MAYA.id);
    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/tasks") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    const body = await (await created).json();
    expect(body.scratchNote?.patientId, "the note is filed against Maya").toBe(MAYA.id);
    await expect(composer).toHaveValue("");
  });

  test("a Messages reply typed to one patient is not sent to the next patient", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    // Messages is not pinned by default; pin it where rails live, then reload.
    const { defaultPreferences } = await import("../../app/lib/preference-engine");
    const pinned = await page.request.put("/api/preferences/rails", {
      data: {
        left: defaultPreferences.rails.left,
        right: [...defaultPreferences.rails.right, "messages"],
      },
    });
    expect(pinned.ok()).toBeTruthy();
    await page.reload();
    await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });

    const text = `CB6c reply ${Date.now()}`;
    await focusChart(page, MAYA.name);
    await openCompanion(page, "Messages");
    const panel = page.locator(".companion-messages-panel");
    const composer = panel.locator(".message-composer textarea");
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill(text);

    await focusChart(page, JORDAN.name);
    await expect(composer).toHaveAttribute("placeholder", `Reply to ${JORDAN.name}...`);
    await expect(composer, "Jordan's composer must not carry Maya's reply").toHaveValue("");

    await focusChart(page, MAYA.name);
    await expect(composer, "Maya's reply draft comes back with her chart").toHaveValue(text);
    const sent = page.waitForResponse(
      (r) => r.url().includes("/api/messages") && r.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "Send", exact: true }).click();
    const request = (await sent).request();
    expect(JSON.stringify(request.postDataJSON()), "the reply is sent in Maya's thread").toContain(MAYA.id);

    const jordanThreads = await (await page.request.get(`/api/messages?patientId=${JORDAN.id}`)).json();
    expect(JSON.stringify(jordanThreads), "nothing reached Jordan").not.toContain(text);
  });

  test("a Scratchpad draft marked as a practice note stays a practice note", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const text = `CB6c practice ${Date.now()}`;

    await focusChart(page, MAYA.name);
    await openCompanion(page, "Scratchpad");
    const composer = page.locator(".scratchpad-composer textarea");
    const target = page.getByLabel("Who this note is about");
    await expect(composer).toBeEnabled({ timeout: 15_000 });
    await composer.fill(text);
    await target.selectOption("");

    await focusChart(page, JORDAN.name);
    await focusChart(page, MAYA.name);
    await expect(composer).toHaveValue(text);
    await expect(target, "the practice choice survives the chart switch").toHaveValue("");

    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/tasks") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    const body = await (await created).json();
    expect(body.scratchNote?.patientId ?? null, "filed as a practice note").toBeNull();
  });

  test("a task that fails to save keeps its draft and its patient", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");
    const text = `CB6c failed ${Date.now()}`;

    await focusChart(page, MAYA.name);
    await openCompanion(page, "Tasks");
    const input = page.getByRole("textbox", { name: "New task" });
    await expect(input).toBeEnabled({ timeout: 15_000 });
    await input.fill(text);

    await page.route("**/api/tasks", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, body: JSON.stringify({ success: false }) })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    await expect(page.getByText("Task was not added. Try again.")).toBeVisible();
    await expect(input, "a failed save does not discard the draft").toHaveValue(text);
    await page.unroute("**/api/tasks");

    await focusChart(page, JORDAN.name);
    await expect(input).toHaveValue("");
    await focusChart(page, MAYA.name);
    await expect(input, "the unsaved draft is still Maya's").toHaveValue(text);
  });
});
