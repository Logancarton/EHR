import type { AssessmentInstrumentType } from "./clinical-measurements";

/**
 * Forms a clinician asks an established patient to complete before a visit:
 * self-report rating scales and consents to sign.
 *
 * A request is carried by a portal invitation (the same single-subject token and
 * date-of-birth check intake uses, D-109) with an explicit list of what was asked
 * for. The patient sees only those items, and a submission can record only those
 * items, so a link sent for a PHQ-9 cannot be used to sign an unrelated consent.
 */
export type RequestedForm =
  | { kind: "assessment"; instrument: RemoteAssessmentInstrument }
  | { kind: "consent"; templateId: string }
  | { kind: "safety-plan" }
  /** A release of information created server-side for this request; never sent by a client. */
  | { kind: "release"; releaseId: string };

/**
 * Scales a patient may complete alone, away from the clinic.
 *
 * C-SSRS is deliberately absent: it is a clinician-administered interview whose
 * positive answers need an immediate response, which an unattended link cannot
 * give. It stays in the visit.
 */
export const REMOTE_ASSESSMENT_INSTRUMENTS = ["phq-9", "gad-7", "asrs-v1.1"] as const;
export type RemoteAssessmentInstrument = (typeof REMOTE_ASSESSMENT_INSTRUMENTS)[number];

export function isRemoteAssessmentInstrument(value: unknown): value is RemoteAssessmentInstrument {
  return (REMOTE_ASSESSMENT_INSTRUMENTS as readonly string[]).includes(value as string);
}

export const REMOTE_ASSESSMENT_LABELS: Record<RemoteAssessmentInstrument, string> = {
  "phq-9": "PHQ-9 (depression)",
  "gad-7": "GAD-7 (anxiety)",
  "asrs-v1.1": "ASRS v1.1 (adult ADHD)",
};

/** Days a form link stays usable when the clinician does not choose. */
export const DEFAULT_FORM_REQUEST_TTL_DAYS = 7;

/**
 * Validates and de-duplicates a requested list. Returns an error message for the
 * first problem, or the clean list. Consent template existence is checked by the
 * caller, which has the template store.
 */
export function normalizeRequestedForms(
  input: unknown,
  options: { allowEmpty?: boolean } = {},
): { items: RequestedForm[] } | { error: string } {
  if (input === undefined && options.allowEmpty) return { items: [] };
  if (!Array.isArray(input) || (input.length === 0 && !options.allowEmpty)) return { error: "Choose at least one form to send." };
  const seen = new Set<string>();
  const items: RequestedForm[] = [];
  for (const raw of input as Array<Record<string, unknown>>) {
    if (raw?.kind === "assessment") {
      if (!isRemoteAssessmentInstrument(raw.instrument)) {
        return { error: `${String(raw.instrument)} cannot be sent for the patient to complete alone.` };
      }
      const key = `assessment:${raw.instrument}`;
      if (!seen.has(key)) items.push({ kind: "assessment", instrument: raw.instrument });
      seen.add(key);
    } else if (raw?.kind === "safety-plan") {
      if (!seen.has("safety-plan")) items.push({ kind: "safety-plan" });
      seen.add("safety-plan");
    } else if (raw?.kind === "consent" && typeof raw.templateId === "string" && raw.templateId.trim()) {
      const key = `consent:${raw.templateId}`;
      if (!seen.has(key)) items.push({ kind: "consent", templateId: raw.templateId.trim() });
      seen.add(key);
    } else {
      return { error: "Each requested form must be a rating scale, a consent or a safety plan." };
    }
  }
  return { items };
}

export function requestedInstruments(items: readonly RequestedForm[]): RemoteAssessmentInstrument[] {
  return items.flatMap((item) => (item.kind === "assessment" ? [item.instrument] : []));
}

export function requestedConsentTemplateIds(items: readonly RequestedForm[]): string[] {
  return items.flatMap((item) => (item.kind === "consent" ? [item.templateId] : []));
}

/**
 * Whether a completed PHQ-9 endorsed item 9 (thoughts of being better off dead or
 * of self-harm). Any non-zero answer is a positive endorsement.
 */
export function phq9Item9Endorsed(
  instrument: AssessmentInstrumentType,
  responses: Record<number | string, number> | undefined,
): boolean {
  if (instrument !== "phq-9" || !responses) return false;
  return Number(responses[9] ?? 0) > 0;
}

export function safetyPlanRequested(items: readonly RequestedForm[] | undefined): boolean {
  return Boolean(items?.some((item) => item.kind === "safety-plan"));
}

export const SAFETY_PLAN_LABEL = "Safety plan (blank, for the patient to fill out)";

