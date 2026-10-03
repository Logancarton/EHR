import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test("LIVE document is read-only, guidance is separate, stop freezes an editable durable draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page
    .locator(".browser-tab[data-workspace-tab='patient']")
    .filter({ hasText: "Maya Chen" })
    .click();
  await page
    .locator(".primary-workspace-pane .section-tabs")
    .getByRole("tab", { name: "Encounter", exact: true })
    .click();
  const workspace = page.locator(
    ".primary-workspace-pane .encounter-workspace-root",
  );
  const copilot = workspace.getByRole("region", { name: "Provider copilot" });
  await expect(workspace.locator(".btn-toolbar-primary")).toBeEnabled();
  const clockTime = new Date();
  await page.clock.install({ time: clockTime });
  await page.clock.pauseAt(new Date(clockTime.getTime() + 60_000));
  await copilot
    .getByRole("button", { name: "Start synthetic capture", exact: true })
    .click();
  await page.clock.runFor(1200);
  await expect(workspace).toHaveAttribute("data-encounter-mode", "LIVE");
  await expect(workspace.locator(".note-doc textarea")).toHaveCount(0);
  await expect(workspace.locator(".btn-toolbar-primary")).toBeDisabled();
  await expect(
    workspace.locator('[data-note-section="intervalHistory"]'),
  ).toContainText("“");
  await copilot
    .getByRole("textbox", { name: "Guide Clinical Bond", exact: true })
    .fill("Restricted affect, not flat. Synthetic exam.");
  await copilot.getByRole("button", { name: "Submit guidance" }).click();
  await expect(
    workspace.locator('[data-note-section="mse.moodAffect"]'),
  ).toContainText("Restricted affect, not flat. Synthetic exam.");
  await copilot
    .getByLabel("Guidance type", { exact: true })
    .selectOption("observation");
  await copilot
    .getByLabel("Guidance section", { exact: true })
    .selectOption("mse.behavior");
  await copilot
    .getByRole("textbox", { name: "Guide Clinical Bond", exact: true })
    .fill("Intermittent facial motor tic. Synthetic observation.");
  await copilot.getByRole("button", { name: "Submit guidance" }).click();
  await expect(
    workspace.locator('[data-note-section="mse.behavior"]'),
  ).toContainText("Intermittent facial motor tic");
  await copilot
    .getByLabel("Guidance type", { exact: true })
    .selectOption("clinical-thought");
  await copilot
    .getByLabel("Guidance section", { exact: true })
    .selectOption("assessment");
  await copilot
    .getByRole("textbox", { name: "Guide Clinical Bond", exact: true })
    .fill("Consider akathisia; needs assessment.");
  await copilot.getByRole("button", { name: "Submit guidance" }).click();
  await expect(
    workspace.locator('[data-note-section="assessment"]'),
  ).not.toContainText("Consider akathisia");
  await expect(copilot).toContainText("Needs clarification");
  await copilot
    .getByLabel("Guidance section", { exact: true })
    .selectOption("riskAssessment");
  await expect(
    copilot.getByRole("button", { name: "Mark sufficient" }),
  ).toBeDisabled();
  await page.screenshot({ path: "output/playwright/enc-live-1440.png" });
  await copilot
    .getByRole("button", { name: "Stop capture · Review", exact: true })
    .click();
  await expect(workspace).toHaveAttribute("data-encounter-mode", "REVIEW");
  await page.clock.resume();
  const history = workspace.getByRole("textbox", {
    name: "Interval History",
    exact: true,
  });
  await history.fill(
    "Synthetic reviewed history: clinician edited after capture.",
  );
  await page.waitForTimeout(1600);
  await expect(history).toHaveValue(
    "Synthetic reviewed history: clinician edited after capture.",
  );
  await expect(workspace.locator('[data-save-status="saved"]')).toBeVisible();
  const encounterId = await workspace.getAttribute("data-encounter-id");
  const response = await page.request.get(
    "/api/encounters?patientId=maya-chen",
    { headers: { "x-ehr-patient-id": "maya-chen" } },
  );
  const data = await response.json();
  const saved = data.encounters.find(
    (item: { id: string }) => item.id === encounterId,
  );
  expect(
    saved.workingState.liveSupport.guidance.map(
      (item: { kind: string }) => item.kind,
    ),
  ).toEqual(
    expect.arrayContaining(["correction", "observation", "clinical-thought"]),
  );
  expect(saved.workingState.ambientTranscript.length).toBeGreaterThan(0);
  expect(
    saved.workingState.liveSupport.guidance.every((item: { actorId: string }) =>
      Boolean(item.actorId),
    ),
  ).toBeTruthy();
  await page.reload();
  await expect(history).toHaveValue(
    "Synthetic reviewed history: clinician edited after capture.",
  );
  await expect(workspace).toHaveAttribute("data-encounter-mode", "REVIEW");
  await page.screenshot({ path: "output/playwright/enc-review-1440.png" });
});

