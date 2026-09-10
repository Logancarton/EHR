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

/**
 * Mental status exam, by dimension. Selecting replaces that dimension only.
 *
 * This group carries the most weight of anything here, because the MSE is
 * *observed* rather than spoken. It is almost never in a transcript, so an ambient
 * scribe structurally cannot produce it — it is the clinician's own examination and
 * these are the phrasings that examination gets written in.
 *
 * Movement findings live inside the behaviour options as whole phrasings rather than
 * as a separate control: extrapyramidal effects and tremor matter enough in
 * psychopharmacology to be one click, not two. Nothing here is a rating scale — a
 * documented tremor is not an AIMS score, and the options say so where it matters.
 */
export const MSE_VOCABULARY: Record<string, NoteVocabularyGroup> = {
  appearance: {
    id: "appearance",
    label: "Appearance",
    options: [
      { label: "Well-groomed", text: "Well-groomed, dressed appropriately for weather and setting." },
      { label: "Casual", text: "Casually dressed, adequately groomed, appears stated age." },
      { label: "Neat and appropriate", text: "Neatly dressed and appropriately groomed. In no acute distress." },
      { label: "Meticulous", text: "Meticulously groomed, notably careful and precise presentation." },
      { label: "Mildly unkempt", text: "Mildly unkempt relative to prior visits; grooming somewhat below baseline." },
      { label: "Disheveled", text: "Disheveled, grooming below baseline." },
      { label: "Poor hygiene", text: "Poor hygiene evident, with neglected self-care." },
      { label: "Dressed inappropriately", text: "Dressed inappropriately for the weather and setting." },
      { label: "Appears older", text: "Appears older than stated age." },
      { label: "Appears younger", text: "Appears younger than stated age." },
      { label: "Apparent weight change", text: "Apparent change in weight since the prior visit; discussed and addressed in the plan." },
      { label: "Video — limited view", text: "Seen by video; appearance assessable only from the shoulders up." },
    ],
  },
  behavior: {
    id: "behavior",
    label: "Behavior",
    options: [
      { label: "Cooperative", text: "Calm and cooperative, good eye contact, no psychomotor abnormality." },
      { label: "Engaged", text: "Engaged and forthcoming, rapport easily established, good eye contact." },
      { label: "Restless", text: "Restless, increased psychomotor activity, difficulty remaining seated." },
      { label: "Fidgety, redirectable", text: "Fidgety but readily redirectable; no sustained psychomotor agitation." },
      { label: "Psychomotor slowing", text: "Psychomotor slowing, delayed initiation of movement and response." },
      { label: "Guarded", text: "Guarded, limited eye contact, reticent to elaborate." },
      { label: "Withdrawn", text: "Withdrawn, minimal spontaneous engagement, poor eye contact." },
      { label: "Irritable in session", text: "Irritable during the interview with low frustration tolerance; redirectable." },
      { label: "Tearful", text: "Tearful at points during the interview, consolable, able to continue." },
      { label: "Intrusive / hyperactive", text: "Hyperactive and intrusive, difficult to interrupt or redirect." },
      { label: "No abnormal movements", text: "Cooperative. No tremor, rigidity, dyskinesia, or abnormal involuntary movements observed." },
      { label: "Tremor observed", text: "Cooperative, with a fine postural tremor observed in the upper extremities." },
      { label: "Akathisia", text: "Cooperative, with subjective and observed restlessness consistent with akathisia; addressed in the plan." },
      // Deliberately does not stand in for a rating scale: observing dyskinetic
      // movements is the start of an AIMS assessment, not a substitute for one.
      { label: "Dyskinetic movements", text: "Cooperative, with abnormal involuntary movements observed; formal AIMS assessment indicated." },
      { label: "Rigidity / bradykinesia", text: "Cooperative, with cogwheel rigidity and bradykinesia observed; addressed in the plan." },
    ],
  },
  speech: {
    id: "speech",
    label: "Speech",
    options: [
      { label: "Normal", text: "Normal rate, rhythm, volume, and prosody." },
      { label: "Pressured", text: "Pressured, increased rate and volume, difficult to interrupt." },
      { label: "Rapid but interruptible", text: "Increased rate but interruptible; not frankly pressured." },
      { label: "Slowed", text: "Slowed rate with increased latency of response." },
      { label: "Soft", text: "Soft volume, decreased spontaneity." },
      { label: "Loud", text: "Increased volume throughout, without pressure of speech." },
      { label: "Monotone", text: "Reduced prosody with a monotone quality." },
      { label: "Sparse", text: "Sparse and monosyllabic; answers largely limited to direct questions." },
      { label: "Verbose", text: "Verbose and over-inclusive, requiring redirection to complete the interview." },
      { label: "Slurred / dysarthric", text: "Slurred and mildly dysarthric; medication effect considered and addressed in the plan." },
      { label: "Word-finding pauses", text: "Hesitant with word-finding pauses; no frank aphasia." },
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
      { label: "Anxious & dysphoric", text: 'Mood described as both "anxious" and "low"; affect anxious and dysphoric, congruent.' },
      { label: "Labile", text: "Mood variable through the interview; affect labile, shifting rapidly between states." },
      { label: "Blunted", text: "Affect blunted, with markedly reduced intensity of emotional expression." },
      { label: "Flat", text: "Affect flat, with virtually no expressive range." },
      { label: "Constricted but reactive", text: "Affect constricted in range but reactive to content." },
      { label: "Reactive despite low mood", text: 'Mood "low"; affect dysphoric but reactive, brightening appropriately in context.' },
      { label: "Incongruent", text: "Affect incongruent with stated mood and with the content discussed." },
      { label: "Improved from last visit", text: "Mood improved relative to the prior visit; affect brighter and wider in range." },
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
      { label: "Flight of ideas", text: "Flight of ideas with rapid shifts between loosely connected topics." },
      { label: "Racing but followable", text: "Subjectively racing thoughts; process remains followable." },
      { label: "Perseverative", text: "Perseverative, returning repeatedly to the same themes despite redirection." },
      { label: "Thought blocking", text: "Intermittent thought blocking with abrupt interruption of the train of thought." },
      { label: "Impoverished", text: "Impoverished thought with slowed, sparse production." },
      { label: "Concrete", text: "Concrete, with limited capacity for abstraction during the interview." },
    ],
  },
  thoughtContent: {
    id: "thoughtContent",
    label: "Thought content",
    options: [
      { label: "No SI/HI/psychosis", text: "No suicidal or homicidal ideation. No delusions or perceptual disturbance." },
      { label: "Passive SI, no plan", text: "Passive suicidal ideation without plan, intent, or means. No homicidal ideation. No psychosis." },
      // Active ideation points at the risk assessment rather than standing alone.
      // Documenting it properly means plan, intent, means, protective factors, and
      // disposition; a one-click MSE line must not look like that work is done.
      { label: "Active SI — see risk", text: "Active suicidal ideation elicited. Plan, intent, means, protective factors, and disposition documented in the Risk Assessment section." },
      { label: "HI — see risk", text: "Homicidal ideation elicited. Target, plan, means, and disposition documented in the Risk Assessment section." },
      { label: "Self-harm without SI", text: "Reports non-suicidal self-injury. Denies suicidal intent. Addressed in the Risk Assessment section." },
      { label: "Ruminative", text: "Ruminative worry without suicidal or homicidal ideation. No psychosis." },
      { label: "Obsessional", text: "Obsessional content without suicidal or homicidal ideation. No psychosis." },
      { label: "Somatic preoccupation", text: "Preoccupied with somatic concerns. No suicidal or homicidal ideation. No psychosis." },
      { label: "Guilt / worthlessness", text: "Themes of guilt and worthlessness. Denies suicidal or homicidal ideation. No psychosis." },
      { label: "Paranoid ideation", text: "Paranoid ideation described, non-systematised. Denies suicidal or homicidal ideation." },
      { label: "Delusional content", text: "Delusional content elicited as described in the assessment. Denies suicidal or homicidal ideation." },
      { label: "Auditory hallucinations", text: "Reports auditory hallucinations. Denies command quality. Denies suicidal or homicidal ideation." },
      { label: "Visual hallucinations", text: "Reports visual hallucinations. Denies suicidal or homicidal ideation." },
      { label: "No perceptual disturbance", text: "Denies hallucinations in any modality. No delusional content elicited." },
    ],
  },
  cognition: {
    id: "cognition",
    label: "Cognition",
    options: [
      { label: "Intact", text: "Alert and oriented x3. Attention, concentration, and memory grossly intact." },
      { label: "Oriented x4", text: "Alert and oriented to person, place, time, and situation. Cognition grossly intact." },
      { label: "Impaired attention", text: "Alert and oriented x3. Attention and concentration impaired; memory grossly intact." },
      { label: "Distractible", text: "Alert and oriented x3. Notably distractible, requiring repetition of questions." },
      { label: "Short-term memory concern", text: "Alert and oriented x3. Reports short-term memory difficulty; formal testing indicated." },
      { label: "Slowed processing", text: "Alert and oriented x3. Processing speed slowed; comprehension preserved." },
      { label: "Concrete", text: "Alert and oriented x3. Thinking concrete, with limited abstraction." },
      { label: "Screening performed", text: "Alert and oriented x3. Cognitive screening performed this visit; score and interpretation documented in the assessment." },
      { label: "Not formally tested", text: "Alert and oriented x3. Formal cognitive testing not performed this visit." },
    ],
  },
  insightJudgment: {
    id: "insightJudgment",
    label: "Insight & judgment",
    options: [
      { label: "Good / good", text: "Insight good; judgment good." },
      { label: "Good / fair", text: "Insight good; judgment fair." },
      { label: "Fair / fair", text: "Insight fair; judgment fair." },
      { label: "Fair / good", text: "Insight fair; judgment good." },
      { label: "Limited / fair", text: "Insight limited; judgment fair and adequate for safety." },
      { label: "Limited / impaired", text: "Insight limited; judgment impaired." },
      { label: "Poor / poor", text: "Insight poor; judgment poor, with implications for adherence and safety addressed in the plan." },
      { label: "Good into illness", text: "Good insight into the illness and its treatment; judgment intact regarding medication and safety." },
      { label: "Limited into illness only", text: "Limited insight into the illness, though judgment regarding day-to-day safety remains intact." },
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
