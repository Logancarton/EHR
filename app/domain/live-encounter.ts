import type {
  EncounterState,
  TranscriptUtterance,
} from "../lib/encounter-engine";

export const guidanceTargets = {
  chiefComplaint: "Visit focus",
  intervalHistory: "Interval history",
  reviewOfSymptoms: "Symptoms / function",
  treatmentResponse: "Medication response",
  sideEffects: "Side effects / adherence",
  riskAssessment: "Safety",
  "mse.appearance": "Appearance",
  "mse.behavior": "Behavior / motor",
  "mse.speech": "Speech",
  "mse.moodAffect": "Mood / affect",
  "mse.thoughtProcess": "Thought process",
  "mse.thoughtContent": "Thought content / perception",
  "mse.cognition": "Attention",
  "mse.insightJudgment": "Insight / judgment",
  assessment: "Assessment",
  plan: "Plan",
  followUp: "Follow-up",
} as const;
export type GuidanceTarget = keyof typeof guidanceTargets;
export type GuidanceKind = "correction" | "observation" | "clinical-thought";
export type ProviderGuidance = {
  id: string;
  kind: GuidanceKind;
  target: GuidanceTarget;
  text: string;
  createdAt: string;
  needsClarification: boolean;
  replaces?: string;
  actorId?: string;
};
export type CoverageAttestation = {
  id: string;
  target: GuidanceTarget;
  evidence: string;
  createdAt: string;
  actorId?: string;
  safetyExplicitlyAssessed: boolean;
};
export type LiveEncounterSupport = {
  guidance: ProviderGuidance[];
  attestations: CoverageAttestation[];
};
export type EncounterMode = "LIVE" | "REVIEW" | "SIGNED";
export function encounterMode(
  draft: EncounterState,
  capturing: boolean,
): EncounterMode {
  return draft.status === "signed" ? "SIGNED" : capturing ? "LIVE" : "REVIEW";
}
export function targetText(
  draft: EncounterState,
  target: GuidanceTarget,
): string {
  return target.startsWith("mse.")
    ? (draft.mse[target.slice(4) as keyof EncounterState["mse"]] ?? "")
    : String(draft[target as keyof EncounterState] ?? "");
}
function writeTarget(
  draft: EncounterState,
  target: GuidanceTarget,
  text: string,
): EncounterState {
  return target.startsWith("mse.")
    ? { ...draft, mse: { ...draft.mse, [target.slice(4)]: text } }
    : { ...draft, [target]: text };
}
/** Explicitly targeted clinician wording, never a natural-language diagnosis parser. */
export function applyProviderGuidance(
  draft: EncounterState,
  entry: ProviderGuidance,
): EncounterState {
  if (draft.status === "signed") return draft;
  const support = draft.liveSupport ?? { guidance: [], attestations: [] };
  if (support.guidance.some((item) => item.id === entry.id)) return draft;
  const previous = targetText(draft, entry.target);
  const event = {
    ...entry,
    replaces: entry.kind === "correction" ? previous : undefined,
  };
  const next = {
    ...draft,
    liveSupport: { ...support, guidance: [...support.guidance, event] },
  };
  // Considerations remain visibly separate from prose and all structured chart facts.
  if (entry.kind === "clinical-thought") return next;
  if (entry.needsClarification) return writeTarget(next, entry.target, "");
  return writeTarget(
    next,
    entry.target,
    entry.kind === "correction"
      ? entry.text
      : [previous, entry.text].filter(Boolean).join("\n"),
  );
}
/** Conservative replaceable live renderer: verbatim speech, no inferred normal findings. */
export function captureUtterance(
  draft: EncounterState,
  utterance: TranscriptUtterance,
  target: GuidanceTarget = "intervalHistory",
): EncounterState {
  if (
    draft.status === "signed" ||
    draft.ambientTranscript.some((item) => item.id === utterance.id)
  )
    return draft;
  const text = `${utterance.speakerName}: “${utterance.text}”`;
  const captured = {
    ...draft,
    ambientTranscript: [...draft.ambientTranscript, utterance],
  };
  if (
    draft.liveSupport?.guidance
      .filter((entry) => entry.target === target)
      .at(-1)?.needsClarification
  )
    return captured;
  return writeTarget(
    captured,
    target,
    [targetText(draft, target), text].filter(Boolean).join("\n"),
  );
}
export type CoverageState = "covered" | "partial" | "missing" | "clarification";
export const coverageLabels: Record<CoverageState, string> = {
  covered: "✓ Covered",
  partial: "◐ Partial",
  missing: "○ Not addressed",
  clarification: "⚠ Needs clarification",
};
export function sectionCoverage(
  draft: EncounterState,
  target: GuidanceTarget,
): { state: CoverageState; evidence: string } {
  const evidence = targetText(draft, target).trim();
  const latestGuidance = draft.liveSupport?.guidance
    .filter((item) => item.target === target)
    .at(-1);
  const attestation = draft.liveSupport?.attestations
    .filter((item) => item.target === target && item.evidence === evidence)
    .at(-1);
  if (
    latestGuidance?.needsClarification &&
    (!attestation || attestation.createdAt < latestGuidance.createdAt)
  )
    return { state: "clarification", evidence };
  if (!evidence) return { state: "missing", evidence };
  if (
    attestation &&
    (target !== "riskAssessment" || attestation.safetyExplicitlyAssessed)
  )
    return { state: "covered", evidence };
  // Text presence is not completeness; absent explicit assessment is never a negative.
  return { state: "partial", evidence };
}
export function attestCoverage(
  draft: EncounterState,
  target: GuidanceTarget,
  safetyExplicitlyAssessed: boolean,
): EncounterState {
  const evidence = targetText(draft, target).trim();
  if (
    draft.status === "signed" ||
    !evidence ||
    (target === "riskAssessment" && !safetyExplicitlyAssessed)
  )
    return draft;
  const support = draft.liveSupport ?? { guidance: [], attestations: [] };
  return {
    ...draft,
    liveSupport: {
      ...support,
      attestations: [
        ...support.attestations,
        {
          id: crypto.randomUUID(),
          target,
          evidence,
          safetyExplicitlyAssessed,
          createdAt: new Date().toISOString(),
        },
      ],
    },
  };
}

