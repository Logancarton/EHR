import { expect, test } from "@playwright/test";
import { signInWithDefaultLayout } from "./workspace-fixtures";

test.describe("clinical calculators and interactive psychiatric rating scales", () => {
  test("rating scales work interactively in practice/unbound mode and calculate scores live", async ({ page }) => {
    await signInWithDefaultLayout(page, "Prototype provider");

    // 1. Open Calculators from Today Dashboard (no patient bound)
    const calcRailBtn = page.locator(".companion-rail-btn[aria-label='Calculators']");
    await expect(calcRailBtn).toBeVisible({ timeout: 10_000 });
    await calcRailBtn.click();

    const panel = page.locator('[data-patient-tool="rating-scales"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // Verify it is in unbound/practice mode, NOT parked/locked
    await expect(panel.locator(".calc-question").first().getByRole("button").first()).toBeEnabled();

    // 2. Answer questions on PHQ-9
    const questions = panel.locator(".calc-question");
    await expect(questions).toHaveCount(9);

    // Answer Q1 with 'Several days' (+1)
    await questions.nth(0).getByRole("button", { name: "Several days" }).click();
    await expect(panel.locator(".calc-footer-score")).toContainText("1 of 9 answered");

    // Answer remaining questions (all 'More than half the days' = +2)
    for (let i = 1; i < 9; i++) {
      await questions.nth(i).getByRole("button", { name: "More than half the days" }).click();
    }

    // Now all 9 are answered: Score should be 1 + 8*2 = 17 / 27 (Moderately Severe Depression)
    await expect(panel.locator(".calc-footer-score")).toContainText("17 / 27");
    await expect(panel.locator(".calc-footer-score")).toContainText("Moderately Severe Depression");

    // Check Safety Risk Alert for Item 9
    await expect(panel.locator(".calc-safety-alert")).toContainText("POSITIVE ITEM 9");

    // Copy summary button is enabled and functional
    const copyBtn = panel.getByRole("button", { name: /Copy/i });
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();
    await expect(panel.getByText("Copied")).toBeVisible();

    // 3. Switch to GAD-7 and verify interactivity
    await panel.getByRole("button", { name: "GAD-7", exact: true }).click();
    const gadQuestions = panel.locator(".calc-question");
    await expect(gadQuestions).toHaveCount(7);
    await gadQuestions.nth(0).getByRole("button", { name: "Nearly every day" }).click();
    await expect(panel.locator(".calc-footer-score")).toContainText("1 of 7 answered");

    // 4. Switch to Medical & Dosing Calculators
    await panel.getByRole("tab", { name: "Medical & Dosing" }).click();
    await expect(panel.getByRole("button", { name: "CrCl / eGFR" })).toBeVisible();

    // CrCl Calculator is active by default
    const crclCard = panel.locator(".calc-result-card");
    await expect(crclCard).toBeVisible();
    await expect(crclCard).toContainText("mL/min (Cockcroft-Gault)");
    await expect(crclCard).toContainText("Lithium Dosing Guidance");

    // Change Serum Creatinine to 3.5 mg/dL to verify live recalculation to severe impairment
    const scrInput = panel.locator("#crcl-scr");
    await scrInput.fill("3.5");
    await expect(crclCard).toContainText("Severe impairment");
    await expect(crclCard).toContainText("CONTRAINDICATED / HIGH RISK");

    // Switch to BMI & Metabolic Surveillance
    await panel.getByRole("button", { name: "BMI & Metabolic" }).click();
    const bmiCard = panel.locator(".calc-result-card");
    await expect(bmiCard).toBeVisible();
    await expect(bmiCard).toContainText("kg/m² (BMI)");
    await expect(bmiCard).toContainText("Antipsychotic Metabolic Surveillance");

    // Switch to QTc Interval Calculator
    await panel.getByRole("button", { name: "QTc Interval" }).click();
    const qtcCard = panel.locator(".calc-result-card");
    await expect(qtcCard).toBeVisible();
    await expect(qtcCard).toContainText("Bazett");

    // Set QT to 520 ms to verify Critical Prolongation alert
    const qtInput = panel.locator("#qtc-qt");
    await qtInput.fill("520");
    await expect(qtcCard).toContainText("Critical Prolongation");
    await expect(qtcCard).toContainText("CRITICAL SAFETY WARNING");
    await expect(qtcCard).toContainText("Torsades de Pointes");

    // Switch to Follow-up / Days Calculator
    await panel.getByRole("button", { name: "Follow-up / Days" }).click();
    const daysCard = panel.locator(".calc-result-card");
    await expect(daysCard).toBeVisible();
    await expect(daysCard).toContainText("days later");

    // Click +14d preset
    await panel.getByRole("button", { name: "+14d (Titration)" }).click();
    await expect(daysCard).toContainText("(14 days later)");
  });
});
