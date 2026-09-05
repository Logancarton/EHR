// Encounter Lifecycle & Ambient AI Scribing Engine
// Synthetic clinical models, ambient psychiatric scenarios, and draft persistence

export type MentalStatusExam = {
  appearance: string;
  behavior: string;
  speech: string;
  moodAffect: string;
  thoughtProcess: string;
  thoughtContent: string;
  cognition: string;
  insightJudgment: string;
};

export type CandidateAction = {
  id: string;
  type: "medication-titration" | "lab-order" | "diagnosis" | "referral";
  title: string;
  detail: string;
  status: "suggested" | "accepted" | "dismissed";
  provenanceSnippet: string; // The exact quote from transcript that triggered this
  rationale: string;
};

export type TranscriptUtterance = {
  id: string;
  speaker: "clinician" | "patient";
  speakerName: string;
  text: string;
  timestamp: string;
};

export type EncounterStatus = "draft" | "review" | "signed";

export type EncounterState = {
  patientId: string;
  encounterId: string;
  date: string;
  visitType: string;
  status: EncounterStatus;
  selectedTemplateId?: string;
  psychotherapyMinutes?: number;
  chiefComplaint: string;
  intervalHistory: string;
  treatmentResponse: string;
  sideEffects: string;
  mse: MentalStatusExam;
  assessment: string;
  plan: string;
  candidateActions: CandidateAction[];
  ambientTranscript: TranscriptUtterance[];
  signedAt?: string;
  signedBy?: string;
  npi?: string;
  lastAutosavedAt?: string;
};

export type AmbientScenario = {
  id: string;
  patientId: string;
  title: string;
  description: string;
  visitType: string;
  utterances: TranscriptUtterance[];
  synthesizedNote: {
    chiefComplaint: string;
    intervalHistory: string;
    treatmentResponse: string;
    sideEffects: string;
    mse: MentalStatusExam;
    assessment: string;
    plan: string;
    candidateActions: CandidateAction[];
  };
};

export const defaultMse: MentalStatusExam = {
  appearance: "Well-groomed, dressed appropriately for weather and setting.",
  behavior: "Cooperative, calm, maintains appropriate eye contact.",
  speech: "Normal rate, rhythm, and volume. Non-pressured.",
  moodAffect: "Mood described as 'stable, slightly anxious at times'; affect full and congruent.",
  thoughtProcess: "Linear, goal-directed, coherent. No looseness of associations.",
  thoughtContent: "No evidence of delusions, hallucinations, suicidal ideation, or homicidal ideation.",
  cognition: "Alert and oriented x4. Attention and concentration intact during exam.",
  insightJudgment: "Good insight into condition; judgment intact regarding pharmacotherapy and safety.",
};

