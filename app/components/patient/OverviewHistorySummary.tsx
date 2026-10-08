"use client";

import type { ReactNode } from "react";
import type { AssessmentRecord, PsychiatricHistoryItem, PsychiatricHistoryCategory } from "../../domain/clinical-measurements";
import { formatClinicalDate } from "../../lib/clinical-date";
import Button from "../ui/Button";
import { describeRecordSource } from "../../lib/record-source-presentation";
import { OverviewLine, SourceNote } from "./OverviewParts";

const categories: [PsychiatricHistoryCategory, string][] = [
  ["safety_risk", "Safety history"], ["medication_trial", "Prior medication trials"],
  ["hospitalization", "Psychiatric hospitalizations"], ["psychotherapy", "Psychotherapy"],
  ["substance_use", "Substance use"], ["family_history", "Family psychiatric history"],
  ["social", "Social context"], ["trauma", "Trauma history"],
  ["medical_condition", "Medical history"], ["surgical", "Surgical history"],
  ["family_medical", "Family medical history"], ["sdoh", "Social determinants"],
  ["implanted_device", "Implanted devices"],
];
/** Short row labels; the full category name stays in the expanded detail. */
const rowLabels: Partial<Record<PsychiatricHistoryCategory, string>> = {
  safety_risk: "Risk history", medication_trial: "Prior trials", hospitalization: "Hospitalizations",
  family_history: "Family psych", medical_condition: "Medical", surgical: "Surgical",
  family_medical: "Family medical", sdoh: "SDOH", implanted_device: "Devices", substance_use: "Substances",
};
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

/** One phrase per record, built only from recorded fields. */
function highlight(item: PsychiatricHistoryItem): string {
  const why = detailValue(item.details.reasonForDiscontinuation) ?? detailValue(item.details.outcome) ?? detailValue(item.details.description);
  return why ? `${item.title} — ${why}` : item.title;
}

export default function OverviewHistorySummary({ items, assessments, showHistory, onDocuments, careTeam }: {
  items: PsychiatricHistoryItem[]; assessments: AssessmentRecord[]; showHistory: boolean; onDocuments: () => void; careTeam: ReactNode;
}) {
  const retained = items.filter((item) => item.status !== "entered-in-error");
  const safetyAssessment = [...assessments].filter((item) => item.instrument === "cssrs")
    .sort((a, b) => b.administeredAt.localeCompare(a.administeredAt))[0];
  const grouped = categories.map(([category, label]) => ({
    category, label,
    records: retained.filter((item) => item.category === category).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  }));
  const missing = grouped.filter((group) => group.records.length === 0);
  return <div className="ov-stack">
    {showHistory && <>
      <OverviewLine label="Safety" meta={safetyAssessment ? formatClinicalDate(safetyAssessment.administeredAt) : undefined} detail={<>
        <p>Safety-plan status is not available in this overview. Review the source documentation.</p>
        <Button size="sm" variant="tertiary" onClick={onDocuments}>Review documents</Button>
      </>}>
        {safetyAssessment ? `Latest C-SSRS: ${safetyAssessment.severity}` : "No C-SSRS assessment recorded."}
      </OverviewLine>
      {grouped.filter((group) => group.records.length > 0).map(({ category, label, records }) => (
        <OverviewLine key={category} label={rowLabels[category] ?? label} data-history-category={category}
          meta={records.length > 1 ? `${records.length} records` : formatClinicalDate(records[0].resolvedDate ?? records[0].recordedAt)}
          detail={records.map((item) => <article key={item.id} className="overview-history-entry">
            <strong>{item.title}</strong>
            <p className="overview-record-date">{item.status.replaceAll("-", " ")} · Recorded {formatClinicalDate(item.recordedAt)}{item.onsetDate ? ` · Onset ${formatClinicalDate(item.onsetDate)}` : ""}{item.resolvedDate ? ` · Ended ${formatClinicalDate(item.resolvedDate)}` : ""}</p>
            <dl>{Object.entries(item.details).map(([key, value]) => {
              const text = detailValue(value);
              return text ? <div key={key}><dt>{detailLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{text}</dd></div> : null;
            })}</dl>
            <SourceNote>Source: {describeRecordSource(null, item.sourceSystem)}{item.sourceRef ? ` · ${item.sourceRef}` : ""} · Recorded by {item.recordedBy}</SourceNote>
          </article>)}>
          {records.map(highlight).join(" · ")}
        </OverviewLine>
      ))}
      {missing.length > 0 && <OverviewLine label="Not recorded" className="ov-line--quiet" data-history-missing="">
        {missing.map((group) => group.label.toLowerCase()).join(", ")}
      </OverviewLine>}
    </>}
    {careTeam}
  </div>;
}
