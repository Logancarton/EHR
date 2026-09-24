export type LabStatus = "current" | "due-soon" | "due" | "overdue";
export type MonitoringMeasureKind = "lab" | "vital";
export type MonitoringPolicySource = "system" | "practice" | "provider" | "patient";

export type LabObservation = {
  id: string;
  testName: string;
  code: string;
  date: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag?: "normal" | "high" | "low" | "abnormal";
  orderedBy: string;
  /** Defaults to lab so existing callers/fixtures remain valid. */
  kind?: MonitoringMeasureKind;
};

export type MedicationProtocol = {
  id: string;
  medicationKeyword: string;
  canonicalMedication: string;
  measureKind: MonitoringMeasureKind;
  /** Human-facing monitored item. */
  requiredMeasure: string;
  /** Backward-compatible alias used by existing Overview code during migration. */
  requiredLab: string;
  /** Case-insensitive substrings that qualify authoritative evidence for this rule. */
  evidenceAliases: string[];
  intervalDays: number;
  dueSoonDays: number;
  overdueGraceDays: number;
  enabled: boolean;
  source: MonitoringPolicySource;
  rationale: string;
  policyReason?: string | null;
};

export type MonitoringPolicyOverride = {
  ruleId: string;
  intervalDays?: number;
  dueSoonDays?: number;
  overdueGraceDays?: number;
  enabled?: boolean;
  reason?: string | null;
  updatedAt?: string;
  updatedBy?: string;
};

export type PatientMonitoringItem = {
  ruleId: string;
  medication: string;
  canonicalMedication: string;
  measureKind: MonitoringMeasureKind;
  requiredMeasure: string;
  /** Backward-compatible alias. */
  requiredLab: string;
  intervalDays: number;
  intervalLabel: string;
  lastDoneDate: string | null;
  dueDate: string | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  status: LabStatus;
  rationale: string;
  policySource: MonitoringPolicySource;
  policyReason?: string | null;
};

export type PastEncounter = {
  id: string;
  date: string;
  provider: string;
  type: string;
  chiefComplaint: string;
  hpi: string;
  assessment: string;
  plan: string;
};

function systemRule(input: Omit<MedicationProtocol, "requiredLab" | "source" | "enabled">): MedicationProtocol {
  return {
    ...input,
    requiredLab: input.requiredMeasure,
    enabled: true,
    source: "system",
  };
}

/**
 * Starter surveillance library.
 *
 * These are application defaults, not an assertion that every patient should be
 * managed identically. Practice, provider, and patient-specific overrides resolve
 * on top of this list before the chart decides whether something is due.
 */
