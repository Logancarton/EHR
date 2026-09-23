/**
 * Clinical domain models for longitudinal measurements, structured psychiatric
 * history, and standardized clinical rating scales (P3-D, P3-E, P3-F).
 */

// ---------------------------------------------------------------------------
// P3-D: Longitudinal Measurements & Vitals
// ---------------------------------------------------------------------------

export type VitalSignType =
  | "bp-systolic"
  | "bp-diastolic"
  | "bp"
  | "hr"
  | "wt"
  | "ht"
  | "bmi"
  | "rr"
  | "temp"
  | "spo2";

export interface VitalMeasurementInput {
  patientId: string;
  effectiveAt?: string;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  weightLbs?: number;
  heightIn?: number;
  respiratoryRate?: number;
  temperatureF?: number;
  oxygenSaturation?: number;
  notes?: string;
}

export interface VitalAttentionFlag {
  type: "blood_pressure" | "heart_rate" | "bmi" | "weight_change";
  severity: "warning" | "critical";
  label: string;
  detail: string;
}

export interface VitalSignSummary {
  recordedAt: string;
  systolic?: number | null;
  diastolic?: number | null;
  bpText?: string | null;
  heartRate?: number | null;
  weightLbs?: number | null;
  heightIn?: number | null;
  bmi?: number | null;
  bmiCategory?: string | null;
  respiratoryRate?: number | null;
  temperatureF?: number | null;
  oxygenSaturation?: number | null;
  flags: VitalAttentionFlag[];
  notes?: string | null;
}

export function calculateBmi(weightLbs: number, heightIn: number): number {
  if (weightLbs <= 0 || heightIn <= 0) return 0;
  // BMI = (weight in pounds x 703) / (height in inches)^2
  const bmi = (weightLbs * 703) / (heightIn * heightIn);
  return Math.round(bmi * 10) / 10;
}

export function bmiCategory(bmi: number): string {
  if (bmi <= 0) return "Unknown";
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25.0) return "Normal weight";
  if (bmi < 30.0) return "Overweight";
  if (bmi < 35.0) return "Obesity Class I";
  if (bmi < 40.0) return "Obesity Class II";
  return "Obesity Class III";
}