/** Validate untrusted working-state inputs before any database write. Actor comes from the server. */
export function validateLiveSupport(
  value: unknown,
): asserts value is LiveEncounterSupport {
  if (value === undefined) return;
  if (!value || typeof value !== "object")
    throw new Error("Invalid encounter guidance.");
  const support = value as LiveEncounterSupport;
  if (
    !Array.isArray(support.guidance) ||
    !Array.isArray(support.attestations) ||
    support.guidance.length > 500 ||
    support.attestations.length > 500
  )
    throw new Error("Invalid encounter guidance lists.");
  const ids = new Set<string>();
  for (const entry of [...support.guidance, ...support.attestations]) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      entry.id.length > 100 ||
      ids.has(entry.id) ||
      typeof entry.target !== "string" ||
      !Object.hasOwn(guidanceTargets, entry.target) ||
      typeof entry.createdAt !== "string" ||
      !Number.isFinite(Date.parse(entry.createdAt))
    )
      throw new Error("Invalid encounter guidance provenance.");
    ids.add(entry.id);
    const text = "text" in entry ? entry.text : entry.evidence;
    if (typeof text !== "string" || !text.trim() || text.length > 20000)
      throw new Error("Invalid encounter guidance text.");
    if ("kind" in entry) {
      if (
        !["correction", "observation", "clinical-thought"].includes(
          entry.kind,
        ) ||
        typeof entry.needsClarification !== "boolean" ||
        (entry.replaces !== undefined && typeof entry.replaces !== "string")
      )
        throw new Error("Invalid provider guidance kind.");
    } else if (
      typeof entry.safetyExplicitlyAssessed !== "boolean" ||
      (entry.target === "riskAssessment" && !entry.safetyExplicitlyAssessed)
    )
      throw new Error("Safety requires explicit assessment.");
  }
}
