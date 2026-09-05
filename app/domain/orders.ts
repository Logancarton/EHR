export type DeaSchedule = "None" | "C-II" | "C-III" | "C-IV" | "C-V";

export type OrderStatus = "draft" | "staged" | "authorized" | "transmitted" | "cancelled";

export type Pharmacy = {
  id: string;
  name: string;
  address: string;
  phone: string;
  ncpdpId: string;
  epcsEnabled: boolean;
  hours?: string;
  distance?: string;
};

export type ProviderAuth = {
  providerName: string;
  npi: string;
  deaNumber?: string;
  stateLicense?: string;
  epcsPin?: string;
  otpToken?: string;
};

export type MedicationOrder = {
  id: string;
  patientId: string;
  type: "medication";
  medication: string;
  genericName: string;
  strength: string;
  form: string;
  route: string;
  frequency: string;
  sig: string;
  dispenseQuantity: number;
  daysSupply: number;
  refills: number;
  substitutionAllowed: boolean;
  indication: string; // ICD-10 diagnosis link
  deaSchedule: DeaSchedule;
  requiresEpcs: boolean;
  pharmacy: Pharmacy;
  status: OrderStatus;
  prescribedBy: string;
  createdAt: string;
  notesToPharmacist?: string;
  transmittedAt?: string;
  transmissionId?: string;
  transmissionVendor?: string;
};

export type LabOrder = {
  id: string;
  patientId: string;
  type: "lab";
  testName: string;
  loincCode: string;
  specimen: string;
  priority: "Routine" | "STAT" | "Next Visit" | "Protocol Surveillance";
  fastingRequired: boolean;
  clinicalRationale: string;
  indication: string; // ICD-10 diagnosis link
  targetFacility: "Quest Diagnostics" | "Labcorp" | "In-House STAT Lab";
  status: OrderStatus;
  orderedBy: string;
  createdAt: string;
  requisitionNumber?: string;
  transmittedAt?: string;
  transmissionVendor?: string;
};

export type ClinicalOrder = MedicationOrder | LabOrder;

export type ClinicalSafetySeverity = "critical" | "warning" | "advisory";

export type ClinicalSafetyAlert = {
  id: string;
  severity: ClinicalSafetySeverity;
  title: string;
  mechanism: string;
  clinicalAction: string;
  drugsInvolved: string[];
};

export type OrderTransmissionReceipt = {
  transmissionId: string;
  vendor: string;
  timestamp: string;
  providerNpi: string;
  providerName: string;
  itemsSummary: string[];
  destination: string;
  auditTrailCode: string;
  epcsVerified?: boolean;
};

export type DrugCatalogItem = {
  id: string;
  name: string;
  genericName: string;
  defaultStrength: string;
  availableStrengths: string[];
  defaultForm: string;
  forms: string[];
  defaultRoute: string;
  defaultFrequency: string;
  frequencies: string[];
  defaultSig: string;
  defaultQuantity: number;
  defaultDaysSupply: number;
  defaultRefills: number;
  deaSchedule: DeaSchedule;
  category: "SSRI" | "SNRI" | "Atypical Antipsychotic" | "Mood Stabilizer" | "Stimulant" | "Alpha-2 Agonist" | "Benzodiazepine" | "Anxiolytic / Non-Benzo" | "Antidepressant (Other)";
  contraindications: string[];
  monitoringRequired?: string;
};

export type LabCatalogItem = {
  id: string;
  testName: string;
  loincCode: string;
  specimen: string;
  defaultPriority: "Routine" | "STAT" | "Next Visit" | "Protocol Surveillance";
  fastingRequired: boolean;
  category: "Metabolic" | "Hematology" | "Endocrine / Thyroid" | "Therapeutic Drug Monitoring" | "Toxicology" | "Cardiovascular";
  clinicalIndications: string[];
  description: string;
};

