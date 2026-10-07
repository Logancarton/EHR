import type {
  OmniboxClinicalInsight,
  OmniboxEvidenceReference,
  OmniboxReviewSuggestion,
  OmniboxPatientTrajectory,
} from "../../domain/omnibox";
import type { AssembledClinicalContext } from "../context/context-assembler";
import { buildPatientTrajectory } from "./patient-trajectory-model";

export type LongitudinalClinicalReasoning = {
  answer: string;
  evidence: OmniboxEvidenceReference[];
  insights: OmniboxClinicalInsight[];
  reviewSuggestion?: OmniboxReviewSuggestion;
  trajectory: OmniboxPatientTrajectory;
};

function evidence(label: string, sourceRef: string, excerpt?: string): OmniboxEvidenceReference {
  return { label, sourceRef, excerpt };
}

function uniqueEvidence(items: readonly OmniboxEvidenceReference[]): OmniboxEvidenceReference[] {
  const seen = new Set<string>();
  const result: OmniboxEvidenceReference[] = [];
  for (const item of items) {
    const key = `${item.sourceRef}:${item.label}:${item.excerpt ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function valueWithUnit(value: string, unit: string): string {
  const cleanValue = compact(value);
  const cleanUnit = compact(unit);
  if (!cleanUnit) return cleanValue;
  if (cleanValue.toLowerCase().endsWith(cleanUnit.toLowerCase())) return cleanValue;
  return `${cleanValue} ${cleanUnit}`;
}

function boundedExcerpt(value: string, max = 280): string {
  const text = compact(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function sourceRefFor(context: AssembledClinicalContext, key: string, fallback: string): string {
  return context.provenanceMap[key] || fallback;
}

function compareRecordedValue(
  label: string,
  current: { value: string; date: string; ref: string },
  prior: { value: string; date: string; ref: string },
): OmniboxClinicalInsight | null {
  const currentValue = compact(current.value);
  const priorValue = compact(prior.value);
  if (!currentValue || !priorValue || currentValue === priorValue) return null;
  return {
    id: `change-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind: "change",
    label,
    statement: `${label} changed from ${priorValue} on ${prior.date} to ${currentValue} on ${current.date}.`,
    confidence: "recorded",
    evidence: [
      evidence(`${label} · current`, current.ref, `${current.date}: ${currentValue}`),
      evidence(`${label} · prior`, prior.ref, `${prior.date}: ${priorValue}`),
    ],
  };
}

function assessmentInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  const rows = context.recentAssessments || [];
  const grouped = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = grouped.get(row.instrument) || [];
    existing.push(row);
    grouped.set(row.instrument, existing);
  }

  const insights: OmniboxClinicalInsight[] = [];
  for (const [instrument, items] of grouped.entries()) {
    const ordered = [...items].sort((a, b) => b.date.localeCompare(a.date));
    const latest = ordered[0];
    if (!latest) continue;
    const latestEvidence = evidence(
      `${latest.title} · ${latest.date}`,
      latest.provenanceRef,
      `${latest.totalScore}/${latest.maxScore} · ${latest.severity}${latest.flags.length ? ` · ${latest.flags.join("; ")}` : ""}`,
    );
    const prior = ordered[1];

    if (!prior) {
      insights.push({
        id: `missing-prior-${instrument}`,
        kind: "missing_evidence",
        label: `${latest.title} trend`,
        statement: `A current ${latest.title} is present, but no prior ${latest.title} is included in the bounded recent-measure context, so a score trend cannot be established from this payload.`,
        confidence: "recorded",
        evidence: [latestEvidence],
      });
      continue;
    }

    const delta = latest.totalScore - prior.totalScore;
    if (delta !== 0 || latest.severity !== prior.severity) {
      const priorEvidence = evidence(
        `${prior.title} · ${prior.date}`,
        prior.provenanceRef,
        `${prior.totalScore}/${prior.maxScore} · ${prior.severity}`,
      );
      insights.push({
        id: `assessment-change-${instrument}`,
        kind: "change",
        label: `${latest.title} changed`,
        statement: `${latest.title} changed from ${prior.totalScore}/${prior.maxScore} (${prior.severity}) on ${prior.date} to ${latest.totalScore}/${latest.maxScore} (${latest.severity}) on ${latest.date}.`,
        confidence: "recorded",
        evidence: [latestEvidence, priorEvidence],
      });

      if ((instrument === "phq-9" || instrument === "gad-7") && delta !== 0) {
        insights.push({
          id: `assessment-interpretation-${instrument}`,
          kind: "possible_interpretation",
          label: `${latest.title} trajectory`,
          statement:
            delta < 0
              ? `The lower ${latest.title} score may indicate lower recently reported symptom burden; this is an interpretation of the score trajectory, not a diagnosis or treatment conclusion.`
              : `The higher ${latest.title} score may indicate higher recently reported symptom burden; this is an interpretation of the score trajectory, not a diagnosis or treatment conclusion.`,
          confidence: "possible",
          evidence: [latestEvidence, priorEvidence],
        });
      }
    }

    if (latest.flags.length) {
      insights.push({
        id: `assessment-flag-${instrument}`,
        kind: "recorded_fact",
        label: `${latest.title} flag`,
        statement: `The most recent ${latest.title} carries recorded flag(s): ${latest.flags.join("; ")}.`,
        confidence: "recorded",
        evidence: [latestEvidence],
      });
    }
  }
  return insights;
}

function labInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  const groups = new Map<string, AssembledClinicalContext["recentLabs"]>();
  for (const lab of context.recentLabs) {
    const key = lab.testName.trim().toLowerCase();
    const existing = groups.get(key) || [];
    existing.push(lab);
    groups.set(key, existing);
  }

  const insights: OmniboxClinicalInsight[] = [];
  for (const labs of groups.values()) {
    const ordered = [...labs].sort((a, b) => b.date.localeCompare(a.date));
    const latest = ordered[0];
    if (!latest) continue;
    const latestValue = `${valueWithUnit(latest.value, latest.unit)}${latest.flag ? ` · flag: ${latest.flag}` : ""}`;
    if (latest.flag) {
      insights.push({
        id: `lab-flag-${latest.id}`,
        kind: "recorded_fact",
        label: `${latest.testName} flag`,
        statement: `The most recent ${latest.testName} result carries the recorded flag “${latest.flag}”.`,
        confidence: "recorded",
        evidence: [evidence(latest.testName, `observations/${latest.id}`, `${latest.date}: ${latestValue}`)],
      });
    }
    const prior = ordered[1];
    if (!prior) continue;
    const priorValue = `${valueWithUnit(prior.value, prior.unit)}${prior.flag ? ` · flag: ${prior.flag}` : ""}`;
    const insight = compareRecordedValue(
      latest.testName,
      { value: latestValue, date: latest.date, ref: `observations/${latest.id}` },
      { value: priorValue, date: prior.date, ref: `observations/${prior.id}` },
    );
    if (insight) insights.push(insight);
  }
  return insights;
}

function vitalInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  const rows = context.recentVitals || [];
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.code.trim().toLowerCase();
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  const insights: OmniboxClinicalInsight[] = [];
  for (const [code, items] of groups.entries()) {
    const preferred = code === "bp"
      || code === "hr"
      || code === "wt"
      || code === "bmi"
      || code === "blood-pressure"
      || code === "heart-rate"
      || code === "weight"
      || code.includes("body-weight");
    if (!preferred) continue;
    const ordered = [...items].sort((a, b) => b.date.localeCompare(a.date));
    if (ordered.length < 2) continue;
    const latest = ordered[0];
    const prior = ordered[1];
    const label = latest.testName || latest.code;
    const change = compareRecordedValue(
      label,
      { value: valueWithUnit(latest.value, latest.unit), date: latest.date, ref: latest.provenanceRef },
      { value: valueWithUnit(prior.value, prior.unit), date: prior.date, ref: prior.provenanceRef },
    );
    if (change) insights.push(change);
  }
  return insights;
}

function encounterInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  const encounters = context.recentEncounters;
  const latest = encounters[0];
  if (!latest) return [];
  const currentText = compact(`${latest.assessment} ${latest.plan}`);
  const prior = encounters[1];
  if (!prior) {
    return [{
      id: "missing-prior-signed-encounter",
      kind: "missing_evidence",
      label: "Prior-visit comparison",
      statement: `The bounded longitudinal context includes the signed encounter from ${latest.date}, but no earlier signed encounter, so prior-visit comparison is incomplete.`,
      confidence: "recorded",
      evidence: [evidence(`Encounter ${latest.date}`, latest.provenanceRef, boundedExcerpt(currentText))],
    }];
  }

  const priorText = compact(`${prior.assessment} ${prior.plan}`);
  if (!currentText || !priorText || currentText === priorText) return [];
  return [{
    id: "signed-encounter-change",
    kind: "change",
    label: "Signed assessment / plan changed",
    statement: `The recorded assessment/plan differs between the signed encounter on ${prior.date} and the signed encounter on ${latest.date}. The excerpts below show the source change; this does not by itself establish why the clinical state changed.`,
    confidence: "recorded",
    evidence: [
      evidence(`Encounter ${latest.date}`, latest.provenanceRef, boundedExcerpt(currentText)),
      evidence(`Encounter ${prior.date}`, prior.provenanceRef, boundedExcerpt(priorText)),
    ],
  }];
}

function medicationTrajectoryInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  return (context.recentMedicationChanges || []).map((entry, index) => {
    const changeText = entry.changes
      .map((change) => {
        const from = change.from ?? "not recorded";
        const to = change.to ?? "not recorded";
        return `${change.label}: ${from} → ${to}`;
      })
      .join("; ");
    return {
      id: `medication-change-${entry.medicationId}-${index}`,
      kind: "change" as const,
      label: `${entry.medicationName || entry.displayText} changed`,
      statement: `The authoritative medication record changed on ${entry.changedAt}: ${changeText}.`,
      confidence: "recorded" as const,
      evidence: [evidence(
        entry.displayText || entry.medicationName,
        entry.provenanceRef,
        changeText,
      )],
    };
  });
}

function medicationContradictions(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  return (context.pendingMedicationCandidates || []).map((candidate) => {
    const sourceEvidence = evidence("Pending medication evidence", candidate.provenanceRef, boundedExcerpt(candidate.rawEvidenceText));
    const supporting: OmniboxEvidenceReference[] = [sourceEvidence];
    if (candidate.advisory.suggestedMedicationId) {
      supporting.push(evidence(
        candidate.advisory.suggestedMedicationDisplay || "Authoritative medication record",
        sourceRefFor(
          context,
          `medication-${candidate.advisory.suggestedMedicationId}`,
          `medications/${candidate.advisory.suggestedMedicationId}`,
        ),
      ));
    }
    return {
      id: `medication-contradiction-${candidate.candidateId}`,
      kind: "contradiction" as const,
      label: "Medication reconciliation conflict",
      statement: `Pending non-authoritative medication evidence differs from current medication truth: ${candidate.advisory.conflictSignal}. It remains unresolved and must not be treated as an active medication change.`,
      confidence: "derived" as const,
      evidence: supporting,
    };
  });
}

function communicationInsights(context: AssembledClinicalContext): OmniboxClinicalInsight[] {
  const latestEncounter = context.recentEncounters[0];
  if (!latestEncounter) return [];
  const encounterDate = latestEncounter.date.slice(0, 10);
  const afterVisit = (context.chartedCommunications || [])
    // Encounter history currently carries a visit date, not a trustworthy signed
    // event time. Same-day communication therefore cannot be ordered relative to
    // that visit without inventing precision; only a strictly later calendar date
    // is safe to describe as post-visit.
    .filter((item) => item.createdAt.slice(0, 10) > encounterDate)
    .slice(0, 3);
  if (!afterVisit.length) return [];
  return [{
    id: "post-visit-communication",
    kind: "recorded_fact",
    label: "Communication after last signed visit",
    statement: `${afterVisit.length} charted communication${afterVisit.length === 1 ? "" : "s"} in the bounded context occurred after the most recent signed encounter on ${latestEncounter.date}. Review may be useful because these records can contain interval events not present in that signed note.`,
    confidence: "recorded",
    evidence: afterVisit.map((item) =>
      evidence(item.title || item.type, `chart-communications/${item.id}`, boundedExcerpt(item.body)),
    ),
  }];
}

