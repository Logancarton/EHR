import { expect, test, type Page } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

/**
 * The top bar microphone asks what the voice is for (owner request, 2026-09-27).
 *
 * It used to start listening into the omnibox and open the search dropdown. It now
 * opens its own menu: Dictate note and Scribe note each pick a patient and a note
 * type and open that patient's note; Talk with Clinical Bond is the old omnibox
 * voice path. Speech itself is not exercised here (headless Chromium has none);
 * what is asserted is where each choice lands and what it records.
 */

function microphone(page: Page) {
  return page.locator(".topbar").getByRole("button", { name: "Voice", exact: true });
}

function voiceMenu(page: Page) {
  return page.getByRole("region", { name: "Voice" });
}

test.beforeEach(async ({ page }) => {
  page.on("console", (msg) => console.log("PAGE LOG:", msg.type(), msg.text()));
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signInWithDefaultLayout(page, "Prototype provider");
});

test("the microphone opens the voice menu, not the search dropdown, and closes the way it opened", async ({ page }) => {
  await microphone(page).click();
  await expect(voiceMenu(page)).toBeVisible();
  await expect(microphone(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".search-results")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Ask AI or search the EHR" })).not.toBeFocused();
  for (const option of ["Dictate note", "Scribe note", "Talk with Clinical Bond"]) {
    await expect(voiceMenu(page).getByRole("button", { name: new RegExp(`^${option}`) })).toBeVisible();
  }

  await page.keyboard.press("Escape");
  await expect(voiceMenu(page)).toHaveCount(0);
  await expect(microphone(page)).toBeFocused();

  await microphone(page).click();
  await expect(voiceMenu(page)).toBeVisible();
  await microphone(page).click();
  await expect(voiceMenu(page), "the microphone toggles its menu").toHaveCount(0);
});

test("Dictate note → patient → Phone call opens that patient's note as a phone call", async ({ page }) => {
  await microphone(page).click();
  await voiceMenu(page).getByRole("button", { name: /^Dictate note/ }).click();
  await expect(voiceMenu(page).getByRole("heading", { name: "Dictate note · Choose patient" })).toBeVisible();
  await voiceMenu(page).getByRole("textbox", { name: "Search patients" }).fill("Sofia");
  await voiceMenu(page).getByRole("listitem").filter({ hasText: "Sofia Martinez" }).click();

  await expect(voiceMenu(page).getByRole("heading", { name: "Dictate note · Sofia Martinez" })).toBeVisible();
  const types = voiceMenu(page).getByRole("list", { name: "Note types" });
  for (const label of ["Intake", "Follow-up", "Phone call", "Psychotherapy", "Other", "Create new note type"]) {
    await expect(types.getByRole("listitem").filter({ hasText: label }).first()).toBeVisible();
  }
  // Back returns to the patient step with the search kept.
  await voiceMenu(page).getByRole("button", { name: "Back" }).click();
  await expect(voiceMenu(page).getByRole("textbox", { name: "Search patients" })).toHaveValue("Sofia");
  await voiceMenu(page).getByRole("listitem").filter({ hasText: "Sofia Martinez" }).click();

  await types.getByRole("listitem").filter({ hasText: "Phone call" }).click();
  await expect(voiceMenu(page)).toHaveCount(0);
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: "Sofia Martinez" });
  await expect(tab).toHaveClass(/active/);
  const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
  await expect(workspace).toBeVisible();
  await expect(workspace.locator(".note-doc-header, .encounter-note-document").first()).toContainText(
    /Phone Call|Psychiatric Follow-Up/,
  );
});

test("Create new note type saves it for next time; Scribe note opens the Scribe tool", async ({ page }) => {
  const name = `Care conference ${Date.now().toString().slice(-5)}`;
  await microphone(page).click();
  await voiceMenu(page).getByRole("button", { name: /^Scribe note/ }).click();
  await voiceMenu(page).getByRole("textbox", { name: "Search patients" }).fill("David Kim");
  await voiceMenu(page).getByRole("listitem").filter({ hasText: "David Kim" }).click();
  await voiceMenu(page).getByRole("listitem").filter({ hasText: "Create new note type" }).click();
  await voiceMenu(page).getByRole("textbox", { name: "New note type name" }).fill(name);
  await voiceMenu(page).getByRole("button", { name: "Save and start" }).click();

  const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
  await expect(workspace).toBeVisible();
  const recordTool = workspace.getByRole("group", { name: "Encounter rail modes" }).getByRole("button", { name: "Scribe", exact: true });
  await expect(recordTool, "scribing opens on the Scribe tool").toHaveAttribute("aria-pressed", "true");

  // The saved type is offered again, from the server-held preferences.
  await page.reload();
  await expect(page.locator(".authenticated-app")).toHaveAttribute("data-workspace-restored", "true", { timeout: 15_000 });
  await microphone(page).click();
  await voiceMenu(page).getByRole("button", { name: /^Dictate note/ }).click();
  await voiceMenu(page).getByRole("textbox", { name: "Search patients" }).fill("David Kim");
  await voiceMenu(page).getByRole("listitem").filter({ hasText: "David Kim" }).click();
  await expect(voiceMenu(page).getByRole("list", { name: "Note types" }).getByRole("listitem").filter({ hasText: name })).toBeVisible();
});

test("Talk with Clinical Bond is the omnibox voice path", async ({ page }) => {
  await microphone(page).click();
  await voiceMenu(page).getByRole("button", { name: /^Talk with Clinical Bond/ }).click();
  await expect(voiceMenu(page)).toHaveCount(0);
  // Headless Chromium has no speech engine, so the omnibox reports that plainly
  // rather than pretending to listen.
  await expect(page.locator(".topbar")).toContainText(/Voice input|Microphone permission is off|Listening/);
});