// Standard Synthetic Community Pharmacies
export const standardPharmacies: Pharmacy[] = [
  {
    id: "pharm-cvs-1042",
    name: "CVS Pharmacy #1042",
    address: "1200 Market St, San Francisco, CA 94102",
    phone: "(415) 552-3021",
    ncpdpId: "0549201",
    epcsEnabled: true,
    hours: "Open 24 Hours",
    distance: "0.4 mi",
  },
  {
    id: "pharm-walgreens-4920",
    name: "Walgreens Pharmacy #4920",
    address: "498 Castro St, San Francisco, CA 94114",
    phone: "(415) 861-3136",
    ncpdpId: "0583921",
    epcsEnabled: true,
    hours: "8:00 AM – 9:00 PM",
    distance: "1.2 mi",
  },
  {
    id: "pharm-alto-sf",
    name: "Alto Pharmacy (Delivery)",
    address: "1400 16th St, Ste 400, San Francisco, CA 94103",
    phone: "(800) 874-5881",
    ncpdpId: "0599182",
    epcsEnabled: true,
    hours: "Same-Day Courier Delivery",
    distance: "1.8 mi",
  },
];

// Curated Psychiatric Formulary & Drug Catalog
export const psychiatricDrugCatalog: DrugCatalogItem[] = [
  {
    id: "drug-sertraline",
    name: "Sertraline (Zoloft)",
    genericName: "sertraline hydrochloride",
    defaultStrength: "100 mg",
    availableStrengths: ["25 mg", "50 mg", "100 mg", "150 mg", "200 mg"],
    defaultForm: "Tablet",
    forms: ["Tablet", "Oral Concentrate"],
    defaultRoute: "Oral",
    defaultFrequency: "Once daily in morning",
    frequencies: ["Once daily in morning", "Once daily with food", "Nightly at bedtime"],
    defaultSig: "Take 1 tablet (100 mg) by mouth once daily in the morning with food.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 3,
    deaSchedule: "None",
    category: "SSRI",
    contraindications: ["MAOI within 14 days", "Pimozide"],
    monitoringRequired: "Electrolytes if high-risk for SIADH",
  },
  {
    id: "drug-escitalopram",
    name: "Escitalopram (Lexapro)",
    genericName: "escitalopram oxalate",
    defaultStrength: "10 mg",
    availableStrengths: ["5 mg", "10 mg", "20 mg"],
    defaultForm: "Tablet",
    forms: ["Tablet", "Oral Solution"],
    defaultRoute: "Oral",
    defaultFrequency: "Once daily in morning",
    frequencies: ["Once daily in morning", "Nightly at bedtime"],
    defaultSig: "Take 1 tablet (10 mg) by mouth once daily.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 3,
    deaSchedule: "None",
    category: "SSRI",
    contraindications: ["MAOI within 14 days", "QTc prolongation"],
  },
  {
    id: "drug-bupropion",
    name: "Bupropion XL (Wellbutrin XL)",
    genericName: "bupropion hydrochloride ER",
    defaultStrength: "150 mg",
    availableStrengths: ["150 mg", "300 mg", "450 mg"],
    defaultForm: "Extended-Release Tablet",
    forms: ["Extended-Release Tablet (24hr)"],
    defaultRoute: "Oral",
    defaultFrequency: "Once daily in morning",
    frequencies: ["Once daily in morning"],
    defaultSig: "Take 1 tablet (150 mg) by mouth once daily in the morning. Swallow whole, do not crush.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 3,
    deaSchedule: "None",
    category: "Antidepressant (Other)",
    contraindications: ["Seizure disorder", "Bulimia / Anorexia nervosa", "Abrupt alcohol/sedative withdrawal", "MAOI within 14 days"],
  },
  {
    id: "drug-lamotrigine",
    name: "Lamotrigine (Lamictal)",
    genericName: "lamotrigine",
    defaultStrength: "150 mg",
    availableStrengths: ["25 mg", "50 mg", "100 mg", "150 mg", "200 mg"],
    defaultForm: "Tablet",
    forms: ["Tablet", "Chewable Tablet", "Extended-Release Tablet"],
    defaultRoute: "Oral",
    defaultFrequency: "Once daily",
    frequencies: ["Once daily", "Twice daily divided doses"],
    defaultSig: "Take 1 tablet (150 mg) by mouth once daily.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 2,
    deaSchedule: "None",
    category: "Mood Stabilizer",
    contraindications: ["Hypersensitivity to lamotrigine"],
    monitoringRequired: "Periodic CMP / LFTs, immediate report of new rash",
  },
  {
    id: "drug-quetiapine",
    name: "Quetiapine (Seroquel)",
    genericName: "quetiapine fumarate",
    defaultStrength: "100 mg",
    availableStrengths: ["25 mg", "50 mg", "100 mg", "200 mg", "300 mg"],
    defaultForm: "Tablet",
    forms: ["Immediate-Release Tablet", "Extended-Release (XR) Tablet"],
    defaultRoute: "Oral",
    defaultFrequency: "Nightly at bedtime",
    frequencies: ["Nightly at bedtime", "Twice daily"],
    defaultSig: "Take 1 tablet (100 mg) by mouth nightly at bedtime for mood stabilization and sleep.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 2,
    deaSchedule: "None",
    category: "Atypical Antipsychotic",
    contraindications: ["Severe CNS depression"],
    monitoringRequired: "Annual Fasting Lipid Panel & HbA1c (Metabolic Protocol)",
  },
  {
    id: "drug-lithium",
    name: "Lithium Carbonate (Lithobid)",
    genericName: "lithium carbonate ER",
    defaultStrength: "300 mg",
    availableStrengths: ["150 mg", "300 mg", "450 mg", "600 mg"],
    defaultForm: "Extended-Release Tablet",
    forms: ["Extended-Release Tablet", "Capsule", "Oral Solution"],
    defaultRoute: "Oral",
    defaultFrequency: "Twice daily with meals",
    frequencies: ["Twice daily with meals", "Nightly single dose"],
    defaultSig: "Take 1 tablet (300 mg) by mouth twice daily with meals. Maintain hydration.",
    defaultQuantity: 60,
    defaultDaysSupply: 30,
    defaultRefills: 1,
    deaSchedule: "None",
    category: "Mood Stabilizer",
    contraindications: ["Severe renal impairment", "Dehydration", "Significant cardiovascular disease"],
    monitoringRequired: "Serum Lithium level (12h trough), Renal Panel, TSH every 6 months",
  },
  {
    id: "drug-guanfacine",
    name: "Guanfacine ER (Intuniv)",
    genericName: "guanfacine hydrochloride ER",
    defaultStrength: "2 mg",
    availableStrengths: ["1 mg", "2 mg", "3 mg", "4 mg"],
    defaultForm: "Extended-Release Tablet",
    forms: ["Extended-Release Tablet (24hr)"],
    defaultRoute: "Oral",
    defaultFrequency: "Nightly at bedtime",
    frequencies: ["Nightly at bedtime", "Once daily in morning"],
    defaultSig: "Take 1 tablet (2 mg) by mouth nightly at bedtime. Do not crush or chew.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 3,
    deaSchedule: "None",
    category: "Alpha-2 Agonist",
    contraindications: ["Severe bradycardia", "Hypotension"],
    monitoringRequired: "Blood Pressure & Pulse every 3 months",
  },
  {
    id: "drug-methylphenidate",
    name: "Methylphenidate ER (Concerta)",
    genericName: "methylphenidate hydrochloride ER",
    defaultStrength: "36 mg",
    availableStrengths: ["18 mg", "27 mg", "36 mg", "54 mg"],
    defaultForm: "Extended-Release Tablet (OROS)",
    forms: ["Extended-Release Tablet (OROS)"],
    defaultRoute: "Oral",
    defaultFrequency: "Once daily in morning",
    frequencies: ["Once daily in morning"],
    defaultSig: "Take 1 tablet (36 mg) by mouth once daily in the morning with a full glass of water. EPCS Controlled Substance.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 0, // DEA C-II rule: zero refills permitted
    deaSchedule: "C-II",
    category: "Stimulant",
    contraindications: ["Marked anxiety/agitation", "Glaucoma", "Tourette syndrome/tics", "MAOI within 14 days"],
    monitoringRequired: "Blood pressure, heart rate, weight",
  },
  {
    id: "drug-clonazepam",
    name: "Clonazepam (Klonopin)",
    genericName: "clonazepam",
    defaultStrength: "0.5 mg",
    availableStrengths: ["0.25 mg", "0.5 mg", "1 mg", "2 mg"],
    defaultForm: "Tablet",
    forms: ["Tablet", "Orally Disintegrating Tablet (ODT)"],
    defaultRoute: "Oral",
    defaultFrequency: "PRN as needed for acute panic",
    frequencies: ["PRN as needed for acute panic", "Twice daily as directed"],
    defaultSig: "Take 1 tablet (0.5 mg) by mouth as needed for severe panic episodes. Maximum 2 per day. EPCS Controlled Substance.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 1,
    deaSchedule: "C-IV",
    category: "Benzodiazepine",
    contraindications: ["Acute narrow-angle glaucoma", "Severe respiratory impairment", "Concurrent high-dose opioids"],
    monitoringRequired: "Sedation, dependence risk, PDMP surveillance",
  },
  {
    id: "drug-buspirone",
    name: "Buspirone (Buspar)",
    genericName: "buspirone hydrochloride",
    defaultStrength: "10 mg",
    availableStrengths: ["5 mg", "7.5 mg", "10 mg", "15 mg", "30 mg"],
    defaultForm: "Dividose Tablet",
    forms: ["Dividose Tablet"],
    defaultRoute: "Oral",
    defaultFrequency: "Twice daily with meals",
    frequencies: ["Twice daily with meals", "Three times daily"],
    defaultSig: "Take 1 tablet (10 mg) by mouth twice daily with consistent meal timing.",
    defaultQuantity: 60,
    defaultDaysSupply: 30,
    defaultRefills: 3,
    deaSchedule: "None",
    category: "Anxiolytic / Non-Benzo",
    contraindications: ["Severe hepatic or renal impairment", "MAOI within 14 days"],
  },
  {
    id: "drug-hydroxyzine",
    name: "Hydroxyzine Pamoate (Vistaril)",
    genericName: "hydroxyzine pamoate",
    defaultStrength: "25 mg",
    availableStrengths: ["25 mg", "50 mg"],
    defaultForm: "Capsule",
    forms: ["Capsule"],
    defaultRoute: "Oral",
    defaultFrequency: "PRN as needed for breakthrough anxiety",
    frequencies: ["PRN as needed for breakthrough anxiety", "Nightly for sleep"],
    defaultSig: "Take 1 capsule (25 mg) by mouth every 6 to 8 hours as needed for acute anxiety or insomnia.",
    defaultQuantity: 30,
    defaultDaysSupply: 30,
    defaultRefills: 2,
    deaSchedule: "None",
    category: "Anxiolytic / Non-Benzo",
    contraindications: ["Prolonged QT interval", "Early pregnancy"],
  },
];