// Synthetic clinical scenarios simulating ambient psychiatric dialogues
export const ambientScenarios: Record<string, AmbientScenario> = {
  "maya-chen": {
    id: "sc-maya-1",
    patientId: "maya-chen",
    title: "Maya Chen · ADHD Follow-up & Guanfacine Titration",
    description: "Follow-up evaluating Guanfacine ER 2mg sleep onset latency and residual 4 PM executive dysfunction.",
    visitType: "Psychiatric Follow-Up",
    utterances: [
      {
        id: "u-1",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "Good morning, Maya. Great to see you again. How have things been going since we started the Guanfacine ER at 2 milligrams nightly?",
        timestamp: "10:31 AM",
      },
      {
        id: "u-2",
        speaker: "patient",
        speakerName: "Maya Chen",
        text: "Hi Dr. Carton. It's actually been a noticeable improvement for my sleep. My sleep onset latency is down from an hour and a half to about 25 minutes. I'm not tossing and turning with racing thoughts nearly as much.",
        timestamp: "10:32 AM",
      },
      {
        id: "u-3",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "That's a very encouraging response on the delayed sleep phase. Any morning grogginess or daytime sedation from the Guanfacine?",
        timestamp: "10:32 AM",
      },
      {
        id: "u-4",
        speaker: "patient",
        speakerName: "Maya Chen",
        text: "A little bit of dry mouth in the morning, but zero morning hangover. The main issue is around 3:30 or 4:00 PM at work, my mental stamina drops off and I get overwhelmed with executive task switching.",
        timestamp: "10:33 AM",
      },
      {
        id: "u-5",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "I see. And how has your anxiety been on the Sertraline 100 milligrams daily? Any panic surges or heart palpitations?",
        timestamp: "10:34 AM",
      },
      {
        id: "u-6",
        speaker: "patient",
        speakerName: "Maya Chen",
        text: "No panic attacks at all. Sertraline has kept the baseline worry manageable. It's really just the late afternoon ADHD focus and task paralysis.",
        timestamp: "10:34 AM",
      },
      {
        id: "u-7",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "Given your excellent tolerance of Guanfacine 2mg and persistent late-day executive fatigue, we can consider titrating Guanfacine ER to 3mg nightly at bedtime. Your sitting blood pressure today is 116/74 with a pulse of 68, which is completely stable.",
        timestamp: "10:35 AM",
      },
      {
        id: "u-8",
        speaker: "patient",
        speakerName: "Maya Chen",
        text: "That sounds like a great next step. Should I keep taking it right before bed?",
        timestamp: "10:36 AM",
      },
      {
        id: "u-9",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "Yes, continue taking it with a light snack 30 minutes before sleep. We will maintain Sertraline 100mg in the morning, and re-check executive rating scales and blood pressure in 4 weeks.",
        timestamp: "10:36 AM",
      },
    ],
    synthesizedNote: {
      chiefComplaint: "ADHD executive fatigue in late afternoons and follow-up on Guanfacine ER 2mg sleep response.",
      intervalHistory: "Patient is a 34yo female established for treatment of ADHD (combined) and GAD, presenting for scheduled follow-up. Reports notable clinical response since initiating Guanfacine ER 2mg at bedtime: sleep onset latency decreased from ~90 minutes to ~25 minutes with reduction in nocturnal racing thoughts. Tolerating well without morning sedation. Notes residual executive fatigue and task-switching difficulties beginning mid-to-late afternoon (3:30-4:00 PM). Baseline GAD symptoms remain stable on Sertraline 100mg daily with no panic episodes.",
      treatmentResponse: "Marked benefit in evening sensory settling and sleep latency on Guanfacine ER 2mg. Sertraline 100mg maintains panic prophylaxis.",
      sideEffects: "Reports mild morning dry mouth; denies orthostatic lightheadedness, daytime sedation, or sexual side effects.",
      mse: {
        appearance: "Well-groomed, casual professional attire, appears stated age.",
        behavior: "Calm, engaged, cooperative, excellent eye contact throughout interview.",
        speech: "Clear, normal rate, volume, and modulation. No pressure of speech.",
        moodAffect: "Mood: 'Good, feeling optimistic about sleep.' Affect: Full range, congruent, warm.",
        thoughtProcess: "Logical, linear, goal-directed without tangentiality or circumstantiality.",
        thoughtContent: "No suicidal or homicidal ideation, intent, or plan. Denies auditory/visual hallucinations or paranoia.",
        cognition: "Alert and fully oriented x4. Working memory and recall intact during cognitive screening.",
        insightJudgment: "Good insight into ADHD coping mechanisms; excellent judgment and treatment adherence.",
      },
      assessment: "1. Attention-deficit hyperactivity disorder, combined presentation (F90.2): Positive response to non-stimulant alpha-2 agonist with room for optimization on executive stamina.\n2. Generalized anxiety disorder (F41.1): Well-controlled on current SSRI maintenance therapy.\n3. Sitting BP 116/74 mmHg, HR 68 bpm — within ideal physiological parameters for alpha-2 titration.",
      plan: "1. Titrate Guanfacine ER from 2 mg to 3 mg orally nightly at bedtime with a light snack.\n2. Maintain Sertraline 100 mg orally every morning.\n3. Advised on hydration and avoiding abrupt discontinuation.\n4. Follow-up appointment scheduled in 4 weeks for repeat blood pressure check and executive function review.",
      candidateActions: [
        {
          id: "act-maya-1",
          type: "medication-titration",
          title: "Titrate Guanfacine ER to 3 mg nightly",
          detail: "Increase from 2 mg to 3 mg PO QHS for ADHD executive support and delayed sleep phase.",
          status: "suggested",
          provenanceSnippet: "Given your excellent tolerance of Guanfacine 2mg and persistent late-day executive fatigue, we can consider titrating Guanfacine ER to 3mg nightly at bedtime.",
          rationale: "Targeting residual 4 PM executive dysfunction following successful sleep onset response.",
        },
        {
          id: "act-maya-2",
          type: "referral",
          title: "Executive Function Coaching Protocol",
          detail: "Provide digital habit-stacking worksheets for mid-day work transitions.",
          status: "suggested",
          provenanceSnippet: "The main issue is around 3:30 or 4:00 PM at work, my mental stamina drops off and I get overwhelmed with executive task switching.",
          rationale: "Non-pharmacological structural support for afternoon work transitions.",
        },
      ],
    },
  },
  "jordan-reed": {
    id: "sc-jordan-1",
    patientId: "jordan-reed",
    title: "Jordan Reed · Mood Stabilization & Metabolic Surveillance",
    description: "Follow-up for Bipolar maintenance, Quetiapine sedation, 6lb weight change, and overdue fasting metabolic labs.",
    visitType: "Psychiatric Follow-Up",
    utterances: [
      {
        id: "uj-1",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "Hello Jordan. Thanks for coming in today. How have your mood and energy levels been tracking over the past month?",
        timestamp: "04:31 PM",
      },
      {
        id: "uj-2",
        speaker: "patient",
        speakerName: "Jordan Reed",
        text: "Hi Dr. Carton. Mood has been pretty even—no severe depressive dips or irritable hypomanic spikes on the Lamotrigine 150. Sleep is solid with Quetiapine 100 at bedtime, getting about 7.5 hours.",
        timestamp: "04:32 PM",
      },
      {
        id: "uj-3",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "That stability is key. Any signs of rash, mouth sores, or flu-like symptoms on the Lamotrigine?",
        timestamp: "04:32 PM",
      },
      {
        id: "uj-4",
        speaker: "patient",
        speakerName: "Jordan Reed",
        text: "No skin rashes at all. Skin is clear. But I did notice on my home scale that I'm up about 6 pounds since winter, and I get intense late-night carbohydrate cravings about 45 minutes after taking the Quetiapine.",
        timestamp: "04:33 PM",
      },
      {
        id: "uj-5",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "That is a very common metabolic effect with Quetiapine due to antihistaminic and 5-HT2C receptor activity. Looking at your chart, your annual fasting metabolic panel—specifically fasting lipids and HbA1c—is currently overdue by protocol.",
        timestamp: "04:34 PM",
      },
      {
        id: "uj-6",
        speaker: "patient",
        speakerName: "Jordan Reed",
        text: "Yeah, I missed the lab slip last year with work travel. Can we get those ordered today so I can go to Quest this week?",
        timestamp: "04:35 PM",
      },
      {
        id: "uj-7",
        speaker: "clinician",
        speakerName: "Dr. Logan Carton",
        text: "Absolutely. I will place the orders for Fasting Lipid Panel, HbA1c, and a routine CMP right now. For the late-night cravings, let's have you take Quetiapine right as you turn off the lights rather than sitting up watching television.",
        timestamp: "04:36 PM",
      },
      {
        id: "uj-8",
        speaker: "patient",
        speakerName: "Jordan Reed",
        text: "Understood. That makes a lot of sense so I fall asleep before the cravings hit.",
        timestamp: "04:36 PM",
      },
    ],
    synthesizedNote: {
      chiefComplaint: "Routine mood stability check, Quetiapine late-night cravings, and overdue metabolic laboratory surveillance.",
      intervalHistory: "Patient is a 39yo male with unspecified mood disorder maintained on Lamotrigine 150mg daily and Quetiapine 100mg nightly. Reports stable euthymic mood over preceding 4 weeks with absence of depressive deceleration or hypomanic agitation. Sleep efficiency preserved at ~7.5 hours per night. Reports 6 lb weight gain over the past 8 months accompanied by prominent post-dose carbohydrate cravings ~45 minutes after Quetiapine ingestion. Patient is agreeable to immediate metabolic lab surveillance.",
      treatmentResponse: "Mood euthymic on Lamotrigine 150mg. Sleep well-maintained on Quetiapine 100mg.",
      sideEffects: "Late-night hyperphagia/cravings secondary to Quetiapine. No cutaneous rash, mucosal lesions, or cognitive dulling.",
      mse: {
        appearance: "Appropriately dressed, casually groomed.",
        behavior: "Calm, engaged, maintains natural reciprocal rapport.",
        speech: "Regular rate, normal prosody and volume.",
        moodAffect: "Mood: 'Stable and even.' Affect: Broad, appropriate, euthymic.",
        thoughtProcess: "Linear, logical, goal-directed. No tangentiality.",
        thoughtContent: "Denies SI/HI. No paranoid delusions or perceptual disturbances.",
        cognition: "Intact attention, concentration, and remote memory.",
        insightJudgment: "Excellent insight regarding mood maintenance and metabolic risk.",
      },
      assessment: "1. Unspecified mood disorder (F31.9): Stable in partial remission on combination Lamotrigine/Quetiapine.\n2. Quetiapine-associated weight gain and nocturnal hyperphagia.\n3. Protocol surveillance: Annual Fasting Lipid Panel and HbA1c overdue by 446 days.",
      plan: "1. Continue Lamotrigine 150 mg PO daily in morning.\n2. Continue Quetiapine 100 mg PO nightly at bedtime; instructed to take immediately prior to lights-out to bypass hyperphagia window.\n3. Order overdue metabolic surveillance labs: Fasting Lipid Panel, HbA1c, and Comprehensive Metabolic Panel (CMP) via Quest Diagnostics.\n4. Return for follow-up in 6 weeks to review metabolic results and weight trajectory.",
      candidateActions: [
        {
          id: "act-jordan-1",
          type: "lab-order",
          title: "Order Fasting Lipid Panel & HbA1c",
          detail: "Quest LOINC 24331-1 & 4548-4 to monitor metabolic parameters during atypical antipsychotic therapy.",
          status: "suggested",
          provenanceSnippet: "Looking at your chart, your annual fasting metabolic panel—specifically fasting lipids and HbA1c—is currently overdue by protocol.",
          rationale: "Standard psychiatric surveillance protocol for Quetiapine pharmacotherapy.",
        },
        {
          id: "act-jordan-2",
          type: "lab-order",
          title: "Order Comprehensive Metabolic Panel (CMP)",
          detail: "Baseline hepatic and renal electrolyte assessment.",
          status: "suggested",
          provenanceSnippet: "I will place the orders for Fasting Lipid Panel, HbA1c, and a routine CMP right now.",
          rationale: "Periodic organ function surveillance alongside anticonvulsant mood stabilizers.",
        },
      ],
    },
  },
};

