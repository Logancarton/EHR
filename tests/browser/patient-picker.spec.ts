import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("Patients opens a picker, searches the whole roster, and deliberately selects a chart", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const maya = page.getByRole("button", { name: "Maya Chen tab", exact: true });
  await maya.focus();
  await page.keyboard.press("Enter");
  const launcher = page.getByRole("button", { name: "Open workspace", exact: true });
  const openPicker = async () => {
    await launcher.click();
    await page.locator("button[data-workspace-id='patients']").click();
  };
  await openPicker();
  const canvas = page.getByRole("dialog", { name: "Find a patient" });
  const search = canvas.getByRole("searchbox");
  await expect(search).toBeFocused();
  await expect(maya).toHaveAttribute("aria-current", "page");
  await search.fill("not-a-patient-987654");
  await expect(canvas.getByText("No patients match your search.")).toBeVisible();
  await search.fill("Elena Rostova");
  await expect(canvas.getByRole("button", { name: /Elena Rostova/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(canvas).not.toBeVisible();
  await expect(launcher).toBeFocused();
  await expect(maya).toHaveAttribute("aria-current", "page");

  await openPicker();
  await search.fill("Elena Rostova");
  const row = canvas.getByRole("button", { name: /Elena Rostova/ });
  const identity = await row.innerText();
  const mrn = identity.match(/MRN (\S+)/)?.[1];
  expect(mrn).toBeTruthy();
  await search.fill(mrn!);
  await expect(canvas.locator("li")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(canvas).not.toBeVisible();
  const elena = page.getByRole("button", { name: "Elena Rostova tab", exact: true });
  await expect(elena).toHaveAttribute("aria-current", "page");
  await expect(maya).toBeVisible();
  await openPicker();
  await search.fill("Elena Rostova");
  await row.click();
  await expect(elena).toHaveCount(1);
});

test("patient picker distinguishes roster failure, retry, loading and empty", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/patients", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.reload();
  // Restore also reads the roster. Finish it before replacing the failure route
  // so its background request cannot consume the held Retry response.
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true");
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.locator("button[data-workspace-id='patients']").click();
  const canvas = page.getByRole("dialog", { name: "Find a patient" });
  await expect(canvas.getByRole("alert")).toContainText("Patients could not be loaded");
  await expect(canvas.locator("li")).toHaveCount(0);
  await page.unroute("**/api/patients");
  let release!: () => void;
  const paused = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/patients", async (route) => {
    await paused;
    await route.fulfill({ json: { success: true, patients: [] } });
  });
  await canvas.getByRole("button", { name: "Retry loading patients" }).click();
  await expect(canvas.getByText("Loading patients…")).toBeVisible();
  release();
  await expect(canvas.getByText("No accessible patients are available.")).toBeVisible();
  await expect(canvas.locator("li")).toHaveCount(0);
});

test("New patient starts the existing intake flow without creating a chart implicitly", async ({ page }) => {
  await signInWithDefaultLayout(page, "Prototype provider");
  const before = await (await page.request.get("/api/patients")).json();
  const openNew = async () => {
    await page.getByRole("button", { name: "Open workspace", exact: true }).click();
    await page.locator("button[data-workspace-id='patients']").click();
    await page.getByRole("dialog", { name: "Find a patient" })
      .getByRole("button", { name: "New patient / Start intake", exact: true }).click();
  };
  await openNew();
  const modal = page.getByRole("dialog", { name: "New Intake", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("textbox", { name: "First name", exact: true })).toBeFocused();
  await expect(modal.getByRole("button", { name: "Start Intake", exact: true })).toBeDisabled();
  await modal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(modal).not.toBeVisible();
  // Intake is already mounted on this second handoff; no lost mount-time event.
  await openNew();
  await expect(modal).toBeVisible();
  const name = `Picker Prospect ${Date.now()}`;
  await modal.getByRole("textbox", { name: "First name", exact: true }).fill("Picker");
  await modal.getByRole("textbox", { name: "Last name", exact: true }).fill(name.slice(7));
  await modal.getByLabel("Date of birth", { exact: true }).fill("1990-03-04");
  await modal.getByRole("textbox", { name: "Callback phone", exact: true }).fill("6025550135");
  await modal.getByRole("textbox", { name: "Email", exact: true }).fill("picker-prospect@example.test");
  await expect(modal.getByRole("checkbox", { name: "Schedule a tentative visit now" })).not.toBeChecked();
  let prospectCreates = 0;
  await page.route("**/api/prospective-persons", async (route) => {
    if (route.request().method() === "POST") prospectCreates += 1;
    await route.continue();
  });
  await page.route("**/api/intake", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, json: { success: false, error: "Intake temporarily unavailable" } });
    } else await route.continue();
  });
  await modal.getByRole("button", { name: "Start Intake", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("Intake temporarily unavailable");
  await expect(modal).toBeVisible();
  await page.unroute("**/api/intake");
  await modal.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(modal).not.toBeVisible();
  expect(prospectCreates).toBe(1);
  await expect(page.locator(".intake-detail-pane")).toContainText(name);
  const after = await (await page.request.get("/api/patients")).json();
  expect(after.patients.map((patient: { id: string }) => patient.id)).toEqual(before.patients.map((patient: { id: string }) => patient.id));
  await page.getByRole("button", { name: "Close Intake workspace", exact: true }).click();
  await page.getByRole("button", { name: "Open workspace", exact: true }).click();
  await page.locator("button[data-workspace-id='intake']").click();
  await expect(modal).not.toBeVisible();
});

for (const { width, height, zoom, label } of [
  { width: 1440, height: 900, zoom: 1, label: "1440" },
  { width: 1280, height: 800, zoom: 1, label: "1280" },
  { width: 1024, height: 800, zoom: 1, label: "1024" },
  { width: 1440, height: 900, zoom: 2, label: "200-percent" },
]) {
  test(`patient picker readable and reachable at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signInWithDefaultLayout(page, "Prototype provider");
    await page.evaluate((scale) => { document.documentElement.style.zoom = String(scale); }, zoom);
    await page.getByRole("button", { name: "Open workspace", exact: true }).click();
    await page.locator("button[data-workspace-id='patients']").click();
    const canvas = page.getByRole("dialog", { name: "Find a patient" });
    await expect(canvas.getByRole("button", { name: /Maya Chen/ })).toBeVisible();
    expect(await canvas.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await canvas.locator("li").last().scrollIntoViewIfNeeded();
    await expect(canvas.locator("li").last()).toBeInViewport();
    await expect(canvas.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    await expect(canvas.getByRole("button", { name: "New patient / Start intake", exact: true })).toBeInViewport();
    await canvas.getByRole("searchbox").fill("Maya Chen");
    await page.screenshot({ path: `output/playwright/patient-picker-${label}.png` });
    await canvas.getByRole("button", { name: "Close", exact: true }).click();
    await expect(canvas).not.toBeVisible();
  });
}
