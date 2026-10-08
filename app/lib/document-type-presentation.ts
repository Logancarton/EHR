/** Document types are stored as identifiers; clinicians read them as these labels. */
export const DOCUMENT_TYPE_OPTIONS = [
  { value: "consult_note", label: "Consultation Note" },
  { value: "eval_report", label: "Evaluation Report" },
  { value: "specialist_note", label: "Specialist Note" },
  { value: "discharge_summary", label: "Discharge Summary" },
  { value: "lab_requisition", label: "Lab Requisition / Order" },
  { value: "prior_auth", label: "Prior Authorization" },
  { value: "outside_records", label: "Outside Clinical Records" },
  { value: "education_plan", label: "Education / 504 Plan" },
  { value: "safety_plan", label: "Safety Plan" },
  { value: "referral_out", label: "Referral — Sent" },
  { value: "referral_in", label: "Referral — Received" },
  { value: "patient_education", label: "Patient Education" },
  { value: "government_id", label: "Government ID" },
  { value: "insurance_card_primary", label: "Insurance Card — Primary" },
  { value: "insurance_card_secondary", label: "Insurance Card — Secondary" },
] as const;

const LABELS = new Map<string, string>(DOCUMENT_TYPE_OPTIONS.map((option) => [option.value, option.label]));

/** A known type's label; an unknown identifier is spelled out rather than hidden. */
export function documentTypeLabel(value: string | null | undefined): string {
  const type = (value ?? "").trim();
  if (!type) return "Document";
  const known = LABELS.get(type);
  if (known) return known;
  const words = type.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