function nextReviewSuggestion(insights: readonly OmniboxClinicalInsight[]): OmniboxReviewSuggestion | undefined {
  const contradiction = insights.find((item) => item.kind === "contradiction");
  if (contradiction) {
    return {
      label: "Review medication reconciliation",
      rationale: "A source-backed medication contradiction is still unresolved. Review the evidence before relying on medication truth for a new order or note statement.",
      evidence: contradiction.evidence,
    };
  }

  const flagged = insights.find((item) => item.id.startsWith("lab-flag-") || item.id.startsWith("assessment-flag-"));
  if (flagged) {
    return {
      label: "Review the flagged result",
      rationale: "A current source record carries a flag. This suggestion only asks for review; it does not determine clinical significance or acknowledge the result.",
      evidence: flagged.evidence,
    };
  }

  const possibleWorsening = insights.find((item) =>
    item.kind === "possible_interpretation" && /higher recently reported symptom burden/i.test(item.statement),
  );
  if (possibleWorsening) {
    return {
      label: "Review symptom trajectory",
      rationale: "A standardized score increased across two recorded administrations. Confirm the trajectory in the encounter before drawing a treatment conclusion.",
      evidence: possibleWorsening.evidence,
    };
  }

  const medicationChange = insights.find((item) => item.id.startsWith("medication-change-"));
  if (medicationChange) {
    return {
      label: "Review recent medication change",
      rationale: "The authoritative medication history contains a recent recorded change. Confirm it matches the current treatment plan before relying on prior-dose or medication-state assumptions.",
      evidence: medicationChange.evidence,
    };
  }

  const communication = insights.find((item) => item.id === "post-visit-communication");
  if (communication) {
    return {
      label: "Review interval communication",
      rationale: "Charted communication occurred after the last signed visit and may contain interval context for today's encounter.",
      evidence: communication.evidence,
    };
  }

  return undefined;
}

/**
 * Deterministic first-pass longitudinal reasoning.
 *
 * This function compares bounded, permission-filtered source records and produces
 * typed signals. It does not diagnose, prescribe, acknowledge results, reconcile
 * medications, or mutate the chart. Later language models may rephrase/rank these
 * signals, but they should not be allowed to manufacture new evidence.
 */
export function buildLongitudinalClinicalReasoning(
  context: AssembledClinicalContext,
): LongitudinalClinicalReasoning {
  const insights = [
    ...medicationContradictions(context),
    ...medicationTrajectoryInsights(context),
    ...assessmentInsights(context),
    ...labInsights(context),
    ...vitalInsights(context),
    ...communicationInsights(context),
    ...encounterInsights(context),
  ].filter((item) => item.evidence.length > 0);

  const evidenceItems = uniqueEvidence(insights.flatMap((item) => item.evidence)).slice(0, 16);
  const reviewSuggestion = nextReviewSuggestion(insights);

  const kindCounts = new Map<string, number>();
  for (const insight of insights) {
    kindCounts.set(insight.kind, (kindCounts.get(insight.kind) || 0) + 1);
  }
  const countText = [
    ["changes", kindCounts.get("change") || 0],
    ["contradictions", kindCounts.get("contradiction") || 0],
    ["recorded facts", kindCounts.get("recorded_fact") || 0],
    ["context gaps", kindCounts.get("missing_evidence") || 0],
    ["possible interpretations", kindCounts.get("possible_interpretation") || 0],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${count} ${label}`)
    .join(", ");

  const trajectory = buildPatientTrajectory(context, insights);
  const trajectoryText = trajectory.domains
    .filter((domain) => domain.direction !== "insufficient_evidence")
    .map((domain) => `${domain.label}: ${domain.direction.replaceAll("_", " ")}`)
    .join("; ");

  const hasTrajectorySignal = trajectory.domains.some((domain) => domain.direction !== "insufficient_evidence");
  const answer = insights.length || hasTrajectorySignal
    ? `Longitudinal review for ${context.patient.name}: ${countText ? `${countText}. ` : ""}${trajectoryText ? `Trajectory snapshot — ${trajectoryText}. ` : ""}Findings are separated by evidence status below. Possible interpretations are explicitly non-authoritative, and no clinical action was taken.`
    : `The bounded longitudinal context for ${context.patient.name} did not yield a source-backed comparison signal. No change, contradiction, or interpretation was invented.`;

  return { answer, evidence: evidenceItems, insights, reviewSuggestion, trajectory };
}
