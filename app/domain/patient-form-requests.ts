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
  | { kind: "consent"; templateId: string };

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
export function normalizeRequestedForms(input: unknown): { items: RequestedForm[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "Choose at least one form to send." };
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
    } else if (raw?.kind === "consent" && typeof raw.templateId === "string" && raw.templateId.trim()) {
      const key = `consent:${raw.templateId}`;
      if (!seen.has(key)) items.push({ kind: "consent", templateId: raw.templateId.trim() });
      seen.add(key);
    } else {
      return { error: "Each requested form must be a rating scale or a consent." };
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