// Note Template Presets & Clickable Chips
export type NoteTemplate = {
  id: string;
  name: string;
  category: "followup" | "intake" | "psychotherapy" | "refill";
  badge: string;
  description: string;
  defaultChiefComplaint: string;
  suggestedCoding: string;
  defaultPsychotherapyMinutes: number;
  defaultMse: MentalStatusExam;
  quickChips: {
    chiefComplaint: string[];
    intervalHistory: string[];
    treatmentResponse: string[];
    sideEffects: string[];
    assessment: string[];
    plan: string[];
  };
};

export const builtInTemplates: NoteTemplate[] = [
  {
    id: "psych-followup-99214",
    name: "Psychiatric Follow-Up & Med Management",
    category: "followup",
    badge: "99214 Moderate MDM",
    description: "Standard outpatient evaluation and management of psychotropic medications, clinical trajectory, and side effects.",
    defaultChiefComplaint: "Routine psychiatric follow-up for medication management and symptom surveillance.",
    suggestedCoding: "99214",
    defaultPsychotherapyMinutes: 0,
    defaultMse: { ...defaultMse },
    quickChips: {
      chiefComplaint: [
        "ADHD medication check",
        "Anxiety symptom review",
        "Sleep onset latency",
        "Mood stability check",
        "Medication side effect review",
        "Post-hospital discharge check",
      ],
      intervalHistory: [
        "Stable on current psychotropic regimen",
        "Notable cognitive and focus improvement",
        "Residual afternoon executive crash (~4 PM)",
        "Workplace stress heightened this month",
        "Delayed sleep phase with racing thoughts",
        "Panic attack frequency reduced to zero",
        "Adherent to daily medication schedule",
      ],
      treatmentResponse: [
        "Sleep latency reduced to < 30 minutes",
        "Daytime task completion improved ~40%",
        "Affect broadly euthymic and stable",
        "Somatic anxiety / palpitations resolved",
        "Sensory overload significantly dialed down",
        "No emergent depressive symptoms",
      ],
      sideEffects: [
        "Denies any adverse psychotropic effects",
        "Mild morning xerostomia (dry mouth)",
        "Zero daytime sedation or grogginess",
        "Mild appetite suppression at noon",
        "Blood pressure and heart rate within limits",
        "Weight remains stable at baseline",
      ],
      assessment: [
        "ADHD, Combined Type (F90.2) - Improving on Alpha-2 agonist",
        "Generalized Anxiety Disorder (F41.1) - In remission on SSRI",
        "Major Depressive Disorder, Recurrent, Moderate (F33.1)",
        "Bipolar II Disorder, Most Recent Hypomanic (F31.81)",
        "Delayed Sleep Phase Syndrome (G47.21)",
      ],
      plan: [
        "Titrate Guanfacine ER to 3mg PO at bedtime",
        "Continue Sertraline 100mg PO daily with breakfast",
        "Order Fasting Lipid Panel and HbA1c surveillance",
        "Reinforce sleep hygiene and stimulus control",
        "Safety plan reviewed; patient denies SI/HI",
        "Follow up in psychiatric clinic in 4 weeks",
      ],
    },
  },
  {
    id: "psychotherapy-add-90833",
    name: "Psychotherapy + Medication Management",
    category: "psychotherapy",
    badge: "99214 + 90833 (30m)",
    description: "Integrated psychiatric medical evaluation and management paired with 30-minute concurrent psychotherapy.",
    defaultChiefComplaint: "Scheduled medication check and cognitive-behavioral psychotherapy session.",
    suggestedCoding: "99214 + 90833",
    defaultPsychotherapyMinutes: 30,
    defaultMse: { ...defaultMse },
    quickChips: {
      chiefComplaint: [
        "Med check + 30m CBT psychotherapy",
        "Executive function coaching + medication review",
        "Anxiety cognitive restructuring & med follow-up",
        "Trauma processing & psychopharmacology",
      ],
      intervalHistory: [
        "Explored cognitive reframing of workplace imposter syndrome",
        "Practiced progressive muscle relaxation for panic triggers",
        "Identified catastrophic thought distortions regarding deadlines",
        "Behavioral activation schedule maintained over past 2 weeks",
        "Examined boundary setting in interpersonal relationships",
      ],
      treatmentResponse: [
        "Demonstrated mastery of thought-challenging worksheets",
        "Able to disengage from rumination loops using 5-4-3-2-1 technique",
        "Improved distress tolerance during acute work stressors",
        "Reports feeling heard, validated, and equipped with actionable tools",
      ],
      sideEffects: [
        "Tolerating current pharmacotherapy without complaints",
        "No anticholinergic or extrapyramidal symptoms",
        "Normal sleep architecture maintained",
      ],
      assessment: [
        "Generalized Anxiety Disorder (F41.1) with panic features",
        "ADHD, Predominantly Inattentive (F90.0) with executive burnout",
        "Persistent Depressive Disorder / Dysthymia (F34.1)",
      ],
      plan: [
        "Maintain current medication dosage without change",
        "30 minutes psychotherapy provided: CBT thought log & distress tolerance",
        "Assigned behavioral experiment: test 10m pause before responding to work emails",
        "Next combined psychopharm + therapy session in 2 weeks",
      ],
    },
  },
  {
    id: "comprehensive-intake-90792",
    name: "Comprehensive Psychiatric Diagnostic Evaluation",
    category: "intake",
    badge: "90792 / 99205",
    description: "Comprehensive initial diagnostic evaluation with medical services, full developmental/family history, and 8-dimension MSE.",
    defaultChiefComplaint: "Initial psychiatric evaluation for diagnostic clarification and pharmacotherapy consultation.",
    suggestedCoding: "90792",
    defaultPsychotherapyMinutes: 0,
    defaultMse: { ...defaultMse },
    quickChips: {
      chiefComplaint: [
        "New patient diagnostic psychiatric evaluation",
        "Diagnostic clarification: ADHD vs. Bipolar vs. Unipolar Depression",
        "Refractory anxiety and insomnia consultation",
        "Medication consultation and treatment planning",
      ],
      intervalHistory: [
        "Symptoms onset in late adolescence with progressive impairment",
        "Prior trials of SSRIs with partial efficacy and sexual side effects",
        "Family history positive for major mood disorders and substance use",
        "Denied history of manic episodes, psychosis, or suicide attempts",
        "High functional impairment in occupational and academic settings",
      ],
      treatmentResponse: [
        "Baseline intake evaluation — no prior treatment with this clinic",
        "Prior therapeutic response history reviewed in detail",
      ],
      sideEffects: [
        "Intolerant to stimulant medication in past secondary to palpitations",
        "Allergies to psychotropics: None known",
      ],
      assessment: [
        "Major Depressive Disorder, Single Episode, Moderate (F32.1)",
        "Attention-Deficit/Hyperactivity Disorder, Combined (F90.2)",
        "Rule out Bipolar II Disorder (F31.81)",
        "Rule out Obstructive Sleep Apnea / secondary insomnia",
      ],
      plan: [
        "Initiate Bupropion XL 150mg PO every morning",
        "Order baseline CBC, CMP, TSH, Free T4, Fasting Lipids, Vitamin D",
        "Coordinate collateral records from prior therapist",
        "Administer adult ADHD self-report scale (ASRS-v1.1)",
        "Comprehensive safety plan established; crisis line 988 reviewed",
        "Follow up in 2 weeks for titration and baseline lab review",
      ],
    },
  },
  {
    id: "fast-med-check-99213",
    name: "Fast Medication Refill / Check",
    category: "refill",
    badge: "99213 Low MDM",
    description: "Brief focused follow-up for stable established patients with well-tolerated long-term medication regimens.",
    defaultChiefComplaint: "Routine stable medication refill and tolerability screening.",
    suggestedCoding: "99213",
    defaultPsychotherapyMinutes: 0,
    defaultMse: { ...defaultMse },
    quickChips: {
      chiefComplaint: [
        "Routine stable psych medication refill",
        "Maintenance check for stable mood",
        "Annual controlled substance refill check",
      ],
      intervalHistory: [
        "Mood and attention remain stable on current regimen",
        "No interval psychiatric hospitalizations or emergency visits",
        "Consistent daily medication adherence verified",
        "Employment and interpersonal functioning intact",
      ],
      treatmentResponse: [
        "Maintains full clinical remission on current maintenance dose",
        "Sleep and energy levels consistent with patient's baseline",
      ],
      sideEffects: [
        "Zero side effects or tolerability issues reported",
        "Recent metabolic and vital signs within normal limits",
      ],
      assessment: [
        "Major Depressive Disorder in Full Remission (F33.42)",
        "ADHD, Inattentive Type, well-controlled (F90.0)",
        "Stable established psychiatric maintenance",
      ],
      plan: [
        "Renew maintenance prescription x 90 days with 1 refill",
        "Continue baseline lifestyle and psychotherapy maintenance",
        "Routine follow-up in 3 to 6 months",
      ],
    },
  },
];

