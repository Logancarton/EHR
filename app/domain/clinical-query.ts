import { type Patient, type Section, patients } from "./patient";
import {
  calculateMonitoringStatus,
  patientLabHistory,
  patientEncounterHistory,
} from "../lib/clinical-protocols";
import {
  type ProviderPreferences,
  parseAiPreferenceCommand,
} from "../lib/preference-engine";

export type ClinicalQueryAnswer = {
  type: "lab-status" | "encounter-match" | "protocol-info";
  title: string;
  body: string;
  patientId: string;
  patientName: string;
  actionLabel?: string;
  actionSection?: Section;
  labOrderName?: string;
};

export const googleWorkspaceApps = [
  { id: "today", label: "Today", icon: "⌂" },
  { id: "patients", label: "Patients", icon: "◉" },
  { id: "schedule", label: "Schedule", icon: "□" },
  { id: "inbox", label: "Inbox", icon: "✉" },
  { id: "tasks", label: "Tasks", icon: "✓" },
  { id: "documents", label: "Documents", icon: "▤" },
  { id: "labs", label: "Labs", icon: "⌁" },
  { id: "billing", label: "Billing", icon: "$" },
  { id: "reports", label: "Reports", icon: "▥" },
  { id: "prescribe", label: "E-Rx", icon: "Rx" },
  { id: "telehealth", label: "Meet", icon: "📹" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export const phqQuestions = [
  "1. Little interest or pleasure in doing things",
  "2. Feeling down, depressed, or hopeless",
  "3. Trouble falling or staying asleep, or sleeping too much",
  "4. Feeling tired or having little energy",
  "5. Poor appetite or overeating",
  "6. Feeling bad about yourself — or that you are a failure",
  "7. Trouble concentrating on things",
  "8. Moving or speaking slowly, or fidgety/restless",
  "9. Thoughts that you would be better off dead or hurting yourself",
];

export function executeClinicalQuery(
  rawQuery: string,
  activePatient: Patient,
  preferences: ProviderPreferences
): ClinicalQueryAnswer | null {
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery || normalizedQuery.length < 3) return null;

  // Check which patient is mentioned in the query, else fallback to active patient
  const mentionedPatient =
    patients.find((p) => {
      const pName = p.name.toLowerCase();
      const pFirst = pName.split(" ")[0];
      const pLast = pName.split(" ")[1];
      return (
        normalizedQuery.includes(pName) ||
        normalizedQuery.includes(pFirst) ||
        normalizedQuery.includes(pLast)
      );
    }) ?? activePatient;

  // 0. AI Layout & Preference queries
  const prefResult = parseAiPreferenceCommand(normalizedQuery, preferences);
  if (prefResult.recognized && prefResult.updatedPreferences) {
    return {
      type: "protocol-info",
      title: "Workspace Layout Preference",
      body: prefResult.feedback,
      patientId: activePatient.id,
      patientName: activePatient.name,
      actionLabel: "Apply Layout Change",
    };
  }

  // 1. Lab and Surveillance queries
  const labTriggers = [
    "lab", "labs", "lipid", "a1c", "cmp", "bmp", "blood", "due", "done",
    "last done", "overdue", "preference", "protocol", "lithium", "seroquel",
    "quetiapine", "metabolic", "monitoring", "surveillance", "test", "tests"
  ];
  const isLabQuery = labTriggers.some((trigger) => normalizedQuery.includes(trigger));

  if (isLabQuery) {
    const labs = patientLabHistory[mentionedPatient.id] || [];
    const monitoringItems = calculateMonitoringStatus(mentionedPatient.meds, labs);
    const overdueItems = monitoringItems.filter((item) => item.status === "overdue");
    const currentItems = monitoringItems.filter((item) => item.status === "current");

    let body = "";
    let labOrderName: string | undefined;

    if (overdueItems.length > 0) {
      const item = overdueItems[0];
      labOrderName = item.requiredLab;
      body = `${mentionedPatient.name}'s ${item.requiredLab} was last completed ${
        item.lastDoneDate ? `${item.lastDoneDate} (${item.daysElapsed} days ago)` : "never"
      }. Protocol: ${item.intervalLabel} for ${item.medication.split(" ")[0]} metabolic surveillance — status: OVERDUE.`;
      if (currentItems.length > 0) {
        body += ` Other labs: ${currentItems[0].requiredLab} is current (completed ${currentItems[0].lastDoneDate}).`;
      }
    } else if (monitoringItems.length > 0) {
      body = `All active medication surveillance labs for ${mentionedPatient.name} are current. ${monitoringItems[0].requiredLab} last completed ${monitoringItems[0].lastDoneDate}. Next check due in ${monitoringItems[0].daysRemaining ?? 90} days (${monitoringItems[0].intervalLabel}).`;
    } else if (labs.length > 0) {
      body = `Most recent lab on record for ${mentionedPatient.name}: ${labs[0].testName} on ${labs[0].date} (${labs[0].value} ${labs[0].unit}).`;
    } else {
      body = `No recent lab records found for ${mentionedPatient.name}. Standard intake panels recommended.`;
    }

    return {
      type: "lab-status",
      title: `Clinical AI · Lab Surveillance for ${mentionedPatient.name}`,
      body,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: `Open ${mentionedPatient.name.split(" ")[0]}'s Labs`,
      actionSection: "Labs",
      labOrderName,
    };
  }

  // 2. Encounter notes search queries
  const encounterKeywords = [
    "sleep", "anxiety", "weight", "rash", "titration", "dreams", "vanderbilt",
    "panic", "prozac", "guanfacine", "lamotrigine", "sertraline", "hpi", "note",
    "notes", "visit", "visits", "plan", "assessment", "complaint"
  ];
  const matchesKeyword = encounterKeywords.find((kw) => normalizedQuery.includes(kw));

  if (matchesKeyword) {
    const targetEncounters = patientEncounterHistory[mentionedPatient.id] || [];
    const match = targetEncounters.find((enc) => {
      const text = `${enc.chiefComplaint} ${enc.hpi} ${enc.assessment} ${enc.plan}`.toLowerCase();
      return text.includes(matchesKeyword);
    });

    if (match) {
      return {
        type: "encounter-match",
        title: `Encounter Match · ${mentionedPatient.name} (${match.date})`,
        body: `Found in ${match.type}: “${match.hpi.slice(0, 160)}…”`,
        patientId: mentionedPatient.id,
        patientName: mentionedPatient.name,
        actionLabel: `View Encounter Note`,
        actionSection: "Encounter",
      };
    }
  }

  return null;
}