// Curated Psychiatric & Diagnostic Laboratory Test Catalog
export const psychiatricLabCatalog: LabCatalogItem[] = [
  {
    id: "lab-fasting-metabolic",
    testName: "Fasting Lipid Panel & HbA1c",
    loincCode: "24331-1 / 4548-4",
    specimen: "Blood (Serum/Plasma)",
    defaultPriority: "Protocol Surveillance",
    fastingRequired: true,
    category: "Metabolic",
    clinicalIndications: ["Atypical Antipsychotic Surveillance", "Metabolic Syndrome Screen", "Weight/Lipid Baseline"],
    description: "Total cholesterol, HDL, LDL, Triglycerides, and Glycated Hemoglobin (HbA1c). Required annually for patients on Quetiapine, Olanzapine, or Risperidone.",
  },
  {
    id: "lab-cmp",
    testName: "Comprehensive Metabolic Panel (CMP)",
    loincCode: "24323-8",
    specimen: "Blood (Serum/Plasma)",
    defaultPriority: "Routine",
    fastingRequired: false,
    category: "Metabolic",
    clinicalIndications: ["Hepatorenal Baseline", "Mood Stabilizer Monitoring", "Electrolyte Balance"],
    description: "14 clinical measurements including Sodium, Potassium, BUN, Creatinine, eGFR, AST, ALT, Total Bilirubin, and Alkaline Phosphatase.",
  },
  {
    id: "lab-lithium-tsh",
    testName: "Serum Lithium Level & Thyroid Stimulating Hormone (TSH)",
    loincCode: "14338-8 / 3016-3",
    specimen: "Blood (Serum)",
    defaultPriority: "Protocol Surveillance",
    fastingRequired: false,
    category: "Therapeutic Drug Monitoring",
    clinicalIndications: ["Lithium Therapeutic Monitoring", "Hypothyroidism Surveillance", "Narrow Therapeutic Index Check"],
    description: "Serum lithium trough drawn 12 hours post-dose plus TSH to detect drug-induced thyroid or renal dysfunction.",
  },
  {
    id: "lab-cbc",
    testName: "Complete Blood Count with Differential (CBC with Diff)",
    loincCode: "58410-2",
    specimen: "Blood (Whole Blood EDTA)",
    defaultPriority: "Routine",
    fastingRequired: false,
    category: "Hematology",
    clinicalIndications: ["Baseline Psychotropic Workup", "Agranulocytosis Screening", "Anemia / Fatigue Rule-Out"],
    description: "WBC count, differential, RBC, Hemoglobin, Hematocrit, and Platelet count.",
  },
  {
    id: "lab-tsh-ft4",
    testName: "Thyroid Panel (TSH & Free T4)",
    loincCode: "3016-3 / 3024-7",
    specimen: "Blood (Serum)",
    defaultPriority: "Routine",
    fastingRequired: false,
    category: "Endocrine / Thyroid",
    clinicalIndications: ["Depression Etiology Workup", "Anxiety Rule-Out", "Rapid Cycling Surveillance"],
    description: "High-sensitivity TSH and Free Thyroxine (FT4) to rule out endocrine drivers of affective symptoms.",
  },
  {
    id: "lab-uds-12",
    testName: "Urine Drug Screen & Toxicology (12-Panel with Confirmation)",
    loincCode: "19295-5",
    specimen: "Urine (Clean Catch)",
    defaultPriority: "Routine",
    fastingRequired: false,
    category: "Toxicology",
    clinicalIndications: ["Controlled Substance Protocol (EPCS)", "ADHD Stimulant Baseline", "Differential Diagnosis"],
    description: "Screening for Amphetamines, Barbiturates, Benzodiazepines, Cannabinoids, Cocaine, Methadone, Opiates, Oxycodone, Phencyclidine, and Fentanyl.",
  },
  {
    id: "lab-ecg",
    testName: "12-Lead Electrocardiogram (ECG / EKG)",
    loincCode: "11524-6",
    specimen: "In-Clinic Diagnostic Procedure",
    defaultPriority: "Routine",
    fastingRequired: false,
    category: "Cardiovascular",
    clinicalIndications: ["Baseline QTc Measurement", "Antipsychotic Safety", "Tricyclic Monitoring"],
    description: "Standard 12-lead rhythm recording with automated and manual QTc interval calculation.",
  },
];