export const medicationProtocols: MedicationProtocol[] = [
  systemRule({
    id: "quetiapine-lipids",
    medicationKeyword: "quetiapine",
    canonicalMedication: "Quetiapine (Seroquel)",
    measureKind: "lab",
    requiredMeasure: "Fasting lipid panel",
    evidenceAliases: ["fasting lipid", "lipid panel", "cholesterol", "triglycer"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Metabolic surveillance associated with atypical antipsychotic treatment.",
  }),
  systemRule({
    id: "quetiapine-glucose",
    medicationKeyword: "quetiapine",
    canonicalMedication: "Quetiapine (Seroquel)",
    measureKind: "lab",
    requiredMeasure: "HbA1c / fasting glucose",
    evidenceAliases: ["hemoglobin a1c", "hba1c", "a1c", "fasting glucose", "glucose"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Metabolic surveillance associated with atypical antipsychotic treatment.",
  }),
  systemRule({
    id: "lamotrigine-cmp",
    medicationKeyword: "lamotrigine",
    canonicalMedication: "Lamotrigine (Lamictal)",
    measureKind: "lab",
    requiredMeasure: "CMP / hepatic and renal function",
    evidenceAliases: ["comprehensive metabolic panel", "cmp", "hepatic", "liver function", "creatinine"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Practice-configurable periodic laboratory surveillance.",
  }),
  systemRule({
    id: "lithium-level",
    medicationKeyword: "lithium",
    canonicalMedication: "Lithium Carbonate",
    measureKind: "lab",
    requiredMeasure: "12-hour serum lithium level",
    evidenceAliases: ["serum lithium", "lithium level", "lithium"],
    intervalDays: 180,
    dueSoonDays: 30,
    overdueGraceDays: 14,
    rationale: "Lithium concentration surveillance.",
  }),
  systemRule({
    id: "lithium-renal",
    medicationKeyword: "lithium",
    canonicalMedication: "Lithium Carbonate",
    measureKind: "lab",
    requiredMeasure: "Renal function (BUN / creatinine / eGFR)",
    evidenceAliases: ["bun/creatinine", "creatinine", "egfr", "renal function", "basic metabolic panel", "comprehensive metabolic panel"],
    intervalDays: 180,
    dueSoonDays: 30,
    overdueGraceDays: 14,
    rationale: "Renal-function surveillance while lithium is active.",
  }),
  systemRule({
    id: "lithium-tsh",
    medicationKeyword: "lithium",
    canonicalMedication: "Lithium Carbonate",
    measureKind: "lab",
    requiredMeasure: "TSH",
    evidenceAliases: ["tsh", "thyroid stimulating hormone", "thyroid"],
    intervalDays: 180,
    dueSoonDays: 30,
    overdueGraceDays: 14,
    rationale: "Thyroid surveillance while lithium is active.",
  }),
  systemRule({
    id: "guanfacine-vitals",
    medicationKeyword: "guanfacine",
    canonicalMedication: "Guanfacine ER (Intuniv)",
    measureKind: "vital",
    requiredMeasure: "Resting blood pressure & pulse",
    evidenceAliases: ["resting blood pressure", "blood pressure & pulse", "blood pressure", "vital signs"],
    intervalDays: 90,
    dueSoonDays: 14,
    overdueGraceDays: 14,
    rationale: "Practice-configurable hemodynamic monitoring.",
  }),
  systemRule({
    id: "sertraline-sodium",
    medicationKeyword: "sertraline",
    canonicalMedication: "Sertraline (Zoloft)",
    measureKind: "lab",
    requiredMeasure: "Electrolytes / sodium",
    evidenceAliases: ["sodium", "electrolytes", "basic metabolic panel", "comprehensive metabolic panel", "bmp", "cmp"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Practice-configurable periodic laboratory surveillance.",
  }),
  systemRule({
    id: "fluoxetine-cmp",
    medicationKeyword: "fluoxetine",
    canonicalMedication: "Fluoxetine (Prozac)",
    measureKind: "lab",
    requiredMeasure: "Comprehensive metabolic panel",
    evidenceAliases: ["comprehensive metabolic panel", "cmp"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Practice-configurable periodic laboratory surveillance.",
  }),
  systemRule({
    id: "fluoxetine-vitals",
    medicationKeyword: "fluoxetine",
    canonicalMedication: "Fluoxetine (Prozac)",
    measureKind: "vital",
    requiredMeasure: "Routine vital signs",
    evidenceAliases: ["vital signs", "blood pressure", "resting blood pressure"],
    intervalDays: 365,
    dueSoonDays: 30,
    overdueGraceDays: 30,
    rationale: "Practice-configurable routine vital-sign surveillance.",
  }),
];

export function formatMonitoringInterval(days: number): string {
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? "Every 12 months" : `Every ${years} years`;
  }
  if (days % 30 === 0) {
    const months = days / 30;
    return months === 1 ? "Every 30 days" : `Every ${months} months`;
  }
  return `Every ${days} days`;
}

export function monitoringPolicySourceLabel(source: MonitoringPolicySource): string {
  if (source === "practice") return "Practice default";
  if (source === "provider") return "Your override";
  if (source === "patient") return "Patient exception";
  return "System starter";
}

function applyPolicyLayer(
  rules: MedicationProtocol[],
  overrides: readonly MonitoringPolicyOverride[],
  source: MonitoringPolicySource,
): MedicationProtocol[] {
  const byRule = new Map(overrides.map((override) => [override.ruleId, override]));
  return rules.map((rule) => {
    const override = byRule.get(rule.id);
    if (!override) return rule;
    return {
      ...rule,
      intervalDays: override.intervalDays ?? rule.intervalDays,
      dueSoonDays: override.dueSoonDays ?? rule.dueSoonDays,
      overdueGraceDays: override.overdueGraceDays ?? rule.overdueGraceDays,
      enabled: override.enabled ?? rule.enabled,
      source,
      policyReason: override.reason ?? null,
    };
  });
}

/** System starter -> practice default -> provider override -> patient exception. */
export function resolveMonitoringRules(
  practiceOverrides: readonly MonitoringPolicyOverride[] = [],
  providerOverrides: readonly MonitoringPolicyOverride[] = [],
  patientOverrides: readonly MonitoringPolicyOverride[] = [],
): MedicationProtocol[] {
  const system = medicationProtocols.map((rule) => ({ ...rule, evidenceAliases: [...rule.evidenceAliases] }));
  const practice = applyPolicyLayer(system, practiceOverrides, "practice");
  const provider = applyPolicyLayer(practice, providerOverrides, "provider");
  return applyPolicyLayer(provider, patientOverrides, "patient");
}

/**
 * Legacy synthetic patient alerts predate the policy engine and duplicate its job.
 * Suppress only these exact fixture strings; unknown/manual alerts remain visible.
 */
const LEGACY_SYNTHETIC_MONITORING_ALERTS = new Set([
  "Monitoring labs due",
  "Overdue PHQ-9 & blood pressure monitoring",
  "Overdue 12-hr Lithium level & eGFR",
]);

export function isLegacySyntheticMonitoringAlert(alert?: string | null): boolean {
  return Boolean(alert && LEGACY_SYNTHETIC_MONITORING_ALERTS.has(alert));
}

// Patient-Specific Longitudinal Lab Results
export const patientLabHistory: Record<string, LabObservation[]> = {
  "jordan-reed": [
    {
      id: "lab-jr-1",
      testName: "Fasting Lipid Panel",
      code: "24331-1",
      date: "Jun 14, 2025",
      value: "Trig 182, LDL 118",
      unit: "mg/dL",
      referenceRange: "Trig <150, LDL <100",
      flag: "high",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-jr-2",
      testName: "Hemoglobin A1c",
      code: "4548-4",
      date: "Jun 14, 2025",
      value: "5.6",
      unit: "%",
      referenceRange: "<5.7",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-jr-3",
      testName: "Comprehensive Metabolic Panel (CMP)",
      code: "24323-8",
      date: "Aug 08, 2026",
      value: "Cr 0.9, eGFR >90, ALT 24, AST 21",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
  "maya-chen": [
    {
      id: "lab-mc-1",
      testName: "Basic Metabolic Panel (BMP)",
      code: "24320-4",
      date: "May 19, 2026",
      value: "Na 140, K 4.2, BUN 12, Cr 0.8",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-mc-2",
      testName: "Blood Pressure & Pulse Record",
      code: "85354-9",
      date: "Aug 12, 2026",
      value: "116/74 mmHg, Pulse 68",
      unit: "mmHg",
      referenceRange: "<120/80",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-mc-3",
      testName: "TSH (Thyroid Stimulating Hormone)",
      code: "3016-3",
      date: "Jan 15, 2026",
      value: "1.84",
      unit: "uIU/mL",
      referenceRange: "0.45–4.50",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
  "elena-rostova": [
    {
      id: "lab-er-1",
      testName: "Resting Blood Pressure & Pulse",
      code: "85354-9",
      date: "Aug 05, 2026",
      value: "128/82 mmHg, Pulse 76",
      unit: "mmHg",
      referenceRange: "<120/80",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-er-2",
      testName: "Comprehensive Metabolic Panel (CMP)",
      code: "24323-8",
      date: "May 12, 2026",
      value: "Na 139, K 4.1, Cr 0.7, eGFR >90",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
  "david-kim": [
    {
      id: "lab-dk-1",
      testName: "Serum Lithium Level, BUN/Creatinine, & TSH",
      code: "14334-7",
      date: "Feb 15, 2026",
      value: "Lithium 0.68 mEq/L, Cr 1.0, TSH 2.1",
      unit: "mEq/L",
      referenceRange: "0.60–0.80 mEq/L",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-dk-2",
      testName: "Complete Blood Count (CBC)",
      code: "58410-2",
      date: "Feb 15, 2026",
      value: "WBC 7.2, Hgb 14.8, Plt 220",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
  "marcus-vance": [
    {
      id: "lab-mv-1",
      testName: "Resting Blood Pressure & Pulse",
      code: "85354-9",
      date: "Aug 04, 2026",
      value: "120/78 mmHg, Pulse 72",
      unit: "mmHg",
      referenceRange: "<120/80",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-mv-2",
      testName: "Annual Metabolic Screen",
      code: "24323-8",
      date: "Apr 10, 2026",
      value: "Glucose 88, Lipid panel optimal",
      unit: "mg/dL",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
  "sofia-martinez": [
    {
      id: "lab-sm-1",
      testName: "Complete Blood Count (CBC)",
      code: "58410-2",
      date: "Feb 10, 2026",
      value: "WBC 6.4, Hgb 13.2, Plt 240",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
    {
      id: "lab-sm-2",
      testName: "Comprehensive Metabolic Panel (CMP)",
      code: "24323-8",
      date: "Feb 10, 2026",
      value: "All analytes within normal limits",
      unit: "multi",
      referenceRange: "Normal limits",
      flag: "normal",
      orderedBy: "Dr. Logan Carton",
    },
  ],
};

// Past Encounter Notes for Longitudinal Encounter Search
export const patientEncounterHistory: Record<string, PastEncounter[]> = {
  "maya-chen": [
    {
      id: "enc-mc-3",
      date: "Aug 12, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Psychiatric Follow-Up",
      chiefComplaint: "ADHD executive dysfunction and residual morning anxiety.",
      hpi: "Patient reports that Guanfacine ER 2mg nightly has significantly helped evening hyperactivity and sensory overload. Sleep onset latency improved from 90 minutes to approximately 25 minutes. Reports occasional mild vivid dreams but no morning grogginess. Sertraline 100mg continues to keep panic symptoms at baseline.",
      assessment: "ADHD, combined type: good early response to Guanfacine ER titration. Generalized anxiety disorder: stable on Sertraline 100mg.",
      plan: "1. Continue Guanfacine ER 2mg nightly at bedtime.\n2. Continue Sertraline 100mg daily in the morning.\n3. Re-evaluate sleep logs and executive function in 4 weeks.",
    },
    {
      id: "enc-mc-2",
      date: "Jul 15, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Medication Adjustment",
      chiefComplaint: "Difficulty winding down at night, racing thoughts.",
      hpi: "Patient experiencing worsening evening restlessness and difficulty transitioning to sleep. Has been taking Sertraline 100mg consistently. Discussed non-stimulant vs alpha-2 options for ADHD emotional dysregulation and delayed sleep phase.",
      assessment: "ADHD with prominent hyperactive/evening restlessness; GAD in partial remission.",
      plan: "1. Initiate Guanfacine ER 1mg nightly at bedtime for 10 days, then titrate to 2mg nightly.\n2. Warned about sedation, orthostatic dizziness, and need to avoid abrupt discontinuation.",
    },
    {
      id: "enc-mc-1",
      date: "May 19, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Comprehensive Psychiatric Intake",
      chiefComplaint: "Chronic worry, career stress, distractibility since childhood.",
      hpi: "34yo female presenting for evaluation of lifelong attention difficulties and recurring worry cycles. Divulges history of perfectionism, procrastination, and test anxiety during university. Initiated Sertraline earlier in year with partial anxiety relief.",
      assessment: "Generalized anxiety disorder (F41.1), ADHD combined presentation (F90.2).",
      plan: "1. Titrate Sertraline to 100mg daily.\n2. Order baseline BMP and TSH to rule out organic contributors.",
    },
  ],
  "elena-rostova": [
    {
      id: "enc-er-2",
      date: "Aug 05, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Psychiatric Follow-Up",
      chiefComplaint: "Mood stabilization and energy check on Bupropion XL 300mg.",
      hpi: "Patient reports substantial improvement in morning motivation and executive stamina since increasing Bupropion XL to 300mg. Denies irritability, tremor, or worsening insomnia. Escitalopram 10mg keeps baseline panic symptoms fully suppressed. PHQ-9 score down to 6.",
      assessment: "Major depressive disorder, recurrent, partial to full remission on dual Bupropion/Escitalopram regimen.",
      plan: "1. Maintain Bupropion XL 300mg daily in AM.\n2. Maintain Escitalopram 10mg daily.\n3. Recheck resting vitals next visit.",
    },
    {
      id: "enc-er-1",
      date: "Jun 20, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Medication Adjustment",
      chiefComplaint: "Atypical depressive symptoms, hypersomnia, fatigue.",
      hpi: "Patient reported residual vegetative depressive features despite SSRI therapy. Initiated Bupropion XL 150mg augmentation.",
      assessment: "Major depressive disorder with prominent lethargy.",
      plan: "1. Initiate Bupropion XL 150mg morning titration.\n2. Target increase to 300mg after 4 weeks.",
    },
  ],
  "david-kim": [
    {
      id: "enc-dk-2",
      date: "Aug 10, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Bipolar Maintenance Review",
      chiefComplaint: "Lithium stability, sleep consistency, tremor screening.",
      hpi: "Patient maintains mood stability on Lithium Carbonate 600mg BID. No hypomanic episodes, racing thoughts, or spending sprees over past 6 months. Mild fine postural hand tremor when fatigued; denies ataxia or GI distress. Reminded patient that 6-month Lithium trough level and eGFR are due.",
      assessment: "Bipolar II disorder, currently euthymic on Lithium monotherapy with PRN Trazodone.",
      plan: "1. Continue Lithium Carbonate 600mg BID.\n2. Ordered repeat 12-hour trough Lithium level, BUN, Creatinine, eGFR, and TSH.\n3. Keep Trazodone 50mg available PRN for shift sleep disruptions.",
    },
    {
      id: "enc-dk-1",
      date: "May 14, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Bipolar Follow-Up",
      chiefComplaint: "Routine mood stability check.",
      hpi: "Patient established on Lithium 600mg BID. Sleep averaging 7 hours. No depressive dip noted.",
      assessment: "Bipolar II disorder in remission.",
      plan: "1. Continue current Lithium dosing.\n2. Recheck metabolic labs in August.",
    },
  ],
  "marcus-vance": [
    {
      id: "enc-mv-2",
      date: "Aug 04, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "ADHD Follow-Up & Refill",
      chiefComplaint: "ADHD medication refill and work focus review.",
      hpi: "Patient reports excellent focus, time management, and task completion at engineering job with Lisdexamfetamine 40mg daily. Takes medication with breakfast around 7:30 AM; reports therapeutic duration through 6 PM without rebound crash. Vital signs stable (BP 120/78, HR 72).",
      assessment: "ADHD, combined type: well managed on Lisdexamfetamine 40mg.",
      plan: "1. Refill Lisdexamfetamine 40mg #30 with 2 electronic authorizations.\n2. Continue sleep hygiene and Melatonin 3mg PRN.",
    },
    {
      id: "enc-mv-1",
      date: "Jun 02, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "ADHD Titration",
      chiefComplaint: "Titrating Lisdexamfetamine from 30mg to 40mg.",
      hpi: "Patient felt 30mg was wearing off by 2 PM. Titrated to 40mg with improved afternoon coverage.",
      assessment: "ADHD, combined presentation.",
      plan: "1. Increase Lisdexamfetamine to 40mg daily.\n2. Monitor resting blood pressure.",
    },
  ],
  "jordan-reed": [
    {
      id: "enc-jr-2",
      date: "Aug 21, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Psychiatric Follow-Up",
      chiefComplaint: "Mood stabilization check and monitoring.",
      hpi: "Patient reports overall mood has been relatively stable on Lamotrigine 150mg daily. Quetiapine 100mg nightly provides reliable sleep maintenance without parasomnias. Patient notes 6-pound weight gain over past year. Noted that fasting metabolic labs (Lipid panel and HbA1c) have not been repeated since June 2025.",
      assessment: "Unspecified mood disorder, in partial remission. Mild dyslipidemia by history.",
      plan: "1. Continue Lamotrigine 150mg daily.\n2. Continue Quetiapine 100mg nightly.\n3. Ordered overdue annual metabolic monitoring labs: Fasting Lipids and HbA1c due now.",
    },
    {
      id: "enc-jr-1",
      date: "Jun 10, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Mood Titration Visit",
      chiefComplaint: "Titrating Lamotrigine, managing nighttime restlessness.",
      hpi: "Completed titration from Lamotrigine 100mg to 150mg without rash or systemic complaints. Denies fever, sore throat, or mucosal lesions. Sleep improved with Quetiapine 100mg bedtime.",
      assessment: "Mood disorder responding to Lamotrigine titration.",
      plan: "1. Maintain Lamotrigine 150mg daily.\n2. Recheck CMP in August 2026.",
    },
  ],
  "sofia-martinez": [
    {
      id: "enc-sm-1",
      date: "Jul 29, 2026",
      provider: "Dr. Logan Carton, MD",
      type: "Adolescent Mood Evaluation",
      chiefComplaint: "Persistent low energy, academic avoidance.",
      hpi: "18yo female college freshman presenting with depressed mood and social avoidance. Currently taking Fluoxetine 20mg, recently increased to 30mg by outpatient provider.",
      assessment: "Major depressive disorder, single episode, moderate.",
      plan: "1. Continue Fluoxetine 30mg daily with breakfast.\n2. Behavioral activation and sleep scheduling.",
    },
  ],
};

// Calculate Monitoring Status Based on Patient's Active Meds & authoritative evidence
function evidenceDate(value: string): Date | null {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function evidenceMatches(rule: MedicationProtocol, observation: LabObservation): boolean {
  const kind = observation.kind ?? "lab";
  if (kind !== rule.measureKind) return false;
  const haystack = `${observation.testName} ${observation.code}`.toLowerCase();
  return rule.evidenceAliases.some((alias) => haystack.includes(alias.toLowerCase()));
}

export function calculateMonitoringStatus(
  medications: string[],
  labHistory: LabObservation[],
  options: {
    protocols?: readonly MedicationProtocol[];
    referenceDate?: Date;
  } = {},
): PatientMonitoringItem[] {
  const items: PatientMonitoringItem[] = [];
  const referenceDate = options.referenceDate ?? new Date();
  const resolvedRules = options.protocols ?? medicationProtocols;

  for (const medString of medications) {
    const medLower = medString.toLowerCase();
    const matchingRules = resolvedRules.filter(
      (rule) => rule.enabled && medLower.includes(rule.medicationKeyword.toLowerCase()),
    );

    for (const protocol of matchingRules) {
      const matchingEvidence = labHistory
        .filter((observation) => evidenceMatches(protocol, observation))
        .map((observation) => ({ observation, date: evidenceDate(observation.date) }))
        .filter((entry): entry is { observation: LabObservation; date: Date } => Boolean(entry.date))
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

      let status: LabStatus = "overdue";
      let daysElapsed: number | null = null;
      let daysRemaining: number | null = null;
      let lastDoneDate: string | null = null;
      let dueDate: string | null = null;

      if (matchingEvidence) {
        lastDoneDate = matchingEvidence.observation.date;
        const elapsedMs = referenceDate.getTime() - matchingEvidence.date.getTime();
        daysElapsed = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
        daysRemaining = protocol.intervalDays - daysElapsed;
        dueDate = utcDateOnly(addUtcDays(matchingEvidence.date, protocol.intervalDays));

        if (daysRemaining > protocol.dueSoonDays) {
          status = "current";
        } else if (daysRemaining > 0) {
          status = "due-soon";
        } else if (Math.abs(daysRemaining) <= protocol.overdueGraceDays) {
          status = "due";
        } else {
          status = "overdue";
        }
      }

      items.push({
        ruleId: protocol.id,
        medication: medString,
        canonicalMedication: protocol.canonicalMedication,
        measureKind: protocol.measureKind,
        requiredMeasure: protocol.requiredMeasure,
        requiredLab: protocol.requiredMeasure,
        intervalDays: protocol.intervalDays,
        intervalLabel: formatMonitoringInterval(protocol.intervalDays),
        lastDoneDate,
        dueDate,
        daysElapsed,
        daysRemaining,
        status,
        rationale: protocol.rationale,
        policySource: protocol.source,
        policyReason: protocol.policyReason,
      });
    }
  }

  return items;
}