/**
 * A blank safety plan the patient fills out on their own, in the widely used
 * six-step structure plus reasons for living. What comes back is the patient's
 * own draft: it is filed for the clinician to review with them, never treated as
 * a reviewed plan.
 */
export const SAFETY_PLAN_SECTIONS = [
  {
    id: "warningSigns",
    title: "My warning signs",
    prompt: "Thoughts, feelings, situations or behaviors that tell me a crisis may be starting.",
  },
  {
    id: "copingStrategies",
    title: "Things I can do on my own",
    prompt: "Ways to take my mind off things without contacting anyone, like a walk, music or a shower.",
  },
  {
    id: "distractions",
    title: "People and places that help me feel better",
    prompt: "People I can spend time with, and places I can go, that take my mind off things.",
  },
  {
    id: "helpContacts",
    title: "People I can ask for help",
    prompt: "Names and phone numbers of people I trust to call when I need help.",
  },
  {
    id: "professionalContacts",
    title: "Professionals and services I can contact",
    prompt: "My clinician, after-hours numbers and my nearest emergency department. The 988 Suicide & Crisis Lifeline is always available.",
  },
  {
    id: "safeEnvironment",
    title: "Making my surroundings safer",
    prompt: "Steps that keep me safe, like storing medications, firearms or other things I could use to hurt myself somewhere else or with someone else.",
  },
  {
    id: "reasonsForLiving",
    title: "What matters most to me",
    prompt: "My reasons for living and the things worth staying safe for.",
  },
] as const;

export type SafetyPlanSectionId = (typeof SAFETY_PLAN_SECTIONS)[number]["id"];
export type SafetyPlanAnswers = Partial<Record<SafetyPlanSectionId, string>>;

/** Answers trimmed to known sections; empty when the patient wrote nothing. */
export function cleanSafetyPlanAnswers(input: unknown): SafetyPlanAnswers {
  const answers: SafetyPlanAnswers = {};
  if (!input || typeof input !== "object") return answers;
  for (const section of SAFETY_PLAN_SECTIONS) {
    const value = (input as Record<string, unknown>)[section.id];
    if (typeof value === "string" && value.trim()) answers[section.id] = value.trim().slice(0, 4000);
  }
  return answers;
}

/** The plan as the plain text filed in Documents. */
export function safetyPlanDocumentText(answers: SafetyPlanAnswers, completedOn: string): string {
  return safetyPlanText(answers, [
    `Safety plan written by the patient on ${completedOn} through a forms link.`,
    "Patient draft: not yet reviewed with a clinician.",
  ]);
}

/** A plan the clinician has gone over with the patient and finalized. */
export function reviewedSafetyPlanText(answers: SafetyPlanAnswers, reviewedOn: string, clinician: string): string {
  return safetyPlanText(answers, [`Safety plan reviewed with the patient and finalized by ${clinician} on ${reviewedOn}.`]);
}

const CRISIS_LINE = "Crisis: call or text 988 (Suicide & Crisis Lifeline) at any time, or 911 in an emergency.";

function safetyPlanText(answers: SafetyPlanAnswers, header: string[]): string {
  const lines = [...header, ""];
  for (const section of SAFETY_PLAN_SECTIONS) {
    lines.push(`${section.title}:`, answers[section.id] || "(left blank)", "");
  }
  lines.push(CRISIS_LINE);
  return lines.join("\n");
}

/**
 * Reads a plan back from the text this module wrote, so a clinician can edit the
 * patient's draft section by section. Text that does not follow the layout yields
 * no sections rather than a guess.
 */
export function parseSafetyPlanText(text: string | null | undefined): SafetyPlanAnswers {
  const lines = (text ?? "").split("\n");
  const answers: SafetyPlanAnswers = {};
  const starts = SAFETY_PLAN_SECTIONS.map((section) => lines.indexOf(`${section.title}:`));
  SAFETY_PLAN_SECTIONS.forEach((section, index) => {
    const start = starts[index];
    if (start < 0) return;
    const later = [...starts.slice(index + 1).filter((n) => n > start), lines.indexOf(CRISIS_LINE, start)].filter((n) => n > start);
    const end = later.length ? Math.min(...later) : lines.length;
    const value = lines.slice(start + 1, end).join("\n").trim();
    if (value && value !== "(left blank)") answers[section.id] = value;
  });
  return answers;
}

/** A patient's safety-plan draft that has not yet been finalized. */
export function isSafetyPlanDraft(document: { document_type?: string | null; title?: string | null; workflow_status?: string | null }): boolean {
  return document.document_type === "safety_plan"
    && /patient draft/i.test(document.title ?? "")
    && document.workflow_status !== "superseded";
}

export function requestedReleaseIds(items: readonly RequestedForm[] | undefined): string[] {
  return (items ?? []).flatMap((item) => (item.kind === "release" ? [item.releaseId] : []));
}
