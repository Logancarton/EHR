import { type Patient, type Section } from "./patient";
import {
  type ProviderPreferences,
  parseAiPreferenceCommand,
} from "../lib/preference-engine";
import { findTool, isAvailableTool } from "../lib/workspace-tools";
import { parseScheduleJumpQuery } from "../lib/schedule-data";

export type ClinicalQueryAnswer = {
  type:
    | "lab-status"
    | "encounter-match"
    | "protocol-info"
    | "order-intent"
    | "message-triage"
    | "history-synthesis"
    | "split-screen"
    | "schedule-jump";
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
  scheduleDate?: string;
  scheduleDaysLater?: number;
};

/**
 * Destinations in the app launcher.
 *
 * Every entry here must actually open something. The launcher previously listed
 * twelve and routed three, showing "Switched to Billing" while nothing changed —
 * an app grid that lies about where it goes is worse than a shorter one. `id`
 * values match the sidebar's vocabulary so both use one routing path.
 *
 * Telehealth was removed rather than left pointing nowhere: it is not built, not
 * planned, and an EHR should not advertise a clinical capability it lacks.
 */
const workspaceAppCatalogue = [
  { id: "today", label: "Dashboard", icon: "dashboard" },
  { id: "patients", label: "Patients", icon: "◉" },
  { id: "schedule", label: "Schedule", icon: "calendar_month" },
  { id: "tasks", label: "Tasks", icon: "check" },
  { id: "documents", label: "Documents", icon: "▤" },
  { id: "labs", label: "Labs", icon: "⌁" },
  { id: "prescribing", label: "E-Rx", icon: "Rx" },
  { id: "billing", label: "Billing", icon: "$" },
  // Communications is one launcher destination with channel choices inside it.
  // Inbox, Fax, and Community used to be duplicated across top-level launcher
  // destinations and communication surfaces, leaving multiple navigation models
  // for the same family of work.
  { id: "communications", label: "Communications", icon: "forum" },
  { id: "reports", label: "Reports", icon: "▥" },
  { id: "settings", label: "Settings", icon: "settings" },
];

/**
 * The drawer, filtered through the tool registry.
 *
 * The catalogue above is the vocabulary; the registry decides what is offered. The
 * two had drifted — the drawer kept a Reports tile the registry had already
 * withdrawn, and at P9-0 it also offered the Financials prototype — which is the
 * same class of defect the comment above describes, just one layer further in.
 * Entries with no registry row (`today`, `patients`, `schedule`,
 * `communications`) are launcher-level destinations rather than pinnable tools
 * and are always offered.
 */
export const googleWorkspaceApps = workspaceAppCatalogue.filter((app) => {
  const tool = findTool(app.id);
  return tool ? isAvailableTool(tool) : true;
});

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

/**
 * Answers an omnibox question about the chart in front of the clinician.
 *
 * `roster` is the accessible patient roster the caller already holds. Cross-patient
 * phrasing ("split screen with Jordan") may only reach a patient in it, so this
 * function cannot name a chart the signed-in clinician has no access to.
 */
export function executeClinicalQuery(
  rawQuery: string,
  activePatient?: Patient | null,
  preferences?: ProviderPreferences,
  roster: readonly Patient[] = [],
): ClinicalQueryAnswer | null {
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery || normalizedQuery.length < 3) return null;

  // 0a. AI Schedule & Clinical Interval Jump Operator (e.g. "pull up 28 days later", "56 days later", "84 days later")
  const jumpMatch = parseScheduleJumpQuery(normalizedQuery);
  if (jumpMatch) {
    const patientDisplayName = activePatient?.name || "Practice Schedule";
    const patientId = activePatient?.id || "";
    return {
      type: "schedule-jump",
      title: `Calendar Operator · ${jumpMatch.days} Days Later`,
      body: `Jump calendar to ${jumpMatch.formattedFull} (${jumpMatch.days} days from today · ${jumpMatch.weeksHint}). Check opening slots for follow-up and prescription renewals.`,
      patientId,
      patientName: patientDisplayName,
      actionLabel: `Pull Up ${jumpMatch.formattedDisplay} (+${jumpMatch.days}d)`,
      scheduleDate: jumpMatch.targetDate,
      scheduleDaysLater: jumpMatch.days,
    };
  }

  // 0b. AI Layout & Preference queries
  if (preferences) {
    const prefResult = parseAiPreferenceCommand(normalizedQuery, preferences);
    if (prefResult.recognized && prefResult.updatedPreferences) {
      return {
        type: "protocol-info",
        title: "Workspace Layout Operator",
        body: prefResult.feedback,
        patientId: activePatient?.id ?? "",
        patientName: activePatient?.name ?? "Workspace",
        actionLabel: "Apply Layout Change",
      };
    }
  }

  // If no patient is active, subsequent clinical chart queries cannot proceed
  if (!activePatient) return null;

  // Check which patient is mentioned in the query, else fallback to active patient
  const mentionedPatient =
    roster.find((p) => {
      const pName = p.name.toLowerCase();
      const pFirst = pName.split(" ")[0];
      const pLast = pName.split(" ")[1];
      return (
        normalizedQuery.includes(pName) ||
        normalizedQuery.includes(pFirst) ||
        normalizedQuery.includes(pLast)
      );
    }) ?? activePatient;

  // 1. Split Screen / Side by Side Operator
  if (
    normalizedQuery.includes("split") ||
    normalizedQuery.includes("side by side") ||
    normalizedQuery.includes("dual chart") ||
    normalizedQuery.includes("two patients")
  ) {
    // Determine which patient to split (preferably a different one than active)
    const otherPatient =
      roster.find((p) => p.id !== activePatient.id && (
        normalizedQuery.includes(p.name.toLowerCase()) ||
        normalizedQuery.includes(p.name.toLowerCase().split(" ")[0])
      )) || roster.find((p) => p.id !== activePatient.id) || mentionedPatient;

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
    // A shortcut to the chart, not an answer. This instant card is computed in the
    // browser from nothing but the query, so it cannot know what the record says:
    // it used to report lab dates and "OVERDUE" from fixture data under a
    // "Protocol Verified" badge — and answered a lithium question with a lipid
    // panel. The Labs section, and the planner behind Enter, read the record.
    return {
      type: "lab-status",
      title: `Labs & monitoring · ${mentionedPatient.name}`,
      body: `Opens ${mentionedPatient.name}'s results and medication monitoring, as recorded in the chart. Press Enter to ask about the record itself.`,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: `Open ${mentionedPatient.name.split(" ")[0]}'s Labs`,
      actionSection: "Labs",
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
    // Navigation only, for the same reason as the lab shortcut: quoting a note
    // here meant quoting fixture notes, not this patient's record.
    return {
      type: "encounter-match",
      title: `Visit notes · ${mentionedPatient.name}`,
      body: `Opens ${mentionedPatient.name}'s visit history to look for “${matchesKeyword}”.`,
      patientId: mentionedPatient.id,
      patientName: mentionedPatient.name,
      actionLabel: "Open Visit History",
      actionSection: "History",
    };
  }

  return null;
}