// Initial Staged Orders Fixture per Patient
// Jordan Reed has 2 overdue metabolic surveillance orders staged for fast one-click clinician sign-off
export const initialStagedOrders: Record<string, ClinicalOrder[]> = {
  "jordan-reed": [
    {
      id: "ord-jr-lab-1",
      patientId: "jordan-reed",
      type: "lab",
      testName: "Fasting Lipid Panel & HbA1c",
      loincCode: "24331-1 / 4548-4",
      specimen: "Blood (Serum/Plasma)",
      priority: "Protocol Surveillance",
      fastingRequired: true,
      clinicalRationale: "Annual metabolic surveillance for Quetiapine (Seroquel). Prior fasting labs from June 2025 are overdue (>365 days elapsed).",
      indication: "F31.9 - Bipolar disorder, unspecified / Quetiapine surveillance",
      targetFacility: "Quest Diagnostics",
      status: "staged",
      orderedBy: "Dr. Logan Carton, MD",
      createdAt: "Sep 5, 2026",
    },
    {
      id: "ord-jr-lab-2",
      patientId: "jordan-reed",
      type: "lab",
      testName: "Comprehensive Metabolic Panel (CMP)",
      loincCode: "24323-8",
      specimen: "Blood (Serum/Plasma)",
      priority: "Routine",
      fastingRequired: false,
      clinicalRationale: "Periodic hepatic and renal function surveillance for Lamotrigine maintenance therapy.",
      indication: "F31.9 - Bipolar disorder, unspecified",
      targetFacility: "Quest Diagnostics",
      status: "staged",
      orderedBy: "Dr. Logan Carton, MD",
      createdAt: "Sep 5, 2026",
    },
  ],
  "maya-chen": [],
  "sofia-martinez": [],
};

