import fs from "node:fs";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const VERIFY_DIR = path.resolve(process.cwd(), "docs/gemini-context/screenshots/deep-review/verification");
fs.mkdirSync(VERIFY_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000/...");
  await page.context().clearCookies();
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1000);

  // 1. Sign in as Casey (Clinical assistant)
  console.log("--- 1. SIGN IN AS CASEY (CLINICAL ASSISTANT) ---");
  const caseyBtn = page.getByRole("button", { name: "Casey · Clinical assistant", exact: true });
  await expect(caseyBtn).toBeVisible({ timeout: 15000 });
  await caseyBtn.click();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);

  // Reset workspace state to have Maya Chen docked and active
  const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await page.request.put("http://localhost:3000/api/workspace-state", {
    data: {
      state: {
        activeView: "patient",
        dockedPatientIds: ["maya-chen"],
        detachedPatientIds: [],
        activePatientId: "maya-chen",
      },
    },
    headers: { cookie: cookies },
  });
  await page.reload();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);

  // Navigate to Maya Chen -> Messages tab
  console.log("--- Navigating to Messages tab ---");
  const msgsTab = page.locator(".primary-workspace-pane .section-tabs").getByRole("tab", { name: "Messages" }).first();
  await expect(msgsTab).toBeVisible({ timeout: 10000 });
  await msgsTab.click();
  await page.waitForTimeout(1000);

  // Verify Compose button disabled state
  const composeBtn = page.locator(".btn-new-thread").first();
  await expect(composeBtn).toBeVisible({ timeout: 10000 });
  const composeDisabled = await composeBtn.getAttribute("disabled");
  const composeTitle = await composeBtn.getAttribute("title");
  console.log("Compose button disabled attribute:", composeDisabled);
  console.log("Compose button title/reason:", composeTitle);

  // Verify Send button disabled state
  const sendBtn = page.locator(".btn-send-message").first();
  await expect(sendBtn).toBeVisible({ timeout: 10000 });
  const sendDisabled = await sendBtn.getAttribute("disabled");
  const sendTitle = await sendBtn.getAttribute("title");
  console.log("Send button disabled attribute:", sendDisabled);
  console.log("Send button title/reason:", sendTitle);

  await page.screenshot({
    path: path.join(VERIFY_DIR, "v16_clinical_assistant_messages_disabled.png"),
    fullPage: false,
  });
  console.log("Saved verification screenshot: v16_clinical_assistant_messages_disabled.png");

  // 2. Sign in as Morgan (Front desk)
  console.log("--- 2. SIGN IN AS MORGAN (FRONT DESK) ---");
  await page.context().clearCookies();
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1000);

  const morganBtn = page.getByRole("button", { name: "Morgan Reed · Practice Manager & Biller", exact: true });
  await expect(morganBtn).toBeVisible({ timeout: 15000 });
  await morganBtn.click();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1500);

  // Pin "messages" tool to Morgan's right rail
  const morganCookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
  await page.request.put("http://localhost:3000/api/preferences/rails", {
    data: {
      right: ["calendar", "labs", "ai", "communication", "hr", "prescribing", "scratchpad", "tasks", "calc", "messages"],
    },
    headers: { cookie: morganCookies },
  });
  await page.reload();
  await page.locator(".app-shell").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1000);

  // Open Intake workspace
  console.log("--- Opening Intake workspace and Messages companion ---");
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-switch-view", { detail: { view: "intake" } }));
  });
  await page.waitForTimeout(1000);

  // Open Messages companion
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("ehr-open-companion", { detail: { tool: "messages" } }));
  });
  await page.waitForTimeout(1200);

  // Check the recipient note
  const recipientNote = page.locator(".messages-recipient-note").first();
  await expect(recipientNote).toBeVisible({ timeout: 10000 });
  const noteText = await recipientNote.innerText();
  console.log("Recipient note visible! Text:", noteText);

  await page.screenshot({
    path: path.join(VERIFY_DIR, "v17_front_desk_messages_intake_only.png"),
    fullPage: false,
  });
  console.log("Saved verification screenshot: v17_front_desk_messages_intake_only.png");

  await browser.close();
  console.log("--- ROLE MESSAGING VERIFICATION COMPLETE ---");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
