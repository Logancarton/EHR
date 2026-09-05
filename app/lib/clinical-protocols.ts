export type LabStatus = "current" | "due-soon" | "overdue";

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
};

export type MedicationProtocol = {
  medicationKeyword: string;
  canonicalMedication: string;
  requiredLab: string;
  intervalDays: number;
  intervalLabel: string;
  rationale: string;
};

export type PatientMonitoringItem = {
  medication: string;
  requiredLab: string;
  intervalLabel: string;
  lastDoneDate: string | null;
  daysElapsed: number | null;
  daysRemaining: number | null;
  status: LabStatus;
  rationale: string;
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

// Standard Psychiatric & Medical Surveillance Protocols
export const medicationProtocols: MedicationProtocol[] = [
  {
    medicationKeyword: "quetiapine",
    canonicalMedication: "Quetiapine (Seroquel)",
    requiredLab: "Fasting Lipid Panel & HbA1c / Fasting Glucose",
    intervalDays: 365,
    intervalLabel: "Every 12 months",
    rationale: "Metabolic surveillance for atypical antipsychotics (insulin resistance, dyslipidemia, weight gain).",
  },
  {
    medicationKeyword: "lamotrigine",
    canonicalMedication: "Lamotrigine (Lamictal)",
    requiredLab: "Comprehensive Metabolic Panel (CMP) & LFTs",
    intervalDays: 365,
    intervalLabel: "Every 12 months",
    rationale: "Periodic hepatic and renal function surveillance, benign vs hypersensitivity rash monitoring.",
  },
  {
    medicationKeyword: "lithium",
    canonicalMedication: "Lithium Carbonate",
    requiredLab: "Serum Lithium Level, BUN/Creatinine, & TSH",
    intervalDays: 180,
    intervalLabel: "Every 6 months",
    rationale: "Narrow therapeutic index (target 0.6–0.8 mEq/L), risk of nephrogenic diabetes insipidus, hypothyroidism.",
  },
  {
    medicationKeyword: "guanfacine",
    canonicalMedication: "Guanfacine ER (Intuniv)",
    requiredLab: "Resting Blood Pressure & Pulse",
    intervalDays: 90,
    intervalLabel: "Every 3 months",
    rationale: "Alpha-2A agonist hemodynamic monitoring: assess for bradycardia, hypotension, or rebound hypertension.",
  },
  {
    medicationKeyword: "sertraline",
    canonicalMedication: "Sertraline (Zoloft)",
    requiredLab: "Basic Metabolic Panel (Electrolytes/Sodium)",
    intervalDays: 365,
    intervalLabel: "Annual / Periodic",
    rationale: "Screening for SSRI-induced hyponatremia (SIADH), especially in older adults or combined pharmacotherapy.",
  },
  {
    medicationKeyword: "fluoxetine",
    canonicalMedication: "Fluoxetine (Prozac)",
    requiredLab: "Comprehensive Metabolic Panel & Vital Signs",
    intervalDays: 365,
    intervalLabel: "Annual wellness",
    rationale: "Long-half-life SSRI hepatic clearance check and baseline metabolic parameters.",
  },
];

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

// Calculate Monitoring Status Based on Patient's Active Meds & Lab History
export function calculateMonitoringStatus(
  medications: string[],
  labHistory: LabObservation[],
): PatientMonitoringItem[] {
  const items: PatientMonitoringItem[] = [];
  const referenceDate = new Date("2026-09-04T00:00:00Z");

  for (const medString of medications) {
    const medLower = medString.toLowerCase();
    const protocol = medicationProtocols.find((p) => medLower.includes(p.medicationKeyword));

    if (protocol) {
      // Find matching lab
      const matchingLab = labHistory.find((lab) =>
        protocol.requiredLab.toLowerCase().includes(lab.testName.toLowerCase()) ||
        lab.testName.toLowerCase().includes(protocol.requiredLab.split(" ")[0].toLowerCase()),
      );

      let status: LabStatus = "overdue";
      let daysElapsed: number | null = null;
      let daysRemaining: number | null = null;
      let lastDoneDate: string | null = null;

      if (matchingLab) {
        lastDoneDate = matchingLab.date;
        const labDate = new Date(matchingLab.date);
        if (!isNaN(labDate.getTime())) {
          daysElapsed = Math.floor((referenceDate.getTime() - labDate.getTime()) / (1000 * 60 * 60 * 24));
          daysRemaining = protocol.intervalDays - daysElapsed;

          if (daysElapsed > protocol.intervalDays) {
            status = "overdue";
          } else if (daysRemaining <= 30) {
            status = "due-soon";
          } else {
            status = "current";
          }
        }
      } else {
        // No lab ever recorded for this protocol -> overdue
        status = "overdue";
      }

      items.push({
        medication: medString,
        requiredLab: protocol.requiredLab,
        intervalLabel: protocol.intervalLabel,
        lastDoneDate,
        daysElapsed,
        daysRemaining,
        status,
        rationale: protocol.rationale,
      });
    }
  }

  return items;
}
