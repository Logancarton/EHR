/**
 * The structured vocabulary the note document offers.
 *
 * Every section supports three ways in at once: dictate or scribe into it, pick from
 * these categories, or just type. The dropdowns are shortcuts to the phrasing a
 * psychiatrist writes anyway, never a constraint — each one inserts editable text
 * into the section and the clinician can then change every word of it.
 *
 * These are drafting conveniences, not a coded terminology. Nothing here is a
 * billing code, a diagnosis code, or a governed clinical vocabulary, and selecting
 * one asserts nothing beyond the words it puts in the note.
 */

export type NoteVocabularyOption = {
  label: string;
  /** The text inserted into the section. Editable the moment it lands. */
  text: string;
};

export type NoteVocabularyGroup = {
  id: string;
  label: string;
  options: NoteVocabularyOption[];
};

/** Mental status exam, by dimension. Selecting replaces that dimension only. */
export const MSE_VOCABULARY: Record<string, NoteVocabularyGroup> = {
  appearance: {
    id: "appearance",
    label: "Appearance",
    options: [
      { label: "Well-groomed", text: "Well-groomed, dressed appropriately for weather and setting." },
      { label: "Casual", text: "Casually dressed, adequately groomed, appears stated age." },
      { label: "Disheveled", text: "Disheveled, grooming below baseline." },
      { label: "Meticulous", text: "Meticulously groomed, notably careful presentation." },
    ],
  },
  behavior: {
    id: "behavior",
    label: "Behavior",
    options: [
      { label: "Cooperative", text: "Calm and cooperative, good eye contact, no psychomotor abnormality." },
      { label: "Restless", text: "Restless, increased psychomotor activity, difficulty remaining seated." },
      { label: "Guarded", text: "Guarded, limited eye contact, reticent to elaborate." },
      { label: "Psychomotor slowing", text: "Psychomotor slowing, delayed initiation of movement and response." },
    ],
  },
  speech: {
    id: "speech",
    label: "Speech",
    options: [
      { label: "Normal", text: "Normal rate, rhythm, volume, and prosody." },
      { label: "Pressured", text: "Pressured, increased rate and volume, difficult to interrupt." },
      { label: "Slowed", text: "Slowed rate with increased latency of response." },
      { label: "Soft", text: "Soft volume, decreased spontaneity." },
    ],
  },
  moodAffect: {
    id: "moodAffect",
    label: "Mood & affect",
    options: [
      { label: "Euthymic", text: 'Mood "good"; affect euthymic, full range, congruent.' },
      { label: "Depressed", text: 'Mood "down"; affect dysphoric, constricted range, congruent.' },
      { label: "Anxious", text: 'Mood "on edge"; affect anxious, mildly constricted, congruent.' },
      { label: "Elevated", text: 'Mood "great"; affect elevated and expansive, congruent.' },
      { label: "Irritable", text: 'Mood "irritable"; affect labile with low frustration tolerance.' },
    ],
  },
  thoughtProcess: {
    id: "thoughtProcess",
    label: "Thought process",
    options: [
      { label: "Linear", text: "Linear, logical, and goal-directed." },
      { label: "Circumstantial", text: "Circumstantial, eventually returns to the point with redirection." },
      { label: "Tangential", text: "Tangential, requires frequent redirection to maintain topic." },
      { label: "Disorganized", text: "Disorganized with loosening of associations." },
    ],
  },
  thoughtContent: {
    id: "thoughtContent",
    label: "Thought content",
    options: [
      { label: "No SI/HI/psychosis", text: "No suicidal or homicidal ideation. No delusions or perceptual disturbance." },
      { label: "Passive SI, no plan", text: "Passive suicidal ideation without plan, intent, or means. No homicidal ideation. No psychosis." },
      { label: "Ruminative", text: "Ruminative worry without suicidal or homicidal ideation. No psychosis." },
      { label: "Obsessional", text: "Obsessional content without suicidal or homicidal ideation. No psychosis." },
    ],
  },
  cognition: {
    id: "cognition",
    label: "Cognition",
    options: [
      { label: "Intact", text: "Alert and oriented x3. Attention, concentration, and memory grossly intact." },
      { label: "Impaired attention", text: "Alert and oriented x3. Attention and concentration impaired; memory grossly intact." },
      { label: "Not formally tested", text: "Alert and oriented x3. Formal cognitive testing not performed this visit." },
    ],
  },
  insightJudgment: {
    id: "insightJudgment",
    label: "Insight & judgment",
    options: [
      { label: "Good / good", text: "Insight good; judgment good." },
      { label: "Fair / fair", text: "Insight fair; judgment fair." },
      { label: "Limited / impaired", text: "Insight limited; judgment impaired." },
    ],
  },
};

