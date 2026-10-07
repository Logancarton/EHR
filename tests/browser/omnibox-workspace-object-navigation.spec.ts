import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("AI workspace object navigation", () => {
  test("finds text inside a chart document and opens the exact matched passage", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    const patientId = "maya-chen";
    const phrase = "cobalt lighthouse";
    const createResponse = await page.request.post("/api/clinical-records", {
      headers: {
        "Content-Type": "application/json",
        "x-ehr-patient-id": patientId,
      },
      data: {
        type: "create_document",
        payload: {
          patientId,
          documentType: "outside_record",
          title: "Deep navigation synthetic report",
          mimeType: "text/plain",
          contentText: `Synthetic source text. The ${phrase} phrase identifies the exact passage the workspace AI should find. Additional content follows so the result is meaningfully inside the file rather than only in its title.`,
        },
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const created = await createResponse.json();
    const documentId = created.result?.id;
    expect(documentId).toBeTruthy();

    const omnibox = page.getByLabel("Ask AI or search the EHR");
    await omnibox.fill(`find Maya Chen file that mentions ${phrase}`);
    await omnibox.press("Enter");

    const plan = page.locator("[data-omnibox-plan-card='true']");
    await expect(plan).toBeVisible({ timeout: 15_000 });
    const passageResult = plan
      .locator("[data-workspace-target-kind='document_passage']")
      .filter({ hasText: "Deep navigation synthetic report" });
    await expect(passageResult).toBeVisible({ timeout: 15_000 });
    await expect(passageResult).toContainText(phrase);

    await passageResult.getByRole("button", { name: "Open" }).click();

    const detail = page.locator(`.patient-document-detail[data-document-id="${documentId}"]`);
    await expect(detail).toBeVisible({ timeout: 15_000 });
    await expect(detail.locator(".patient-document-search-focus")).toContainText("Opened from AI search");
    await expect(detail.locator(".patient-document-search-focus")).toContainText("cobalt");
    await expect(detail.locator(".patient-document-search-focus")).toContainText("lighthouse");
    await expect(detail.locator("mark[data-document-search-match='true']").filter({ hasText: "cobalt" })).toBeVisible();
    await expect(detail.locator("mark[data-document-search-match='true']").filter({ hasText: "lighthouse" })).toBeVisible();
    await expect(detail).toContainText("Viewing Version 1");
  });
});
