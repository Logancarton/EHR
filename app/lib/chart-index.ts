import type { Section } from "../domain/patient";

/** The sections of the Patient information drawer, the chart's administrative profile. */
export type PatientInfoSection =
  | "intake"
  | "identity"
  | "additional"
  | "contact"
  | "people"
  | "network"
  | "coverage"
  | "pharmacy"
  | "appointments"
  | "releases";

/**
 * The chart index: every part of a patient's chart listed in one place, each
 * opening where it already lives (owner unchanged).
 *
 * The chart keeps three homes, each with one job: chart sections hold the
 * clinical record, the right strip holds the tools used during a visit, and
 * Patient information holds the administrative profile. The index is the map
 * across them; it adds no new surface and duplicates no data.
 */
export type ChartIndexTarget =
  | { kind: "section"; section: Section }
  | { kind: "companion"; tool: string }
  | { kind: "patient-info"; section: PatientInfoSection };

export type ChartIndexEntry = {
  id: string;
  label: string;
  /** Where it opens, said in words so the destination is never a surprise. */
  where: string;
  icon: string;
  target: ChartIndexTarget;
};

export type ChartIndexGroup = { label: string; entries: readonly ChartIndexEntry[] };

export const CHART_INDEX: readonly ChartIndexGroup[] = [
  {
    label: "Clinical record",
    entries: [
      { id: "facesheet", label: "Facesheet", where: "Overview", icon: "dashboard", target: { kind: "section", section: "Overview" } },
      { id: "problems", label: "Problems & allergies", where: "Overview", icon: "clinical_notes", target: { kind: "section", section: "Overview" } },
      { id: "medications", label: "Medications", where: "Right strip", icon: "medication", target: { kind: "companion", tool: "medications" } },
      { id: "history", label: "History & vitals", where: "Right strip", icon: "history", target: { kind: "companion", tool: "history" } },
      { id: "labs", label: "Labs & results", where: "Right strip", icon: "labs", target: { kind: "companion", tool: "labs" } },
      { id: "notes", label: "Notes & encounter", where: "Encounter", icon: "edit_note", target: { kind: "section", section: "Encounter" } },
      { id: "documents", label: "Documents", where: "Right strip", icon: "folder_open", target: { kind: "companion", tool: "documents" } },
      { id: "messages", label: "Messages & forms", where: "Right strip", icon: "forum", target: { kind: "companion", tool: "communication" } },
      { id: "orders", label: "Orders", where: "Right strip", icon: "shopping_bag", target: { kind: "companion", tool: "orders" } },
    ],
  },
  {
    label: "Profile",
    entries: [
      { id: "identity", label: "Demographics", where: "Patient info", icon: "badge", target: { kind: "patient-info", section: "identity" } },
      { id: "additional", label: "Additional info", where: "Patient info", icon: "person_book", target: { kind: "patient-info", section: "additional" } },
      { id: "appointments", label: "Appointments", where: "Patient info", icon: "event", target: { kind: "patient-info", section: "appointments" } },
      { id: "contact", label: "Contact", where: "Patient info", icon: "call", target: { kind: "patient-info", section: "contact" } },
      { id: "people", label: "Related people & guarantor", where: "Patient info", icon: "group", target: { kind: "patient-info", section: "people" } },
      { id: "network", label: "Care network", where: "Patient info", icon: "diversity_3", target: { kind: "patient-info", section: "network" } },
      { id: "coverage", label: "Insurance & coverage", where: "Patient info", icon: "shield", target: { kind: "patient-info", section: "coverage" } },
      { id: "pharmacy", label: "Pharmacy", where: "Patient info", icon: "local_pharmacy", target: { kind: "patient-info", section: "pharmacy" } },
      { id: "releases", label: "Releases (ROI)", where: "Patient info", icon: "handshake", target: { kind: "patient-info", section: "releases" } },
      { id: "intake", label: "Intake checklist", where: "Patient info", icon: "assignment", target: { kind: "patient-info", section: "intake" } },
    ],
  },
];

/** Every entry, for search and for the AI intent path. */
export function chartIndexEntries(): ChartIndexEntry[] {
  return CHART_INDEX.flatMap((group) => [...group.entries]);
}
