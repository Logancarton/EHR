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

const STORAGE_PREFIX = "ehr-encounter-draft-v1-";

export function createInitialEncounter(patientId: string, visitType = "Psychiatric Follow-Up"): EncounterState {
  const scenario = ambientScenarios[patientId];
  return {
    patientId,
    encounterId: `enc-${patientId}-${Date.now().toString().slice(-6)}`,
    date: "Sep 4, 2026",
    visitType,
    status: "draft",
    chiefComplaint: scenario?.synthesizedNote.chiefComplaint || "Scheduled psychiatric follow-up and medication review.",
    intervalHistory: "",
    treatmentResponse: "",
    sideEffects: "",
    mse: { ...defaultMse },
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
    return {
      ...createInitialEncounter(patientId),
      ...parsed,
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
