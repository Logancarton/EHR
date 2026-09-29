/**
 * Medical and psychopharmacology clinical calculators (CrCl/eGFR, BMI, QTc, Days-Later).
 *
 * Deterministic client-side clinical decision support calculators designed for
 * psychiatric medication management, metabolic surveillance, and renal dosing.
 */

export interface CrClInput {
  age: number;
  sex: "male" | "female";
  weightKg: number;
  serumCreatinineMgDl: number;
}

export interface CrClResult {
  crClMlMin: number;
  stage: string;
  severity: "normal" | "mild" | "moderate" | "severe" | "critical";
  lithiumGuidance: string;
  gabapentinGuidance: string;
  generalGuidance: string;
  summary: string;
}

/**
 * Cockcroft-Gault Creatinine Clearance formula:
 * CrCl = [ (140 - Age) * Weight(kg) ] / [ 72 * SerumCreatinine(mg/dL) ] * (0.85 if female)
 */
export function calculateCockcroftGault(input: CrClInput): CrClResult | null {
  const { age, sex, weightKg, serumCreatinineMgDl } = input;
  if (age <= 0 || weightKg <= 0 || serumCreatinineMgDl <= 0) {
    return null;
  }

  const raw = ((140 - age) * weightKg) / (72 * serumCreatinineMgDl);
  const factor = sex === "female" ? 0.85 : 1.0;
  const crClMlMin = Math.round(raw * factor * 10) / 10;

  let stage = "Normal renal function";
  let severity: CrClResult["severity"] = "normal";
  let lithiumGuidance = "Standard Lithium dosing & therapeutic trough monitoring (0.6–1.0 mEq/L).";
  let gabapentinGuidance = "Standard Gabapentin dosing (up to 1800–3600 mg/day divided TID).";
  let generalGuidance = "Renal clearance is within normal limits.";

  if (crClMlMin >= 90) {
    stage = "Normal / Stage 1 (CrCl ≥ 90 mL/min)";
    severity = "normal";
  } else if (crClMlMin >= 60) {
    stage = "Mild impairment / Stage 2 (CrCl 60–89 mL/min)";
    severity = "mild";
    lithiumGuidance = "Normal to mild dose adjustment; monitor serum Lithium levels and renal panel every 3–6 months.";
    gabapentinGuidance = "Standard dosing (max 1800–2400 mg/day).";
    generalGuidance = "Mild renal reduction. Monitor hydration and NSAID co-administration.";
  } else if (crClMlMin >= 30) {
    stage = "Moderate impairment / Stage 3 (CrCl 30–59 mL/min)";
    severity = "moderate";
    lithiumGuidance = "CAUTION: Reduce Lithium dose by 50%. Titrate slowly with weekly trough levels. Consider alternative mood stabilizer.";
    gabapentinGuidance = "Dose reduction required: 400–1400 mg/day divided BID (max 1400 mg/day).";
    generalGuidance = "Moderate impairment. Avoid nephrotoxic agents (NSAIDs, ACE inhibitors).";
  } else if (crClMlMin >= 15) {
    stage = "Severe impairment / Stage 4 (CrCl 15–29 mL/min)";
    severity = "severe";
    lithiumGuidance = "CONTRAINDICATED / HIGH RISK: Lithium toxicity risk severe. If unavoidable, use extreme low dose with nephrology consult.";
    gabapentinGuidance = "Dose reduction required: 200–700 mg once daily (max 700 mg/day).";
    generalGuidance = "Severe renal disease. Consult nephrology for renally eliminated psychotropics.";
  } else {
    stage = "Kidney failure / Stage 5 (CrCl < 15 mL/min)";
    severity = "critical";
    lithiumGuidance = "STRICTLY CONTRAINDICATED: Avoid Lithium.";
    gabapentinGuidance = "100–300 mg once daily after hemodialysis or single daily micro-dose.";
    generalGuidance = "End-stage renal disease. Renal replacement therapy / dialysis dosing rules apply.";
  }

  return {
    crClMlMin,
    stage,
    severity,
    lithiumGuidance,
    gabapentinGuidance,
    generalGuidance,
    summary: `CrCl (Cockcroft-Gault): ${crClMlMin} mL/min (${stage}) · Lithium: ${lithiumGuidance}`,
  };
}

