import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInWithDefaultLayout, waitForAuthenticatedShell } from "./workspace-fixtures";

/**
 * Review & Sign reads visit readiness: warn plus explicit acknowledgement,
 * never a hard block. Driven through the clinician's controls with synthetic data.
 *
 * Marcus Vance is used because no other spec depends on his encounter state. The
 * first test signs his current draft through the ceremony, so each run signs a
 * fresh draft; the failure test stops before signing.
 */

async function openEncounter(page: Page, patientName: string) {
  const omnibox = page.getByRole("textbox", { name: "Ask AI or search the EHR" });
  await omnibox.fill(patientName);
  const result = page
    .locator('.search-results button[data-omnibox-result="patient"]')
    .filter({ hasText: patientName })
    .first();
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  const tab = page.locator(".browser-tab[data-workspace-tab='patient']").filter({ hasText: patientName });
  await expect(tab).toHaveClass(/active/, { timeout: 10_000 });
  // The patient header carries Overview and Encounter as buttons (PAT-10).
  await page.locator(".primary-workspace-pane").getByRole("button", { name: "Encounter", exact: true }).first().click();
  const workspace = page.locator(".primary-workspace-pane .encounter-workspace-root");
  await expect(workspace).toBeVisible({ timeout: 15_000 });
  // Opening a chart first hydrates its persisted draft. Editing before this
  // finishes creates a different local-only draft instead of the fixture.
  await expect(workspace.getByRole("button", { name: "Review & Sign", exact: true })).toBeEnabled({ timeout: 20_000 });
  return workspace;
}

/**
 * Gives the patient a persisted unsigned draft through the ordinary encounters API
 * when none exists. This isolates readiness on a persisted note; the separate
 * fresh-patient scenario below verifies authoring, first autosave and signing.
 */
async function ensureServerDraft(page: Page, patientId: string) {
  const headers = { "Content-Type": "application/json", "x-ehr-patient-id": patientId };
  const list = await page.request.get(`/api/encounters?patientId=${patientId}`, { headers });
  expect(list.ok()).toBe(true);
  const encounters = ((await list.json()).encounters ?? []) as Array<{ status: string }>;
  if (encounters.some((encounter) => encounter.status !== "signed")) return;
  const created = await page.request.post("/api/encounters", {
    headers,
    data: { patientId, chiefComplaint: "Synthetic sign-readiness fixture" },
  });
  expect(created.ok(), await created.text()).toBe(true);
}