// Preference Store for Default Note Template
const TEMPLATE_PREF_KEY = "ehr-provider-template-pref-v1";

export function getSavedTemplatePreference(): string {
  if (typeof window === "undefined") return "psych-followup-99214";
  try {
    return window.localStorage.getItem(TEMPLATE_PREF_KEY) || "psych-followup-99214";
  } catch {
    return "psych-followup-99214";
  }
}

export function saveTemplatePreference(templateId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_PREF_KEY, templateId);
  } catch (err) {
    console.error("Failed to save template preference:", err);
  }
}

// Dynamic AMA/CMS MDM & Psychotherapy Coding Engine
export type MdmLevel = "straightforward" | "low" | "moderate" | "high";

export type EncounterGoal = {
  id: string;
  label: string;
  detail: string;
  met: boolean;
  codeImpact: string;
};

export type CodingRecommendation = {
  primaryCode: "99212" | "99213" | "99214" | "99215";
  primaryTitle: string;
  addonCodes: string[];
  addonTitles: string[];
  mdmLevel: MdmLevel;
  mdmReasoning: string;
  problemsScore: "minimal" | "low" | "moderate" | "high";
  problemsDetail: string;
  dataScore: "minimal" | "moderate" | "high";
  dataDetail: string;
  riskScore: "minimal" | "low" | "moderate" | "high";
  riskDetail: string;
  psychotherapyMinutes: number;
  qualifiesFor99214: boolean;
  qualifiesFor90833: boolean;
  qualifiesFor90836: boolean;
  goals: EncounterGoal[];
  goalsMetCount: number;
  goalsTotalCount: number;
  nextStepRecommendation: string;
};