export interface BmiCalcInput {
  weightLbs?: number;
  weightKg?: number;
  heightIn?: number;
  heightCm?: number;
}

export interface BmiCalcResult {
  bmi: number;
  category: string;
  severity: "normal" | "mild" | "moderate" | "severe" | "critical";
  monitoringGuidance: string;
  summary: string;
}

/**
 * Body Mass Index and Antipsychotic Metabolic Surveillance:
 * BMI = (Weight lbs * 703) / (Height in)^2
 */
export function calculateBmiAndMetabolic(input: BmiCalcInput): BmiCalcResult | null {
  let weightLbs = input.weightLbs;
  if (!weightLbs && input.weightKg && input.weightKg > 0) {
    weightLbs = input.weightKg * 2.20462;
  }

  let heightIn = input.heightIn;
  if (!heightIn && input.heightCm && input.heightCm > 0) {
    heightIn = input.heightCm / 2.54;
  }

  if (!weightLbs || !heightIn || weightLbs <= 0 || heightIn <= 0) {
    return null;
  }

  const raw = (weightLbs * 703) / (heightIn * heightIn);
  const bmi = Math.round(raw * 10) / 10;

  let category = "Normal weight";
  let severity: BmiCalcResult["severity"] = "normal";
  let monitoringGuidance = "Routine psychiatric metabolic surveillance: annual lipids, glucose, and weight check.";

  if (bmi < 18.5) {
    category = "Underweight (< 18.5)";
    severity = "mild";
    monitoringGuidance = "Evaluate for eating disorder, medical illness, or nutritional deficiency.";
  } else if (bmi < 25.0) {
    category = "Normal weight (18.5–24.9)";
    severity = "normal";
    monitoringGuidance = "Standard monitoring: Fasting glucose & lipid panel at baseline, 12 weeks, then annually.";
  } else if (bmi < 30.0) {
    category = "Overweight (25.0–29.9)";
    severity = "moderate";
    monitoringGuidance = "Metabolic risk: Check waist circumference, HbA1c, lipids. Consider weight-neutral antipsychotics.";
  } else if (bmi < 35.0) {
    category = "Obesity Class I (30.0–34.9)";
    severity = "severe";
    monitoringGuidance = "High metabolic risk: Lifestyle intervention, metformin co-prescription evaluation, or antipsychotic switch.";
  } else if (bmi < 40.0) {
    category = "Obesity Class II (35.0–39.9)";
    severity = "severe";
    monitoringGuidance = "Severe metabolic risk: Quarterly HbA1c/lipids, cardiovascular screening, avoid olanzapine/clozapine if feasible.";
  } else {
    category = "Obesity Class III (≥ 40.0)";
    severity = "critical";
    monitoringGuidance = "Critical metabolic risk: Multidisciplinary bariatric/cardio-metabolic co-management indicated.";
  }

  return {
    bmi,
    category,
    severity,
    monitoringGuidance,
    summary: `BMI: ${bmi} kg/m² (${category}) · Metabolic surveillance: ${monitoringGuidance}`,
  };
}

export interface QtcInput {
  qtMs: number;
  heartRateBpm: number;
  sex: "male" | "female";
}

export interface QtcResult {
  qtcBazettMs: number;
  qtcFridericiaMs: number;
  riskCategory: string;
  severity: "normal" | "mild" | "moderate" | "severe" | "critical";
  clinicalAlert: string;
  summary: string;
}

/**
 * Corrected QT interval (Bazett and Fridericia):
 * RR = 60 / HR (seconds)
 * Bazett: QTc = QT / sqrt(RR)
 * Fridericia: QTcF = QT / cbrt(RR)
 */
