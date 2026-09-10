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
 * Review of symptoms, by category.
 *
 * This is the other half of what a transcript cannot give you. The scribe writes
 * what was *said*; a review of symptoms is mostly what was *asked* — the pertinent
 * negatives that never survive into flowing narrative because nobody narrates "and
 * she denied panic attacks." So every category leads with its negative, because that
 * is the line most often needed and least often dictated.
 *
 * Unlike the MSE, these append rather than replace: a review of symptoms accumulates
 * across categories into one paragraph, and picking from a second category must not
 * wipe out the first.
 */
export const ROS_VOCABULARY: Record<string, NoteVocabularyGroup> = {
  mood: {
    id: "mood",
    label: "Mood",
    options: [
      { label: "Denies depressive symptoms", text: "Denies depressed mood, anhedonia, hopelessness, or worthlessness." },
      { label: "Depressed mood", text: "Reports depressed mood most of the day, more days than not." },
      { label: "Anhedonia", text: "Reports loss of interest or pleasure in usual activities." },
      { label: "Hopelessness", text: "Reports hopelessness about the future." },
      { label: "Guilt / worthlessness", text: "Reports excessive guilt and feelings of worthlessness." },
      { label: "Low energy", text: "Reports low energy and fatigue through most of the day." },
      { label: "Poor concentration", text: "Reports difficulty concentrating and indecisiveness." },
      { label: "Tearfulness", text: "Reports increased tearfulness." },
      { label: "Improved since last visit", text: "Reports mood improved since the prior visit." },
    ],
  },
  anxiety: {
    id: "anxiety",
    label: "Anxiety",
    options: [
      { label: "Denies anxiety symptoms", text: "Denies excessive worry, panic attacks, and avoidance behaviour." },
      { label: "Generalized worry", text: "Reports excessive worry across multiple domains, difficult to control." },
      { label: "Panic attacks", text: "Reports discrete panic attacks with abrupt onset and physical symptoms." },
      { label: "Denies panic", text: "Denies discrete panic attacks." },
      { label: "Physical symptoms", text: "Reports palpitations, chest tightness, and shortness of breath with anxiety." },
      { label: "Avoidance", text: "Reports avoidance of situations that provoke anxiety." },
      { label: "Social anxiety", text: "Reports anxiety in social and performance situations with fear of scrutiny." },
      { label: "Anticipatory anxiety", text: "Reports anticipatory anxiety between episodes." },
      { label: "Improved since last visit", text: "Reports anxiety improved since the prior visit." },
    ],
  },
  mania: {
    id: "mania",
    label: "Manic / hypomanic",
    options: [
      { label: "Denies manic symptoms", text: "Denies elevated or expansive mood, decreased need for sleep, racing thoughts, impulsivity, and increased goal-directed activity." },
      { label: "Elevated mood", text: "Reports periods of elevated or expansive mood distinct from usual self." },
      { label: "Decreased need for sleep", text: "Reports decreased need for sleep with preserved energy the following day." },
      { label: "Increased activity", text: "Reports increased goal-directed activity and productivity." },
      { label: "Racing thoughts", text: "Reports racing thoughts." },
      { label: "Impulsivity", text: "Reports impulsive decision-making out of keeping with baseline." },
      { label: "Increased spending", text: "Reports increased spending during these periods." },
      { label: "Irritable activation", text: "Reports irritable rather than euphoric activation." },
    ],
  },
  psychosis: {
    id: "psychosis",
    label: "Psychosis",
    options: [
      { label: "Denies psychotic symptoms", text: "Denies hallucinations in any modality, paranoia, and ideas of reference." },
      { label: "Auditory hallucinations", text: "Reports auditory hallucinations." },
      { label: "Visual hallucinations", text: "Reports visual hallucinations." },
      { label: "Denies command quality", text: "Denies command hallucinations." },
      { label: "Paranoia", text: "Reports suspiciousness and paranoid ideation." },
      { label: "Ideas of reference", text: "Reports ideas of reference." },
      { label: "Thought interference", text: "Reports thought insertion, withdrawal, or broadcasting." },
      { label: "Disorganization per collateral", text: "Collateral reports disorganized speech or behaviour between visits." },
    ],
  },
  trauma: {
    id: "trauma",
    label: "Trauma",
    options: [
      { label: "Denies trauma symptoms", text: "Denies intrusive memories, nightmares, avoidance, and hypervigilance." },
      { label: "Intrusive memories", text: "Reports intrusive memories of the traumatic event." },
      { label: "Nightmares", text: "Reports trauma-related nightmares." },
      { label: "Flashbacks", text: "Reports flashbacks with a sense of re-experiencing." },
      { label: "Avoidance", text: "Reports avoidance of reminders of the traumatic event." },
      { label: "Hypervigilance", text: "Reports hypervigilance and exaggerated startle response." },
      { label: "Dissociation", text: "Reports dissociative episodes." },
      { label: "Negative mood / cognition", text: "Reports persistent negative beliefs about self and others since the event." },
    ],
  },
  obsessive: {
    id: "obsessive",
    label: "Obsessive-compulsive",
    options: [
      { label: "Denies OCD symptoms", text: "Denies intrusive obsessions and compulsive rituals." },
      { label: "Intrusive obsessions", text: "Reports intrusive, unwanted, distressing thoughts recognised as their own." },
      { label: "Compulsions", text: "Reports compulsive rituals performed to reduce distress." },
      { label: "Time burden", text: "Reports rituals consuming more than an hour daily." },
      { label: "Reassurance seeking", text: "Reports repeated reassurance seeking." },
      { label: "Checking", text: "Reports repetitive checking behaviour." },
      { label: "Improved since last visit", text: "Reports obsessive-compulsive symptoms improved since the prior visit." },
    ],
  },
  attention: {
    id: "attention",
    label: "Attention & executive",
    options: [
      { label: "Denies attention symptoms", text: "Denies inattention, distractibility, and disorganization beyond baseline." },
      { label: "Inattention", text: "Reports difficulty sustaining attention and frequent distractibility." },
      { label: "Task initiation", text: "Reports difficulty initiating tasks and persistent procrastination." },
      { label: "Disorganization", text: "Reports disorganization with materials, time, and planning." },
      { label: "Forgetfulness", text: "Reports forgetfulness in daily activities." },
      { label: "Hyperactivity", text: "Reports internal restlessness and difficulty remaining settled." },
      { label: "Impulsivity", text: "Reports interrupting others and acting without forethought." },
      { label: "Late-day rebound", text: "Reports return of symptoms in the late afternoon as coverage wears off." },
      { label: "Improved on treatment", text: "Reports attention and executive function improved on the current regimen." },
    ],
  },
  sleep: {
    id: "sleep",
    label: "Sleep",
    options: [
      { label: "Sleep adequate", text: "Reports adequate, restorative sleep with no initiation or maintenance difficulty." },
      { label: "Initial insomnia", text: "Reports difficulty falling asleep with prolonged sleep onset latency." },
      { label: "Middle insomnia", text: "Reports nocturnal awakenings with difficulty returning to sleep." },
      { label: "Early morning awakening", text: "Reports early morning awakening before the intended time." },
      { label: "Hypersomnia", text: "Reports excessive sleep and difficulty waking." },
      { label: "Non-restorative", text: "Reports adequate sleep duration that is not restorative." },
      { label: "Nightmares", text: "Reports frequent distressing dreams." },
      { label: "Snoring / apnea concern", text: "Reports snoring and witnessed pauses in breathing; sleep study considered." },
      { label: "Irregular schedule", text: "Reports an irregular and shifting sleep schedule." },
      { label: "Improved since last visit", text: "Reports sleep improved since the prior visit." },
    ],
  },
  appetite: {
    id: "appetite",
    label: "Appetite & weight",
    options: [
      { label: "Appetite and weight stable", text: "Reports stable appetite and weight." },
      { label: "Decreased appetite", text: "Reports decreased appetite." },
      { label: "Increased appetite", text: "Reports increased appetite and carbohydrate cravings." },
      { label: "Weight gain", text: "Reports weight gain since the prior visit; monitoring discussed." },
      { label: "Weight loss", text: "Reports weight loss since the prior visit; monitoring discussed." },
      { label: "Binge episodes", text: "Reports episodes of eating a large amount with a sense of loss of control." },
      { label: "Restriction", text: "Reports restricting intake." },
      { label: "Denies disordered eating", text: "Denies bingeing, restriction, and compensatory behaviours." },
    ],
  },
  substance: {
    id: "substance",
    label: "Substance use",
    options: [
      { label: "Denies all substance use", text: "Denies alcohol, cannabis, nicotine, stimulant, and opioid use." },
      { label: "Alcohol", text: "Reports alcohol use; quantity and frequency documented in the assessment." },
      { label: "Denies alcohol", text: "Denies alcohol use since the prior visit." },
      { label: "Cannabis", text: "Reports cannabis use; quantity and frequency documented in the assessment." },
      { label: "Nicotine / vaping", text: "Reports nicotine use." },
      { label: "Stimulants", text: "Reports non-prescribed stimulant use." },
      { label: "Opioids", text: "Reports non-prescribed opioid use." },
      { label: "Caffeine", text: "Reports significant daily caffeine intake." },
      { label: "Denies injection use", text: "Denies any injection drug use." },
      { label: "Reduced since last visit", text: "Reports reduced substance use since the prior visit." },
    ],
  },
  somatic: {
    id: "somatic",
    label: "Somatic & neurologic",
    options: [
      { label: "Denies somatic complaints", text: "Denies headache, dizziness, palpitations, tremor, and gastrointestinal upset." },
      { label: "Headache", text: "Reports headache." },
      { label: "Dizziness", text: "Reports dizziness or lightheadedness, including on standing." },
      { label: "Palpitations", text: "Reports palpitations." },
      { label: "GI upset", text: "Reports nausea or gastrointestinal upset." },
      { label: "Dry mouth / constipation", text: "Reports dry mouth and constipation." },
      { label: "Sexual side effects", text: "Reports sexual side effects on direct questioning." },
      { label: "Tremor", text: "Reports tremor." },
      { label: "Daytime sedation", text: "Reports daytime sedation." },
      { label: "Sweating", text: "Reports increased sweating." },
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
