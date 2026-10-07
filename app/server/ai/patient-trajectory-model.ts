import type {
  OmniboxClinicalInsight,
  OmniboxEvidenceReference,
  OmniboxPatientTrajectory,
  OmniboxTrajectoryDirection,
  OmniboxTrajectoryDomain,
  OmniboxTrajectoryDomainSummary,
} from "../../domain/omnibox";
import type { AssembledClinicalContext } from "../context/context-assembler";

function evidence(label: string, sourceRef: string, excerpt?: string): OmniboxEvidenceReference {
  return { label, sourceRef, excerpt };
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function boundedExcerpt(value: string, max = 240): string {
  const text = compact(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function domainSummary(
  domain: OmniboxTrajectoryDomain,
  label: string,
  direction: OmniboxTrajectoryDirection,
  summary: string,
  evidenceRows: OmniboxEvidenceReference[],
  sourceInsightIds: string[] = [],
): OmniboxTrajectoryDomainSummary {
  return {
    domain,
    label,
    direction,
    summary,
    evidence: evidenceRows,
    sourceInsightIds,
  };
}

function insightIds(
  insights: readonly OmniboxClinicalInsight[],
  predicate: (insight: OmniboxClinicalInsight) => boolean,
): string[] {
  return insights.filter(predicate).map((insight) => insight.id);
}

function assessmentTrajectory(
  context: AssembledClinicalContext,
  insights: readonly OmniboxClinicalInsight[],
  instrument: string,
  domain: OmniboxTrajectoryDomain,
  label: string,
  directional: boolean,
): OmniboxTrajectoryDomainSummary {
  const rows = (context.recentAssessments || [])
    .filter((row) => {
      const recorded = row.instrument.toLowerCase();
      return instrument === "asrs" ? recorded.startsWith("asrs") : recorded === instrument;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const latest = rows[0];
  const relatedInsightIds = insightIds(
    insights,
    (item) => item.id.includes(instrument) || item.label.toLowerCase().includes(instrument),
  );

  if (!latest) {
    return domainSummary(
      domain,
      label,
      "insufficient_evidence",
      `No recent ${label} measurement is present in the bounded longitudinal context.`,
      [],
      relatedInsightIds,
    );
  }

  const latestEvidence = evidence(
    `${latest.title} · ${latest.date}`,
    latest.provenanceRef,
    `${latest.totalScore}/${latest.maxScore} · ${latest.severity}`,
  );
  const prior = rows[1];
  if (!prior) {
    return domainSummary(
      domain,
      label,
      "insufficient_evidence",
      `One recent ${latest.title} is available, but a second recent administration is not present in this bounded context, so direction is not assigned.`,
      [latestEvidence],
      relatedInsightIds,
    );
  }

  const priorEvidence = evidence(
    `${prior.title} · ${prior.date}`,
    prior.provenanceRef,
    `${prior.totalScore}/${prior.maxScore} · ${prior.severity}`,
  );
  const delta = latest.totalScore - prior.totalScore;
  if (delta === 0 && latest.severity === prior.severity) {
    return domainSummary(
      domain,
      label,
      "stable",
      `${latest.title} remained ${latest.totalScore}/${latest.maxScore} (${latest.severity}) across the two most recent administrations in context.`,
      [latestEvidence, priorEvidence],
      relatedInsightIds,
    );
  }

  if (!directional) {
    return domainSummary(
      domain,
      label,
      "changed",
      `${latest.title} changed from ${prior.totalScore}/${prior.maxScore} (${prior.severity}) to ${latest.totalScore}/${latest.maxScore} (${latest.severity}). No better/worse interpretation is assigned to this instrument here.`,
      [latestEvidence, priorEvidence],
      relatedInsightIds,
    );
  }

  const direction: OmniboxTrajectoryDirection = delta < 0 ? "improving" : "worsening";
  const directionText = delta < 0 ? "lower" : "higher";
  return domainSummary(
    domain,
    label,
    direction,
    `${latest.title} moved from ${prior.totalScore}/${prior.maxScore} (${prior.severity}) to ${latest.totalScore}/${latest.maxScore} (${latest.severity}). This supports a ${directionText} recently reported symptom-score direction; it does not establish an overall diagnosis or treatment outcome.`,
    [latestEvidence, priorEvidence],
    relatedInsightIds,
  );
}

type ExplicitTextEvidence = {
  label: string;
  text: string;
  sourceRef: string;
};

function explicitTextEvidence(
  context: AssembledClinicalContext,
  pattern: RegExp,
  limit = 3,
): ExplicitTextEvidence[] {
  const rows: ExplicitTextEvidence[] = [];

  for (const encounter of context.recentEncounters) {
    const text = compact(`${encounter.assessment} ${encounter.plan}`);
    if (text && pattern.test(text)) {
      rows.push({
        label: `Encounter ${encounter.date}`,
        text: boundedExcerpt(text),
        sourceRef: encounter.provenanceRef,
      });
    }
  }

  for (const communication of context.chartedCommunications || []) {
    const text = compact(`${communication.title} ${communication.body}`);
    if (text && pattern.test(text)) {
      rows.push({
        label: communication.title || communication.type,
        text: boundedExcerpt(text),
        sourceRef: `chart-communications/${communication.id}`,
      });
    }
  }

  return rows.slice(0, limit);
}

function explicitDomain(
  context: AssembledClinicalContext,
  insights: readonly OmniboxClinicalInsight[],
  domain: OmniboxTrajectoryDomain,
  label: string,
  pattern: RegExp,
  evidenceDescription: string,
  insightPattern?: RegExp,
): OmniboxTrajectoryDomainSummary {
  const rows = explicitTextEvidence(context, pattern);
  const relatedInsightIds = insightPattern
    ? insightIds(insights, (item) => insightPattern.test(`${item.id} ${item.label} ${item.statement}`))
    : [];

  if (!rows.length) {
    return domainSummary(
      domain,
      label,
      "insufficient_evidence",
      `No explicit ${evidenceDescription} is present in the bounded recent encounter or communication context. No direction is inferred from absence.`,
      [],
      relatedInsightIds,
    );
  }

  return domainSummary(
    domain,
    label,
    "signal_present",
    `Explicit ${evidenceDescription} is present in ${rows.length} recent source record${rows.length === 1 ? "" : "s"}. This domain is surfaced for review without assigning a better/worse direction from free text.`,
    rows.map((row) => evidence(row.label, row.sourceRef, row.text)),
    relatedInsightIds,
  );
}

function medicationTrajectory(
  context: AssembledClinicalContext,
  insights: readonly OmniboxClinicalInsight[],
): OmniboxTrajectoryDomainSummary {
  const changes = context.recentMedicationChanges || [];
  const candidates = context.pendingMedicationCandidates || [];
  const relatedInsightIds = insightIds(
    insights,
    (item) => item.id.startsWith("medication-"),
  );

  if (changes.length) {
    const evidenceRows = changes.slice(0, 3).map((entry) => {
      const changeText = entry.changes
        .map((change) => `${change.label}: ${change.from ?? "not recorded"} → ${change.to ?? "not recorded"}`)
        .join("; ");
      return evidence(entry.displayText || entry.medicationName, entry.provenanceRef, changeText);
    });
    const contradictionText = candidates.length
      ? ` ${candidates.length} unresolved medication-reconciliation evidence item${candidates.length === 1 ? "" : "s"} also remain separate from authoritative medication truth.`
      : "";
    return domainSummary(
      "medication_course",
      "Medication course",
      "changed",
      `${changes.length} authoritative medication change event${changes.length === 1 ? "" : "s"} are present in the bounded longitudinal context.${contradictionText}`,
      evidenceRows,
      relatedInsightIds,
    );
  }

  if (candidates.length) {
    return domainSummary(
      "medication_course",
      "Medication course",
      "signal_present",
      `No authoritative medication change is present in the bounded trajectory, but ${candidates.length} unresolved reconciliation evidence item${candidates.length === 1 ? "" : "s"} require review.`,
      candidates.slice(0, 3).map((item) =>
        evidence("Pending medication evidence", item.provenanceRef, boundedExcerpt(item.rawEvidenceText)),
      ),
      relatedInsightIds,
    );
  }

  return domainSummary(
    "medication_course",
    "Medication course",
    "insufficient_evidence",
    "No recent authoritative medication version change or unresolved reconciliation evidence is present in the bounded longitudinal context.",
    [],
    relatedInsightIds,
  );
}

/**
 * Builds a compact clinical-domain view from authoritative/permission-filtered
 * context. This model deliberately distinguishes objective directional signals
 * from free-text mentions. Free text can make a domain visible for review, but
 * cannot by itself turn a domain into improving or worsening.
 */
export function buildPatientTrajectory(
  context: AssembledClinicalContext,
  insights: readonly OmniboxClinicalInsight[],
): OmniboxPatientTrajectory {
  const mood = assessmentTrajectory(context, insights, "phq-9", "mood", "Depressive symptoms", true);
  const anxiety = assessmentTrajectory(context, insights, "gad-7", "anxiety", "Anxiety symptoms", true);
  const attention = assessmentTrajectory(context, insights, "asrs", "attention", "Attention symptoms", false);
  const sleep = explicitDomain(
    context,
    insights,
    "sleep",
    "Sleep",
    /\b(sleep|insomnia|hypersomnia|nightmare|nightmares)\b/i,
    "sleep-related content",
  );
  const safety = explicitDomain(
    context,
    insights,
    "safety",
    "Safety",
    /\b(suicid(?:e|al|ality)?|self[- ]?harm|homicid(?:e|al)?|safety plan|safety concern)\b/i,
    "safety-related content",
    /suicid|self[- ]?harm|homicid|safety/i,
  );
  const medication = medicationTrajectory(context, insights);
  const adverseEffects = explicitDomain(
    context,
    insights,
    "adverse_effects",
    "Adverse effects",
    /\b(side effect|side effects|adverse effect|nausea|vomit(?:ing)?|diarrhea|constipat(?:ion|ed)|dizz(?:y|iness)|sedat(?:ed|ion)|drows(?:y|iness)|groggy|grogginess|restless(?:ness)?|akathisia|tremor|weight gain|urinary hesitancy)\b/i,
    "possible adverse-effect content",
  );
  const functioning = explicitDomain(
    context,
    insights,
    "functioning",
    "Functioning",
    /\b(function(?:ing|al)?|school|academic|grades?|attendance|work|job|employment|activities of daily living|adl)\b/i,
    "functioning-related content",
  );

  return {
    generatedFrom: "deterministic_longitudinal_reasoner",
    domains: [mood, anxiety, attention, sleep, safety, medication, adverseEffects, functioning],
  };
}