export function calculateQtc(input: QtcInput): QtcResult | null {
  const { qtMs, heartRateBpm, sex } = input;
  if (qtMs <= 0 || heartRateBpm <= 0) {
    return null;
  }

  const rrSeconds = 60 / heartRateBpm;
  const qtcBazett = Math.round(qtMs / Math.sqrt(rrSeconds));
  const qtcFridericia = Math.round(qtMs / Math.cbrt(rrSeconds));

  const upperNormal = sex === "female" ? 460 : 450;
  const borderlineUpper = sex === "female" ? 480 : 470;

  let riskCategory = "Normal QTc";
  let severity: QtcResult["severity"] = "normal";
  let clinicalAlert = "Low risk for Torsades de Pointes. Standard psychotropic monitoring.";

  if (qtcBazett >= 500 || qtcFridericia >= 500) {
    riskCategory = "Critical Prolongation (≥ 500 ms)";
    severity = "critical";
    clinicalAlert =
      "CRITICAL SAFETY WARNING: High risk of Torsades de Pointes / fatal arrhythmia. Immediately evaluate psychotropics (Citalopram, Haloperidol, Ziprasidone). Obtain serum K+, Mg2+, repeat ECG, and cardiology consult.";
  } else if (qtcBazett > borderlineUpper) {
    riskCategory = `Prolonged QTc (> ${borderlineUpper} ms)`;
    severity = "severe";
    clinicalAlert =
      "Prolonged QTc: Avoid adding further QT-prolonging psychotropics. Check electrolytes and repeat ECG after dose changes.";
  } else if (qtcBazett > upperNormal) {
    riskCategory = `Borderline QTc (${upperNormal + 1}–${borderlineUpper} ms)`;
    severity = "moderate";
    clinicalAlert =
      "Borderline QTc: Use cautious titration with QT-prolonging psychotropics; monitor electrolytes.";
  }

  return {
    qtcBazettMs: qtcBazett,
    qtcFridericiaMs: qtcFridericia,
    riskCategory,
    severity,
    clinicalAlert,
    summary: `QTc Bazett: ${qtcBazett} ms / Fridericia: ${qtcFridericia} ms (${riskCategory}) · ${clinicalAlert}`,
  };
}

export interface DaysLaterInput {
  baseDate?: string; // YYYY-MM-DD
  days: number;
}

export interface DaysLaterResult {
  targetDate: string; // YYYY-MM-DD
  formattedDate: string; // e.g. "Tuesday, Oct 28, 2026"
  dayOfWeek: string;
  isWeekend: boolean;
  weekendWarning: string;
  summary: string;
}

/**
 * Calculates a future date given a base date and days interval.
 */
export function calculateDaysLater(input: DaysLaterInput): DaysLaterResult {
  const base = input.baseDate ? new Date(input.baseDate + "T12:00:00") : new Date();
  const target = new Date(base.getTime() + input.days * 24 * 60 * 60 * 1000);

  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  const targetDate = `${year}-${month}-${day}`;

  const dayOfWeek = target.toLocaleDateString("en-US", { weekday: "long" });
  const formattedDate = target.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const dayNum = target.getDay(); // 0 is Sunday, 6 is Saturday
  const isWeekend = dayNum === 0 || dayNum === 6;
  const weekendWarning = isWeekend
    ? `Lands on a ${dayOfWeek}. Consider adjusting to Friday (-${dayNum === 6 ? "1" : "2"}d) or Monday (+${dayNum === 6 ? "2" : "1"}d) for clinic/pharmacy hours.`
    : "";

  return {
    targetDate,
    formattedDate,
    dayOfWeek,
    isWeekend,
    weekendWarning,
    summary: `Follow-up / Supply Date: ${formattedDate} (${input.days} days)${weekendWarning ? ` · [${weekendWarning}]` : ""}`,
  };
}
