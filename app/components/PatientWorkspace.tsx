"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TodayDashboard from "./TodayDashboard";
import WorkspaceCustomizer from "./WorkspaceCustomizer";
import {
  calculateMonitoringStatus,
  medicationProtocols,
  patientLabHistory,
  patientEncounterHistory,
  type LabStatus,
  type LabObservation,
  type PatientMonitoringItem,
  type PastEncounter,
} from "../lib/clinical-protocols";
import {
  type ProviderPreferences,
  type OverviewCardId,
  defaultPreferences,
  builtInPresets,
  loadPreferences,
  savePreferences,
  parseAiPreferenceCommand,
} from "../lib/preference-engine";
import {
  type EncounterState,
  type CandidateAction,
  type TranscriptUtterance,
  type MentalStatusExam,
  type NoteTemplate,
  type CodingRecommendation,
  type EncounterGoal,
  type MdmLevel,
  defaultMse,
  builtInTemplates,
  calculateEncounterCoding,
  getSavedTemplatePreference,
  saveTemplatePreference,
  ambientScenarios,
  loadEncounterDraft,
  saveEncounterDraft,
  signEncounterDraft,
} from "../lib/encounter-engine";

type Section = "Overview" | "Encounter" | "Meds" | "Labs" | "Messages" | "History";

type ClinicalQueryAnswer = {
  type: "lab-status" | "encounter-match" | "protocol-info";
  title: string;
  body: string;
  patientId: string;
  patientName: string;
  actionLabel?: string;
  actionSection?: Section;
  labOrderName?: string;
};

type Patient = {
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

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
};