for (const [width, height, zoom] of [
  [1440, 900, 1],
  [1280, 800, 1],
  [1024, 800, 1],
  [1440, 900, 2],
]) {
  test(`Document and guidance are reachable at ${width}x${height}, zoom ${zoom}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await signInWithDefaultLayout(page, "Prototype provider");
    await page
      .locator(".browser-tab[data-workspace-tab='patient']")
      .filter({ hasText: "Maya Chen" })
      .click();
    await page
      .locator(".primary-workspace-pane .section-tabs")
      .getByRole("tab", { name: "Encounter", exact: true })
      .click();
    if (zoom === 2)
      await page.locator("body").evaluate((element) => {
        element.style.zoom = "2";
      });
    const workspace = page.locator(
      ".primary-workspace-pane .encounter-workspace-root",
    );
    if (width === 1024 || zoom === 2) {
      const paperBox = await workspace.locator(".encounter-paper-column").boundingBox();
      const railBox = await workspace.locator(".context-rail").boundingBox();
      expect(Math.abs(paperBox!.x - railBox!.x)).toBeLessThan(2);
    }
    const guide = workspace.getByRole("textbox", {
      name: "Guide Clinical Bond",
      exact: true,
    });
    await guide.scrollIntoViewIfNeeded();
    await expect(guide).toBeInViewport();
    await workspace
      .getByRole("textbox", { name: "Interval History", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      workspace.getByRole("textbox", { name: "Interval History", exact: true }),
    ).toBeInViewport();
    await expect(
      workspace.getByLabel("Encounter completion", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `output/playwright/enc-live-layout-${width}-${zoom}.png`,
    });
  });
}

test("browser capture error and stopped callbacks preserve review text and raw evidence", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class SyntheticRecognition {
      continuous = true;
      interimResults = true;
      lang = "en-US";
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (
          window as unknown as { syntheticRecognition: SyntheticRecognition }
        ).syntheticRecognition = this;
      }
      stop() {}
    }
    Object.assign(window, { SpeechRecognition: SyntheticRecognition });
  });
  await signInWithDefaultLayout(page, "Prototype provider");
  await page
    .locator(".browser-tab[data-workspace-tab='patient']")
    .filter({ hasText: "Maya Chen" })
    .click();
  await page
    .locator(".primary-workspace-pane .section-tabs")
    .getByRole("tab", { name: "Encounter", exact: true })
    .click();
  const workspace = page.locator(
    ".primary-workspace-pane .encounter-workspace-root",
  );
  await expect(workspace.locator(".btn-toolbar-primary")).toBeEnabled();
  await workspace
    .getByRole("button", { name: "Capture microphone", exact: true })
    .click();
  await expect(workspace).toHaveAttribute("data-encounter-mode", "LIVE");
  const emit = async (text: string) =>
    page.evaluate((value) => {
      const recognition = (
        window as unknown as {
          syntheticRecognition: { onresult: (event: unknown) => void };
        }
      ).syntheticRecognition;
      recognition.onresult({
        resultIndex: 0,
        results: [Object.assign([{ transcript: value }], { isFinal: true })],
      });
    }, text);
  await emit("Synthetic unmodified speech evidence.");
  await expect(
    workspace.locator('[data-note-section="intervalHistory"]'),
  ).toContainText("Synthetic unmodified speech evidence.");
  await page.evaluate(() =>
    (
      window as unknown as { syntheticRecognition: { onerror: () => void } }
    ).syntheticRecognition.onerror(),
  );
  await expect(workspace).toHaveAttribute("data-encounter-mode", "REVIEW");
  const history = workspace.getByRole("textbox", {
    name: "Interval History",
    exact: true,
  });
  await history.fill("Reviewed after microphone error.");
  await emit("Late speech must not overwrite review.");
  await expect(history).toHaveValue("Reviewed after microphone error.");
});