// Past Transmitted Orders History per Patient
export const initialTransmittedOrders: Record<string, ClinicalOrder[]> = {
  "maya-chen": [
    {
      id: "ord-mc-rx-1",
      patientId: "maya-chen",
      type: "medication",
      medication: "Guanfacine ER 2 mg",
      genericName: "guanfacine hydrochloride ER",
      strength: "2 mg",
      form: "Extended-Release Tablet",
      route: "Oral",
      frequency: "Nightly at bedtime",
      sig: "Take 1 tablet (2 mg) by mouth nightly at bedtime.",
      dispenseQuantity: 30,
      daysSupply: 30,
      refills: 3,
      substitutionAllowed: true,
      indication: "F90.2 - ADHD, combined presentation",
      deaSchedule: "None",
      requiresEpcs: false,
      pharmacy: standardPharmacies[0],
      status: "transmitted",
      prescribedBy: "Dr. Logan Carton, MD",
      createdAt: "Aug 12, 2026",
      transmittedAt: "Aug 12, 2026 · 11:14 AM",
      transmissionId: "NCPDP-TX-948201",
      transmissionVendor: "Surescripts NCPDP SCRIPT v2017071",
    },
  ],
  "jordan-reed": [],
  "sofia-martinez": [
    {
      id: "ord-sm-rx-1",
      patientId: "sofia-martinez",
      type: "medication",
      medication: "Fluoxetine 30 mg",
      genericName: "fluoxetine hydrochloride",
      strength: "30 mg",
      form: "Capsule",
      route: "Oral",
      frequency: "Once daily in morning",
      sig: "Take 1 capsule (30 mg) by mouth once daily in morning with breakfast.",
      dispenseQuantity: 30,
      daysSupply: 30,
      refills: 2,
      substitutionAllowed: true,
      indication: "F33.1 - Major depressive disorder, recurrent, moderate",
      deaSchedule: "None",
      requiresEpcs: false,
      pharmacy: standardPharmacies[1],
      status: "transmitted",
      prescribedBy: "Dr. Logan Carton, MD",
      createdAt: "Jul 29, 2026",
      transmittedAt: "Jul 29, 2026 · 03:45 PM",
      transmissionId: "NCPDP-TX-883019",
      transmissionVendor: "Surescripts NCPDP SCRIPT v2017071",
    },
  ],
};
