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
  await row.focus();
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
    await canvas.getByRole("searchbox").fill("Maya Chen");
    await page.screenshot({ path: `output/playwright/patient-picker-${label}.png` });
    await canvas.getByRole("button", { name: "Close", exact: true }).click();
    await expect(canvas).not.toBeVisible();
  });
}