export function calculateEncounterCoding(
  draft: EncounterState,
  psychotherapyMinutes = 0
): CodingRecommendation {
  // 1. Encounter Goals Evaluation
  const hasHpi = (draft.intervalHistory || "").trim().length >= 15;
  const hasResponse = (draft.treatmentResponse || "").trim().length >= 10;
  const hasSideEffects = (draft.sideEffects || "").trim().length >= 5;
  const hasMseComplete = Boolean(
    draft.mse &&
    draft.mse.appearance &&
    draft.mse.behavior &&
    draft.mse.speech &&
    draft.mse.moodAffect &&
    draft.mse.thoughtProcess &&
    draft.mse.thoughtContent &&
    draft.mse.cognition &&
    draft.mse.insightJudgment
  );

  const textCorpus = `${draft.plan} ${draft.assessment} ${draft.treatmentResponse} ${draft.intervalHistory}`.toLowerCase();

  // Rx Drug Management (titration, continuation, discontinuation, side effect monitoring) = Moderate Risk
  const hasRxManagement =
    textCorpus.includes("titrate") ||
    textCorpus.includes("continue") ||
    textCorpus.includes("mg") ||
    textCorpus.includes("refill") ||
    textCorpus.includes("dose") ||
    textCorpus.includes("guanfacine") ||
    textCorpus.includes("sertraline") ||
    textCorpus.includes("bupropion") ||
    textCorpus.includes("lithium") ||
    textCorpus.includes("medication") ||
    draft.candidateActions.some((a) => a.type === "medication-titration" && a.status === "accepted");

  // Safety & SI explicitly addressed
  const thoughtContentLower = (draft.mse.thoughtContent || "").toLowerCase();
  const hasSafety =
    thoughtContentLower.includes("no si") ||
    thoughtContentLower.includes("denies") ||
    thoughtContentLower.includes("suicid") ||
    thoughtContentLower.includes("safety") ||
    textCorpus.includes("safety plan");

  // Psychotherapy duration >= 16 minutes
  const hasTherapy = psychotherapyMinutes >= 16;

  const goals: EncounterGoal[] = [
    {
      id: "hpi",
      label: "Interval History Documented",
      detail: "Clinical trajectory, recent symptoms, and daily functioning recorded.",
      met: hasHpi,
      codeImpact: "Supports medical necessity for evaluation",
    },
    {
      id: "response",
      label: "Treatment Response Quantified",
      detail: "Sleep latency, focus, and symptom progression evaluated.",
      met: hasResponse,
      codeImpact: "Required for clinical effectiveness monitoring",
    },
    {
      id: "tolerability",
      label: "Adverse Effects Screened",
      detail: "Active screening for adverse reactions, sedation, or metabolic signs.",
      met: hasSideEffects,
      codeImpact: "Essential patient safety requirement",
    },
    {
      id: "mse",
      label: "8-Dimension MSE Complete",
      detail: "Formal psychiatric mental status exam across all 8 dimensions.",
      met: hasMseComplete,
      codeImpact: "Comprehensive psychiatric objective examination",
    },
    {
      id: "rx-management",
      label: "Prescription Drug Management",
      detail: "Medication titration, dose evaluation, or renewal (Moderate Risk).",
      met: hasRxManagement,
      codeImpact: "Satisfies Moderate Risk pillar for 99214",
    },
    {
      id: "safety",
      label: "Safety & Suicidality Assessed",
      detail: "Explicit documentation of suicidal/homicidal ideation status.",
      met: hasSafety,
      codeImpact: "Clinical safety threshold required for all visits",
    },
    {
      id: "psychotherapy",
      label: "Psychotherapy Duration (≥16 min)",
      detail: `Current documented psychotherapy: ${psychotherapyMinutes} min.`,
      met: hasTherapy,
      codeImpact: "Unlocks +90833 (30m) or +90836 (45m) add-on code",
    },
  ];

  const goalsMetCount = goals.filter((g) => g.met).length;

  // 2. MDM Element 1: Problems Addressed
  const assessmentText = (draft.assessment || "").toLowerCase();
  const isHighRiskEmergency =
    assessmentText.includes("acute suicidal") ||
    assessmentText.includes("hospitalization") ||
    assessmentText.includes("crisis intervention") ||
    assessmentText.includes("severe psychosis");

  let problemCount = 0;
  if (assessmentText.includes("adhd")) problemCount++;
  if (assessmentText.includes("anxiety") || assessmentText.includes("gad")) problemCount++;
  if (assessmentText.includes("depress") || assessmentText.includes("mdd")) problemCount++;
  if (assessmentText.includes("bipolar")) problemCount++;
  if (assessmentText.includes("insomnia") || assessmentText.includes("sleep")) problemCount++;
  if (problemCount === 0 && (draft.assessment || "").length > 15) {
    problemCount = Math.max(1, (draft.assessment.match(/•|\n|-/g) || []).length);
  }

  const hasExacerbation =
    textCorpus.includes("exacerbation") ||
    textCorpus.includes("crash") ||
    textCorpus.includes("worsened") ||
    textCorpus.includes("stress") ||
    textCorpus.includes("residual");

  let problemsScore: "minimal" | "low" | "moderate" | "high" = "minimal";
  let problemsDetail = "1 self-limited or minimal problem";

  if (isHighRiskEmergency) {
    problemsScore = "high";
    problemsDetail = "Acute threat to life / safety or severe psychiatric crisis";
  } else if (problemCount >= 2 || (problemCount >= 1 && hasExacerbation)) {
    problemsScore = "moderate";
    problemsDetail =
      problemCount >= 2
        ? `${problemCount} chronic conditions addressed (e.g. ADHD + Anxiety)`
        : "1 chronic condition with mild progression/exacerbation";
  } else if (problemCount === 1) {
    problemsScore = "low";
    problemsDetail = "1 stable chronic illness addressed";
  }

  // 3. MDM Element 2: Data Complexity
  const acceptedActions = draft.candidateActions.filter((a) => a.status === "accepted").length;
  const hasLabReview =
    textCorpus.includes("lab") ||
    textCorpus.includes("lipid") ||
    textCorpus.includes("hba1c") ||
    acceptedActions > 0;

  let dataScore: "minimal" | "moderate" | "high" = "minimal";
  let dataDetail = "Minimal or no diagnostic data reviewed";
  if (acceptedActions >= 2 || (hasLabReview && acceptedActions >= 1)) {
    dataScore = "moderate";
    dataDetail = `Reviewed tests/labs and external candidate actions (${acceptedActions} staged)`;
  }

  // 4. MDM Element 3: Risk of Patient Management
  let riskScore: "minimal" | "low" | "moderate" | "high" = "minimal";
  let riskDetail = "Minimal risk of morbidity from diagnostic testing or treatment";

  if (isHighRiskEmergency) {
    riskScore = "high";
    riskDetail = "Decision regarding hospitalization or immediate crisis intervention";
  } else if (hasRxManagement) {
    riskScore = "moderate";
    riskDetail = "Prescription drug management (dosage titration, side-effect surveillance)";
  } else if (hasHpi) {
    riskScore = "low";
    riskDetail = "Low risk (over-the-counter medication or minor clinical counseling)";
  }

  // 5. Calculate Overall E/M Code (2 of 3 categories rule)
  const scoreToNum = (s: string) => (s === "high" ? 4 : s === "moderate" ? 3 : s === "low" ? 2 : 1);
  const pNum = scoreToNum(problemsScore);
  const dNum = scoreToNum(dataScore);
  const rNum = scoreToNum(riskScore);

  const scoresSorted = [pNum, dNum, rNum].sort((a, b) => b - a);
  const qualifyingNum = scoresSorted[1];

  let primaryCode: "99212" | "99213" | "99214" | "99215" = "99212";
  let primaryTitle = "CPT 99212 · Established Patient Office Visit (Straightforward MDM)";
  let mdmLevel: MdmLevel = "straightforward";

  if (qualifyingNum >= 4) {
    primaryCode = "99215";
    primaryTitle = "CPT 99215 · Established Patient Office Visit (High MDM)";
    mdmLevel = "high";
  } else if (qualifyingNum >= 3) {
    primaryCode = "99214";
    primaryTitle = "CPT 99214 · Established Patient Office Visit (Moderate MDM)";
    mdmLevel = "moderate";
  } else if (qualifyingNum >= 2) {
    primaryCode = "99213";
    primaryTitle = "CPT 99213 · Established Patient Office Visit (Low MDM)";
    mdmLevel = "low";
  }

  // Psychotherapy add-on codes
  const addonCodes: string[] = [];
  const addonTitles: string[] = [];

  const qualifiesFor90833 = psychotherapyMinutes >= 16 && psychotherapyMinutes <= 37;
  const qualifiesFor90836 = psychotherapyMinutes >= 38 && psychotherapyMinutes <= 52;
  const qualifiesFor90838 = psychotherapyMinutes >= 53;

  if (qualifiesFor90833) {
    addonCodes.push("+90833");
    addonTitles.push("+90833 · Psychotherapy Add-on 30 min (with E/M, 16–37m documented)");
  } else if (qualifiesFor90836) {
    addonCodes.push("+90836");
    addonTitles.push("+90836 · Psychotherapy Add-on 45 min (with E/M, 38–52m documented)");
  } else if (qualifiesFor90838) {
    addonCodes.push("+90838");
    addonTitles.push("+90838 · Psychotherapy Add-on 60 min (with E/M, 53+m documented)");
  }

  const qualifiesFor99214 = primaryCode === "99214" || primaryCode === "99215";

  let mdmReasoning = "";
  if (primaryCode === "99214") {
    mdmReasoning = `Qualifies for Moderate MDM (99214): ${problemsDetail} + ${riskDetail}.`;
  } else if (primaryCode === "99213") {
    mdmReasoning = `Qualifies for Low MDM (99213): ${problemsDetail}. Documenting prescription drug management elevates to 99214.`;
  } else if (primaryCode === "99215") {
    mdmReasoning = `Qualifies for High MDM (99215): Severe complexity and acute risk intervention documented.`;
  } else {
    mdmReasoning = `Straightforward visit. Adding problem details or prescription drug management elevates code.`;
  }

  let nextStepRecommendation = "";
  if (primaryCode === "99213") {
    nextStepRecommendation = "To qualify for 99214 (Moderate MDM): Document prescription drug management or add second chronic condition.";
  } else if (primaryCode === "99214" && psychotherapyMinutes === 0) {
    nextStepRecommendation = "To attach +90833 psychotherapy add-on: Document at least 16 minutes of interactive psychotherapy.";
  } else if (primaryCode === "99214" && qualifiesFor90833) {
    nextStepRecommendation = "To unlock +90836 (45 min psychotherapy): Document 38+ minutes of dedicated psychotherapy.";
  } else {
    nextStepRecommendation = "Encounter documentation meets clinical compliance and AMA coding guidelines.";
  }

  return {
    primaryCode,
    primaryTitle,
    addonCodes,
    addonTitles,
    mdmLevel,
    mdmReasoning,
    problemsScore,
    problemsDetail,
    dataScore,
    dataDetail,
    riskScore,
    riskDetail,
    psychotherapyMinutes,
    qualifiesFor99214,
    qualifiesFor90833,
    qualifiesFor90836,
    goals,
    goalsMetCount,
    goalsTotalCount: goals.length,
    nextStepRecommendation,
  };
}