type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = {
  readonly error: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const patients: Patient[] = [
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

const sections: Section[] = ["Overview", "Encounter", "Meds", "Labs", "Messages", "History"];

const sectionAliases: Record<Section, string[]> = {
  Overview: ["overview", "summary", "snapshot", "chart"],
  Encounter: ["encounter", "visit", "note"],
  Meds: ["meds", "medications", "medication", "prescriptions", "rx"],
  Labs: ["labs", "lab", "results", "bloodwork"],
  Messages: ["messages", "message", "portal"],
  History: ["history", "timeline", "longitudinal"],
};

type CompanionToolId = "ai" | "scratchpad" | "tasks" | "calc";

type ScratchNote = {
  id: string;
  text: string;
  time: string;
  color: string;
};

type ClinicalTask = {
  id: string;
  text: string;
  completed: boolean;
  due: string;
};

const googleWorkspaceApps = [
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

const phqQuestions = [
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

function resolvePatientFromCommand(input: string) {
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

function resolveSectionFromCommand(input: string): Section | undefined {
  const normalized = input.trim().toLowerCase();
  return sections.find((candidate) =>
    sectionAliases[candidate].some((alias) => normalized.includes(alias)),
  );
}

export default function PatientWorkspace() {
  const [activeView, setActiveView] = useState<"today" | "patient">("today");
  const [openPatientIds, setOpenPatientIds] = useState(["maya-chen", "jordan-reed"]);
  const [detachedPatientIds, setDetachedPatientIds] = useState<string[]>([]);
  const [detachedSections, setDetachedSections] = useState<Record<string, Section>>({});
  const [activePatientId, setActivePatientId] = useState("maya-chen");
  const [section, setSection] = useState<Section>("Overview");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCompanionPanel, setActiveCompanionPanel] = useState<CompanionToolId | null>("ai");
  const [waffleOpen, setWaffleOpen] = useState(false);
  const [globalAiPrompt, setGlobalAiPrompt] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [scratchpadNotes, setScratchpadNotes] = useState<ScratchNote[]>([
    {
      id: "note-1",
      text: "Titration note: Discussed Guanfacine ER increase to 3mg nightly if bedtime sedation is tolerated. Check blood pressure before committing.",
      time: "10:45 AM",
      color: "note-yellow",
    },
    {
      id: "note-2",
      text: "Differential: GAD vs ADHD-related emotional dysregulation. Follow up Vanderbilt rating scale and repeat GAD-7 at next visit.",
      time: "Yesterday",
      color: "note-blue",
    },
  ]);
  const [newNoteText, setNewNoteText] = useState("");
  const [tasks, setTasks] = useState<ClinicalTask[]>([
    { id: "task-1", text: "Review Jordan Reed lithium level (Due today)", completed: false, due: "Today" },
    { id: "task-2", text: "Complete prior authorization for Vyvanse 40mg", completed: false, due: "Tomorrow" },
    { id: "task-3", text: "Sign encounter draft for Maya Chen", completed: false, due: "Today" },
    { id: "task-4", text: "Order follow-up CMP & Lipid panel", completed: true, due: "Done" },
  ]);
  const [newTaskText, setNewTaskText] = useState("");
  const [phqAnswers, setPhqAnswers] = useState<Record<number, number>>({ 0: 2, 1: 1, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0 });
  const [preferences, setPreferences] = useState<ProviderPreferences>(defaultPreferences);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const waffleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  useEffect(() => {
    function handleViewSwitch(event: Event) {
      const customEvent = event as CustomEvent<{ view: string }>;
      const view = customEvent.detail?.view;
      if (view === "today" || view === "schedule") {
        setActiveView("today");
      } else if (view === "patients") {
        setActiveView("patient");
      }
    }
    window.addEventListener("ehr-switch-view", handleViewSwitch);
    return () => window.removeEventListener("ehr-switch-view", handleViewSwitch);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!waffleRef.current?.contains(event.target as Node)) {
        setWaffleOpen(false);
      }
    }
    if (waffleOpen) document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [waffleOpen]);

  const activePatient = patients.find((patient) => patient.id === activePatientId) ?? patients[0];
  const dockedPatientIds = openPatientIds.filter((id) => !detachedPatientIds.includes(id));
  const normalizedQuery = query.trim().toLowerCase();
  const commandPatient = useMemo(() => resolvePatientFromCommand(query), [query]);
  const commandSection = useMemo(() => resolveSectionFromCommand(query), [query]);
  const filteredPatients = useMemo(() => {
    if (!normalizedQuery) return [];
    return patients.filter((patient) => {
      const searchable = `${patient.name} ${patient.mrn} ${patient.dob}`.toLowerCase();
      const nameParts = patient.name.toLowerCase().split(" ");
      return (
        searchable.includes(normalizedQuery) ||
        nameParts.some((part) => part.length > 2 && normalizedQuery.includes(part))
      );
    });
  }, [normalizedQuery]);

  const queryClinicalAnswer = useMemo<ClinicalQueryAnswer | null>(() => {
    if (!normalizedQuery || normalizedQuery.length < 3) return null;

    // Check which patient is mentioned in the query, else fallback to active patient
    const mentionedPatient =
      patients.find((p) => {
        const pName = p.name.toLowerCase();
        const pFirst = pName.split(" ")[0];
        const pLast = pName.split(" ")[1];
        return normalizedQuery.includes(pName) || normalizedQuery.includes(pFirst) || normalizedQuery.includes(pLast);
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
  }, [normalizedQuery, activePatient]);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    setVoiceSupported(true);
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setQuery(transcript.trimStart());
      setSearchFocused(true);
      setVoiceMessage("Listening…");
    };

    recognition.onend = () => {
      setIsListening(false);
      setVoiceMessage("");
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      setVoiceMessage(event.error === "not-allowed" ? "Microphone permission is off" : "Voice input unavailable");
    };

    recognitionRef.current = recognition;
    return () => {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        commandInputRef.current?.focus();
        setSearchFocused(true);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function openPatient(id: string, targetSection: Section = "Overview") {
    setOpenPatientIds((current) => (current.includes(id) ? current : [...current, id]));
    setDetachedPatientIds((current) => current.filter((patientId) => patientId !== id));
    setActivePatientId(id);
    setSection(targetSection);
    setActiveView("patient");
    setQuery("");
    setSearchFocused(false);
  }

  function handleStartVisit(patientId: string, patientName: string) {
    setOpenPatientIds((current) => (current.includes(patientId) ? current : [...current, patientId]));
    setDetachedPatientIds((current) => current.filter((id) => id !== patientId));
    setActivePatientId(patientId);
    setSection("Encounter");
    setActiveView("patient");
    setWorkspaceMessage(`Started encounter for ${patientName}`);
    window.setTimeout(() => setWorkspaceMessage(""), 3000);
  }

  function handleOpenChart(patientId: string, targetSection?: string) {
    setOpenPatientIds((current) => (current.includes(patientId) ? current : [...current, patientId]));
    setDetachedPatientIds((current) => current.filter((id) => id !== patientId));
    setActivePatientId(patientId);
    if (targetSection) setSection(targetSection as Section);
    setActiveView("patient");
  }

  function handleEncounterSigned(patientId: string) {
    const p = patients.find((item) => item.id === patientId);
    if (p) {
      p.lastVisit = "Sep 4, 2026 (Signed)";
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ehr-encounter-signed", { detail: { patientId } }));
    }
    setWorkspaceMessage(`Encounter for ${p?.name || patientId} signed and added to legal medical record!`);
    window.setTimeout(() => setWorkspaceMessage(""), 4000);
  }

  function runAiCommand(rawCommand: string) {
    const command = rawCommand.trim();
    if (!command) return;

    // Check for layout & preference commands
    const aiPref = parseAiPreferenceCommand(command, preferences);
    if (aiPref.recognized && aiPref.updatedPreferences) {
      setPreferences(aiPref.updatedPreferences);
      setWorkspaceMessage(aiPref.feedback);
      window.setTimeout(() => setWorkspaceMessage(""), 3500);
      setQuery("");
      setSearchFocused(false);
      return;
    }

    if (queryClinicalAnswer?.actionSection) {
      openPatient(queryClinicalAnswer.patientId, queryClinicalAnswer.actionSection);
      return;
    }

    const targetPatient = resolvePatientFromCommand(command);
    const targetSection = resolveSectionFromCommand(command);

    if (targetPatient) {
      openPatient(targetPatient.id, targetSection ?? "Overview");
      return;
    }

    if (targetSection) {
      setSection(targetSection);
      setQuery("");
      setSearchFocused(false);
      return;
    }

    setGlobalAiPrompt(command);
    setActiveCompanionPanel("ai");
    setQuery("");
    setSearchFocused(false);
  }

  function toggleVoice() {
    const recognition = recognitionRef.current;
    if (!voiceSupported || !recognition) {
      setVoiceMessage("Voice input is not supported in this browser");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }

    try {
      setVoiceMessage("Listening…");
      setSearchFocused(true);
      commandInputRef.current?.focus();
      recognition.start();
      setIsListening(true);
    } catch {
      setVoiceMessage("Voice input is already active");
    }
  }

  function closePatient(id: string) {
    const detachedAfterClose = detachedPatientIds.filter((patientId) => patientId !== id);
    setDetachedPatientIds(detachedAfterClose);
    setDetachedSections((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    setOpenPatientIds((current) => {
      const remaining = current.filter((patientId) => patientId !== id);
      if (id === activePatientId) {
        const nextDocked = remaining.filter((patientId) => !detachedAfterClose.includes(patientId));
        setActivePatientId(nextDocked.at(-1) ?? remaining.at(-1) ?? patients[0].id);
        setSection("Overview");
      }
      return remaining;
    });
  }

  function reorderTab(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    if (detachedPatientIds.includes(draggedId)) {
      dockPatient(draggedId, targetId);
      return;
    }

    setOpenPatientIds((current) => {
      const next = [...current];
      const from = next.indexOf(draggedId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
    setDraggedId(null);
  }

  function detachPatient(id: string) {
    const docked = openPatientIds.filter((patientId) => !detachedPatientIds.includes(patientId));
    if (docked.length <= 1) {
      setWorkspaceMessage("Keep at least one patient docked in the main workspace.");
      window.setTimeout(() => setWorkspaceMessage(""), 2200);
      setDraggedId(null);
      return;
    }

    setDetachedPatientIds((current) => (current.includes(id) ? current : [...current, id]));
    setDetachedSections((current) => ({
      ...current,
      [id]: current[id] ?? (id === activePatientId ? section : "Overview"),
    }));

    if (id === activePatientId) {
      const nextActive = docked.find((patientId) => patientId !== id);
      if (nextActive) {
        setActivePatientId(nextActive);
        setSection("Overview");
      }
    }

    setDraggedId(null);
  }

  function dockPatient(id: string, targetId?: string) {
    setDetachedPatientIds((current) => current.filter((patientId) => patientId !== id));

    if (targetId && targetId !== id) {
      setOpenPatientIds((current) => {
        const next = current.filter((patientId) => patientId !== id);
        const targetIndex = next.indexOf(targetId);
        if (targetIndex < 0) return [...next, id];
        next.splice(targetIndex, 0, id);
        return next;
      });
    }

    setActivePatientId(id);
    setSection(detachedSections[id] ?? "Overview");
    setDraggedId(null);
  }

  function startPatientDrag(id: string, event: React.DragEvent<HTMLElement>) {
    setDraggedId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-ehr-patient", id);
    event.dataTransfer.setData("text/plain", id);
  }

  const commandLabel = commandPatient
    ? `Open ${commandPatient.name}${commandSection ? ` · ${commandSection}` : ""}`
    : commandSection
      ? `Open ${activePatient.name} · ${commandSection}`
      : query.trim()
        ? `Ask Clinical AI: “${query.trim()}”`
        : "";

  return (
    <main className={`app-shell density-${preferences.density}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" title="EHR Workspace">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div>
            <strong>EHR Workspace</strong>
            <span>Clinical Workspace</span>
          </div>
        </div>

        <div className={`patient-search-wrap ${isListening ? "listening" : ""}`}>
          <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={commandInputRef}
            aria-label="Ask AI or search the EHR"
            value={query}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runAiCommand(query);
              if (event.key === "Escape") {
                setQuery("");
                setSearchFocused(false);
                commandInputRef.current?.blur();
              }
            }}
            placeholder={isListening ? "Listening…" : "Search patients, records, or ask Clinical AI…"}
          />
          <span className="command-ai-badge"><span>✦</span> AI</span>
          {isListening && <span className="voice-listening"><span />Listening</span>}
          <button
            type="button"
            className={`voice-toggle ${isListening ? "active" : ""}`}
            aria-label={isListening ? "Stop voice input" : "Start voice input"}
            aria-pressed={isListening}
            title={voiceSupported ? "Voice input" : "Voice input requires a supported browser"}
            onClick={toggleVoice}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M6.5 10.5v.8a5.5 5.5 0 0 0 11 0v-.8M12 16.8V21M9 21h6" />
            </svg>
          </button>
          <kbd>Ctrl K</kbd>

          {searchFocused && (query.trim() || voiceMessage) && (
            <div className="search-results command-results">
              {queryClinicalAnswer && (
                <div className="query-answer-card">
                  <div className="query-answer-header">
                    <span className="query-answer-title">
                      <span>✦</span> {queryClinicalAnswer.title}
                    </span>
                    <span className="query-confidence-badge">Protocol Verified</span>
                  </div>
                  <p>{queryClinicalAnswer.body}</p>
                  <div className="query-card-actions">
                    {queryClinicalAnswer.actionLabel && (
                      <button
                        type="button"
                        className="query-card-btn primary"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openPatient(queryClinicalAnswer.patientId, queryClinicalAnswer.actionSection ?? "Overview")}
                      >
                        {queryClinicalAnswer.actionLabel}
                      </button>
                    )}
                    {queryClinicalAnswer.labOrderName && (
                      <button
                        type="button"
                        className="query-card-btn"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setWorkspaceMessage(`Drafted lab order for ${queryClinicalAnswer.patientName}: ${queryClinicalAnswer.labOrderName}`);
                          window.setTimeout(() => setWorkspaceMessage(""), 3000);
                        }}
                      >
                        ＋ Draft Order
                      </button>
                    )}
                  </div>
                </div>
              )}

              {query.trim() && (
                <button className="ai-command-result" onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand(query)}>
                  <span className="command-result-icon">✦</span>
                  <span>
                    <strong>{commandLabel}</strong>
                    <small>{commandPatient || commandSection ? "AI-routed workspace command" : "Send to Clinical AI with the active chart context"}</small>
                  </span>
                  <span className="enter-hint">↵</span>
                </button>
              )}

              {filteredPatients.length > 0 && <div className="result-group-label">Patients</div>}
              {filteredPatients.map((patient) => (
                <button key={patient.id} onMouseDown={(event) => event.preventDefault()} onClick={() => openPatient(patient.id)}>
                  <span className="avatar small">{patient.initials}</span>
                  <span>
                    <strong>{patient.name}</strong>
                    <small>{patient.mrn} · DOB {patient.dob}</small>
                  </span>
                </button>
              ))}

              {voiceMessage && !isListening && <div className="voice-message">{voiceMessage}</div>}
            </div>
          )}

          {searchFocused && !query.trim() && !voiceMessage && (
            <div className="search-results command-results command-starters">
              <div className="result-group-label">Try a clinical question or command</div>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("When were Jordan's labs last done?"); }}><span className="command-result-icon">✦</span><span><strong>When were Jordan&apos;s labs last done?</strong><small>Check surveillance dates & protocol status</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("Find sleep notes in Maya Chen"); }}><span className="command-result-icon">✦</span><span><strong>Find sleep notes in Maya Chen</strong><small>Search longitudinal encounter notes</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("Open Jordan Reed medications")}><span className="command-result-icon">✦</span><span><strong>Open Jordan Reed medications</strong><small>Navigate by natural language</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("What needs my attention today?")}><span className="command-result-icon">✦</span><span><strong>What needs my attention today?</strong><small>Send a global question to Clinical AI</small></span></button>
            </div>
          )}
        </div>

        <div className="top-actions">
          <div className="topbar-apps-anchor" ref={waffleRef}>
            <button
              type="button"
              className={`icon-button waffle-launcher ${waffleOpen ? "active" : ""}`}
              aria-label="Google Apps Launcher"
              title="Google EHR Apps"
              onClick={() => setWaffleOpen((prev) => !prev)}
            >
              <span className="nine-dot-grid" aria-hidden="true">
                {Array.from({ length: 9 }).map((_, index) => (
                  <i key={index} />
                ))}
              </span>
            </button>

            {waffleOpen && (
              <div className="topbar-apps-drawer">
                <div className="apps-drawer-header">
                  <strong>Google EHR Apps</strong>
                  <small>Quickly switch clinical or administrative tools</small>
                </div>
                <div className="apps-drawer-grid">
                  {googleWorkspaceApps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="app-drawer-item"
                      onClick={() => {
                        if (app.id === "today" || app.id === "schedule") {
                          setActiveView("today");
                        } else if (app.id === "patients") {
                          setActiveView("patient");
                        }
                        setWorkspaceMessage(`Switched to ${app.label}`);
                        setWaffleOpen(false);
                        window.setTimeout(() => setWorkspaceMessage(""), 2200);
                      }}
                    >
                      <span className="app-drawer-icon">{app.icon}</span>
                      <span className="app-drawer-label">{app.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="icon-button" aria-label="Help" title="Help & documentation">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-button topbar-layout-btn"
            aria-label="Layout & Preferences"
            title="Customize workspace modularity & layout preferences (⚙️)"
            onClick={() => setCustomizerOpen(true)}
          >
            <span style={{ fontSize: "15px" }}>⚙️</span>
          </button>
          <div className="provider-avatar" title="Logan Carton (Attending Physician)">LC</div>
        </div>
      </header>

      <section className={`workspace ${activeCompanionPanel !== null ? "with-companion" : ""}`}>
        <div
          className={`browser-tabs ${draggedId && detachedPatientIds.includes(draggedId) ? "dock-ready" : ""}`}
          onDragOver={(event) => {
            if (draggedId && detachedPatientIds.includes(draggedId)) event.preventDefault();
          }}
          onDrop={(event) => {
            if (!draggedId || !detachedPatientIds.includes(draggedId)) return;
            event.preventDefault();
            dockPatient(draggedId);
          }}
        >
          <button
            type="button"
            className={`home-tab ${activeView === "today" ? "active" : ""}`}
            title="Today / Schedule Dashboard"
            onClick={() => setActiveView("today")}
          >
            ⌂
          </button>
          {dockedPatientIds.map((id) => {
            const patient = patients.find((item) => item.id === id);
            if (!patient) return null;
            return (
              <div
                key={patient.id}
                draggable
                onDragStart={(event) => startPatientDrag(patient.id, event)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  reorderTab(patient.id);
                }}
                onDragEnd={() => setDraggedId(null)}
                className={`browser-tab ${activeView === "patient" && patient.id === activePatientId ? "active" : ""}`}
                onClick={() => {
                  setActivePatientId(patient.id);
                  setActiveView("patient");
                }}
                title="Drag to reorder, or drag into the chart area to split this patient into a pane"
              >
                <span className="tab-dot" />
                <span className="tab-name">{patient.name}</span>
                {patient.alert && <span className="alert-dot" title={patient.alert} />}
                <button
                  aria-label={`Close ${patient.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closePatient(patient.id);
                  }}
                >×</button>
              </div>
            );
          })}
          <button className="new-tab" onClick={() => { commandInputRef.current?.focus(); setSearchFocused(true); }}>＋</button>
          <div className="tab-spacer" />
          {detachedPatientIds.length > 0 && <span className="detached-count">{detachedPatientIds.length} split</span>}
          <button
            className={`ai-toggle ${activeCompanionPanel === "ai" ? "active" : ""}`}
            onClick={() => setActiveCompanionPanel((curr) => (curr === "ai" ? null : "ai"))}
          >
            ✦ Gemini AI
          </button>
        </div>

        <div
          className={`workspace-body ${draggedId && !detachedPatientIds.includes(draggedId) ? "tab-drag-active" : ""}`}
          onDragOver={(event) => {
            if (draggedId && !detachedPatientIds.includes(draggedId)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(event) => {
            if (!draggedId || detachedPatientIds.includes(draggedId)) return;
            event.preventDefault();
            detachPatient(draggedId);
          }}
        >
          {draggedId && !detachedPatientIds.includes(draggedId) && (
            <div className="detach-drop-hint">Drop here to open this patient side by side</div>
          )}

          {activeView === "today" ? (
            <section className="primary-workspace-pane">
              <TodayDashboard
                preferences={preferences}
                onUpdatePreferences={setPreferences}
                onOpenCustomizer={() => setCustomizerOpen(true)}
                onStartVisit={(patientId, patientName) => {
                  handleStartVisit(patientId, patientName);
                }}
                onOpenChart={(patientId, targetSection) => {
                  handleOpenChart(patientId, targetSection);
                }}
                onDraftLabOrder={(patientName, labName) => {
                  setWorkspaceMessage(`Drafted lab order for ${patientName}: ${labName}`);
                  window.setTimeout(() => setWorkspaceMessage(""), 3000);
                }}
              />
            </section>
          ) : (
            <section className="primary-workspace-pane">
              <PatientHeader
                patient={activePatient}
                headerDensity={preferences.headerDensity}
                onOpenCustomizer={() => setCustomizerOpen(true)}
              />

              {activePatient.alert && (
                <div className="clinical-alert"><strong>Attention:</strong> {activePatient.alert}<button>Review</button></div>
              )}

              <SectionTabs value={section} onChange={setSection} />
              <div className={`content-area ${section === "Encounter" ? "encounter-mode" : ""}`}>
                <PatientSection
                  patient={activePatient}
                  section={section}
                  preferences={preferences}
                  onUpdatePreferences={setPreferences}
                  onDraftOrder={(orderName) => {
                    setWorkspaceMessage(`Drafted lab order for ${activePatient.name}: ${orderName}`);
                    window.setTimeout(() => setWorkspaceMessage(""), 3000);
                  }}
                  onInsertText={(text) => {
                    setWorkspaceMessage("Inserted prior note context into active encounter!");
                    window.setTimeout(() => setWorkspaceMessage(""), 3000);
                  }}
                  onEncounterSigned={handleEncounterSigned}
                />
              </div>
            </section>
          )}

          {detachedPatientIds.map((id) => {
            const patient = patients.find((item) => item.id === id);
            if (!patient) return null;
            const paneSection = detachedSections[id] ?? "Overview";

            return (
              <section className="detached-patient-pane" key={id}>
                <div
                  className="detached-pane-header"
                  draggable
                  onDragStart={(event) => startPatientDrag(id, event)}
                  onDragEnd={() => setDraggedId(null)}
                  title="Drag this header back to the tab bar to dock"
                >
                  <span className="pane-drag-handle" aria-hidden="true">⠿</span>
                  <div className="avatar small">{patient.initials}</div>
                  <div className="detached-pane-title">
                    <strong>{patient.name}</strong>
                    <small>{patient.mrn} · DOB {patient.dob}</small>
                  </div>
                  <button draggable={false} className="dock-button" onClick={() => dockPatient(id)} title="Return to tab bar">Dock</button>
                  <button draggable={false} className="pane-close-button" aria-label={`Close ${patient.name}`} onClick={() => closePatient(id)}>×</button>
                </div>

                {patient.alert && <div className="detached-alert">{patient.alert}</div>}
                <SectionTabs
                  compact
                  value={paneSection}
                  onChange={(nextSection) => setDetachedSections((current) => ({ ...current, [id]: nextSection }))}
                />
                <div className={`detached-content ${paneSection === "Encounter" ? "encounter-mode" : ""}`}>
                  <PatientSection
                    patient={patient}
                    section={paneSection}
                    preferences={preferences}
                    onUpdatePreferences={setPreferences}
                    onDraftOrder={(orderName) => {
                      setWorkspaceMessage(`Drafted lab order for ${patient.name}: ${orderName}`);
                      window.setTimeout(() => setWorkspaceMessage(""), 3000);
                    }}
                    onInsertText={(text) => {
                      setWorkspaceMessage("Inserted prior note context into active encounter!");
                      window.setTimeout(() => setWorkspaceMessage(""), 3000);
                    }}
                    onEncounterSigned={handleEncounterSigned}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* Google Workspace Right Companion Rail */}
      {preferences.showCompanionRail && (
        <aside className="companion-rail" aria-label="Google Workspace Companion Tools">
          <button
            type="button"
            className={`companion-rail-btn ${activeCompanionPanel === "ai" ? "active" : ""}`}
            title="Clinical AI (Gemini)"
            aria-label="Clinical AI"
            onClick={() => setActiveCompanionPanel((curr) => (curr === "ai" ? null : "ai"))}
          >
            ✦
          </button>
          <button
            type="button"
            className={`companion-rail-btn ${activeCompanionPanel === "scratchpad" ? "active" : ""}`}
            title="Clinical Scratchpad (Google Keep)"
            aria-label="Clinical Scratchpad"
            onClick={() => setActiveCompanionPanel((curr) => (curr === "scratchpad" ? null : "scratchpad"))}
          >
            📝
          </button>
          <button
            type="button"
            className={`companion-rail-btn ${activeCompanionPanel === "tasks" ? "active" : ""}`}
            title="Tasks & Follow-ups (Google Tasks)"
            aria-label="Tasks & Follow-ups"
            onClick={() => setActiveCompanionPanel((curr) => (curr === "tasks" ? null : "tasks"))}
          >
            ✓
          </button>
          <button
            type="button"
            className={`companion-rail-btn ${activeCompanionPanel === "calc" ? "active" : ""}`}
            title="Clinical Calculators (PHQ-9 / GAD-7)"
            aria-label="Clinical Calculators"
            onClick={() => setActiveCompanionPanel((curr) => (curr === "calc" ? null : "calc"))}
          >
            🧮
          </button>

          <div className="companion-rail-divider" />

          <button
            type="button"
            className="companion-rail-btn add-btn"
            title="Add Tools & Add-ons"
            aria-label="Add Tools"
            onClick={() => {
              setWorkspaceMessage("Google EHR Add-ons marketplace coming soon.");
              window.setTimeout(() => setWorkspaceMessage(""), 2200);
            }}
          >
            ＋
          </button>
        </aside>
      )}

      {/* Active Companion Panel (Gemini AI, Keep Scratchpad, Google Tasks, Calculator) */}
      {activeCompanionPanel === "ai" && (
        <AiPanel
          patient={activePatient}
          section={section}
          command={globalAiPrompt}
          preferences={preferences}
          onUpdatePreferences={setPreferences}
          onOpenCustomizer={() => setCustomizerOpen(true)}
          onClose={() => setActiveCompanionPanel(null)}
        />
      )}

      {activeCompanionPanel === "scratchpad" && (
        <ScratchpadPanel
          notes={scratchpadNotes}
          newNoteText={newNoteText}
          setNewNoteText={setNewNoteText}
          onAddNote={(text) => {
            if (!text.trim()) return;
            setScratchpadNotes([
              { id: `note-${Date.now()}`, text, time: "Just now", color: "note-yellow" },
              ...scratchpadNotes,
            ]);
            setNewNoteText("");
          }}
          onDeleteNote={(id) => setScratchpadNotes(scratchpadNotes.filter((n) => n.id !== id))}
          onInsertToNote={(text) => {
            setWorkspaceMessage("Copied note to clinical clipboard!");
            window.setTimeout(() => setWorkspaceMessage(""), 2200);
          }}
          onClose={() => setActiveCompanionPanel(null)}
        />
      )}

      {activeCompanionPanel === "tasks" && (
        <TasksPanel
          tasks={tasks}
          newTaskText={newTaskText}
          setNewTaskText={setNewTaskText}
          onToggleTask={(id) => {
            setTasks(tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
          }}
          onAddTask={(text) => {
            if (!text.trim()) return;
            setTasks([...tasks, { id: `task-${Date.now()}`, text, completed: false, due: "Today" }]);
            setNewTaskText("");
          }}
          onClose={() => setActiveCompanionPanel(null)}
        />
      )}

      {activeCompanionPanel === "calc" && (
        <CalculatorPanel
          answers={phqAnswers}
          onAnswer={(index, score) => setPhqAnswers({ ...phqAnswers, [index]: score })}
          onInsertToNote={(summary) => {
            setWorkspaceMessage(`Copied "${summary}" to clinical clipboard!`);
            window.setTimeout(() => setWorkspaceMessage(""), 2200);
          }}
          onClose={() => setActiveCompanionPanel(null)}
        />
      )}

      <WorkspaceCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        preferences={preferences}
        onUpdatePreferences={setPreferences}
        onToast={(msg) => {
          setWorkspaceMessage(msg);
          window.setTimeout(() => setWorkspaceMessage(""), 2800);
        }}
      />

      {workspaceMessage && <div className="workspace-toast">{workspaceMessage}</div>}
    </main>
  );
}

function PatientHeader({
  patient,
  headerDensity = "full",
  onOpenCustomizer,
}: {
  patient: Patient;
  headerDensity?: "full" | "compact" | "minimal";
  onOpenCustomizer?: () => void;
}) {
  if (headerDensity === "minimal") {
    return (
      <div className="patient-header patient-header-minimal">
        <div className="patient-identity">
          <div className="avatar small" title={patient.name}>{patient.initials}</div>
          <div className="patient-name-line">
            <h1>{patient.name}</h1>
            <span className="status-pill">{patient.status}</span>
            <span className="minimal-meta">MRN {patient.mrn} · {patient.age} yrs</span>
          </div>
        </div>
        <div className="patient-actions">
          {onOpenCustomizer && (
            <button
              type="button"
              className="btn-icon-customizer"
              onClick={onOpenCustomizer}
              title="Customize workspace layout"
            >
              ⚙️ Layout
            </button>
          )}
          <button type="button" className="primary">＋ New encounter</button>
        </div>
      </div>
    );
  }

  if (headerDensity === "compact") {
    return (
      <div className="patient-header patient-header-compact">
        <div className="patient-identity">
          <div className="avatar compact" title={patient.name}>{patient.initials}</div>
          <div>
            <div className="patient-name-line">
              <h1>{patient.name}</h1>
              <span className="status-pill">{patient.status}</span>
            </div>
            <p>DOB {patient.dob} · {patient.age} yrs · {patient.pronouns} · MRN {patient.mrn}</p>
          </div>
        </div>
        <div className="patient-actions">
          {onOpenCustomizer && (
            <button
              type="button"
              className="btn-icon-customizer"
              onClick={onOpenCustomizer}
              title="Customize workspace layout"
            >
              ⚙️ Layout
            </button>
          )}
          <button type="button">✉ Message</button>
          <button type="button">📅 Schedule</button>
          <button type="button" className="primary">＋ New encounter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-header">
      <div className="patient-identity">
        <div className="avatar" title={patient.name}>{patient.initials}</div>
        <div>
          <div className="patient-name-line">
            <h1>{patient.name}</h1>
            <span className="status-pill">{patient.status}</span>
          </div>
          <p>
            <span>DOB {patient.dob}</span> · 
            <span> {patient.age} yrs</span> · 
            <span> {patient.pronouns}</span> · 
            <span> MRN {patient.mrn}</span>
          </p>
        </div>
      </div>
      <div className="patient-actions">
        {onOpenCustomizer && (
          <button
            type="button"
            className="btn-icon-customizer"
            onClick={onOpenCustomizer}
            title="Customize workspace layout"
          >
            ⚙️ Layout
          </button>
        )}
        <button type="button">✉ Message</button>
        <button type="button">📅 Schedule</button>
        <button type="button" className="primary">＋ New encounter</button>
      </div>
    </div>
  );
}

function SectionTabs({ value, onChange, compact = false }: { value: Section; onChange: (section: Section) => void; compact?: boolean }) {
  return (
    <nav className={`section-tabs ${compact ? "compact-section-tabs" : ""}`}>
      {sections.map((item) => (
        <button key={item} className={value === item ? "active" : ""} onClick={() => onChange(item)}>
          {item}
        </button>
      ))}
    </nav>
  );
}

function PatientSection({
  patient,
  section,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onDraftOrder,
  onInsertText,
  onEncounterSigned,
}: {
  patient: Patient;
  section: Section;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onDraftOrder: (orderName: string) => void;
  onInsertText: (text: string) => void;
  onEncounterSigned?: (patientId: string) => void;
}) {
  if (section === "Overview")
    return (
      <Overview
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
      />
    );
  if (section === "Encounter")
    return (
      <Encounter
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
        onInsertText={onInsertText}
        onEncounterSigned={onEncounterSigned}
      />
    );
  if (section === "Meds") return <MedicationList patient={patient} onDraftOrder={onDraftOrder} />;
  if (section === "Labs") return <LabsView patient={patient} onDraftOrder={onDraftOrder} />;
  if (section === "Messages") return <Placeholder title="Messages" text="Patient communication will stay attached to the patient workspace instead of becoming a separate silo." />;
  return <Placeholder title="Longitudinal history" text="A unified chronological record of visits, medications, diagnoses, labs, messages, and imported records." />;
}

function Overview({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
}) {
  function hideCard(key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: false },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function toggleCollapse(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const isCollapsed = preferences.overview.collapsedCards[cardId] || false;
    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        collapsedCards: {
          ...preferences.overview.collapsedCards,
          [cardId]: !isCollapsed,
        },
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function moveCard(index: number, direction: "up" | "down") {
    if (!onUpdatePreferences) return;
    const order = [...preferences.overview.cardOrder];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;
    const temp = order[index];
    order[index] = order[target];
    order[target] = temp;
    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: order,
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  // Dynamic snapshot & surveillance data
  const monitoring = useMemo(() => {
    return calculateMonitoringStatus(patient.meds, patientLabHistory[patient.id] || []);
  }, [patient.meds, patient.id]);

  const overdueItem = monitoring.find((m) => m.status === "overdue");
  const pastEnc = patientEncounterHistory[patient.id]?.[0];

  // Dynamic chronological clinical timeline per patient
  const timelineItems = useMemo(() => {
    const encList = patientEncounterHistory[patient.id] || [];
    const labList = patientLabHistory[patient.id] || [];

    type TimelineEntry = {
      id: string;
      date: string;
      title: string;
      detail: string;
      type: "encounter" | "lab" | "intake";
    };

    const entries: TimelineEntry[] = [];

    encList.forEach((enc) => {
      entries.push({
        id: enc.id,
        date: enc.date,
        title: enc.type,
        detail: enc.chiefComplaint || enc.assessment.slice(0, 85) + "...",
        type: "encounter",
      });
    });

    labList.forEach((lab) => {
      entries.push({
        id: lab.id,
        date: lab.date,
        title: `Lab Result: ${lab.testName}`,
        detail: `${lab.value} ${lab.unit} (${lab.flag === "high" ? "High" : "Normal limits"})`,
        type: "lab",
      });
    });

    if (entries.length === 0) {
      entries.push({
        id: "baseline",
        date: "Today",
        title: "Intake Scheduled",
        detail: "Comprehensive psychiatric baseline evaluation pending.",
        type: "intake",
      });
    }

    return entries;
  }, [patient.id]);

  return (
    <div className="overview-grid">
      {preferences.overview.cardOrder.map((cardId, index) => {
        if (cardId === "snapshot") {
          if (!preferences.overview.showSnapshot) return null;
          const isCollapsed = preferences.overview.collapsedCards.snapshot || false;
          return (
            <section className={`card wide-card ${isCollapsed ? "is-collapsed" : ""}`} key="snapshot">
              <div className="card-heading">
                <div>
                  <span className="eyebrow">Clinical snapshot</span>
                  <h2>What matters now</h2>
                </div>
                <div className="card-header-tools">
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === 0}
                    onClick={() => moveCard(index, "up")}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === preferences.overview.cardOrder.length - 1}
                    onClick={() => moveCard(index, "down")}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    onClick={() => toggleCollapse("snapshot")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    onClick={() => hideCard("showSnapshot")}
                    title="Hide card"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="snapshot-grid">
                  <div>
                    <span>Last visit</span>
                    <strong>{patient.lastVisit}</strong>
                    <small>{pastEnc ? pastEnc.type : "Initial evaluation"}</small>
                  </div>
                  <div>
                    <span>Next visit</span>
                    <strong>{patient.nextVisit}</strong>
                    <small>Scheduled follow-up</small>
                  </div>
                  <div>
                    <span>Clinical status</span>
                    <strong style={{ color: overdueItem ? "#b3261e" : "#137333" }}>
                      {overdueItem ? "Surveillance Due" : "Improving / Stable"}
                    </strong>
                    <small>
                      {overdueItem
                        ? `${overdueItem.requiredLab.split(" ")[0]} overdue (${overdueItem.daysElapsed}d)`
                        : "Target symptoms managed"}
                    </small>
                  </div>
                </div>
              )}
            </section>
          );
        }

        if (cardId === "diagnoses") {
          if (!preferences.overview.showDiagnoses) return null;
          const isCollapsed = preferences.overview.collapsedCards.diagnoses || false;
          return (
            <section className={`card ${isCollapsed ? "is-collapsed" : ""}`} key="diagnoses">
              <div className="card-heading">
                <h2>Diagnoses</h2>
                <div className="card-header-tools">
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === 0}
                    onClick={() => moveCard(index, "up")}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === preferences.overview.cardOrder.length - 1}
                    onClick={() => moveCard(index, "down")}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    onClick={() => toggleCollapse("diagnoses")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    onClick={() => hideCard("showDiagnoses")}
                    title="Hide card"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="stack-list">
                  {patient.diagnoses.map((diagnosis, dIndex) => (
                    <div key={diagnosis}>
                      <span className="code">F{dIndex + 4}x.x</span>
                      <strong>{diagnosis}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        }

        if (cardId === "medications") {
          if (!preferences.overview.showMedications) return null;
          const isCollapsed = preferences.overview.collapsedCards.medications || false;
          const isWide = index === 0;
          return (
            <section className={`card ${isWide ? "wide-card" : ""} ${isCollapsed ? "is-collapsed" : ""}`} key="medications">
              <div className="card-heading">
                <h2>Current medications</h2>
                <div className="card-header-tools">
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === 0}
                    onClick={() => moveCard(index, "up")}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === preferences.overview.cardOrder.length - 1}
                    onClick={() => moveCard(index, "down")}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    onClick={() => toggleCollapse("medications")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    onClick={() => hideCard("showMedications")}
                    title="Hide card"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="stack-list">
                  {patient.meds.map((medication) => (
                    <div key={medication}>
                      <span className="med-icon">Rx</span>
                      <strong>{medication}</strong>
                      <small>Active</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        }

        if (cardId === "timeline") {
          if (!preferences.overview.showTimeline) return null;
          const isCollapsed = preferences.overview.collapsedCards.timeline || false;
          return (
            <section className={`card wide-card ${isCollapsed ? "is-collapsed" : ""}`} key="timeline">
              <div className="card-heading">
                <h2>Recent clinical activity</h2>
                <div className="card-header-tools">
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === 0}
                    onClick={() => moveCard(index, "up")}
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    disabled={index === preferences.overview.cardOrder.length - 1}
                    onClick={() => moveCard(index, "down")}
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn"
                    onClick={() => toggleCollapse("timeline")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-tool-btn close-tool"
                    onClick={() => hideCard("showTimeline")}
                    title="Hide card"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {!isCollapsed && (
                <div className="timeline">
                  {timelineItems.map((item) => (
                    <div key={item.id}>
                      <span
                        className="timeline-dot"
                        style={{
                          background:
                            item.type === "lab"
                              ? "#137333"
                              : item.type === "intake"
                              ? "#b06000"
                              : "#0b57d0",
                        }}
                      />
                      <time>{item.date}</time>
                      <p>
                        <strong>{item.title}</strong>
                        <br />
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}

function Encounter({
  patient,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onInsertText,
  onEncounterSigned,
}: {
  patient: Patient;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onInsertText?: (text: string) => void;
  onEncounterSigned?: (patientId: string) => void;
}) {
  const [draft, setDraft] = useState<EncounterState>(() => loadEncounterDraft(patient.id));
  const [searchTerm, setSearchTerm] = useState("");
  const [showPastNotes, setShowPastNotes] = useState(false);
  const [scenarioKey, setScenarioKey] = useState<string>(
    patient.id in ambientScenarios ? patient.id : "maya-chen"
  );
  const scenario = ambientScenarios[scenarioKey] || ambientScenarios["maya-chen"];
  const [isAmbientPlaying, setIsAmbientPlaying] = useState(false);
  const [ambientCursor, setAmbientCursor] = useState(0);
  const [micListening, setMicListening] = useState(false);
  const [activeMicField, setActiveMicField] = useState<
    "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan"
  >("intervalHistory");
  const [mseOpen, setMseOpen] = useState(true);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Note Preference Template
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    return draft.selectedTemplateId || getSavedTemplatePreference();
  });

  const activeTemplate = useMemo(() => {
    return (
      builtInTemplates.find((t) => t.id === selectedTemplateId) || builtInTemplates[0]
    );
  }, [selectedTemplateId]);

  // Psychotherapy Duration (Minutes)
  const [psychotherapyMinutes, setPsychotherapyMinutes] = useState<number>(() => {
    return draft.psychotherapyMinutes !== undefined
      ? draft.psychotherapyMinutes
      : activeTemplate.defaultPsychotherapyMinutes;
  });

  const pastEncounters = patientEncounterHistory[patient.id] || [];

  // Reload draft when patient changes
  useEffect(() => {
    const loaded = loadEncounterDraft(patient.id);
    setDraft(loaded);
    setScenarioKey(patient.id in ambientScenarios ? patient.id : "maya-chen");
    setIsAmbientPlaying(false);
    setAmbientCursor(0);
    const tmplId = loaded.selectedTemplateId || getSavedTemplatePreference();
    setSelectedTemplateId(tmplId);
    const tmpl = builtInTemplates.find((t) => t.id === tmplId) || builtInTemplates[0];
    setPsychotherapyMinutes(
      loaded.psychotherapyMinutes !== undefined
        ? loaded.psychotherapyMinutes
        : tmpl.defaultPsychotherapyMinutes
    );
  }, [patient.id]);

  // Autosave draft on edits
  useEffect(() => {
    saveEncounterDraft({
      ...draft,
      selectedTemplateId,
      psychotherapyMinutes,
    });
  }, [draft, selectedTemplateId, psychotherapyMinutes]);

  function showToast(msg: string) {
    setToastNotice(msg);
    setTimeout(() => {
      setToastNotice((prev) => (prev === msg ? null : prev));
    }, 3200);
  }

  // Dynamic AMA/CMS Coding Engine Calculation
  const codingRec: CodingRecommendation = useMemo(() => {
    return calculateEncounterCoding(draft, psychotherapyMinutes);
  }, [draft, psychotherapyMinutes]);

  // Clickable Chips Helper: Appends or toggles chip text in specific field
  function toggleChip(
    field: "chiefComplaint" | "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan",
    text: string
  ) {
    if (draft.status === "signed") return;
    setDraft((prev) => {
      const currentVal = prev[field] || "";
      if (currentVal.includes(text)) {
        // Remove chip text
        const cleaned = currentVal
          .replace(text, "")
          .replace(/\s*;\s*;\s*/g, "; ")
          .replace(/\s*,\s*,\s*/g, ", ")
          .replace(/^\s*;\s*/, "")
          .replace(/\s*;\s*$/, "")
          .replace(/\n\s*•\s*$/, "")
          .trim();
        return { ...prev, [field]: cleaned };
      } else {
        // Append chip text
        if (!currentVal.trim()) {
          return { ...prev, [field]: text };
        }
        if (field === "plan" || field === "assessment") {
          return { ...prev, [field]: `${currentVal}\n• ${text}` };
        }
        return { ...prev, [field]: `${currentVal}; ${text}` };
      }
    });
  }

  function isChipActive(
    field: "chiefComplaint" | "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan",
    text: string
  ): boolean {
    const currentVal = draft[field] || "";
    return currentVal.includes(text);
  }

  // Template Switching & Preference Saving
  function handleSelectTemplate(templateId: string) {
    const tmpl = builtInTemplates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplateId(tmpl.id);
    setPsychotherapyMinutes(tmpl.defaultPsychotherapyMinutes);
    setDraft((prev) => ({
      ...prev,
      selectedTemplateId: tmpl.id,
      psychotherapyMinutes: tmpl.defaultPsychotherapyMinutes,
      chiefComplaint: prev.chiefComplaint || tmpl.defaultChiefComplaint,
      mse: { ...(tmpl.defaultMse || defaultMse) },
    }));
    showToast(`Switched note template to "${tmpl.name}"`);
  }

  function handleSaveAsDefaultTemplate() {
    saveTemplatePreference(selectedTemplateId);
    showToast(`★ Saved "${activeTemplate.name}" as your default note template!`);
  }

  function handleApplyTemplateDefaults() {
    setDraft((prev) => ({
      ...prev,
      chiefComplaint: activeTemplate.defaultChiefComplaint,
      mse: { ...(activeTemplate.defaultMse || defaultMse) },
    }));
    showToast(`Applied default baseline from "${activeTemplate.name}".`);
  }

  // Psychotherapy Duration Controller
  function handlePsychotherapyChange(minutes: number) {
    const next = Math.max(0, Math.min(120, minutes));
    setPsychotherapyMinutes(next);
    setDraft((prev) => ({ ...prev, psychotherapyMinutes: next }));
    if (next >= 16 && next <= 37) {
      showToast(`+90833 Psychotherapy Add-on qualified (${next} min documented)`);
    } else if (next >= 38 && next <= 52) {
      showToast(`+90836 Psychotherapy Add-on qualified (${next} min documented)`);
    } else if (next >= 53) {
      showToast(`+90838 Psychotherapy Add-on qualified (${next} min documented)`);
    }
  }

  // Simulated ambient dialogue stream
  useEffect(() => {
    if (!isAmbientPlaying) return;
    if (ambientCursor >= scenario.utterances.length) {
      setIsAmbientPlaying(false);
      showToast("Ambient conversation stream complete. Ready for note synthesis.");
      return;
    }

    const timer = setTimeout(() => {
      const nextUtterance = scenario.utterances[ambientCursor];
      setDraft((prev) => ({
        ...prev,
        ambientTranscript: [...prev.ambientTranscript, nextUtterance],
      }));
      setAmbientCursor((c) => c + 1);
    }, 1100);

    return () => clearTimeout(timer);
  }, [isAmbientPlaying, ambientCursor, scenario.utterances]);

  // Live Speech Recognition Web API
  function toggleLiveMic(
    field: "intervalHistory" | "treatmentResponse" | "sideEffects" | "assessment" | "plan" = "intervalHistory"
  ) {
    if (typeof window === "undefined") return;

    if (micListening) {
      recognitionRef.current?.stop();
      setMicListening(false);
      showToast("Microphone paused.");
      return;
    }

    const SpeechRecognitionConstructor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionConstructor) {
      showToast("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const item = event.results[i];
          if (item?.isFinal) {
            finalChunk += item[0]?.transcript + " ";
          }
        }
        if (finalChunk.trim()) {
          setDraft((prev) => ({
            ...prev,
            [field]: (prev[field] ? prev[field] + " " : "") + finalChunk.trim(),
          }));
        }
      };

      recognition.onerror = () => setMicListening(false);
      recognition.onend = () => setMicListening(false);

      recognition.start();
      recognitionRef.current = recognition;
      setActiveMicField(field);
      setMicListening(true);
      showToast(`🎙️ Dictating live into ${field}...`);
    } catch {
      showToast("Could not access microphone.");
      setMicListening(false);
    }
  }

  function handleStartAmbient() {
    setDraft((prev) => ({
      ...prev,
      ambientTranscript: [],
    }));
    setAmbientCursor(0);
    setIsAmbientPlaying(true);
    showToast(`Started ambient clinical dialogue for ${scenario.title}`);
  }

  function handleSynthesizeFromAmbient() {
    setIsAmbientPlaying(false);
    const sNote = scenario.synthesizedNote;

    setDraft((prev) => ({
      ...prev,
      chiefComplaint: sNote.chiefComplaint,
      intervalHistory: sNote.intervalHistory,
      treatmentResponse: sNote.treatmentResponse,
      sideEffects: sNote.sideEffects,
      mse: { ...sNote.mse },
      assessment: sNote.assessment,
      plan: sNote.plan,
      candidateActions: [...sNote.candidateActions],
      ambientTranscript:
        prev.ambientTranscript.length > 0 ? prev.ambientTranscript : [...scenario.utterances],
    }));

    showToast("✦ Synthesized note blocks from ambient stream with exact source quotes.");
  }

  function handleApplyCandidateAction(action: CandidateAction) {
    const addition = `\n• ${action.title}: ${action.detail}`;
    setDraft((prev) => ({
      ...prev,
      plan: (prev.plan ? prev.plan + "\n" : "") + addition.trim(),
      candidateActions: prev.candidateActions.map((a) =>
        a.id === action.id ? { ...a, status: "accepted" as const } : a
      ),
    }));
    showToast(`Applied "${action.title}" to active plan.`);
  }

  function handleDismissCandidateAction(actionId: string) {
    setDraft((prev) => ({
      ...prev,
      candidateActions: prev.candidateActions.map((a) =>
        a.id === actionId ? { ...a, status: "dismissed" as const } : a
      ),
    }));
    showToast("Dismissed candidate action.");
  }

  function handleApplyMseTemplate(templateName: string) {
    let updatedMse: MentalStatusExam = { ...draft.mse };

    if (templateName === "normal") {
      updatedMse = {
        appearance: "Well-groomed, casual attire, appears stated age.",
        behavior: "Calm, engaged, cooperative, appropriate eye contact.",
        speech: "Normal rate, rhythm, and volume. Non-pressured.",
        moodAffect: "Mood: 'Good, stable.' Affect: Broad, appropriate, euthymic.",
        thoughtProcess: "Linear, logical, goal-directed. No tangentiality.",
        thoughtContent: "No delusions, hallucinations, suicidal ideation, or homicidal ideation.",
        cognition: "Alert and oriented x4. Attention and concentration intact.",
        insightJudgment: "Insight good; judgment intact regarding medications and safety.",
      };
    } else if (templateName === "anxious") {
      updatedMse = {
        appearance: "Neatly dressed, subtle psychomotor restlessness, fidgeting with hands.",
        behavior: "Cooperative but slightly guarded; frequent rapid scanning of room.",
        speech: "Mildly accelerated rate, normal volume and articulation.",
        moodAffect: "Mood: 'Nervous, on edge.' Affect: Anxious, constricted range, congruent with mood.",
        thoughtProcess: "Goal-directed but hyper-focused on anticipated work and family stressors.",
        thoughtContent: "Prominent worries and somatic tension; denies panic attacks, SI/HI, or psychosis.",
        cognition: "Grossly oriented x4; mild difficulty with serial subtractions secondary to anxiety.",
        insightJudgment: "Insight fair to good regarding anxiety triggers; judgment preserved.",
      };
    } else if (templateName === "depressed") {
      updatedMse = {
        appearance: "Casual, slight dishevelment, slowed gait and psychomotor deceleration.",
        behavior: "Tired appearance, poor eye contact, intermittent sighing.",
        speech: "Soft, monotone, increased latency of response.",
        moodAffect: "Mood: 'Depressed, exhausted.' Affect: Blunted, constricted, tearful at times.",
        thoughtProcess: "Slowed thought processing; linear and coherent without looseness.",
        thoughtContent: "Feelings of guilt, worthlessness, and helplessness. Denies active SI/intent/plan.",
        cognition: "Oriented x4; subjective complaints of brain fog and memory lapses.",
        insightJudgment: "Insight intact regarding depressive episode; judgment preserved.",
      };
    } else if (templateName === "hypomanic") {
      updatedMse = {
        appearance: "Brightly dressed, vivacious, elevated motor energy.",
        behavior: "Charming, restless, slightly intrusive but reciprocal rapport maintained.",
        speech: "Rapid, voluminous, mildly pressured but easily interruptible.",
        moodAffect: "Mood: 'Fantastic, never better.' Affect: Expansive, elevated, labile.",
        thoughtProcess: "Circumstantial, flight of ideas, rapid association switching.",
        thoughtContent: "Grandiose ambitions, multiple simultaneous new projects. Denies overt delusions or SI.",
        cognition: "Alert, hyper-vigilant, distractible.",
        insightJudgment: "Insight poor to partial regarding hypomania; judgment mildly impaired regarding sleep.",
      };
    }

    setDraft((prev) => ({ ...prev, mse: updatedMse }));
    showToast(`Applied ${templateName.toUpperCase()} MSE template.`);
  }

  function handleCopyCleanNote() {
    const fullText = `
ANTIGRAVITY PSYCHIATRIC MEDICINE
OUTPATIENT CLINICAL PROGRESS NOTE

PATIENT: ${patient.name} | MRN: ${patient.mrn} | DOB: ${patient.dob} (${patient.age}y)
DATE OF SERVICE: Sep 4, 2026 | PROVIDER: Dr. Logan Carton, MD (NPI: 1948201948)
VISIT TYPE: ${draft.visitType} | CPT CODING: ${codingRec.primaryCode} ${codingRec.addonCodes.join(" ")}

CHIEF COMPLAINT:
${draft.chiefComplaint || "Routine psychiatric follow-up."}

INTERVAL HISTORY (HPI):
${draft.intervalHistory || "None documented."}

RESPONSE TO TREATMENT:
${draft.treatmentResponse || "None reported."}

SIDE EFFECTS & TOLERABILITY:
${draft.sideEffects || "Denies adverse effects."}

MENTAL STATUS EXAMINATION:
• Appearance: ${draft.mse.appearance}
• Behavior & Rapport: ${draft.mse.behavior}
• Speech: ${draft.mse.speech}
• Mood & Affect: ${draft.mse.moodAffect}
• Thought Process: ${draft.mse.thoughtProcess}
• Thought Content (Safety/SI): ${draft.mse.thoughtContent}
• Cognition: ${draft.mse.cognition}
• Insight & Judgment: ${draft.mse.insightJudgment}

CLINICAL ASSESSMENT & MDM:
${draft.assessment || "Clinical assessment pending."}
Medical Decision Making Level: ${codingRec.mdmLevel.toUpperCase()} (${codingRec.mdmReasoning})

TREATMENT PLAN & ORDERS:
${draft.plan || "Plan as documented."}
${psychotherapyMinutes >= 16 ? `\nPsychotherapy Provided: ${psychotherapyMinutes} minutes of interactive psychotherapy.` : ""}

SIGNATURE:
${isLocked ? `Electronically Signed by ${draft.signedBy} on ${draft.signedAt} (NPI: ${draft.npi})` : "DRAFT - Unsigned"}
    `.trim();

    navigator.clipboard?.writeText(fullText);
    showToast("📋 Clean note copied to clipboard.");
  }

  function handleSignNote() {
    if (!attestationChecked) {
      showToast("Please check the verification attestation before signing.");
      return;
    }

    const signed = signEncounterDraft(draft, "Dr. Logan Carton, MD", "1948201948");
    setDraft(signed);

    const newPast: PastEncounter = {
      id: signed.encounterId,
      date: "Sep 4, 2026",
      provider: "Dr. Logan Carton, MD",
      type: `${signed.visitType} (${codingRec.primaryCode})`,
      chiefComplaint: signed.chiefComplaint,
      hpi: signed.intervalHistory,
      assessment: signed.assessment,
      plan: signed.plan,
    };

    if (!patientEncounterHistory[patient.id]) {
      patientEncounterHistory[patient.id] = [];
    }
    if (!patientEncounterHistory[patient.id].some((e) => e.id === signed.encounterId)) {
      patientEncounterHistory[patient.id].unshift(newPast);
    }

    setReviewModalOpen(false);
    if (onEncounterSigned) {
      onEncounterSigned(patient.id);
    }
    showToast("Encounter signed, locked, and committed to legal medical record.");
  }

  const isLocked = draft.status === "signed";

  const filteredPastEncounters = useMemo(() => {
    if (!searchTerm.trim()) return pastEncounters;
    const term = searchTerm.toLowerCase();
    return pastEncounters.filter((enc) =>
      `${enc.chiefComplaint} ${enc.hpi} ${enc.assessment} ${enc.plan}`.toLowerCase().includes(term)
    );
  }, [pastEncounters, searchTerm]);

  return (
    <div className="encounter-workspace-root">
      {/* Toast Feedback */}
      {toastNotice && <div className="encounter-toast">{toastNotice}</div>}

      {/* TOP TOOLBAR: NOTE TEMPLATE PREFERENCE & SESSION CONTROLS */}
      <header className="encounter-top-toolbar" aria-label="Encounter Controls">
        <div className="toolbar-left-group">
          <div className="template-picker-group">
            <span className="picker-label">NOTE TEMPLATE:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              className="template-select-dropdown"
              disabled={isLocked}
              aria-label="Select Note Preference Template"
            >
              {builtInTemplates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name} ({tmpl.badge})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="template-save-default-btn"
              onClick={handleSaveAsDefaultTemplate}
              title="Save this template as your permanent starting default for all new encounters"
            >
              ★ Save as Default
            </button>
            <button
              type="button"
              className="template-apply-defaults-btn"
              onClick={handleApplyTemplateDefaults}
              disabled={isLocked}
              title="Re-apply template default phrases and MSE"
            >
              ↺ Defaults
            </button>
          </div>

          <button
            type="button"
            className={`toolbar-history-toggle ${showPastNotes ? "active" : ""}`}
            onClick={() => setShowPastNotes(!showPastNotes)}
            title="Toggle search drawer for longitudinal past notes"
          >
            📚 Past Notes ({pastEncounters.length})
          </button>
        </div>

        {/* PSYCHOTHERAPY TIME STEPPER & CODING ACCELERATOR */}
        <div className="toolbar-psychotherapy-stepper">
          <span className="stepper-label">PSYCHOTHERAPY TIME:</span>
          <div className="stepper-controls">
            <button
              type="button"
              className="stepper-btn"
              onClick={() => handlePsychotherapyChange(psychotherapyMinutes - 5)}
              disabled={isLocked || psychotherapyMinutes <= 0}
            >
              −5m
            </button>
            <span className="stepper-value">
              <strong>{psychotherapyMinutes}</strong> min
            </span>
            <button
              type="button"
              className="stepper-btn"
              onClick={() => handlePsychotherapyChange(psychotherapyMinutes + 5)}
              disabled={isLocked || psychotherapyMinutes >= 120}
            >
              +5m
            </button>
          </div>

          <div className="stepper-quick-pills">
            <button
              type="button"
              className={`pill-btn ${psychotherapyMinutes === 0 ? "active" : ""}`}
              onClick={() => handlePsychotherapyChange(0)}
              disabled={isLocked}
            >
              0m
            </button>
            <button
              type="button"
              className={`pill-btn ${psychotherapyMinutes === 16 ? "active" : ""}`}
              onClick={() => handlePsychotherapyChange(16)}
              disabled={isLocked}
              title="Minimum time for +90833 (16-37 min)"
            >
              16m (+90833)
            </button>
            <button
              type="button"
              className={`pill-btn ${psychotherapyMinutes === 30 ? "active" : ""}`}
              onClick={() => handlePsychotherapyChange(30)}
              disabled={isLocked}
              title="Standard 30 min add-on (+90833)"
            >
              30m (+90833)
            </button>
            <button
              type="button"
              className={`pill-btn ${psychotherapyMinutes === 45 ? "active" : ""}`}
              onClick={() => handlePsychotherapyChange(45)}
              disabled={isLocked}
              title="45 min add-on (+90836)"
            >
              45m (+90836)
            </button>
          </div>
        </div>

        {/* TOP RIGHT: STATUS & PRIMARY ACTIONS */}
        <div className="toolbar-right-actions">
          <div className="encounter-status-tag">
            {isLocked ? (
              <span className="status-locked-pill">🔒 Signed · {draft.signedAt}</span>
            ) : (
              <span className="status-draft-pill">✓ Autosaved {draft.lastAutosavedAt}</span>
            )}
          </div>

          <button
            type="button"
            className="btn-toolbar-action"
            onClick={handleCopyCleanNote}
            title="Copy formatted clinical note to clipboard"
          >
            📋 Copy Note
          </button>
          <button
            type="button"
            className="btn-toolbar-action"
            onClick={() => window.print()}
            title="Print or export clinical document"
          >
            🖶 Print
          </button>
          <button
            type="button"
            className="btn-toolbar-primary"
            onClick={() => setReviewModalOpen(true)}
          >
            {isLocked ? "View Signed Record" : "🔒 Review & Sign"}
          </button>
        </div>
      </header>

      {/* OPTIONAL LONGITUDINAL SEARCH DRAWER */}
      {showPastNotes && (
        <section className="past-notes-drawer-card">
          <div className="drawer-heading">
            <strong>Longitudinal Record · Search Past Encounters</strong>
            <button
              type="button"
              className="drawer-close"
              onClick={() => setShowPastNotes(false)}
            >
              ✕
            </button>
          </div>
          <div className="drawer-search-bar">
            <input
              placeholder="Search previous visits for symptoms, sleep, titration, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="drawer-results-grid">
            {filteredPastEncounters.map((enc) => (
              <div key={enc.id} className="drawer-result-item">
                <div className="result-header">
                  <strong>{enc.type}</strong>
                  <time>{enc.date}</time>
                </div>
                <p><strong>CC:</strong> {enc.chiefComplaint}</p>
                <p><strong>HPI:</strong> {enc.hpi.slice(0, 110)}...</p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((p) => ({
                      ...p,
                      plan: (p.plan ? p.plan + "\n" : "") + `[Prior Plan ${enc.date}]: ${enc.plan}`,
                    }));
                    showToast(`Copied ${enc.date} plan into active note!`);
                  }}
                  disabled={isLocked}
                >
                  📋 Insert Plan to Current Draft
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TRI-PANE ENCOUNTER WORKSPACE */}
      <div className="encounter-tri-pane">
        {/* ============================================================ */}
        {/* PANE 1 (FAR LEFT): SCRIBE OF ENCOUNTER WINDOW                */}
        {/* ============================================================ */}
        <section className="tri-column scribe-column" aria-label="Ambient Scribe Window">
          <div className="pane-card-header scribe-header">
            <div className="header-badge-title">
              <span className="scribe-pulsing-icon">🎙️</span>
              <div>
                <h3>Encounter Scribe</h3>
                <small>Ambient conversation &amp; AI extraction</small>
              </div>
            </div>

            <div className="scribe-scenario-row">
              <select
                value={scenarioKey}
                onChange={(e) => setScenarioKey(e.target.value)}
                className="scribe-scenario-select"
                aria-label="Select Clinical Scenario"
                disabled={isLocked}
              >
                <option value="maya-chen">Maya Chen · ADHD / Guanfacine</option>
                <option value="jordan-reed">Jordan Reed · Mood / Labs</option>
              </select>
            </div>

            <div className="scribe-action-buttons">
              <button
                type="button"
                className={`scribe-stream-btn ${isAmbientPlaying ? "is-active" : ""}`}
                onClick={handleStartAmbient}
                disabled={isLocked}
              >
                {isAmbientPlaying ? "⏸ Pause Stream" : "▶ Start Ambient Stream"}
              </button>
              <button
                type="button"
                className="scribe-synthesize-btn"
                onClick={handleSynthesizeFromAmbient}
                disabled={isLocked}
                title="Synthesize and populate template fields from ambient stream"
              >
                ✦ Synthesize Note
              </button>
              <button
                type="button"
                className={`scribe-mic-btn ${micListening ? "mic-live" : ""}`}
                onClick={() => toggleLiveMic("intervalHistory")}
                disabled={isLocked}
                title="Live microphone dictation via Web Speech API"
              >
                {micListening ? "🔴 Live" : "🎙️ Dictate"}
              </button>
            </div>

            {/* Audio Waveform Animation */}
            {(isAmbientPlaying || micListening) && (
              <div className="ambient-waveform-indicator">
                <div className="wave-bar bar-1"></div>
                <div className="wave-bar bar-2"></div>
                <div className="wave-bar bar-3"></div>
                <div className="wave-bar bar-4"></div>
                <div className="wave-bar bar-5"></div>
                <span>
                  {isAmbientPlaying ? "Streaming ambient room dialogue..." : "Listening to clinician dictation..."}
                </span>
              </div>
            )}
          </div>

          {/* Transcript Scroll Area */}
          <div className="scribe-transcript-scroll">
            <div className="transcript-label-bar">
              <span>CONVERSATION TRANSCRIPT ({draft.ambientTranscript.length} Utterances)</span>
              {draft.ambientTranscript.length > 0 && !isLocked && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={() => setDraft((p) => ({ ...p, ambientTranscript: [] }))}
                >
                  Clear
                </button>
              )}
            </div>

            {draft.ambientTranscript.length === 0 ? (
              <div className="scribe-empty-state">
                <p>
                  No active transcript recorded yet. Click <strong>“Start Ambient Stream”</strong> to run the room dialogue simulation, or use <strong>“Dictate”</strong> to speak directly.
                </p>
              </div>
            ) : (
              <div className="transcript-bubbles-list">
                {draft.ambientTranscript.map((utt) => (
                  <div key={utt.id} className={`transcript-bubble bubble-${utt.speaker}`}>
                    <div className="bubble-meta">
                      <strong>{utt.speakerName}</strong>
                      <time>{utt.timestamp}</time>
                    </div>
                    <p className="bubble-text">{utt.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Candidate Clinical Action Cards */}
          {draft.candidateActions.length > 0 && (
            <div className="scribe-candidate-actions">
              <div className="candidate-header">
                <span className="spark">✦</span>
                <strong>AI Staged Actions (Requires Sign-off)</strong>
              </div>
              <div className="candidate-cards-list">
                {draft.candidateActions.map((action) => (
                  <div key={action.id} className={`candidate-action-card status-${action.status}`}>
                    <div className="action-card-top">
                      <span className={`action-type-pill type-${action.type}`}>
                        {action.type === "medication-titration" && "Rx Titration"}
                        {action.type === "lab-order" && "Lab Order"}
                        {action.type === "referral" && "Intervention"}
                      </span>
                      <strong>{action.title}</strong>
                      {action.status === "accepted" && <span className="action-tag accepted">✓ In Plan</span>}
                      {action.status === "dismissed" && <span className="action-tag dismissed">Dismissed</span>}
                    </div>
                    <p className="action-card-detail">{action.detail}</p>
                    <div className="provenance-quote" title="Exact transcript citation">
                      <span>💬 &ldquo;{action.provenanceSnippet}&rdquo;</span>
                    </div>
                    {action.status === "suggested" && !isLocked && (
                      <div className="action-buttons-row">
                        <button
                          type="button"
                          className="btn-apply-action"
                          onClick={() => handleApplyCandidateAction(action)}
                        >
                          ✓ Apply to Plan
                        </button>
                        <button
                          type="button"
                          className="btn-dismiss-action"
                          onClick={() => handleDismissCandidateAction(action.id)}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* PANE 2 (MIDDLE): INTERACTIVE TEMPLATE WINDOW                 */}
        {/* ============================================================ */}
        <section className="tri-column template-column" aria-label="Interactive Clinical Template">
          <div className="pane-card-header template-header">
            <div className="header-badge-title">
              <span className="template-icon">📝</span>
              <div>
                <h3>Interactive Clinical Template</h3>
                <small>Click chips to auto-fill or type directly into boxes</small>
              </div>
            </div>
            <span className="active-template-badge">{activeTemplate.badge}</span>
          </div>

          <div className="template-scroll-body">
            {/* 1. CHIEF COMPLAINT */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="input-chief-complaint">
                  <strong>Chief Complaint</strong>
                </label>
              </div>

              {/* Clickable Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.chiefComplaint.map((chip) => {
                  const active = isChipActive("chiefComplaint", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("chiefComplaint", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <input
                id="input-chief-complaint"
                className="template-input-box"
                value={draft.chiefComplaint}
                onChange={(e) => setDraft((p) => ({ ...p, chiefComplaint: e.target.value }))}
                placeholder="Reason for visit / primary psychiatric concern..."
                disabled={isLocked}
              />
            </div>

            {/* 2. INTERVAL HISTORY / HPI */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="textarea-interval-history">
                  <strong>Interval History (HPI)</strong>
                </label>
                {!isLocked && (
                  <button
                    type="button"
                    className={`field-mic-btn ${micListening && activeMicField === "intervalHistory" ? "active" : ""}`}
                    onClick={() => toggleLiveMic("intervalHistory")}
                  >
                    {micListening && activeMicField === "intervalHistory" ? "🔴 Dictating" : "🎙️ Mic"}
                  </button>
                )}
              </div>

              {/* Clickable Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.intervalHistory.map((chip) => {
                  const active = isChipActive("intervalHistory", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("intervalHistory", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <textarea
                id="textarea-interval-history"
                className="template-textarea-box"
                rows={4}
                value={draft.intervalHistory}
                onChange={(e) => setDraft((p) => ({ ...p, intervalHistory: e.target.value }))}
                placeholder="Interval trajectory, symptom changes, functional capacity, daily stressors..."
                disabled={isLocked}
              />
            </div>

            {/* 3. RESPONSE TO TREATMENT */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="textarea-treatment-response">
                  <strong>Response to Treatment</strong>
                </label>
                {!isLocked && (
                  <button
                    type="button"
                    className={`field-mic-btn ${micListening && activeMicField === "treatmentResponse" ? "active" : ""}`}
                    onClick={() => toggleLiveMic("treatmentResponse")}
                  >
                    {micListening && activeMicField === "treatmentResponse" ? "🔴" : "🎙️ Mic"}
                  </button>
                )}
              </div>

              {/* Clickable Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.treatmentResponse.map((chip) => {
                  const active = isChipActive("treatmentResponse", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("treatmentResponse", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <textarea
                id="textarea-treatment-response"
                className="template-textarea-box"
                rows={3}
                value={draft.treatmentResponse}
                onChange={(e) => setDraft((p) => ({ ...p, treatmentResponse: e.target.value }))}
                placeholder="Sleep onset latency, focus, affective stability, functional improvements..."
                disabled={isLocked}
              />
            </div>

            {/* 4. SIDE EFFECTS & TOLERABILITY */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="textarea-side-effects">
                  <strong>Side Effects &amp; Tolerability Screen</strong>
                </label>
                {!isLocked && (
                  <button
                    type="button"
                    className={`field-mic-btn ${micListening && activeMicField === "sideEffects" ? "active" : ""}`}
                    onClick={() => toggleLiveMic("sideEffects")}
                  >
                    {micListening && activeMicField === "sideEffects" ? "🔴" : "🎙️ Mic"}
                  </button>
                )}
              </div>

              {/* Clickable Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.sideEffects.map((chip) => {
                  const active = isChipActive("sideEffects", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("sideEffects", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <textarea
                id="textarea-side-effects"
                className="template-textarea-box"
                rows={3}
                value={draft.sideEffects}
                onChange={(e) => setDraft((p) => ({ ...p, sideEffects: e.target.value }))}
                placeholder="Adverse psychotropic effects, morning sedation, dry mouth, appetite, vitals..."
                disabled={isLocked}
              />
            </div>

            {/* 5. MENTAL STATUS EXAM (8 DIMENSIONS) */}
            <div className="template-section-block mse-container">
              <div className="mse-collapsible-bar" onClick={() => setMseOpen(!mseOpen)}>
                <div>
                  <strong>Mental Status Exam (MSE) — 8 Dimensions</strong>
                  <span className="mse-sub-hint">Formal psychiatric objective examination</span>
                </div>
                <button type="button" className="mse-expand-toggle">
                  {mseOpen ? "▲ Collapse" : "▼ Expand MSE"}
                </button>
              </div>

              {mseOpen && (
                <div className="mse-content-body">
                  {!isLocked && (
                    <div className="mse-quick-bar">
                      <span className="quick-label">Presets:</span>
                      <button type="button" onClick={() => handleApplyMseTemplate("normal")}>
                        Normal / Euthymic
                      </button>
                      <button type="button" onClick={() => handleApplyMseTemplate("anxious")}>
                        Anxious / Restless
                      </button>
                      <button type="button" onClick={() => handleApplyMseTemplate("depressed")}>
                        Depressed / Blunted
                      </button>
                      <button type="button" onClick={() => handleApplyMseTemplate("hypomanic")}>
                        Hypomanic / Pressured
                      </button>
                    </div>
                  )}

                  <div className="mse-inputs-grid">
                    <label>
                      <span>Appearance</span>
                      <input
                        value={draft.mse.appearance}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, appearance: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Behavior &amp; Rapport</span>
                      <input
                        value={draft.mse.behavior}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, behavior: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Speech</span>
                      <input
                        value={draft.mse.speech}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, speech: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Mood &amp; Affect</span>
                      <input
                        value={draft.mse.moodAffect}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, moodAffect: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Thought Process</span>
                      <input
                        value={draft.mse.thoughtProcess}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, thoughtProcess: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Thought Content (Safety/SI)</span>
                      <input
                        value={draft.mse.thoughtContent}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, thoughtContent: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Cognition &amp; Orientation</span>
                      <input
                        value={draft.mse.cognition}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, cognition: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                    <label>
                      <span>Insight &amp; Judgment</span>
                      <input
                        value={draft.mse.insightJudgment}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, mse: { ...p.mse, insightJudgment: e.target.value } }))
                        }
                        disabled={isLocked}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* 6. ASSESSMENT & DIFFERENTIAL */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="textarea-assessment">
                  <strong>Clinical Assessment &amp; DSM-5 Impressions</strong>
                </label>
                {!isLocked && (
                  <button
                    type="button"
                    className={`field-mic-btn ${micListening && activeMicField === "assessment" ? "active" : ""}`}
                    onClick={() => toggleLiveMic("assessment")}
                  >
                    {micListening && activeMicField === "assessment" ? "🔴" : "🎙️ Mic"}
                  </button>
                )}
              </div>

              {/* Clickable DSM-5 Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.assessment.map((chip) => {
                  const active = isChipActive("assessment", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("assessment", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <textarea
                id="textarea-assessment"
                className="template-textarea-box"
                rows={3}
                value={draft.assessment}
                onChange={(e) => setDraft((p) => ({ ...p, assessment: e.target.value }))}
                placeholder="Psychiatric diagnostic formulation, DSM-5 codes, clinical stability..."
                disabled={isLocked}
              />
            </div>

            {/* 7. PLAN & STAGED ORDERS */}
            <div className="template-section-block">
              <div className="section-label-row">
                <label htmlFor="textarea-plan">
                  <strong>Treatment Plan &amp; Orders</strong>
                </label>
                {!isLocked && (
                  <button
                    type="button"
                    className={`field-mic-btn ${micListening && activeMicField === "plan" ? "active" : ""}`}
                    onClick={() => toggleLiveMic("plan")}
                  >
                    {micListening && activeMicField === "plan" ? "🔴" : "🎙️ Mic"}
                  </button>
                )}
              </div>

              {/* Clickable Plan Action Chips */}
              <div className="clickable-chips-wrapper">
                {activeTemplate.quickChips.plan.map((chip) => {
                  const active = isChipActive("plan", chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      className={`chip-pill ${active ? "active" : ""}`}
                      onClick={() => toggleChip("plan", chip)}
                      disabled={isLocked}
                    >
                      {active ? "✓ " : "＋ "}
                      {chip}
                    </button>
                  );
                })}
              </div>

              {/* Typable Box */}
              <textarea
                id="textarea-plan"
                className="template-textarea-box"
                rows={4}
                value={draft.plan}
                onChange={(e) => setDraft((p) => ({ ...p, plan: e.target.value }))}
                placeholder="Medication titration, laboratory surveillance orders, psychotherapy focus, safety plan, follow-up..."
                disabled={isLocked}
              />
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* PANE 3 (FAR RIGHT): CLEAN NOTE BEING CONSTRUCTED             */}
        {/* ============================================================ */}
        <section className="tri-column clean-note-column" aria-label="Clean Note Document Preview">
          <div className="pane-card-header clean-note-header">
            <div className="header-badge-title">
              <span className="doc-icon">📄</span>
              <div>
                <h3>Clean Note Document</h3>
                <small>Publication-grade formatted record</small>
              </div>
            </div>

            <div className="clean-note-quick-actions">
              <button
                type="button"
                className="btn-clean-copy"
                onClick={handleCopyCleanNote}
                title="Copy entire formatted clinical note"
              >
                📋 Copy
              </button>
              <button
                type="button"
                className="btn-clean-print"
                onClick={() => window.print()}
                title="Print preview"
              >
                🖶
              </button>
            </div>
          </div>

          {/* Publication Document Sheet */}
          <div className="clean-note-sheet-scroll">
            <div className="clean-note-paper">
              {/* Clinic Letterhead */}
              <div className="clean-paper-letterhead">
                <div className="letterhead-clinic">
                  <h4>ANTIGRAVITY PSYCHIATRIC MEDICINE</h4>
                  <p>Outpatient Clinical Evaluation &amp; Management Note</p>
                </div>
                <div className="letterhead-seal">★ VERIFIED</div>
              </div>

              {/* Patient Demographics & DOS */}
              <div className="clean-patient-banner">
                <div className="banner-col">
                  <div><strong>Patient:</strong> {patient.name}</div>
                  <div><strong>MRN:</strong> {patient.mrn} · <strong>DOB:</strong> {patient.dob} ({patient.age}y)</div>
                </div>
                <div className="banner-col">
                  <div><strong>Date of Service:</strong> Sep 4, 2026</div>
                  <div><strong>Provider:</strong> Dr. Logan Carton, MD (NPI: 1948201948)</div>
                </div>
              </div>

              {/* Live Billing Codes Stamp */}
              <div className="clean-billing-stamp">
                <div className="stamp-primary">
                  <span className="cpt-tag">{codingRec.primaryCode}</span>
                  <span>{codingRec.primaryTitle.split("·")[1]?.trim() || "Established Patient Visit"}</span>
                </div>
                {codingRec.addonCodes.map((code) => (
                  <div key={code} className="stamp-addon">
                    <span className="addon-tag">{code}</span>
                    <span>Psychotherapy Add-on ({psychotherapyMinutes} min)</span>
                  </div>
                ))}
              </div>

              {/* Formatted Clinical Sections */}
              <div className="clean-doc-section">
                <h5>CHIEF COMPLAINT</h5>
                <p className="clean-doc-text">{draft.chiefComplaint || "Routine psychiatric follow-up."}</p>
              </div>

              <div className="clean-doc-section">
                <h5>INTERVAL HISTORY &amp; CLINICAL TRAJECTORY</h5>
                <p className="clean-doc-text">{draft.intervalHistory || "None documented."}</p>
              </div>

              {(draft.treatmentResponse || draft.sideEffects) && (
                <div className="clean-doc-section">
                  <h5>TREATMENT RESPONSE &amp; TOLERABILITY</h5>
                  <div className="clean-two-col-grid">
                    <div>
                      <strong>Therapeutic Response:</strong>
                      <p className="clean-doc-text">{draft.treatmentResponse || "None reported."}</p>
                    </div>
                    <div>
                      <strong>Adverse Effects / Vitals:</strong>
                      <p className="clean-doc-text">{draft.sideEffects || "Denies side effects."}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="clean-doc-section">
                <h5>MENTAL STATUS EXAMINATION</h5>
                <div className="clean-mse-table">
                  <div className="mse-row">
                    <span className="mse-col-title">Appearance:</span>
                    <span className="mse-col-val">{draft.mse.appearance}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Behavior &amp; Rapport:</span>
                    <span className="mse-col-val">{draft.mse.behavior}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Speech:</span>
                    <span className="mse-col-val">{draft.mse.speech}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Mood &amp; Affect:</span>
                    <span className="mse-col-val">{draft.mse.moodAffect}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Thought Process:</span>
                    <span className="mse-col-val">{draft.mse.thoughtProcess}</span>
                  </div>
                  <div className="mse-row highlight-safety">
                    <span className="mse-col-title">Thought Content (SI/HI):</span>
                    <span className="mse-col-val">{draft.mse.thoughtContent}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Cognition:</span>
                    <span className="mse-col-val">{draft.mse.cognition}</span>
                  </div>
                  <div className="mse-row">
                    <span className="mse-col-title">Insight &amp; Judgment:</span>
                    <span className="mse-col-val">{draft.mse.insightJudgment}</span>
                  </div>
                </div>
              </div>

              <div className="clean-doc-section">
                <h5>CLINICAL ASSESSMENT &amp; MEDICAL DECISION MAKING</h5>
                <p className="clean-doc-text pre-wrap">{draft.assessment || "Clinical assessment pending."}</p>
                <div className="clean-mdm-box">
                  <strong>Medical Decision Making (MDM): Level {codingRec.mdmLevel.toUpperCase()}</strong>
                  <p>{codingRec.mdmReasoning}</p>
                </div>
              </div>

              <div className="clean-doc-section">
                <h5>TREATMENT PLAN &amp; CLINICAL ORDERS</h5>
                <p className="clean-doc-text pre-wrap">{draft.plan || "Plan as documented."}</p>
                {psychotherapyMinutes >= 16 && (
                  <div className="clean-psychotherapy-box">
                    <strong>Interactive Psychotherapy Service Documented:</strong>
                    <p>{psychotherapyMinutes} minutes of interactive psychotherapy provided in conjunction with E/M service.</p>
                  </div>
                )}
              </div>

              {/* Signature Block */}
              <div className="clean-doc-signature">
                {isLocked ? (
                  <div className="signature-locked-box">
                    <div className="sig-icon">✓</div>
                    <div>
                      <strong>Electronically Signed by {draft.signedBy}</strong>
                      <p>NPI: {draft.npi} · Date: {draft.signedAt} · Legal Record Sealed</p>
                    </div>
                  </div>
                ) : (
                  <div className="signature-draft-box">
                    <span className="draft-watermark">PRE-SIGNATURE CLINICAL DRAFT</span>
                    <button
                      type="button"
                      className="btn-sign-from-note"
                      onClick={() => setReviewModalOpen(true)}
                    >
                      Review &amp; Sign Note
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ============================================================ */}
      {/* BOTTOM DOCK: ENCOUNTER GOALS & DYNAMIC CODING ENGINE         */}
      {/* ============================================================ */}
      <footer className="coding-engine-dock" aria-label="Dynamic E/M Coding & Encounter Goals">
        {/* Left Half: 6 Encounter Goals Checklist */}
        <div className="dock-goals-section">
          <div className="dock-goals-header">
            <strong>APPOINTMENT GOALS CHECKLIST</strong>
            <span className="goals-count-badge">
              {codingRec.goalsMetCount} / {codingRec.goalsTotalCount} Met ({Math.round((codingRec.goalsMetCount / codingRec.goalsTotalCount) * 100)}%)
            </span>
          </div>

          <div className="goals-chips-row">
            {codingRec.goals.map((goal) => (
              <div
                key={goal.id}
                className={`goal-chip ${goal.met ? "is-met" : "is-pending"}`}
                title={`${goal.detail} · ${goal.codeImpact}`}
              >
                <span className="goal-check-icon">{goal.met ? "✓" : "○"}</span>
                <span className="goal-label">{goal.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Half: Dynamic E/M Code Progression Engine */}
        <div className="dock-coding-section">
          <div className="coding-stepper-row">
            <span className="coding-stepper-label">DYNAMIC E/M PROGRESSION:</span>
            <div className="stepper-bar">
              <span className={`stepper-node ${codingRec.primaryCode === "99212" ? "active" : "passed"}`}>
                99212
              </span>
              <span className="stepper-line" />
              <span className={`stepper-node ${codingRec.primaryCode === "99213" ? "active" : codingRec.primaryCode === "99214" || codingRec.primaryCode === "99215" ? "passed" : ""}`}>
                99213
              </span>
              <span className="stepper-line" />
              <span className={`stepper-node ${codingRec.primaryCode === "99214" ? "active glow" : codingRec.primaryCode === "99215" ? "passed" : ""}`}>
                99214
              </span>
              <span className="stepper-line" />
              <span className={`stepper-node ${codingRec.primaryCode === "99215" ? "active glow" : ""}`}>
                99215
              </span>
            </div>
          </div>

          <div className="coding-qualified-banner">
            <div className="active-code-pill">
              <strong>{codingRec.primaryCode}</strong>
              {codingRec.addonCodes.map((c) => (
                <span key={c} className="addon-pill">{c}</span>
              ))}
            </div>
            <div className="coding-explanation-text">
              <div className="rationale-line">{codingRec.mdmReasoning}</div>
              <small className="next-step-hint">{codingRec.nextStepRecommendation}</small>
            </div>
          </div>
        </div>
      </footer>

      {/* ============================================================ */}
      {/* REVIEW & SIGN MODAL (D-008 Legal Gate)                       */}
      {/* ============================================================ */}
      {reviewModalOpen && (
        <div className="modal-backdrop" onClick={() => setReviewModalOpen(false)}>
          <div className="review-sign-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">Legal Medical Record Verification</span>
                <h3>{isLocked ? "Signed Psychiatric Record" : "Review & Sign Psychiatric Encounter Note"}</h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setReviewModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="note-preview-document">
              <div className="note-doc-meta">
                <div>
                  <strong>Patient:</strong> {patient.name} · <strong>MRN:</strong> {patient.mrn} · <strong>DOB:</strong> {patient.dob} ({patient.age}y)
                </div>
                <div>
                  <strong>Date of Service:</strong> Sep 4, 2026 · <strong>Provider:</strong> Dr. Logan Carton, MD (NPI: 1948201948)
                </div>
                <div>
                  <strong>Visit Type:</strong> {draft.visitType} · <strong>Calculated Billing:</strong> {codingRec.primaryCode} {codingRec.addonCodes.join(" ")}
                </div>
              </div>

              <div className="note-doc-section">
                <h4>CHIEF COMPLAINT</h4>
                <p>{draft.chiefComplaint || "Routine psychiatric follow-up."}</p>
              </div>

              <div className="note-doc-section">
                <h4>INTERVAL HISTORY (HPI)</h4>
                <p>{draft.intervalHistory || "None documented."}</p>
              </div>

              {(draft.treatmentResponse || draft.sideEffects) && (
                <div className="note-doc-section">
                  <h4>TREATMENT RESPONSE &amp; TOLERABILITY</h4>
                  <p><strong>Response:</strong> {draft.treatmentResponse || "None."}</p>
                  <p><strong>Side Effects:</strong> {draft.sideEffects || "None."}</p>
                </div>
              )}

              <div className="note-doc-section">
                <h4>MENTAL STATUS EXAMINATION</h4>
                <ul className="mse-doc-list">
                  <li><strong>Appearance:</strong> {draft.mse.appearance}</li>
                  <li><strong>Behavior:</strong> {draft.mse.behavior}</li>
                  <li><strong>Speech:</strong> {draft.mse.speech}</li>
                  <li><strong>Mood &amp; Affect:</strong> {draft.mse.moodAffect}</li>
                  <li><strong>Thought Process:</strong> {draft.mse.thoughtProcess}</li>
                  <li><strong>Thought Content:</strong> {draft.mse.thoughtContent}</li>
                  <li><strong>Cognition:</strong> {draft.mse.cognition}</li>
                  <li><strong>Insight &amp; Judgment:</strong> {draft.mse.insightJudgment}</li>
                </ul>
              </div>

              <div className="note-doc-section">
                <h4>CLINICAL ASSESSMENT &amp; MEDICAL DECISION MAKING</h4>
                <p style={{ whiteSpace: "pre-line" }}>{draft.assessment || "Clinical assessment pending."}</p>
                <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--m3-text-secondary)" }}>
                  MDM Level: {codingRec.mdmLevel.toUpperCase()} — {codingRec.mdmReasoning}
                </div>
              </div>

              <div className="note-doc-section">
                <h4>TREATMENT PLAN &amp; ORDERS</h4>
                <p style={{ whiteSpace: "pre-line" }}>{draft.plan || "Plan as documented."}</p>
                {psychotherapyMinutes >= 16 && (
                  <p style={{ marginTop: "6px", fontStyle: "italic", fontSize: "12px" }}>
                    Psychotherapy: {psychotherapyMinutes} minutes of interactive psychotherapy provided concurrently.
                  </p>
                )}
              </div>
            </div>

            {!isLocked ? (
              <div className="review-sign-footer">
                <label className="attestation-checkbox-label">
                  <input
                    type="checkbox"
                    checked={attestationChecked}
                    onChange={(e) => setAttestationChecked(e.target.checked)}
                  />
                  <span>
                    I attest that I conducted this psychiatric encounter, reviewed the clinical documentation, and confirm the accuracy of the assigned E/M code ({codingRec.primaryCode}) and psychotherapy services.
                  </span>
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-cancel-btn"
                    onClick={() => setReviewModalOpen(false)}
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    className="sign-confirm-btn"
                    onClick={handleSignNote}
                    disabled={!attestationChecked}
                  >
                    🔒 Sign Legal Record as Dr. Logan Carton, MD
                  </button>
                </div>
              </div>
            ) : (
              <div className="review-sign-footer">
                <div className="signed-stamp-box">
                  <span>✓ Electronically Signed by Dr. Logan Carton, MD</span>
                  <small>{draft.signedAt} · NPI 1948201948 · Audit Verified</small>
                </div>
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => setReviewModalOpen(false)}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MedicationList({
  patient,
  onDraftOrder,
}: {
  patient: Patient;
  onDraftOrder?: (orderName: string) => void;
}) {
  const labs = patientLabHistory[patient.id] || [];

  return (
    <section className="card medication-card">
      <div className="card-heading">
        <div>
          <span className="eyebrow">Medication list</span>
          <h2>Active prescriptions &amp; surveillance</h2>
        </div>
        <button className="primary">＋ Prescribe</button>
      </div>
      <div className="med-table">
        {patient.meds.map((medication) => {
          const monitoringItems = calculateMonitoringStatus([medication], labs);
          const protocol = monitoringItems[0];

          return (
            <div className="med-row-wrap" key={medication}>
              <div className="med-row">
                <div className="med-icon">Rx</div>
                <div>
                  <strong>{medication}</strong>
                  <small>Active · Oral</small>
                </div>
                <span>Last reviewed {patient.lastVisit}</span>
                <button type="button">•••</button>
              </div>

              {protocol && (
                <div className={`med-surveillance-tag ${protocol.status}`}>
                  <span>
                    {protocol.status === "overdue" && "⚠️ Protocol Alert: "}
                    {protocol.status === "due-soon" && "⏳ Protocol Notice: "}
                    {protocol.status === "current" && "✓ Surveillance Current: "}
                    <strong>{protocol.requiredLab}</strong>
                    {protocol.lastDoneDate ? ` (Last: ${protocol.lastDoneDate})` : " (Never recorded)"}
                    {" — "}
                    <span>{protocol.intervalLabel}</span>
                  </span>
                  {onDraftOrder && (
                    <button
                      type="button"
                      onClick={() => onDraftOrder(protocol.requiredLab)}
                    >
                      {protocol.status === "overdue" ? "Draft Order" : "Reorder"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LabsView({
  patient,
  onDraftOrder,
}: {
  patient: Patient;
  onDraftOrder: (orderName: string) => void;
}) {
  const labs = patientLabHistory[patient.id] || [];
  const monitoringItems = calculateMonitoringStatus(patient.meds, labs);
  const overdueCount = monitoringItems.filter((i) => i.status === "overdue").length;

  return (
    <div className="labs-container">
      {/* Surveillance Summary Banner */}
      {overdueCount > 0 ? (
        <div className="lab-banner alert-banner">
          <div>
            <strong>
              <span>⚠️</span> {overdueCount} Medication Surveillance Lab{overdueCount > 1 ? "s" : ""} Overdue
            </strong>
            <p>
              Provider protocol: Periodic metabolic &amp; organ surveillance required for active psychiatric pharmacotherapy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const overdueItem = monitoringItems.find((i) => i.status === "overdue");
              if (overdueItem) onDraftOrder(overdueItem.requiredLab);
            }}
          >
            ＋ Draft Overdue Orders
          </button>
        </div>
      ) : (
        <div className="lab-banner current-banner">
          <div>
            <strong>
              <span>✓</span> All Medication Surveillance Requirements Current
            </strong>
            <p>Provider protocol: Active psychiatric medications are aligned with surveillance guidelines.</p>
          </div>
          <button
            type="button"
            onClick={() => onDraftOrder("Routine Psychiatric Wellness Panel")}
          >
            ＋ Routine Order
          </button>
        </div>
      )}

      {/* Surveillance Protocols Table */}
      <section className="card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Provider Preference &amp; Protocol</span>
            <h2>Medication Surveillance Schedule</h2>
          </div>
          <span style={{ fontSize: "11px", color: "var(--m3-text-secondary)", fontWeight: 500 }}>
            Protocol: Dr. Logan Carton Standard
          </span>
        </div>

        {monitoringItems.length === 0 ? (
          <p style={{ padding: "16px", color: "var(--m3-text-secondary)", fontSize: "12px" }}>
            No specialized routine lab surveillance protocols configured for current medications.
          </p>
        ) : (
          <table className="lab-table">
            <thead>
              <tr>
                <th>Active Medication</th>
                <th>Required Surveillance</th>
                <th>Frequency</th>
                <th>Last Done</th>
                <th>Status</th>
                <th>Protocol Rationale &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {monitoringItems.map((item, index) => (
                <tr key={index}>
                  <td>
                    <strong>{item.medication}</strong>
                  </td>
                  <td>
                    <span style={{ fontWeight: 600 }}>{item.requiredLab}</span>
                  </td>
                  <td>{item.intervalLabel}</td>
                  <td>
                    {item.lastDoneDate ? (
                      <div>
                        <span>{item.lastDoneDate}</span>
                        <small style={{ display: "block", color: "var(--m3-text-secondary)", fontSize: "10.5px" }}>
                          {item.daysElapsed} days ago
                        </small>
                      </div>
                    ) : (
                      <span style={{ color: "var(--m3-text-tertiary)" }}>No record</span>
                    )}
                  </td>
                  <td>
                    <span className={`lab-status-badge status-${item.status}`}>
                      {item.status === "overdue" && "⚠️ Overdue"}
                      {item.status === "due-soon" && "⏳ Due soon"}
                      {item.status === "current" && "✓ Current"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--m3-text-secondary)" }}>{item.rationale}</span>
                      <button
                        type="button"
                        className="query-card-btn"
                        style={{ padding: "3px 8px", fontSize: "10px" }}
                        onClick={() => onDraftOrder(item.requiredLab)}
                      >
                        ＋ Order
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Longitudinal Results Table */}
      <section className="card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">Diagnostic Flowsheet</span>
            <h2>Longitudinal Lab Results</h2>
          </div>
          <button className="primary" onClick={() => onDraftOrder("Comprehensive Panel")}>
            ＋ New Lab Order
          </button>
        </div>

        {labs.length === 0 ? (
          <p style={{ padding: "16px", color: "var(--m3-text-secondary)", fontSize: "12px" }}>
            No prior lab results recorded in this chart.
          </p>
        ) : (
          <table className="lab-table">
            <thead>
              <tr>
                <th>Test Name / LOINC</th>
                <th>Collected Date</th>
                <th>Result Value</th>
                <th>Reference Range</th>
                <th>Ordering Provider</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <tr key={lab.id}>
                  <td>
                    <strong>{lab.testName}</strong>
                    <small style={{ display: "block", color: "var(--m3-text-secondary)", fontSize: "10.5px" }}>
                      LOINC {lab.code}
                    </small>
                  </td>
                  <td>{lab.date}</td>
                  <td>
                    <strong>{lab.value}</strong> {lab.unit !== "multi" && <span>{lab.unit}</span>}
                    {lab.flag && (
                      <span className={`lab-flag ${lab.flag}`}>
                        {lab.flag}
                      </span>
                    )}
                  </td>
                  <td>{lab.referenceRange}</td>
                  <td>{lab.orderedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="card placeholder"><div className="placeholder-icon">◇</div><h2>{title}</h2><p>{text}</p><button>Build this workspace</button></section>;
}

function AiPanel({
  patient,
  section,
  command,
  preferences = defaultPreferences,
  onUpdatePreferences,
  onOpenCustomizer,
  onClose,
}: {
  patient: Patient;
  section: Section;
  command: string;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onOpenCustomizer?: () => void;
  onClose?: () => void;
}) {
  const [customAiText, setCustomAiText] = useState("");
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  function handleAiSubmit(promptText: string) {
    if (!promptText.trim()) return;
    const input = promptText.trim();
    if (preferences && onUpdatePreferences) {
      const res = parseAiPreferenceCommand(input, preferences);
      if (res.recognized && res.updatedPreferences) {
        onUpdatePreferences(res.updatedPreferences);
        setAiFeedback(res.feedback);
        setCustomAiText("");
        return;
      }
    }
    setAiFeedback(`✦ AI clinical assist: Synthesized context for “${input}”.`);
    setCustomAiText("");
  }

  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark">✦</span>
          <div>
            <strong>Clinical AI</strong>
            <small>Context: {patient.name} · {section}</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ai-context">
        <span>LIVE CONTEXT</span>
        <p>AI follows active patient, workspace density ({preferences.density}), and preset ({preferences.activePresetId}).</p>
      </div>
      {command && (
        <div className="ai-global-command">
          <span>GLOBAL COMMAND</span>
          <strong>{command}</strong>
          <small>Captured by universal search bar.</small>
        </div>
      )}
      {aiFeedback && (
        <div className="ai-action-card">
          <span className="spark">✦</span>
          <div>
            <strong>AI Workspace Assistant</strong>
            <p>{aiFeedback}</p>
          </div>
        </div>
      )}
      <div className="ai-card">
        <span className="eyebrow">Before this visit</span>
        <h3>3 things worth checking</h3>
        <ol>
          <li><strong>Response:</strong> Clarify benefit since the last medication adjustment.</li>
          <li><strong>Monitoring:</strong> Confirm adherence and review any pending monitoring.</li>
          <li><strong>Function:</strong> Compare sleep, work/school, and daily impairment with last visit.</li>
        </ol>
      </div>
      <div className="suggestion-chips">
        {onOpenCustomizer && (
          <button type="button" onClick={onOpenCustomizer}>⚙️ Layout drawer</button>
        )}
        <button type="button" onClick={() => handleAiSubmit("Switch to minimal mode")}>🧘 Zen mode</button>
        <button type="button" onClick={() => handleAiSubmit("Switch to med check layout")}>💊 Med check</button>
        <button type="button" onClick={() => handleAiSubmit("Save current layout as Focus Flow")}>★ Save layout</button>
        <button type="button" onClick={() => handleAiSubmit("Summarize chart")}>Summarize chart</button>
        <button type="button" onClick={() => handleAiSubmit("Compare last 3 visits")}>Compare visits</button>
      </div>
      <div className="ai-composer">
        <textarea
          placeholder={`Ask about ${patient.name} or adjust layout ("hide metrics", "zen mode", "save preset")...`}
          value={customAiText}
          onChange={(e) => setCustomAiText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAiSubmit(customAiText);
            }
          }}
        />
        <div>
          <span>Chart &amp; layout context on</span>
          <button type="button" onClick={() => handleAiSubmit(customAiText)}>↑</button>
        </div>
      </div>
      <p className="ai-disclaimer">Prototype only. No real PHI or clinical decision support is connected.</p>
    </aside>
  );
}

function ScratchpadPanel({
  notes,
  newNoteText,
  setNewNoteText,
  onAddNote,
  onDeleteNote,
  onInsertToNote,
  onClose,
}: {
  notes: ScratchNote[];
  newNoteText: string;
  setNewNoteText: (text: string) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (id: string) => void;
  onInsertToNote: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#feefe3", color: "#b06000" }}>📝</span>
          <div>
            <strong>Clinical Scratchpad</strong>
            <small>Quick notes, formulas, phone memos</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="scratchpad-container">
        <div className="scratchpad-composer">
          <textarea
            placeholder="Jot down quick thoughts, phone call notes..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                onAddNote(newNoteText);
              }
            }}
          />
          <button type="button" onClick={() => onAddNote(newNoteText)}>
            ＋ Add note
          </button>
        </div>

        {notes.map((note) => (
          <div key={note.id} className={`scratchpad-note ${note.color}`}>
            <div className="note-text">{note.text}</div>
            <div className="note-footer">
              <span>{note.time}</span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className="note-copy-btn"
                  title="Copy to clipboard / note"
                  onClick={() => onInsertToNote(note.text)}
                >
                  📋 Copy
                </button>
                <button
                  type="button"
                  className="note-copy-btn"
                  style={{ color: "var(--m3-danger)" }}
                  title="Delete note"
                  onClick={() => onDeleteNote(note.id)}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function TasksPanel({
  tasks,
  newTaskText,
  setNewTaskText,
  onToggleTask,
  onAddTask,
  onClose,
}: {
  tasks: ClinicalTask[];
  newTaskText: string;
  setNewTaskText: (text: string) => void;
  onToggleTask: (id: string) => void;
  onAddTask: (text: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#d3e3fd", color: "#0b57d0" }}>✓</span>
          <div>
            <strong>Tasks & Follow-ups</strong>
            <small>Personal clinical action list</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="tasks-container">
        <div className="tasks-add-box">
          <input
            placeholder="Add a clinical task..."
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAddTask(newTaskText);
            }}
          />
          <button type="button" onClick={() => onAddTask(newTaskText)}>
            ＋
          </button>
        </div>

        {tasks.map((task) => (
          <div key={task.id} className={`task-item ${task.completed ? "completed" : ""}`}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onToggleTask(task.id)}
              aria-label={`Mark "${task.text}" as ${task.completed ? "incomplete" : "complete"}`}
            />
            <div className="task-content">
              <strong>{task.text}</strong>
              <small>{task.due}</small>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function CalculatorPanel({
  answers,
  onAnswer,
  onInsertToNote,
  onClose,
}: {
  answers: Record<number, number>;
  onAnswer: (index: number, score: number) => void;
  onInsertToNote: (summary: string) => void;
  onClose: () => void;
}) {
  const totalScore = Object.values(answers).reduce((sum, val) => sum + val, 0);
  let severity = "Minimal depression";
  if (totalScore >= 20) severity = "Severe depression";
  else if (totalScore >= 15) severity = "Moderately severe depression";
  else if (totalScore >= 10) severity = "Moderate depression";
  else if (totalScore >= 5) severity = "Mild depression";

  const summary = `PHQ-9 Score: ${totalScore}/27 (${severity})`;

  return (
    <aside className="companion-panel">
      <div className="companion-panel-header">
        <div>
          <span className="spark" style={{ background: "#ceead6", color: "#137333" }}>🧮</span>
          <div>
            <strong>Clinical Calculator</strong>
            <small>PHQ-9 Depression Severity Scale</small>
          </div>
        </div>
        <button type="button" className="companion-close-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="calc-container">
        <div className="calc-score-badge">
          <div>
            <strong style={{ fontSize: "20px" }}>{totalScore} / 27</strong>
            <div style={{ fontSize: "11px", marginTop: "2px", opacity: 0.9 }}>{severity}</div>
          </div>
          <button
            type="button"
            className="note-copy-btn"
            style={{ padding: "6px 12px" }}
            onClick={() => onInsertToNote(summary)}
          >
            📋 Insert score
          </button>
        </div>

        {phqQuestions.map((question, index) => (
          <div key={index} className="calc-question">
            <p>{question}</p>
            <div className="calc-options">
              {[
                { label: "0 (None)", val: 0 },
                { label: "1 (Few)", val: 1 },
                { label: "2 (> Half)", val: 2 },
                { label: "3 (Daily)", val: 3 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  className={answers[index] === opt.val ? "selected" : ""}
                  onClick={() => onAnswer(index, opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
