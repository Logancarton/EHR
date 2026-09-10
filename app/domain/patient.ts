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
    id: "elena-rostova",
    name: "Elena Rostova",
    initials: "ER",
    dob: "03/22/1988",
    age: 38,
    pronouns: "she/her",
    mrn: "P-10764",
    status: "Established",
    diagnoses: ["Major depressive disorder, recurrent, partial remission", "Generalized anxiety disorder"],
    meds: ["Bupropion XL 300 mg daily", "Escitalopram 10 mg daily"],
    lastVisit: "Aug 05, 2026",
    nextVisit: "Sep 4, 2026 · 1:15 PM",
    alert: "Overdue PHQ-9 & blood pressure monitoring",
  },
  {
    id: "david-kim",
    name: "David Kim",
    initials: "DK",
    dob: "12/05/1979",
    age: 46,
    pronouns: "he/him",
    mrn: "P-10889",
    status: "Established",
    diagnoses: ["Bipolar II disorder, most recent episode hypomanic, in remission", "Insomnia disorder"],
    meds: ["Lithium Carbonate 600 mg BID", "Trazodone 50 mg nightly PRN"],
    lastVisit: "Aug 10, 2026",
    nextVisit: "Sep 4, 2026 · 2:45 PM",
    alert: "Overdue 12-hr Lithium level & eGFR",
  },
  {
    id: "marcus-vance",
    name: "Marcus Vance",
    initials: "MV",
    dob: "08/14/1995",
    age: 31,
    pronouns: "he/him",
    mrn: "P-10231",
    status: "Established",
    diagnoses: ["ADHD, combined presentation", "Shift work sleep disorder"],
    meds: ["Lisdexamfetamine 40 mg daily", "Melatonin 3 mg nightly"],
    lastVisit: "Aug 04, 2026",
    nextVisit: "Sep 4, 2026 · 9:00 AM",
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
