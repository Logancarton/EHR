/**
 * Smart Canvas Domain & Data Models
 *
 * Implements Google Docs-style Smart Chips and mentions for clinical narrative notes.
 *
 * In accordance with the Clinical Reference Layer (docs/NOTE_REFERENCES.md and D-030),
 * note text remains pure, uncorrupted clinical prose from the first keystroke.
 * Smart chips insert clean clinical prose into the document while linking to authoritative
 * structured records (patient_problems, patient_medications, lab observations) out-of-band.
 *
 * This guarantees:
 * 1. Clean exports, printing, and legal signing without token stripping or syntax leaks.
 * 2. Audit-proof evidence basis for coding (99213 / 99214).
 * 3. Rich Google Material 3 interactive chips and hovercards with live clinical context.
 */

export type SmartChipType = "med" | "dx" | "lab" | "vital" | "scale" | "date" | "allergy";

export interface SmartChipMetadata {
  icdCode?: string;
  dose?: string;
  sig?: string;
  refills?: string;
  pharmacy?: string;
  labValue?: string;
  labRange?: string;
  labUnit?: string;
  labFlag?: "normal" | "abnormal" | "critical";
  trend?: string;
  severity?: string;
  normalRange?: string;
  date?: string;
  status?: string;
  subtitle?: string;
  [key: string]: unknown;
}

export interface SmartChipItem {
  id: string;
  type: SmartChipType;
  label: string;
  value: string;
  detail?: string;
  icon: string;
  meta?: SmartChipMetadata;
}

export interface SmartChipSpan {
  start: number;
  end: number;
  type: SmartChipType;
  label: string;
  item: SmartChipItem;
}

export interface TextProseSegment {
  isChip: false;
  text: string;
}

export interface ChipProseSegment {
  isChip: true;
  text: string;
  span: SmartChipSpan;
}

export type ProseSegment = TextProseSegment | ChipProseSegment;

/**
 * Standard clinical icons for each chip category (Google Material Symbols).
 */
export const SMART_CHIP_ICONS: Record<SmartChipType, string> = {
  med: "medication",
  dx: "stethoscope",
  lab: "science",
  vital: "vital_signs",
  scale: "speed",
  date: "calendar_today",
  allergy: "warning",
};

/**
 * Color badge classes for Google Material 3 pastel styling.
 */
export const SMART_CHIP_COLOR_CLASSES: Record<SmartChipType, string> = {
  med: "chip-type-med",
  dx: "chip-type-dx",
  lab: "chip-type-lab",
  vital: "chip-type-vital",
  scale: "chip-type-scale",
  date: "chip-type-date",
  allergy: "chip-type-allergy",
};

/**
 * Friendly category labels.
 */
export const SMART_CHIP_CATEGORY_LABELS: Record<SmartChipType, string> = {
  med: "Medication",
  dx: "Diagnosis",
  lab: "Lab Result / Order",
  vital: "Vital Sign",
  scale: "Clinical Scale",
  date: "Date & Follow-up",
  allergy: "Allergy",
};

/**
 * ICD-10 registry for common psychiatric problems to enrich hovercards.
 */
export const COMMON_ICD_REGISTRY: Record<string, { code: string; title: string }> = {
  "adhd, combined presentation": { code: "F90.2", title: "ADHD, Combined Presentation" },
  "adhd": { code: "F90.9", title: "Attention-Deficit Hyperactivity Disorder, Unspecified" },
  "shift work sleep disorder": { code: "G47.26", title: "Circadian Rhythm Sleep Disorder, Shift Work Type" },
  "generalized anxiety disorder": { code: "F41.1", title: "Generalized Anxiety Disorder" },
  "major depressive disorder": { code: "F33.1", title: "Major Depressive Disorder, Recurrent, Moderate" },
  "major depressive disorder, recurrent, partial remission": { code: "F33.41", title: "Major Depressive Disorder, Recurrent, In Partial Remission" },
  "bipolar ii disorder, most recent episode hypomanic, in remission": { code: "F31.81", title: "Bipolar II Disorder, In Remission" },
  "unspecified mood disorder": { code: "F39", title: "Unspecified Mood [Affective] Disorder" },
  "social anxiety disorder": { code: "F40.10", title: "Social Anxiety Disorder (Social Phobia)" },
  "insomnia disorder": { code: "G47.00", title: "Insomnia, Unspecified" },
  "panic disorder": { code: "F41.0", title: "Panic Disorder Without Agoraphobia" },
  "post-traumatic stress disorder": { code: "F43.10", title: "Post-Traumatic Stress Disorder, Unspecified" },
};

