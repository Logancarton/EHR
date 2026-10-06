"use client";

import type { AssessmentRecord, PsychiatricHistoryItem, PsychiatricHistoryCategory } from "../../domain/clinical-measurements";
import { formatClinicalDate } from "../../lib/clinical-date";
import Button from "../ui/Button";
import { describeRecordSource } from "../../lib/record-source-presentation";

const categories: [PsychiatricHistoryCategory, string][] = [
  ["safety_risk", "Safety history"], ["medication_trial", "Prior medication trials"],
  ["hospitalization", "Psychiatric hospitalizations"], ["psychotherapy", "Psychotherapy"],
  ["substance_use", "Substance use"], ["family_history", "Family psychiatric history"],
  ["social", "Social context"], ["trauma", "Trauma history"],
];
const detailLabels: Record<string, string> = {
  drug: "Medication", maxDose: "Maximum dose", duration: "Duration", outcome: "Response / outcome",
  reasonForDiscontinuation: "Reason stopped", facility: "Facility", voluntary: "Voluntary admission",
  reason: "Reason", description: "Details", modality: "Modality", provider: "Provider",
  lethality: "Recorded lethality", protectiveFactors: "Protective factors",
  response: "Response", relationship: "Relationship", conditions: "Conditions", substance: "Substance", pattern: "Pattern",
};
function detailValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value) && value.every((part) => typeof part === "string")) return value.join(", ");
  return null;
}

export default function OverviewHistorySummary({ items, assessments, onReview, onDocuments }: {
  items: PsychiatricHistoryItem[]; assessments: AssessmentRecord[]; onReview: () => void; onDocuments: () => void;
}) {
  const retained = items.filter((item) => item.status !== "entered-in-error");
  const safetyAssessment = [...assessments].filter((item) => item.instrument === "cssrs")
    .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))[0];
  return <div className="overview-history-summary">
    <div className="overview-source-note">
      <strong>Safety assessment and plan</strong>
      <p>{safetyAssessment ? `Latest recorded C-SSRS: ${safetyAssessment.severity} · ${formatClinicalDate(safetyAssessment.administeredAt)}` : "No C-SSRS assessment recorded."}</p>
      <p>Safety-plan status is not available in this overview. Review the source documentation.</p>
      <Button size="sm" variant="tertiary" onClick={onDocuments}>Review documents</Button>
    </div>
    <div className="overview-history-groups">
      {categories.map(([category, label]) => {
        const records = retained.filter((item) => item.category === category).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
        return <details key={category} open={category === "medication_trial" || category === "safety_risk"}>
          <summary>{label} <span>({records.length})</span></summary>
          {records.length === 0 ? <p>No structured {label.toLowerCase()} recorded.</p> : records.map((item) => <article key={item.id} className="overview-history-entry">
            <strong>{item.title}</strong>
            <p className="overview-record-date">{item.status.replaceAll("-", " ")} · Recorded {formatClinicalDate(item.recordedAt)}{item.onsetDate ? ` · Onset ${formatClinicalDate(item.onsetDate)}` : ""}{item.resolvedDate ? ` · Ended ${formatClinicalDate(item.resolvedDate)}` : ""}</p>
            <dl>{Object.entries(item.details).map(([key, value]) => {
              const text = detailValue(value);
              return text ? <div key={key}><dt>{detailLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{text}</dd></div> : null;
            })}</dl>
            <p className="overview-record-date">Source: {describeRecordSource(null, item.sourceSystem)}{item.sourceRef ? ` · ${item.sourceRef}` : ""} · Recorded by {item.recordedBy}</p>
          </article>)}
        </details>;
      })}
    </div>
    <Button size="sm" variant="secondary" onClick={onReview}>Review psychiatric history</Button>
  </div>;
}
