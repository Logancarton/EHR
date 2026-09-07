export type Section = "Overview" | "Encounter" | "Meds" | "Labs" | "Documents" | "Messages" | "History";

export type Patient = {
  id: string;
  name: string;
  initials: string;
  dob: string;
  age: number;
  pronouns: string;
  mrn: string;
  status: string;
  diagnoses: string[];
  meds: string[];
  lastVisit: string;
  nextVisit: string;
  alert?: string;
};

export const sections: Section[] = ["Overview", "Encounter", "Meds", "Labs", "Documents", "Messages", "History"];

export const sectionAliases: Record<Section, string[]> = {
  Overview: ["overview", "summary", "snapshot", "chart"],
  Encounter: ["encounter", "visit", "note"],
  Meds: ["meds", "medications", "medication", "prescriptions", "rx"],
  Labs: ["labs", "lab", "results", "bloodwork"],
  Documents: ["documents", "document", "files", "records", "outside records"],
  Messages: ["messages", "message", "portal"],
  History: ["history", "timeline", "longitudinal"],
};

export const patients: Patient[] = [
  {
    id: "maya-chen",
    name: "Maya Chen",
    initials: "MC",
    dob: "04/18/1992",
    age: 34,
    pronouns: "she/her",
    mrn: "P-10482",
    status: "Established",
    diagnoses: ["Generalized anxiety disorder", "ADHD, combined presentation"],
    meds: ["Sertraline 100 mg daily", "Guanfacine ER 2 mg nightly"],
    lastVisit: "Aug 12, 2026",
    nextVisit: "Sep 9, 2026 · 10:30 AM",
  },
  {
    id: "jordan-reed",
    name: "Jordan Reed",
    initials: "JR",
    dob: "11/03/1986",
    age: 39,
    pronouns: "he/him",
    mrn: "P-10917",
    status: "Established",
    diagnoses: ["Unspecified mood disorder", "Generalized anxiety disorder"],
    meds: ["Lamotrigine 150 mg daily", "Quetiapine 100 mg nightly"],
    lastVisit: "Aug 21, 2026",
    nextVisit: "Sep 4, 2026 · 4:30 PM",
    alert: "Monitoring labs due",
  },
  {
    id: "sofia-martinez",
    name: "Sofia Martinez",
    initials: "SM",
    dob: "01/27/2008",
    age: 18,
    pronouns: "she/her",
    mrn: "P-11104",
    status: "Established",
    diagnoses: ["Major depressive disorder", "Social anxiety disorder"],
    meds: ["Fluoxetine 30 mg daily"],
    lastVisit: "Jul 29, 2026",
    nextVisit: "Sep 11, 2026 · 3:00 PM",
  },
];

export function resolvePatientFromCommand(input: string): Patient | undefined {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;

  return patients.find((patient) => {
    const name = patient.name.toLowerCase();
    const nameParts = name.split(" ").filter((part) => part.length > 2);
    return (
      normalized.includes(name) ||
      normalized.includes(patient.mrn.toLowerCase()) ||
      nameParts.some((part) => normalized.includes(part))
    );
  });
}

export function resolveSectionFromCommand(input: string): Section | undefined {
  const normalized = input.trim().toLowerCase();
  return sections.find((candidate) =>
    sectionAliases[candidate].some((alias) => normalized.includes(alias)),
  );
}