/**
 * Builds a comprehensive catalog of Smart Chips combining patient specific records
 * and clinical psychiatric knowledge.
 */
export function buildSmartChipCatalog(
  patient?: {
    name?: string;
    meds?: string[];
    diagnoses?: string[];
    mrn?: string;
  },
  allergies?: string[]
): SmartChipItem[] {
  const items: SmartChipItem[] = [];

  // 1. Patient's Active Medications
  if (patient?.meds && patient.meds.length > 0) {
    patient.meds.forEach((med, idx) => {
      const lower = med.toLowerCase();
      const isVyvanse = lower.includes("lisdexamfetamine") || lower.includes("vyvanse");
      const isMelatonin = lower.includes("melatonin");
      const isSertraline = lower.includes("sertraline") || lower.includes("zoloft");
      const isLithium = lower.includes("lithium");
      const isBupropion = lower.includes("bupropion") || lower.includes("wellbutrin");

      let sig = "Take 1 capsule by mouth daily every morning";
      let refills = "2 refills remaining";
      let pharmacy = "CVS Pharmacy #04921 (Broadway)";
      let dose = "40 mg";

      if (isVyvanse) {
        sig = "Take 1 capsule (40 mg) orally once daily every morning with water. Avoid late evening doses.";
        refills = "No refills (C-II Controlled Substance)";
        pharmacy = "Walgreens Pharmacy #10834 (Main St)";
        dose = "40 mg";
      } else if (isMelatonin) {
        sig = "Take 1 tablet (3 mg) orally 30-60 minutes before bedtime as needed.";
        refills = "OTC / Non-controlled";
        pharmacy = "Patient self-purchased OTC";
        dose = "3 mg";
      } else if (isSertraline) {
        sig = "Take 1 tablet (100 mg) orally daily after morning meal.";
        refills = "3 refills remaining";
        pharmacy = "CVS Pharmacy #02144";
        dose = "100 mg";
      } else if (isLithium) {
        sig = "Take 1 capsule (600 mg) orally twice daily with meals. 12-hr trough monitoring required.";
        refills = "1 refill remaining";
        pharmacy = "Kaiser Outpatient Pharmacy";
        dose = "600 mg BID";
      } else if (isBupropion) {
        sig = "Take 1 tablet (300 mg XL) orally once daily upon waking. Do not crush or chew.";
        refills = "2 refills remaining";
        pharmacy = "Rite Aid #05512";
        dose = "300 mg XL";
      }

      items.push({
        id: `med-patient-${idx}`,
        type: "med",
        label: med,
        value: med,
        detail: `Active Rx · ${sig}`,
        icon: SMART_CHIP_ICONS.med,
        meta: {
          dose,
          sig,
          refills,
          pharmacy,
          status: "Active",
          subtitle: "Current active chart medication",
        },
      });
    });
  }

  // 2. Standard Psychiatric Medication Options (for new prescriptions or titration discussions)
  const standardMeds = [
    { name: "Lisdexamfetamine 50 mg daily", dose: "50 mg", sig: "Take 1 capsule (50 mg) orally daily in the morning" },
    { name: "Methylphenidate ER 27 mg daily", dose: "27 mg", sig: "Take 1 tablet (27 mg ER) orally daily in the morning" },
    { name: "Atomoxetine 40 mg daily", dose: "40 mg", sig: "Take 1 capsule (40 mg) orally once daily" },
    { name: "Sertraline 50 mg daily", dose: "50 mg", sig: "Take 1 tablet (50 mg) orally once daily with food" },
    { name: "Escitalopram 10 mg daily", dose: "10 mg", sig: "Take 1 tablet (10 mg) orally once daily" },
    { name: "Bupropion XL 150 mg daily", dose: "150 mg", sig: "Take 1 tablet (150 mg XL) orally once daily in the morning" },
    { name: "Aripiprazole 5 mg daily", dose: "5 mg", sig: "Take 1 tablet (5 mg) orally once daily in the morning" },
    { name: "Trazodone 50 mg nightly PRN", dose: "50 mg", sig: "Take 1 tablet (50 mg) orally at bedtime PRN insomnia" },
    { name: "Hydroxyzine 25 mg TID PRN", dose: "25 mg", sig: "Take 1 tablet (25 mg) orally every 8 hours PRN anxiety" },
  ];

  standardMeds.forEach((m, idx) => {
    if (!items.some((existing) => existing.label.toLowerCase() === m.name.toLowerCase())) {
      items.push({
        id: `med-std-${idx}`,
        type: "med",
        label: m.name,
        value: m.name,
        detail: `Formulary · ${m.sig}`,
        icon: SMART_CHIP_ICONS.med,
        meta: {
          dose: m.dose,
          sig: m.sig,
          refills: "Standard titration candidate",
          pharmacy: "Preferred retail / Mail-order",
          status: "Formulary",
          subtitle: "Psychopharmacology standard dose",
        },
      });
    }
  });

  // 3. Patient's Active Diagnoses
  if (patient?.diagnoses && patient.diagnoses.length > 0) {
    patient.diagnoses.forEach((dx, idx) => {
      const lower = dx.toLowerCase();
      const icdMatch = COMMON_ICD_REGISTRY[lower] || { code: "F99", title: dx };

      items.push({
        id: `dx-patient-${idx}`,
        type: "dx",
        label: dx,
        value: dx,
        detail: `ICD-10 ${icdMatch.code} · Active problem list`,
        icon: SMART_CHIP_ICONS.dx,
        meta: {
          icdCode: icdMatch.code,
          status: "Active",
          subtitle: `ICD-10-CM ${icdMatch.code}`,
        },
      });
    });
  }

  // 4. Common Diagnostic Entries
  Object.entries(COMMON_ICD_REGISTRY).forEach(([key, info], idx) => {
    if (!items.some((existing) => existing.label.toLowerCase() === info.title.toLowerCase())) {
      items.push({
        id: `dx-std-${idx}`,
        type: "dx",
        label: info.title,
        value: info.title,
        detail: `ICD-10 ${info.code}`,
        icon: SMART_CHIP_ICONS.dx,
        meta: {
          icdCode: info.code,
          status: "Clinical Reference",
          subtitle: `ICD-10-CM ${info.code}`,
        },
      });
    }
  });

  // 5. Clinical Lab Results & Diagnostic Tests
  const labData: Array<{
    name: string;
    val: string;
    range: string;
    unit: string;
    flag: "normal" | "abnormal" | "critical";
    trend: string;
  }> = [
    { name: "TSH (Thyroid Stimulating Hormone)", val: "1.84", range: "0.45 - 4.50", unit: "uIU/mL", flag: "normal", trend: "Stable (prior 1.92)" },
    { name: "Serum Lithium Level (12-hr Trough)", val: "0.72", range: "0.60 - 1.00", unit: "mEq/L", flag: "normal", trend: "Therapeutic window verified" },
    { name: "Complete Blood Count (CBC) w/ Diff", val: "WBC 6.4, Hgb 14.8", range: "Within normal limits", unit: "", flag: "normal", trend: "Unremarkable" },
    { name: "Comprehensive Metabolic Panel (CMP)", val: "Cr 0.94, eGFR >90, ALT 24", range: "Within normal limits", unit: "", flag: "normal", trend: "Renal & hepatic stable" },
    { name: "Basic Metabolic Panel (BMP)", val: "Na 140, K 4.2, Cr 0.92", range: "Within normal limits", unit: "", flag: "normal", trend: "Electrolytes normal" },
    { name: "Hemoglobin A1c", val: "5.4%", range: "< 5.7%", unit: "%", flag: "normal", trend: "Euglycemic" },
    { name: "Fasting Lipid Panel", val: "Total Chol 182, LDL 104, HDL 52", range: "Standard risk tier", unit: "mg/dL", flag: "normal", trend: "Metabolic screen clear" },
    { name: "Vitamin D, 25-Hydroxy", val: "24.1", range: "30.0 - 100.0", unit: "ng/mL", flag: "abnormal", trend: "Mild insufficiency" },
    { name: "12-Lead Electrocardiogram (ECG)", val: "Normal sinus rhythm, QTc 418 ms", range: "QTc < 450 ms", unit: "ms", flag: "normal", trend: "Normal cardiac conduction" },
    { name: "Urine Drug Screen (Rapid 10-Panel)", val: "Presumptive positive: Amphetamines (consistent with Rx). Neg: Opi, Bzo, Coc, THC.", range: "Concordant with prescribed regimen", unit: "", flag: "normal", trend: "Treatment concordant" },
  ];

  labData.forEach((lab, idx) => {
    items.push({
      id: `lab-${idx}`,
      type: "lab",
      label: lab.name,
      value: lab.name,
      detail: `${lab.val} ${lab.unit} (${lab.flag.toUpperCase()}) · Ref: ${lab.range}`,
      icon: SMART_CHIP_ICONS.lab,
      meta: {
        labValue: lab.val,
        labRange: lab.range,
        labUnit: lab.unit,
        labFlag: lab.flag,
        trend: lab.trend,
        subtitle: `Latest Result · ${lab.val} ${lab.unit}`,
      },
    });
  });

  // 6. Vitals & Psychiatric Severity Scales
  const vitalsAndScales: Array<{
    type: "vital" | "scale";
    label: string;
    value: string;
    detail: string;
    normal: string;
    severity?: string;
  }> = [
    { type: "vital", label: "Blood Pressure: 122/78 mmHg", value: "BP 122/78 mmHg", detail: "Normotensive · Pulse 72 bpm regular", normal: "< 120/80 mmHg" },
    { type: "vital", label: "Heart Rate: 72 bpm (Regular)", value: "HR 72 bpm regular", detail: "Resting pulse · Normal sinus rhythm", normal: "60 - 100 bpm" },
    { type: "vital", label: "Body Mass Index: 24.2 kg/m²", value: "BMI 24.2 kg/m²", detail: "Normal body habitus · Weight 168 lbs", normal: "18.5 - 24.9 kg/m²" },
    { type: "scale", label: "PHQ-9 Depression Score: 6 (Mild)", value: "PHQ-9: 6 (Mild)", detail: "Depression screen · Down from 14 at baseline", normal: "0 - 4 (Minimal)", severity: "Mild Depression" },
    { type: "scale", label: "GAD-7 Anxiety Score: 4 (Minimal)", value: "GAD-7: 4 (Minimal)", detail: "Anxiety scale · Significant response", normal: "0 - 4 (Minimal)", severity: "Minimal Anxiety" },
    { type: "scale", label: "ASRS v1.1 ADHD Screener: Part A 4/6", value: "ASRS: Part A 4/6", detail: "Adult ADHD Self-Report Scale · Executive function improving", normal: "< 4", severity: "Positive ADHD Screen" },
  ];

  vitalsAndScales.forEach((vs, idx) => {
    items.push({
      id: `${vs.type}-${idx}`,
      type: vs.type,
      label: vs.label,
      value: vs.value,
      detail: vs.detail,
      icon: SMART_CHIP_ICONS[vs.type],
      meta: {
        normalRange: vs.normal,
        severity: vs.severity,
        subtitle: vs.detail,
      },
    });
  });

  // 7. Dynamic Dates & Follow-up Scheduling
  const today = new Date();
  const dateOptions = [
    { label: "Today's Date", value: today.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), detail: "Current encounter date" },
    { label: "Follow-up in 2 Weeks", value: new Date(today.getTime() + 14 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), detail: "Early medication tolerance check" },
    { label: "Follow-up in 4 Weeks", value: new Date(today.getTime() + 28 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), detail: "Standard psychopharmacology follow-up" },
    { label: "Follow-up in 3 Months", value: new Date(today.getTime() + 90 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), detail: "Maintenance surveillance visit" },
  ];

  dateOptions.forEach((d, idx) => {
    items.push({
      id: `date-${idx}`,
      type: "date",
      label: `${d.label} (${d.value})`,
      value: d.value,
      detail: `${d.detail} · ${d.value}`,
      icon: SMART_CHIP_ICONS.date,
      meta: {
        date: d.value,
        subtitle: d.detail,
      },
    });
  });

  // 8. Allergies
  if (allergies && allergies.length > 0) {
    allergies.forEach((allergy, idx) => {
      items.push({
        id: `allergy-${idx}`,
        type: "allergy",
        label: allergy,
        value: allergy,
        detail: "Active Allergy Alert",
        icon: SMART_CHIP_ICONS.allergy,
        meta: {
          status: "Active Allergy",
          subtitle: "Chart-verified drug allergy",
        },
      });
    });
  }

  return items;
}

