// Domain dictionary for psychiatric speech recognition, candidate extraction, and clinical grammar

export interface PsychiatricMedicationInfo {
  generic: string;
  brand: string;
  class: "SSRI" | "SNRI" | "Atypical Antipsychotic" | "Mood Stabilizer" | "Stimulant" | "Alpha-2 Agonist" | "Anxiolytic" | "SARI";
  standardDoses: string[];
  titrationRules: string;
  monitoringLab?: string;
  isControlled: boolean;
  schedule?: "C-II" | "C-IV";
}

export const PSYCHIATRIC_MEDICATIONS: PsychiatricMedicationInfo[] = [
  {
    generic: "guanfacine ER",
    brand: "Intuniv",
    class: "Alpha-2 Agonist",
    standardDoses: ["1 mg", "2 mg", "3 mg", "4 mg"],
    titrationRules: "Titrate by 1 mg weekly at bedtime; monitor blood pressure and pulse.",
    isControlled: false,
  },
  {
    generic: "lisdexamfetamine",
    brand: "Vyvanse",
    class: "Stimulant",
    standardDoses: ["20 mg", "30 mg", "40 mg", "50 mg", "60 mg", "70 mg"],
    titrationRules: "Titrate by 10-20 mg weekly in morning; monitor BP, HR, appetite.",
    isControlled: true,
    schedule: "C-II",
  },
  {
    generic: "methylphenidate ER",
    brand: "Concerta",
    class: "Stimulant",
    standardDoses: ["18 mg", "27 mg", "36 mg", "54 mg"],
    titrationRules: "Titrate by 18 mg weekly in morning.",
    isControlled: true,
    schedule: "C-II",
  },
  {
    generic: "sertraline",
    brand: "Zoloft",
    class: "SSRI",
    standardDoses: ["25 mg", "50 mg", "100 mg", "150 mg", "200 mg"],
    titrationRules: "Titrate by 25-50 mg every 1-2 weeks in morning with food.",
    isControlled: false,
  },
  {
    generic: "escitalopram",
    brand: "Lexapro",
    class: "SSRI",
    standardDoses: ["5 mg", "10 mg", "15 mg", "20 mg"],
    titrationRules: "Titrate by 5-10 mg after 1-2 weeks.",
    isControlled: false,
  },
  {
    generic: "fluoxetine",
    brand: "Prozac",
    class: "SSRI",
    standardDoses: ["10 mg", "20 mg", "40 mg", "60 mg"],
    titrationRules: "Titrate by 20 mg after 2-4 weeks given long half-life.",
    isControlled: false,
  },
  {
    generic: "quetiapine",
    brand: "Seroquel",
    class: "Atypical Antipsychotic",
    standardDoses: ["25 mg", "50 mg", "100 mg", "200 mg", "300 mg", "400 mg"],
    titrationRules: "Titrate by 25-50 mg nightly; monitor metabolic labs, sedation.",
    monitoringLab: "Fasting Lipid Panel & HbA1c",
    isControlled: false,
  },
  {
    generic: "aripiprazole",
    brand: "Abilify",
    class: "Atypical Antipsychotic",
    standardDoses: ["2 mg", "5 mg", "10 mg", "15 mg", "20 mg", "30 mg"],
    titrationRules: "Titrate by 2-5 mg every 2 weeks; monitor for akathisia.",
    monitoringLab: "Fasting Lipid Panel & HbA1c",
    isControlled: false,
  },
  {
    generic: "lamotrigine",
    brand: "Lamictal",
    class: "Mood Stabilizer",
    standardDoses: ["25 mg", "50 mg", "100 mg", "150 mg", "200 mg"],
    titrationRules: "Strict titration: 25 mg daily x 2 wks, 50 mg daily x 2 wks, 100 mg daily x 1 wk; counsel on Stevens-Johnson syndrome rash.",
    monitoringLab: "Comprehensive Metabolic Panel (CMP) & LFTs",
    isControlled: false,
  },
  {
    generic: "lithium carbonate",
    brand: "Lithobid",
    class: "Mood Stabilizer",
    standardDoses: ["300 mg", "600 mg", "900 mg", "1200 mg"],
    titrationRules: "Titrate by 300 mg every 5-7 days guided by 12-hr trough level (target 0.6-1.0 mEq/L).",
    monitoringLab: "Serum Lithium Level, TSH, Renal Panel (BUN/Cr)",
    isControlled: false,
  },
  {
    generic: "bupropion XL",
    brand: "Wellbutrin XL",
    class: "SNRI",
    standardDoses: ["150 mg", "300 mg", "450 mg"],
    titrationRules: "Initiate 150 mg morning x 4 days, then 300 mg morning; contraindicated in eating/seizure disorders.",
    isControlled: false,
  },
  {
    generic: "clonazepam",
    brand: "Klonopin",
    class: "Anxiolytic",
    standardDoses: ["0.25 mg", "0.5 mg", "1 mg", "2 mg"],
    titrationRules: "Use lowest effective dose; taper gradually by 0.25 mg every 1-2 weeks.",
    isControlled: true,
    schedule: "C-IV",
  },
  {
    generic: "trazodone",
    brand: "Desyrel",
    class: "SARI",
    standardDoses: ["25 mg", "50 mg", "100 mg"],
    titrationRules: "Take 25-50 mg nightly at bedtime for sleep onset latency.",
    isControlled: false,
  },
];

export interface Dsm5DiagnosticInfo {
  code: string;
  name: string;
  category: string;
  keywords: string[];
  keyCriteria: string[];
}

