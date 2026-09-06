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
  type:
    | "lab-status"
    | "encounter-match"
    | "protocol-info"
    | "order-intent"
    | "message-triage"
    | "history-synthesis"
    | "split-screen";
  title: string;
  body: string;
  patientId: string;
  patientName: string;
  actionLabel?: string;
  actionSection?: Section;
  labOrderName?: string;
  orderType?: "prescribe" | "labs" | "cart";
  prefillDrug?: string;
  isSplitScreen?: boolean;
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
      title: "Workspace Layout Operator",
      body: prefResult.feedback,
      patientId: activePatient.id,
      patientName: activePatient.name,
      actionLabel: "Apply Layout Change",
    };
  }

  // 1. Split Screen / Side by Side Operator
  if (
    normalizedQuery.includes("split") ||
    normalizedQuery.includes("side by side") ||
    normalizedQuery.includes("dual chart") ||
    normalizedQuery.includes("two patients")
  ) {
    // Determine which patient to split (preferably a different one than active)
    const otherPatient =
      patients.find((p) => p.id !== activePatient.id && (
        normalizedQuery.includes(p.name.toLowerCase()) ||
        normalizedQuery.includes(p.name.toLowerCase().split(" ")[0])
      )) || patients.find((p) => p.id !== activePatient.id) || mentionedPatient;

    return {
      type: "split-screen",
      title: `Split Screen Workspace Operator`,
      body: `Open ${otherPatient.name} in a detached side-by-side pane alongside ${activePatient.name}.`,
      patientId: otherPatient.id,
      patientName: otherPatient.name,
      actionLabel: `Split Screen with ${otherPatient.name}`,
      actionSection: "Overview",
      isSplitScreen: true,
    };
  }

  // 2. Direct E-Prescribing & Refill Operator
  const rxKeywords = ["refill", "prescribe", "e-rx", "erx", "rx", "order cart", "drfirst", "stage refill"];
  const isRxQuery = rxKeywords.some((kw) => normalizedQuery.includes(kw));

  if (isRxQuery) {
    const knownDrugs = ["sertraline", "guanfacine", "lamotrigine", "quetiapine", "fluoxetine", "clonazepam", "methylphenidate"];
    const matchedDrug = knownDrugs.find((d) => normalizedQuery.includes(d));

    return {
      type: "order-intent",
      title: `E-Prescribing Cart Operator · ${mentionedPatient.name}`,
      body: matchedDrug
        ? `Stage e-prescription for ${matchedDrug.toUpperCase()} (${mentionedPatient.name}) into DrFirst/Surescripts order cart.`
        : `Open staged order cart and medication composer for ${mentionedPatient.name}.`,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: matchedDrug ? `Stage ${matchedDrug} to Cart` : "Open Prescription Composer",
      actionSection: "Meds",
      orderType: "prescribe",
      prefillDrug: matchedDrug,
    };
  }

  // 3. Patient Messages & Triage
  const messageKeywords = ["message", "messages", "inbox", "portal", "sms", "chat", "text", "triage"];
  if (messageKeywords.some((kw) => normalizedQuery.includes(kw))) {
    return {
      type: "message-triage",
      title: `Patient Messages & Triage · ${mentionedPatient.name}`,
      body: `Review inbound communication, unread refill requests, and symptom reports for ${mentionedPatient.name}.`,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: `Open ${mentionedPatient.name.split(" ")[0]}'s Messages`,
      actionSection: "Messages",
    };
  }

  // 4. Longitudinal History & Interval Synthesis
  const historyKeywords = ["what changed", "interval", "history", "flowsheet", "timeline", "past visits", "progression"];
  if (historyKeywords.some((kw) => normalizedQuery.includes(kw))) {
    return {
      type: "history-synthesis",
      title: `Longitudinal History & Interval Synthesis · ${mentionedPatient.name}`,
      body: `Inspect multi-stream timeline comparing prior encounters, medication milestones, and diagnostic lab trends.`,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: `Open History Flowsheet`,
      actionSection: "History",
    };
  }

  // 5. Lab and Surveillance queries
  const labTriggers = [
    "lab", "labs", "lipid", "a1c", "cmp", "bmp", "blood", "due", "done",
    "last done", "overdue", "protocol", "lithium", "seroquel",
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

  // 6. Encounter notes search queries
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