export function evaluateVitalFlags(
  current: {
    systolic?: number | null;
    diastolic?: number | null;
    heartRate?: number | null;
    weightLbs?: number | null;
    heightIn?: number | null;
    bmi?: number | null;
  },
  priorWeightLbs?: number | null,
): VitalAttentionFlag[] {
  const flags: VitalAttentionFlag[] = [];

  // Blood Pressure Evaluation (AHA/ACC Guidelines)
  const sys = current.systolic ?? undefined;
  const dia = current.diastolic ?? undefined;
  if (sys !== undefined && dia !== undefined) {
    if (sys >= 180 || dia >= 120) {
      flags.push({
        type: "blood_pressure",
        severity: "critical",
        label: "Hypertensive Crisis",
        detail: `BP ${sys}/${dia} mmHg requires immediate clinical evaluation.`,
      });
    } else if (sys >= 140 || dia >= 90) {
      flags.push({
        type: "blood_pressure",
        severity: "warning",
        label: "Stage 2 Hypertension",
        detail: `BP ${sys}/${dia} mmHg — evaluate stimulant, SNRI, or somatic therapy.`,
      });
    } else if (sys >= 130 || dia >= 80) {
      flags.push({
        type: "blood_pressure",
        severity: "warning",
        label: "Stage 1 Hypertension",
        detail: `BP ${sys}/${dia} mmHg.`,
      });
    }
  }

  // Heart Rate
  if (current.heartRate !== undefined && current.heartRate !== null) {
    if (current.heartRate > 110) {
      flags.push({
        type: "heart_rate",
        severity: "warning",
        label: "Tachycardia",
        detail: `Heart rate ${current.heartRate} bpm.`,
      });
    } else if (current.heartRate < 50) {
      flags.push({
        type: "heart_rate",
        severity: "warning",
        label: "Bradycardia",
        detail: `Heart rate ${current.heartRate} bpm.`,
      });
    }
  }

  // Weight shift surveillance (particularly relevant for second-generation antipsychotics)
  if (current.weightLbs && priorWeightLbs && priorWeightLbs > 0) {
    const changePct = ((current.weightLbs - priorWeightLbs) / priorWeightLbs) * 100;
    if (changePct >= 7.0) {
      flags.push({
        type: "weight_change",
        severity: "warning",
        label: "Significant Weight Gain (>=7%)",
        detail: `+${changePct.toFixed(1)}% weight increase (${priorWeightLbs} -> ${current.weightLbs} lbs). Assess metabolic surveillance.`,
      });
    } else if (changePct <= -7.0) {
      flags.push({
        type: "weight_change",
        severity: "warning",
        label: "Significant Weight Loss (>=7%)",
        detail: `${changePct.toFixed(1)}% weight decrease (${priorWeightLbs} -> ${current.weightLbs} lbs).`,
      });
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// P3-E: Structured Psychiatric History
// ---------------------------------------------------------------------------

export type PsychiatricHistoryCategory =
  | "medication_trial"
  | "hospitalization"
  | "safety_risk"
  | "psychotherapy"
  | "substance_use"
  | "family_history"
  | "trauma"
  | "social";

export type PsychiatricHistoryStatus = "active" | "historical" | "in-remission" | "entered-in-error";

export interface PsychiatricHistoryItem {
  id: string;
  patientId: string;
  category: PsychiatricHistoryCategory;
  title: string;
  details: Record<string, unknown>;
  status: PsychiatricHistoryStatus;
  onsetDate?: string | null;
  resolvedDate?: string | null;
  sourceSystem: string;
  sourceRef?: string | null;
  recordedBy: string;
  recordedAt: string;
  updatedAt: string;
}

export interface PsychiatricHistoryInput {
  patientId: string;
  category: PsychiatricHistoryCategory;
  title: string;
  details: Record<string, unknown>;
  status?: PsychiatricHistoryStatus;
  onsetDate?: string | null;
  resolvedDate?: string | null;
}

export interface PsychiatricHistoryPatch {
  title?: string;
  details?: Record<string, unknown>;
  status?: PsychiatricHistoryStatus;
  onsetDate?: string | null;
  resolvedDate?: string | null;
}

// ---------------------------------------------------------------------------
// P3-F: Standardized Clinical Assessments
// ---------------------------------------------------------------------------

export type AssessmentInstrumentType = "phq-9" | "gad-7" | "asrs-v1.1" | "cssrs";

export interface AssessmentQuestion {
  id: number;
  text: string;
  options: Array<{ label: string; value: number }>;
  /** Optional visual grouping used by multi-part instruments such as the ASRS. */
  sectionTitle?: string;
  sectionDescription?: string;
}

export interface AssessmentInstrumentDefinition {
  type: AssessmentInstrumentType;
  title: string;
  description: string;
  /** Stored instrument version. Older definitions fall back to 1.0. */
  version?: string;
  maxScore: number;
  questions: AssessmentQuestion[];
  interpret: (score: number, answers: Record<number, number>) => {
    severity: string;
    flags: string[];
    summary: string;
  };
}

export const PHQ9_INSTRUMENT: AssessmentInstrumentDefinition = {
  type: "phq-9",
  title: "PHQ-9 (Patient Health Questionnaire)",
  description: "Standardized 9-item depression severity rating scale.",
  maxScore: 27,
  questions: [
    { id: 1, text: "Little interest or pleasure in doing things", options: defaultFrequencyOptions() },
    { id: 2, text: "Feeling down, depressed, or hopeless", options: defaultFrequencyOptions() },
    { id: 3, text: "Trouble falling or staying asleep, or sleeping too much", options: defaultFrequencyOptions() },
    { id: 4, text: "Feeling tired or having little energy", options: defaultFrequencyOptions() },
    { id: 5, text: "Poor appetite or overeating", options: defaultFrequencyOptions() },
    { id: 6, text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down", options: defaultFrequencyOptions() },
    { id: 7, text: "Trouble concentrating on things, such as reading the newspaper or watching television", options: defaultFrequencyOptions() },
    { id: 8, text: "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual", options: defaultFrequencyOptions() },
    { id: 9, text: "Thoughts that you would be better off dead, or of hurting yourself in some way", options: defaultFrequencyOptions() },
  ],
  interpret: (score, answers) => {
    let severity = "None / Minimal";
    if (score >= 20) severity = "Severe Depression";
    else if (score >= 15) severity = "Moderately Severe Depression";
    else if (score >= 10) severity = "Moderate Depression";
    else if (score >= 5) severity = "Mild Depression";

    const flags: string[] = [];
    const item9Score = answers[9] ?? 0;
    if (item9Score > 0) {
      flags.push(`POSITIVE ITEM 9 (Score ${item9Score}): Suicidal or self-injurious thoughts endorsed. Requires immediate clinical risk assessment.`);
    }

    return {
      severity,
      flags,
      summary: `PHQ-9 Score ${score}/27 (${severity})${flags.length > 0 ? " · [SAFETY ALERT: Item 9 Endorsed]" : ""}`,
    };
  },
};

export const GAD7_INSTRUMENT: AssessmentInstrumentDefinition = {
  type: "gad-7",
  title: "GAD-7 (Generalized Anxiety Disorder)",
  description: "Standardized 7-item anxiety severity rating scale.",
  maxScore: 21,
  questions: [
    { id: 1, text: "Feeling nervous, anxious, or on edge", options: defaultFrequencyOptions() },
    { id: 2, text: "Not being able to stop or control worrying", options: defaultFrequencyOptions() },
    { id: 3, text: "Worrying too much about different things", options: defaultFrequencyOptions() },
    { id: 4, text: "Trouble relaxing", options: defaultFrequencyOptions() },
    { id: 5, text: "Being so restless that it is hard to sit still", options: defaultFrequencyOptions() },
    { id: 6, text: "Becoming easily annoyed or irritable", options: defaultFrequencyOptions() },
    { id: 7, text: "Feeling afraid, as if something awful might happen", options: defaultFrequencyOptions() },
  ],
  interpret: (score) => {
    let severity = "Minimal Anxiety";
    if (score >= 15) severity = "Severe Anxiety";
    else if (score >= 10) severity = "Moderate Anxiety";
    else if (score >= 5) severity = "Mild Anxiety";

    return {
      severity,
      flags: [],
      summary: `GAD-7 Score ${score}/21 (${severity})`,
    };
  },
};

export const ASRS_INSTRUMENT: AssessmentInstrumentDefinition = {
  type: "asrs-v1.1",
  version: "1.1",
  title: "ASRS v1.1 (Adult ADHD Self-Report Scale Symptom Checklist)",
  description:
    "Full 18-item adult ADHD symptom checklist. Part A is the 6-item screener; Part B supplies additional symptom information and has no separate diagnostic cutoff. Screening does not establish an ADHD diagnosis.",
  maxScore: 72,
  questions: [
    {
      id: 1,
      sectionTitle: "Part A — Screener",
      sectionDescription: "Six predictive screening items. Four or more responses in the instrument's threshold zones constitute a positive screen.",
      text: "How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?",
      options: asrsOptions(),
    },
    { id: 2, text: "How often do you have difficulty getting things in order when you have to do a task that requires organization?", options: asrsOptions() },
    { id: 3, text: "How often do you have problems remembering appointments or obligations?", options: asrsOptions() },
    { id: 4, text: "When you have a task that requires a lot of thought, how often do you avoid or delay getting started?", options: asrsOptions() },
    { id: 5, text: "How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?", options: asrsOptions() },
    { id: 6, text: "How often do you feel overly active and compelled to do things, like you were driven by a motor?", options: asrsOptions() },
    {
      id: 7,
      sectionTitle: "Part B — Additional symptoms",
      sectionDescription: "Twelve additional symptom-frequency items used as clinical follow-up information; Part B does not have a separate diagnostic cutoff.",
      text: "How often do you make careless mistakes when you have to work on a boring or difficult project?",
      options: asrsOptions(),
    },
    { id: 8, text: "How often do you have difficulty keeping your attention when you are doing boring or repetitive work?", options: asrsOptions() },
    { id: 9, text: "How often do you have difficulty concentrating on what people say to you, even when they are speaking to you directly?", options: asrsOptions() },
    { id: 10, text: "How often do you misplace or have difficulty finding things at home or at work?", options: asrsOptions() },
    { id: 11, text: "How often are you distracted by activity or noise around you?", options: asrsOptions() },
    { id: 12, text: "How often do you leave your seat in meetings or other situations in which you are expected to remain seated?", options: asrsOptions() },
    { id: 13, text: "How often do you feel restless or fidgety?", options: asrsOptions() },
    { id: 14, text: "How often do you have difficulty unwinding and relaxing when you have time to yourself?", options: asrsOptions() },
    { id: 15, text: "How often do you find yourself talking too much when you are in social situations?", options: asrsOptions() },
    { id: 16, text: "When you're in a conversation, how often do you find yourself finishing the sentences of the people you are talking to, before they can finish them themselves?", options: asrsOptions() },
    { id: 17, text: "How often do you have difficulty waiting your turn in situations when turn taking is required?", options: asrsOptions() },
    { id: 18, text: "How often do you interrupt others when they are busy?", options: asrsOptions() },
  ],
  interpret: (score, answers) => {
    /**
     * Original ASRS v1.1 Part A shaded-box rule:
     * Q1-Q3: Sometimes/Often/Very Often
     * Q4-Q5: Often/Very Often
     * Q6: Very Often
     * Four or more threshold responses = positive screen.
     *
     * The full 18-item raw total is retained for longitudinal display because that
     * is how the practice's existing ASRS exports are documented, but it is not
     * treated as an independent diagnostic cutoff.
     */
    const thresholds: Record<number, number> = {
      1: 2,
      2: 2,
      3: 2,
      4: 3,
      5: 3,
      6: 4,
    };
    const significantResponses = Object.entries(thresholds).reduce(
      (count, [questionId, threshold]) =>
        count + ((answers[Number(questionId)] ?? 0) >= threshold ? 1 : 0),
      0,
    );

    const isPositive = significantResponses >= 4;
    const severity = isPositive ? "Positive ADHD Screen" : "Negative ADHD Screen";
    const screeningResult = isPositive ? "Positive" : "Negative";

    return {
      severity,
      // A positive ADHD screen is not a safety event. Safety flags are reserved
      // for clinically urgent findings such as PHQ-9 item 9 or C-SSRS responses.
      flags: [],
      summary:
        `ASRS v1.1 Part A: ${significantResponses}/6 threshold items (${screeningResult} screen) · ` +
        `Full 18-item raw total: ${score}/72. Screening only; formal clinical evaluation is required for diagnosis.`,
    };
  },
};

export const CSSRS_INSTRUMENT: AssessmentInstrumentDefinition = {
  type: "cssrs",
  title: "C-SSRS (Columbia Suicide Severity Rating Scale Screen)",
  description: "Standardized suicide ideation and behavior screener.",
  maxScore: 6,
  questions: [
    { id: 1, text: "Have you wished you were dead or wished you could go to sleep and not wake up?", options: binaryOptions() },
    { id: 2, text: "Have you actually had any thoughts of killing yourself?", options: binaryOptions() },
    { id: 3, text: "Have you thought about how you might do this (method)?", options: binaryOptions() },
    { id: 4, text: "Have you had these thoughts and had some intention of acting on them?", options: binaryOptions() },
    { id: 5, text: "Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?", options: binaryOptions() },
    { id: 6, text: "Have you done anything, started to do anything, or prepared to do anything to end your life (lifetime or past 3 months)?", options: binaryOptions() },
  ],
  interpret: (score, answers) => {
    let severity = "No Suicidal Ideation";
    const flags: string[] = [];

    if (answers[5] === 1) {
      severity = "High Risk (Suicidal Intent with Specific Plan)";
      flags.push("CRITICAL: Active suicidal intent with plan (Item 5 positive). Immediate safety protocol required.");
    } else if (answers[4] === 1) {
      severity = "Moderate-High Risk (Suicidal Intent without Specific Plan)";
      flags.push("HIGH RISK: Suicidal intent without specific plan (Item 4 positive). Safety planning required.");
    } else if (answers[3] === 1) {
      severity = "Moderate Risk (Suicidal Ideation with Method)";
      flags.push("MODERATE RISK: Suicidal thoughts with method (Item 3 positive).");
    } else if (answers[2] === 1) {
      severity = "Mild-Moderate Risk (Active Suicidal Ideation)";
    } else if (answers[1] === 1) {
      severity = "Passive Suicidal Ideation (Wish to be Dead)";
    }

    if (answers[6] === 1) {
      flags.push("HISTORY OF SUICIDAL BEHAVIOR: Patient has engaged in preparatory acts or suicide attempts.");
    }

    return {
      severity,
      flags,
      summary: `C-SSRS Screen: ${severity}${flags.length > 0 ? " · [SAFETY ALERT]" : ""}`,
    };
  },
};

export const ASSESSMENT_INSTRUMENTS: Record<AssessmentInstrumentType, AssessmentInstrumentDefinition> = {
  "phq-9": PHQ9_INSTRUMENT,
  "gad-7": GAD7_INSTRUMENT,
  "asrs-v1.1": ASRS_INSTRUMENT,
  "cssrs": CSSRS_INSTRUMENT,
};

function defaultFrequencyOptions() {
  return [
    { label: "0 · Not at all", value: 0 },
    { label: "1 · Several days", value: 1 },
    { label: "2 · More than half the days", value: 2 },
    { label: "3 · Nearly every day", value: 3 },
  ];
}

function asrsOptions() {
  return [
    { label: "0 · Never", value: 0 },
    { label: "1 · Rarely", value: 1 },
    { label: "2 · Sometimes", value: 2 },
    { label: "3 · Often", value: 3 },
    { label: "4 · Very Often", value: 4 },
  ];
}

function binaryOptions() {
  return [
    { label: "0 · No", value: 0 },
    { label: "1 · Yes", value: 1 },
  ];
}

export interface AssessmentRecord {
  id: string;
  patientId: string;
  encounterId?: string | null;
  instrument: AssessmentInstrumentType;
  instrumentVersion: string;
  title: string;
  totalScore: number;
  maxScore: number;
  severity: string;
  responses: Record<number, number>;
  flags: string[];
  source: "patient" | "staff" | "clinician";
  administeredBy: string;
  administeredAt: string;
  reviewStatus: "reviewed" | "pending-review";
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentInput {
  patientId: string;
  encounterId?: string | null;
  instrument: AssessmentInstrumentType;
  responses: Record<number, number>;
  source?: "patient" | "staff" | "clinician";
  notes?: string | null;
  administeredAt?: string;
}
