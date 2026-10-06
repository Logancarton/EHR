import type { AssembledClinicalContext } from "../context/context-assembler";
import type { OmniboxEvidenceReference } from "../../domain/omnibox";

/** A record projection, with no inferred history, diagnosis or treatment advice. */
export function boundedChartSummary(context: AssembledClinicalContext): { answer: string; evidence: OmniboxEvidenceReference[] } {
  const evidence: OmniboxEvidenceReference[] = [];
  const groups = [
    { label: "Active diagnoses", key: "problem-", values: context.activeDiagnoses },
    { label: "Active medications", key: "medication-", values: context.activeMedications },
    { label: "Recorded allergies", key: "allergy-", values: context.allergies },
  ];
  const lines = groups.map(({ label, key, values }) => {
    const sources = Object.entries(context.provenanceMap).filter(([name]) => name.startsWith(key) && !name.startsWith("medication-candidate-"));
    const supported = values.flatMap((value, index) => {
      const sourceRef = sources[index]?.[1];
      if (!sourceRef) return [];
      evidence.push({ label, sourceRef, excerpt: value });
      return [value];
    });
    return `${label}: ${supported.length ? supported.join("; ") : "No supported entries available in this context"}.`;
  });
  return {
    answer: [`Bounded chart recap for ${context.patient.name}.`, ...lines, "This is a recap of the assembled records, not a complete chart review or clinical formulation. Pending evidence and proposals are not active medication truth."].join("\n"),
    evidence,
  };
}