/** Steps forward to the final Sign step, recording the dialog's top edge at each step. */
async function stepToSign(signModal: Locator): Promise<number[]> {
  const identity = signModal.locator(".review-sign-patient-identity");
  await expect(identity).toBeVisible();
  const identityText = await identity.innerText();
  const tops: number[] = [(await signModal.boundingBox())!.y];
  const continueButton = signModal.getByRole("button", { name: /continue/i });
  while (await continueButton.isVisible().catch(() => false)) {
    const followupCheck = signModal.locator("label").filter({ hasText: "follow-up plan" }).locator("input[type='checkbox']");
    if (await followupCheck.isVisible().catch(() => false)) await followupCheck.check();
    await continueButton.click();
    await expect(identity).toBeVisible();
    await expect(identity).toHaveText(identityText);
    tops.push((await signModal.boundingBox())!.y);
  }
  return tops;
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 800 },
]) {
  test(`open readiness items are shown in Review & Sign and acknowledged before signing (${viewport.width}x${viewport.height})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signInWithDefaultLayout(page, "Prototype provider");
    await ensureServerDraft(page, "marcus-vance");
    const workspace = await openEncounter(page, "Marcus Vance");

    // A note that can be signed (assessment and plan), with gaps left open on purpose.
    await workspace
      .getByRole("textbox", { name: "Clinical Assessment & Medical Decision Making", exact: true })
      .fill("Synthetic assessment: attention symptoms stable on current regimen.");
    await workspace.getByRole("textbox", { name: "Treatment Plan", exact: true }).fill("Continue current medication.");
    await expect(workspace.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 15_000 });

    const panel = workspace.getByRole("complementary", { name: "Visit readiness" });
    await expect(panel.locator('[data-readiness-group="labs"]')).not.toContainText("Checking", { timeout: 15_000 });
    const status = workspace.locator(".encounter-mode-status");
    await expect(status).not.toHaveAttribute("data-readiness-status", "loading", { timeout: 15_000 });
    const openCount = Number(await panel.getAttribute("data-readiness-open"));
    expect(openCount).toBeGreaterThan(0);

    // The status line reports the same count as the panel, never "Ready for review".
    await expect(status.locator("strong")).toContainText(`DRAFT NOTE · ${openCount} open item`);
    await expect(status).not.toContainText("Ready for review");

    // Only one Review & Sign entry remains: the toolbar's.
    await expect(workspace.getByRole("button", { name: /Review (encounter and sign|& Sign)/ })).toHaveCount(1);

    await workspace.getByRole("button", { name: "Review & Sign", exact: true }).click();
    const signModal = page.locator(".review-sign-modal");
    // Opening flushes the draft and re-extracts references first.
    await expect(signModal).toBeVisible({ timeout: 20_000 });

    const review = signModal.getByRole("region", { name: "Visit readiness before signing" });
    await expect(review).toHaveAttribute("data-sign-readiness-open", String(openCount));
    await expect(review.locator("[data-sign-readiness-item]")).toHaveCount(openCount);
    await expect(review.locator('[data-sign-readiness-group="note"]')).toBeVisible();
    await expect(review.locator('[data-sign-readiness-item^="goal:"]').filter({ hasText: "MSE" })).toBeVisible();
    await expect(signModal.locator(".review-sign-step-flag")).toHaveText(`${openCount} open`);
    await page.screenshot({ path: `output/playwright/sign-readiness-review-${viewport.width}x${viewport.height}.png` });

    // The dialog stays put while its steps change.
    const tops = await stepToSign(signModal);
    expect(tops.length).toBeGreaterThan(3);
    for (const top of tops) expect(Math.abs(top - tops[0])).toBeLessThanOrEqual(1);

    const attest = signModal.locator("label").filter({ hasText: "I attest" }).locator("input[type='checkbox']");
    await attest.check();
    const sign = signModal.getByRole("button", { name: /sign legal record|sign note/i });
    const acknowledge = signModal.getByRole("checkbox", { name: new RegExp(`I've reviewed ${openCount} open readiness item`) });
    await expect(acknowledge).toBeVisible();
    await expect(acknowledge).not.toBeChecked();
    await expect(sign).toBeDisabled();
    await acknowledge.check();
    await expect(sign).toBeEnabled();
    await page.screenshot({ path: `output/playwright/sign-readiness-acknowledge-${viewport.width}x${viewport.height}.png` });

    // Only the first viewport signs; the second stops at the enabled Sign action.
    if (viewport.width !== 1440) return;

    const signRequest = page.waitForRequest((request) => request.method() === "PATCH" && /\/api\/encounters\/[^/]+$/.test(request.url()));
    await sign.click();
    const body = JSON.parse((await signRequest).postData() ?? "{}");
    expect(body.readinessAcknowledgement.openCount).toBe(openCount);
    expect(body.readinessAcknowledgement.openItemIds.length).toBe(openCount);
    await expect(signModal.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 20_000 });
    await signModal.getByRole("button", { name: "Close" }).click();

    // The acknowledgement reached the server's own sign audit.
    const audit = await page.request.get("/api/audit?patientId=marcus-vance&limit=50");
    expect(audit.ok()).toBe(true);
    const logs = (await audit.json()).logs as Array<{ eventType: string; metadata: Record<string, unknown> }>;
    const signed = logs.find((entry) => entry.eventType === "note_signed");
    expect(signed?.metadata.readinessAcknowledgement).toMatchObject({ status: "open", openCount });
  });
}