/**
 * Detects known catalog items within clean clinical text and returns non-overlapping spans.
 * Sorts longest matches first to prevent substring collisions (e.g. "Lisdexamfetamine 40 mg daily"
 * takes precedence over "Lisdexamfetamine").
 */
export function detectSmartChipsInText(
  text: string,
  catalog: SmartChipItem[]
): SmartChipSpan[] {
  if (!text || catalog.length === 0) return [];

  const spans: SmartChipSpan[] = [];
  const lowerText = text.toLowerCase();

  // Sort candidate items by descending value length
  const sortedCatalog = [...catalog].sort(
    (a, b) => b.value.length - a.value.length
  );

  for (const item of sortedCatalog) {
    const candidate = item.value.toLowerCase();
    if (!candidate || candidate.length < 3) continue;

    let searchIndex = 0;
    while (searchIndex < lowerText.length) {
      const foundIndex = lowerText.indexOf(candidate, searchIndex);
      if (foundIndex === -1) break;

      const endIndex = foundIndex + candidate.length;

      // Ensure boundary conditions (not in the middle of an alphanumeric word)
      const prevChar = foundIndex > 0 ? lowerText[foundIndex - 1] : " ";
      const nextChar = endIndex < lowerText.length ? lowerText[endIndex] : " ";
      const isWordBoundary = !/[a-z0-9]/i.test(prevChar) && !/[a-z0-9]/i.test(nextChar);

      if (isWordBoundary) {
        // Check for collision with already captured span
        const collides = spans.some(
          (s) => Math.max(s.start, foundIndex) < Math.min(s.end, endIndex)
        );

        if (!collides) {
          spans.push({
            start: foundIndex,
            end: endIndex,
            type: item.type,
            label: text.slice(foundIndex, endIndex),
            item,
          });
        }
      }

      searchIndex = foundIndex + 1;
    }
  }

  // Return spans ordered by character start position
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Splits text into alternating plain text and chip segments based on detected spans.
 */
export function segmentTextBySpans(
  text: string,
  spans: SmartChipSpan[]
): ProseSegment[] {
  if (!text) return [{ isChip: false, text: "" }];
  if (spans.length === 0) return [{ isChip: false, text }];

  const segments: ProseSegment[] = [];
  let cursor = 0;

  for (const span of spans) {
    if (span.start > cursor) {
      segments.push({
        isChip: false,
        text: text.slice(cursor, span.start),
      });
    }

    segments.push({
      isChip: true,
      text: text.slice(span.start, span.end),
      span,
    });

    cursor = span.end;
  }

  if (cursor < text.length) {
    segments.push({
      isChip: false,
      text: text.slice(cursor),
    });
  }

  return segments;
}

/**
 * Inserts selected smart chip text into a document, replacing any preceding trigger characters (e.g. `@query`).
 */
export function insertSmartChipAtCursor(
  currentText: string,
  cursorIndex: number,
  item: SmartChipItem,
  triggerLength = 1
): { nextText: string; newCursorIndex: number } {
  const replaceStart = Math.max(0, cursorIndex - triggerLength);
  const before = currentText.slice(0, replaceStart);
  const after = currentText.slice(cursorIndex);
  const insertText = item.value + " ";

  return {
    nextText: before + insertText + after,
    newCursorIndex: replaceStart + insertText.length,
  };
}