/**
 * Risk documentation. Deliberately phrased as what was assessed and observed —
 * selecting a category never asserts a level of risk on the clinician's behalf, and
 * the text is fully editable before it reaches the signed record.
 */
export const RISK_VOCABULARY: NoteVocabularyGroup = {
  id: "risk",
  label: "Risk assessment",
  options: [
    {
      label: "No SI/HI, no acute risk",
      text: "Denies suicidal and homicidal ideation, intent, and plan. No access to lethal means reported. No acute safety concerns identified this visit. Discussed reasons for living and crisis resources.",
    },
    {
      label: "Passive SI, no plan/intent",
      text: "Reports passive suicidal ideation without plan, intent, or preparatory behaviour. Denies homicidal ideation. Means restriction discussed. Protective factors identified. Safety plan reviewed and agreed.",
    },
    {
      label: "Chronic risk, currently stable",
      text: "Chronic elevated risk in the context of history, currently without acute change. Denies current intent or plan. Safety plan reviewed. Continue current level of care with close follow-up.",
    },
    {
      label: "Acute risk — escalation documented",
      text: "Acute risk identified this visit. Assessment, protective factors, means restriction, and disposition discussed and documented. Level of care escalated as described in the plan.",
    },
  ],
};

export const FOLLOW_UP_VOCABULARY: NoteVocabularyGroup = {
  id: "followUp",
  label: "Follow-up interval",
  options: [
    { label: "1 week", text: "Return in 1 week." },
    { label: "2 weeks", text: "Return in 2 weeks." },
    { label: "4 weeks", text: "Return in 4 weeks." },
    { label: "6 weeks", text: "Return in 6 weeks." },
    { label: "3 months", text: "Return in 3 months." },
    { label: "Sooner if needed", text: "Return in 4 weeks, sooner if symptoms worsen or side effects emerge." },
  ],
};

/** Applied to the free-text narrative sections as starting phrasing. */
export const SECTION_VOCABULARY: Record<string, NoteVocabularyGroup> = {
  chiefComplaint: {
    id: "chiefComplaint",
    label: "Chief complaint",
    options: [
      { label: "Medication follow-up", text: "Routine psychiatric medication management follow-up." },
      { label: "Symptom re-evaluation", text: "Re-evaluation of ongoing symptoms and current treatment response." },
      { label: "Titration visit", text: "Follow-up for medication titration and tolerability review." },
      { label: "Side effect concern", text: "Presenting with concern regarding medication side effects." },
    ],
  },
  treatmentResponse: {
    id: "treatmentResponse",
    label: "Treatment response",
    options: [
      { label: "Good response", text: "Reports meaningful benefit from the current regimen with improved daily function." },
      { label: "Partial response", text: "Reports partial benefit; residual symptoms continue to affect function." },
      { label: "No response", text: "Reports no appreciable benefit from the current regimen at this dose and duration." },
      { label: "Response with side effects", text: "Reports symptomatic benefit limited by side-effect burden." },
    ],
  },
  sideEffects: {
    id: "sideEffects",
    label: "Side effects",
    options: [
      { label: "None reported", text: "Denies side effects on direct questioning across sedation, appetite, GI, sexual, and motor domains." },
      { label: "Mild, tolerable", text: "Reports mild side effects that are tolerable and not limiting adherence." },
      { label: "Limiting adherence", text: "Reports side effects significant enough to affect adherence; discussed adjustment options." },
    ],
  },
};