const STORAGE_PREFIX = "ehr-encounter-draft-v1-";

export function createInitialEncounter(patientId: string, visitType = "Psychiatric Follow-Up"): EncounterState {
  const scenario = ambientScenarios[patientId];
  const templateId = getSavedTemplatePreference();
  const template = builtInTemplates.find((t) => t.id === templateId) || builtInTemplates[0];

  return {
    patientId,
    encounterId: `enc-${patientId}-${Date.now().toString().slice(-6)}`,
    date: "Sep 4, 2026",
    visitType,
    status: "draft",
    selectedTemplateId: template.id,
    psychotherapyMinutes: template.defaultPsychotherapyMinutes,
    chiefComplaint: scenario?.synthesizedNote.chiefComplaint || template.defaultChiefComplaint,
    intervalHistory: "",
    treatmentResponse: "",
    sideEffects: "",
    mse: { ...(template.defaultMse || defaultMse) },
    assessment: "",
    plan: "",
    candidateActions: scenario?.synthesizedNote.candidateActions ? [...scenario.synthesizedNote.candidateActions] : [],
    ambientTranscript: [],
    lastAutosavedAt: "Just started",
  };
}

export function loadEncounterDraft(patientId: string): EncounterState {
  if (typeof window === "undefined") return createInitialEncounter(patientId);

  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${patientId}`);
    if (!raw) return createInitialEncounter(patientId);
    const parsed = JSON.parse(raw);
    const initial = createInitialEncounter(patientId);
    return {
      ...initial,
      ...parsed,
      selectedTemplateId: parsed.selectedTemplateId || initial.selectedTemplateId,
      psychotherapyMinutes: parsed.psychotherapyMinutes !== undefined ? parsed.psychotherapyMinutes : initial.psychotherapyMinutes,
      mse: {
        ...defaultMse,
        ...(parsed.mse || {}),
      },
    };
  } catch {
    return createInitialEncounter(patientId);
  }
}

export function saveEncounterDraft(draft: EncounterState): void {
  if (typeof window === "undefined") return;
  try {
    const toSave: EncounterState = {
      ...draft,
      lastAutosavedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
    window.localStorage.setItem(`${STORAGE_PREFIX}${draft.patientId}`, JSON.stringify(toSave));
  } catch (err) {
    console.error("Failed to save encounter draft:", err);
  }
}

export function clearEncounterDraft(patientId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${patientId}`);
  } catch {}
}

export function signEncounterDraft(
  draft: EncounterState,
  providerName = "Dr. Logan Carton, MD",
  npi = "1948201948",
): EncounterState {
  const signed: EncounterState = {
    ...draft,
    status: "signed",
    signedAt: new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    signedBy: providerName,
    npi,
  };
  saveEncounterDraft(signed);
  return signed;
}