test("a failed readiness read is reported as unavailable and still needs acknowledgement", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page.route("**/api/visit-readiness**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "synthetic outage" }) }),
  );
  await ensureServerDraft(page, "marcus-vance");
  const workspace = await openEncounter(page, "Marcus Vance");
  const status = workspace.locator(".encounter-mode-status");
  await expect(status).toHaveAttribute("data-readiness-status", "unavailable", { timeout: 15_000 });
  await expect(status.locator("strong")).toContainText(/Readiness unavailable|some checks unavailable/);
  await expect(status).not.toContainText("Ready for review");

  await expect(workspace.locator('[data-save-status="saved"], [data-save-status="unsaved"]').first()).toBeVisible({ timeout: 15_000 });
  await workspace.getByRole("button", { name: "Review & Sign", exact: true }).click();
  const signModal = page.locator(".review-sign-modal");
  await expect(signModal).toBeVisible();
  const review = signModal.getByRole("region", { name: "Visit readiness before signing" });
  await expect(review).toHaveAttribute("data-sign-readiness", "unavailable");
  await expect(review.getByRole("alert")).toContainText("not the same as nothing to do");
  await expect(signModal.locator(".review-sign-step-flag")).toHaveText("Unavailable");
  await page.screenshot({ path: "output/playwright/sign-readiness-unavailable-1440x900.png" });

  await stepToSign(signModal);
  const acknowledge = signModal.getByRole("checkbox", { name: /readiness could not be fully checked/ });
  await expect(acknowledge).toBeVisible();
  await expect(acknowledge).not.toBeChecked();
  await expect(signModal.getByText("Ready: every readiness check")).toHaveCount(0);
  await signModal.getByRole("button", { name: "Back", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.unroute("**/api/visit-readiness**");
});

test("a patient without encounters can author, autosave, reload and enter signing without a seeded draft", async ({ page }) => {
  test.setTimeout(120_000);
  await signInWithDefaultLayout(page, "Prototype provider");
  const patientId = `synthetic-fresh-sign-${Date.now()}`;
  const patientName = `Morgan Vale ${Date.now()}`;
  const created = await page.request.post("/api/patients", {
    data: { id: patientId, name: patientName, dob: "01/01/1990" },
  });
  expect(created.ok(), await created.text()).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAuthenticatedShell(page);
  const headers = { "x-ehr-patient-id": patientId };
  const readEncounters = async () => {
    const response = await page.request.get(`/api/encounters?patientId=${patientId}`, { headers });
    expect(response.ok()).toBe(true);
    return (await response.json()).encounters as Array<{ id: string; status: string; assessment: string; plan: string }>;
  };
  expect(await readEncounters()).toEqual([]);
  let workspace = await openEncounter(page, patientName);
  const encounterId = await workspace.getAttribute("data-encounter-id");
  await workspace.getByRole("textbox", { name: "Clinical Assessment & Medical Decision Making", exact: true }).fill("Synthetic fresh-draft assessment.");
  await workspace.getByRole("textbox", { name: "Treatment Plan", exact: true }).fill("Synthetic follow-up plan.");
  await expect(workspace.locator('[data-save-status="saved"]')).toBeVisible({ timeout: 20_000 });
  await expect.poll(readEncounters).toContainEqual(expect.objectContaining({
    id: encounterId, status: "draft", assessment: "Synthetic fresh-draft assessment.", plan: "Synthetic follow-up plan.",
  }));
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForAuthenticatedShell(page);
  workspace = await openEncounter(page, patientName);
  await expect(workspace.getByRole("textbox", { name: "Treatment Plan", exact: true })).toHaveValue("Synthetic follow-up plan.");
  await workspace.getByRole("button", { name: "Review & Sign", exact: true }).click();
  const signModal = page.locator(".review-sign-modal");
  await expect(signModal).toBeVisible({ timeout: 20_000 });
  await stepToSign(signModal);
  await signModal.getByRole("checkbox", { name: /I attest/ }).check();
  await signModal.getByRole("checkbox", { name: /I've reviewed|I understand that readiness/ }).check();
  await signModal.getByRole("button", { name: "Sign Legal Record", exact: true }).click();
  await expect(signModal.getByRole("button", { name: "Close", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect.poll(readEncounters).toContainEqual(expect.objectContaining({ id: encounterId, status: "signed" }));
});