export const DSM5_DIAGNOSES: Dsm5DiagnosticInfo[] = [
  {
    code: "F90.2",
    name: "Attention-Deficit/Hyperactivity Disorder, Combined Presentation",
    category: "Neurodevelopmental Disorders",
    keywords: ["adhd", "inattention", "hyperactivity", "impulsivity", "executive dysfunction", "focus", "distractibility", "organization"],
    keyCriteria: ["6+ inattentive and 6+ hyperactive-impulsive symptoms lasting at least 6 months across 2+ settings."],
  },
  {
    code: "F90.0",
    name: "Attention-Deficit/Hyperactivity Disorder, Predominantly Inattentive",
    category: "Neurodevelopmental Disorders",
    keywords: ["inattentive", "spacing out", "forgetful", "procrastination", "disorganized", "vanderbilt"],
    keyCriteria: ["6+ inattentive symptoms, under 6 hyperactive symptoms."],
  },
  {
    code: "F33.1",
    name: "Major Depressive Disorder, Recurrent, Moderate",
    category: "Depressive Disorders",
    keywords: ["depression", "depressed", "anhedonia", "hopeless", "low energy", "fatigue", "phq-9", "sleep disturbance"],
    keyCriteria: ["2+ distinct major depressive episodes with depressed mood/anhedonia + 4 other SIGECAPS symptoms for 2+ weeks."],
  },
  {
    code: "F31.30",
    name: "Bipolar I Disorder, Current Episode Depressed, Without Psychotic Features",
    category: "Bipolar and Related Disorders",
    keywords: ["bipolar", "hypomania", "mania", "mood swings", "elevated mood", "flight of ideas", "depressive episode"],
    keyCriteria: ["History of at least 1 lifetime manic episode; currently meeting criteria for major depressive episode."],
  },
  {
    code: "F41.1",
    name: "Generalized Anxiety Disorder",
    category: "Anxiety Disorders",
    keywords: ["anxiety", "generalized anxiety", "worry", "gad-7", "muscle tension", "restlessness", "racing thoughts"],
    keyCriteria: ["Excessive anxiety and worry occurring more days than not for at least 6 months about multiple events."],
  },
  {
    code: "F43.10",
    name: "Post-Traumatic Stress Disorder",
    category: "Trauma- and Stressor-Related Disorders",
    keywords: ["ptsd", "trauma", "nightmares", "flashbacks", "hyperarousal", "avoidance", "intrusion"],
    keyCriteria: ["Exposure to traumatic event followed by intrusive memories, avoidance, negative mood/cognitions, and arousal > 1 month."],
  },
];

// Real-time phonetic and acoustic replacement table for speech recognition
export const ASR_PHONETIC_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  // Medications
  { pattern: /\b(sarah\s*quinn|sarah\s*quel|serra\s*quell|sero\s*quill)\b/gi, replacement: "Seroquel" },
  { pattern: /\b(lemon\s*tree\s*jean|la\s*mick\s*tall|lamicktal|la\s*mictal)\b/gi, replacement: "Lamictal" },
  { pattern: /\b(ab\s*ability|ab\s*ill\s*if\s*i|abbilify)\b/gi, replacement: "Abilify" },
  { pattern: /\b(well\s*butane|well\s*be\s*trend|well\s*bu\s*prin)\b/gi, replacement: "Wellbutrin" },
  { pattern: /\b(pro\s*sack|pro\s*zak)\b/gi, replacement: "Prozac" },
  { pattern: /\b(vie\s*vance|van\s*vance|vi\s*vance|vy\s*vans)\b/gi, replacement: "Vyvanse" },
  { pattern: /\b(guan\s*face\s*seen|guan\s*fat\s*scene|guan\s*fa\s*seen)\b/gi, replacement: "Guanfacine" },
  { pattern: /\b(in\s*two\s*if|in\s*to\s*if)\b/gi, replacement: "Intuniv" },
  { pattern: /\b(clo\s*na\s*zap\s*pam|clo\s*no\s*pin)\b/gi, replacement: "Clonazepam" },
  { pattern: /\b(litho\s*bid|lithium\s*car\s*bow\s*nate)\b/gi, replacement: "Lithobid" },
  { pattern: /\b(sir\s*tra\s*lean|sir\s*tra\s*line)\b/gi, replacement: "Sertraline" },
  { pattern: /\b(es\s*sigh\s*tallow\s*pram|lex\s*a\s*pro)\b/gi, replacement: "Lexapro" },
  { pattern: /\b(con\s*sir\s*tah|con\s*cer\s*ta)\b/gi, replacement: "Concerta" },

  // Clinical & MSE Terms
  { pattern: /\b(a\s*cat\s*the\s*sia|aka\s*the\s*sia|a\s*kath\s*i\s*sia)\b/gi, replacement: "akathisia" },
  { pattern: /\b(and\s*he\s*donia|an\s*he\s*doe\s*nia)\b/gi, replacement: "anhedonia" },
  { pattern: /\b(dis\s*thigh\s*mia|dis\s*thymia)\b/gi, replacement: "dysthymia" },
  { pattern: /\b(you\s*thigh\s*mick|u\s*thymic|eu\s*thigh\s*mic)\b/gi, replacement: "euthymic" },
  { pattern: /\b(sig\s*e\s*caps|sig\s*caps)\b/gi, replacement: "SIGECAPS" },
  { pattern: /\b(stevens\s*johnson|steven\s*johnson\s*syndrome|sjs)\b/gi, replacement: "Stevens-Johnson syndrome" },
  { pattern: /\b(vander\s*built|van\s*der\s*bilt)\b/gi, replacement: "Vanderbilt" },
];

export function correctSpeechTranscript(text: string): string {
  if (!text) return "";
  let corrected = text;
  for (const { pattern, replacement } of ASR_PHONETIC_REPLACEMENTS) {
    corrected = corrected.replace(pattern, replacement);
  }
  return corrected;
}
