"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TodayDashboard from "./TodayDashboard";
import WorkspaceCustomizer from "./WorkspaceCustomizer";
import PatientHeader from "./workspace/PatientHeader";
import SectionTabs from "./workspace/SectionTabs";
import PatientOverview from "./patient/PatientOverview";
import PatientMedications from "./patient/PatientMedications";
import PatientLabs from "./patient/PatientLabs";
import PatientMessages from "./patient/PatientMessages";
import PatientHistory from "./patient/PatientHistory";
import EncounterWorkspace from "./encounter/EncounterWorkspace";
import ClinicalAiPanel from "./companion/ClinicalAiPanel";
import ScratchpadPanel from "./companion/ScratchpadPanel";
import TasksPanel from "./companion/TasksPanel";
import CalculatorPanel from "./companion/CalculatorPanel";
import OrderCartModal from "./orders/OrderCartModal";

import {
  type Patient,
  type Section,
  patients,
  resolvePatientFromCommand,
  resolveSectionFromCommand,
} from "../domain/patient";
import {
  type ClinicalOrder,
  type LabOrder,
  psychiatricLabCatalog,
} from "../domain/orders";
import {
  loadStagedOrders,
  saveStagedOrders,
} from "../lib/order-service";
import {
  type ScratchNote,
  type ClinicalTask,
  initialScratchNotes,
  initialTasks,
} from "../domain/tasks";
import {
  type ClinicalQueryAnswer,
  googleWorkspaceApps,
  executeClinicalQuery,
} from "../domain/clinical-query";
import {
  type BrowserSpeechRecognition,
  type SpeechRecognitionEventLike,
} from "../domain/speech";
import {
  type ProviderPreferences,
  defaultPreferences,
  loadPreferences,
  parseAiPreferenceCommand,
  applyQuickPreset,
} from "../lib/preference-engine";

type CompanionToolId = "ai" | "scratchpad" | "tasks" | "calc";

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="card placeholder">
      <div className="placeholder-icon">◇</div>
      <h2>{title}</h2>
      <p>{text}</p>
      <button>Build this workspace</button>
    </section>
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
  onOpenOrderCart,
  onDraftAllOverdue,
  onOpenPrescribe,
  onOpenLabComposer,
  onAddTask,
  onToast,
}: {
  patient: Patient;
  section: Section;
  preferences?: ProviderPreferences;
  onUpdatePreferences?: (updated: ProviderPreferences) => void;
  onDraftOrder: (orderName: string) => void;
  onInsertText: (text: string) => void;
  onEncounterSigned?: (patientId: string) => void;
  onOpenOrderCart?: (tab?: "cart" | "prescribe" | "labs", prefill?: string) => void;
  onDraftAllOverdue?: (labs: string[]) => void;
  onOpenPrescribe?: () => void;
  onOpenLabComposer?: () => void;
  onAddTask?: (text: string) => void;
  onToast?: (msg: string) => void;
}) {
  if (section === "Overview")
    return (
      <PatientOverview
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
      />
    );
  if (section === "Encounter")
    return (
      <EncounterWorkspace
        patient={patient}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
        onInsertText={onInsertText}
        onEncounterSigned={onEncounterSigned}
        onDraftOrder={onDraftOrder}
        onOpenOrderCart={onOpenOrderCart}
      />
    );
  if (section === "Meds")
    return (
      <PatientMedications
        patient={patient}
        onDraftOrder={onDraftOrder}
        onOpenPrescribe={onOpenPrescribe}
      />
    );
  if (section === "Labs")
    return (
      <PatientLabs
        patient={patient}
        onDraftOrder={onDraftOrder}
        onDraftAllOverdue={onDraftAllOverdue}
        onOpenLabComposer={onOpenLabComposer}
      />
    );
  if (section === "Messages")
    return (
      <PatientMessages
        patient={patient}
        onOpenOrderCart={onOpenOrderCart}
        onAddTask={onAddTask}
        onToast={onToast}
      />
    );
  return (
    <PatientHistory
      patient={patient}
      onInsertText={onInsertText}
      onToast={onToast}
    />
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
  const [scratchpadNotes, setScratchpadNotes] = useState<ScratchNote[]>(initialScratchNotes);
  const [newNoteText, setNewNoteText] = useState("");
  const [tasks, setTasks] = useState<ClinicalTask[]>(initialTasks);
  const [newTaskText, setNewTaskText] = useState("");
  const [phqAnswers, setPhqAnswers] = useState<Record<number, number>>({ 0: 2, 1: 1, 2: 2, 3: 2, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0 });
  const [preferences, setPreferences] = useState<ProviderPreferences>(defaultPreferences);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stagedOrdersByPatient, setStagedOrdersByPatient] = useState<Record<string, ClinicalOrder[]>>(() => loadStagedOrders());
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalPatientId, setOrderModalPatientId] = useState<string>("maya-chen");
  const [orderModalTab, setOrderModalTab] = useState<"cart" | "prescribe" | "labs">("cart");
  const [orderModalPrefillLab, setOrderModalPrefillLab] = useState<string | undefined>(undefined);
  const [omniboxFilter, setOmniboxFilter] = useState<"all" | "actions" | "patients" | "ai" | "apps">("all");
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
  const orderModalPatient = patients.find((patient) => patient.id === orderModalPatientId) ?? activePatient;
  const dockedPatientIds = openPatientIds.filter((id) => !detachedPatientIds.includes(id));

  function handleOpenOrderCart(patientId: string, tab: "cart" | "prescribe" | "labs" = "cart", prefill?: string) {
    setOrderModalPatientId(patientId);
    setOrderModalTab(tab);
    setOrderModalPrefillLab(prefill);
    setOrderModalOpen(true);
  }

  function handleDraftLabOrder(patientId: string, labName: string) {
    const p = patients.find((item) => item.id === patientId);
    if (!p) return;
    const catalogItem = psychiatricLabCatalog.find(
      (l) => l.testName.toLowerCase().includes(labName.toLowerCase()) || labName.toLowerCase().includes(l.testName.toLowerCase())
    );
    const newOrder: LabOrder = {
      id: `ord-lab-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      patientId,
      type: "lab",
      testName: catalogItem?.testName || labName,
      loincCode: catalogItem?.loincCode || "24323-8",
      specimen: catalogItem?.specimen || "Blood (Serum)",
      priority: "Protocol Surveillance",
      fastingRequired: catalogItem?.fastingRequired || false,
      clinicalRationale: catalogItem?.description || `Periodic surveillance lab for ${p.name}`,
      indication: p.diagnoses[0] || "Psychiatric Protocol Surveillance",
      targetFacility: "Quest Diagnostics",
      status: "staged",
      orderedBy: "Dr. Logan Carton, MD",
      createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };

    setStagedOrdersByPatient((prev) => {
      const existing = prev[patientId] || [];
      if (existing.some((o) => o.type === "lab" && o.testName === newOrder.testName)) {
        return prev;
      }
      const next = { ...prev, [patientId]: [...existing, newOrder] };
      saveStagedOrders(next);
      return next;
    });

    handleOpenOrderCart(patientId, "cart");
  }

  function handleDraftAllOverdue(patientId: string, labNames: string[]) {
    const p = patients.find((item) => item.id === patientId);
    if (!p) return;

    const newOrders: LabOrder[] = labNames.map((labName, idx) => {
      const catalogItem = psychiatricLabCatalog.find(
        (l) => l.testName.toLowerCase().includes(labName.toLowerCase()) || labName.toLowerCase().includes(l.testName.toLowerCase())
      );
      return {
        id: `ord-lab-${Date.now()}-${idx}`,
        patientId,
        type: "lab",
        testName: catalogItem?.testName || labName,
        loincCode: catalogItem?.loincCode || "24323-8",
        specimen: catalogItem?.specimen || "Blood (Serum/Plasma)",
        priority: "Protocol Surveillance",
        fastingRequired: catalogItem?.fastingRequired || true,
        clinicalRationale: catalogItem?.description || `Periodic surveillance lab for ${p.name}`,
        indication: `${p.diagnoses[0] || "Psychiatric Protocol"} surveillance`,
        targetFacility: "Quest Diagnostics",
        status: "staged",
        orderedBy: "Dr. Logan Carton, MD",
        createdAt: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      };
    });

    setStagedOrdersByPatient((prev) => {
      const existing = prev[patientId] || [];
      const filteredNew = newOrders.filter(
        (no) => !existing.some((eo) => eo.type === "lab" && eo.testName === no.testName)
      );
      const next = { ...prev, [patientId]: [...existing, ...filteredNew] };
      saveStagedOrders(next);
      return next;
    });

    handleOpenOrderCart(patientId, "cart");
  }
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
    return executeClinicalQuery(query, activePatient, preferences);
  }, [query, activePatient, preferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;

    setVoiceSupported(true);
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
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

    if (queryClinicalAnswer?.isSplitScreen) {
      splitScreenPatient(queryClinicalAnswer.patientId);
      setWorkspaceMessage(`Split screen opened with ${queryClinicalAnswer.patientName}`);
      window.setTimeout(() => setWorkspaceMessage(""), 3000);
      setQuery("");
      setSearchFocused(false);
      return;
    }

    if (queryClinicalAnswer?.orderType === "prescribe") {
      handleOpenOrderCart(queryClinicalAnswer.patientId, "prescribe", queryClinicalAnswer.prefillDrug);
      setQuery("");
      setSearchFocused(false);
      return;
    }

    if (queryClinicalAnswer?.labOrderName) {
      handleDraftLabOrder(queryClinicalAnswer.patientId, queryClinicalAnswer.labOrderName);
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

  function splitScreenPatient(targetId: string) {
    setOpenPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));

    if (activePatientId === targetId) {
      const remainingDocked = openPatientIds.filter(
        (id) => id !== targetId && !detachedPatientIds.includes(id)
      );
      if (remainingDocked.length > 0) {
        setActivePatientId(remainingDocked[0]);
      } else {
        const companion = patients.find((p) => p.id !== targetId)?.id || "maya-chen";
        setOpenPatientIds((current) => (current.includes(companion) ? current : [...current, companion]));
        setActivePatientId(companion);
      }
    }

    setDetachedPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
    setDetachedSections((current) => ({
      ...current,
      [targetId]: current[targetId] ?? "Overview",
    }));
    setActiveView("patient");
    setWorkspaceMessage(`Split screen opened with ${patients.find(p => p.id === targetId)?.name || targetId}`);
    window.setTimeout(() => setWorkspaceMessage(""), 2500);
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
              if (event.key === "Enter") {
                event.preventDefault();
                runAiCommand(query);
              }
              if (event.key === "Escape") {
                event.preventDefault();
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
              <div className="omnibox-filter-tabs">
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "all" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "actions" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("actions")}
                >
                  ⚡ Actions
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "patients" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("patients")}
                >
                  ◉ Patients
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "ai" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("ai")}
                >
                  ✦ AI Ops
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "apps" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("apps")}
                >
                  □ Apps
                </button>
              </div>

              {(omniboxFilter === "all" || omniboxFilter === "ai" || omniboxFilter === "actions") && queryClinicalAnswer && (
                <div className="query-answer-card">
                  <div className="query-answer-header">
                    <span className="query-answer-title">
                      <span>✦</span> {queryClinicalAnswer.title}
                    </span>
                    <span className="query-confidence-badge">Protocol Verified</span>
                  </div>
                  <p>{queryClinicalAnswer.body}</p>
                  <div className="query-card-actions">
                    {queryClinicalAnswer.isSplitScreen && (
                      <button
                        type="button"
                        className="query-card-btn primary"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          splitScreenPatient(queryClinicalAnswer.patientId);
                          setQuery("");
                          setSearchFocused(false);
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Split Screen"}
                      </button>
                    )}
                    {queryClinicalAnswer.orderType === "prescribe" && (
                      <button
                        type="button"
                        className="query-card-btn primary"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          handleOpenOrderCart(queryClinicalAnswer.patientId, "prescribe", queryClinicalAnswer.prefillDrug);
                          setQuery("");
                          setSearchFocused(false);
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Stage to Cart"}
                      </button>
                    )}
                    {!queryClinicalAnswer.isSplitScreen && !queryClinicalAnswer.orderType && queryClinicalAnswer.actionLabel && (
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
                          handleDraftLabOrder(queryClinicalAnswer.patientId, queryClinicalAnswer.labOrderName!);
                          setQuery("");
                          setSearchFocused(false);
                        }}
                      >
                        ＋ Stage Lab Order
                      </button>
                    )}
                  </div>
                </div>
              )}

              {(omniboxFilter === "all" || omniboxFilter === "ai") && query.trim() && (
                <button className="ai-command-result" onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand(query)}>
                  <span className="command-result-icon">✦</span>
                  <span>
                    <strong>{commandLabel}</strong>
                    <small>{commandPatient || commandSection ? "AI-routed workspace command" : "Send to Clinical AI with the active chart context"}</small>
                  </span>
                  <span className="enter-hint">↵</span>
                </button>
              )}

              {(omniboxFilter === "all" || omniboxFilter === "patients") && filteredPatients.length > 0 && <div className="result-group-label">Patients</div>}
              {(omniboxFilter === "all" || omniboxFilter === "patients") && filteredPatients.map((patient) => (
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
              <div className="omnibox-filter-tabs">
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "all" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "actions" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("actions")}
                >
                  ⚡ Actions
                </button>
                <button
                  type="button"
                  className={`omnibox-filter-chip ${omniboxFilter === "ai" ? "active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setOmniboxFilter("ai")}
                >
                  ✦ AI Ops
                </button>
              </div>

              <div className="result-group-label">Try a clinical question or command</div>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("When were Jordan's labs last done?"); }}><span className="command-result-icon">✦</span><span><strong>When were Jordan&apos;s labs last done?</strong><small>Check surveillance dates & protocol status</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("Refill Maya's Sertraline"); }}><span className="command-result-icon">💊</span><span><strong>Refill Maya&apos;s Sertraline</strong><small>Stage e-prescription directly to DrFirst cart</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("Split screen Jordan"); }}><span className="command-result-icon">◫</span><span><strong>Split screen Jordan Reed</strong><small>Open side-by-side dual chart comparison</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("What changed since last visit in Maya"); }}><span className="command-result-icon">📊</span><span><strong>What changed since last visit in Maya</strong><small>Summon longitudinal AI interval briefing</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("Switch to zen mode")}><span className="command-result-icon">🧘</span><span><strong>Switch to Zen mode</strong><small>Minimalist distraction-free layout</small></span></button>
            </div>
          )}
        </div>

        <div className="top-actions">
          {/* Segmented Density Controller (Zen | Balanced | Cockpit) */}
          <div className="density-segmented-control" role="group" aria-label="Workspace Density Mode">
            <button
              type="button"
              className={`density-segment-btn ${preferences.activePresetId === "minimal" || preferences.density === "minimal" ? "active" : ""}`}
              title="Zen Mode: Distraction-free single-column document focus"
              onClick={() => {
                const next = applyQuickPreset("minimal", preferences);
                setPreferences(next);
                setWorkspaceMessage("Switched to Zen Mode (Minimalist Focus)");
                window.setTimeout(() => setWorkspaceMessage(""), 2500);
              }}
            >
              <span className="segment-icon">🧘</span>
              <span>Zen</span>
            </button>
            <button
              type="button"
              className={`density-segment-btn ${preferences.activePresetId === "standard" || (preferences.density === "comfortable" && preferences.activePresetId !== "minimal") ? "active" : ""}`}
              title="Balanced Mode: Standard clinical workstation with balanced layout"
              onClick={() => {
                const next = applyQuickPreset("standard", preferences);
                setPreferences(next);
                setWorkspaceMessage("Switched to Balanced Mode (Standard)");
                window.setTimeout(() => setWorkspaceMessage(""), 2500);
              }}
            >
              <span className="segment-icon">⚖</span>
              <span>Balanced</span>
            </button>
            <button
              type="button"
              className={`density-segment-btn ${preferences.activePresetId === "cockpit" || preferences.activePresetId === "med-check" ? "active" : ""}`}
              title="Cockpit Mode: High-density multi-metric flowsheet for high-volume clinics"
              onClick={() => {
                const next = applyQuickPreset("cockpit", preferences);
                setPreferences(next);
                setWorkspaceMessage("Switched to Cockpit Mode (High-Density Multi-Metric)");
                window.setTimeout(() => setWorkspaceMessage(""), 2500);
              }}
            >
              <span className="segment-icon">🚀</span>
              <span>Cockpit</span>
            </button>
          </div>
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
                  const target = patients.find((p) => p.name === patientName) || activePatient;
                  handleDraftLabOrder(target.id, labName);
                }}
              />
            </section>
          ) : (
            <section className="primary-workspace-pane">
              <PatientHeader
                patient={activePatient}
                headerDensity={preferences.headerDensity}
                onOpenCustomizer={() => setCustomizerOpen(true)}
                stagedOrdersCount={(stagedOrdersByPatient[activePatient.id] || []).length}
                onOpenOrderCart={() => handleOpenOrderCart(activePatient.id, "cart")}
                onNavigateSection={setSection}
                onNavigateView={setActiveView}
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
                  onDraftOrder={(orderName) => handleDraftLabOrder(activePatient.id, orderName)}
                  onDraftAllOverdue={(labs) => handleDraftAllOverdue(activePatient.id, labs)}
                  onOpenOrderCart={(tab, prefill) => handleOpenOrderCart(activePatient.id, tab, prefill)}
                  onOpenPrescribe={() => handleOpenOrderCart(activePatient.id, "prescribe")}
                  onOpenLabComposer={() => handleOpenOrderCart(activePatient.id, "labs")}
                  onAddTask={(text) => {
                    setTasks((prev) => [...prev, { id: `task-${Date.now()}`, text, completed: false, due: "Today" }]);
                    setWorkspaceMessage(`Added task: "${text}"`);
                    window.setTimeout(() => setWorkspaceMessage(""), 3000);
                  }}
                  onToast={(msg) => {
                    setWorkspaceMessage(msg);
                    window.setTimeout(() => setWorkspaceMessage(""), 3000);
                  }}
                  onInsertText={() => {
                    setWorkspaceMessage("Inserted context into active encounter!");
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
                    onDraftOrder={(orderName) => handleDraftLabOrder(patient.id, orderName)}
                    onDraftAllOverdue={(labs) => handleDraftAllOverdue(patient.id, labs)}
                    onOpenOrderCart={(tab, prefill) => handleOpenOrderCart(patient.id, tab, prefill)}
                    onOpenPrescribe={() => handleOpenOrderCart(patient.id, "prescribe")}
                    onOpenLabComposer={() => handleOpenOrderCart(patient.id, "labs")}
                    onAddTask={(text) => {
                      setTasks((prev) => [...prev, { id: `task-${Date.now()}`, text, completed: false, due: "Today" }]);
                      setWorkspaceMessage(`Added task: "${text}"`);
                      window.setTimeout(() => setWorkspaceMessage(""), 3000);
                    }}
                    onToast={(msg) => {
                      setWorkspaceMessage(msg);
                      window.setTimeout(() => setWorkspaceMessage(""), 3000);
                    }}
                    onInsertText={() => {
                      setWorkspaceMessage("Inserted context into active encounter!");
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
        <ClinicalAiPanel
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
          onInsertToNote={() => {
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

      {orderModalPatient && (
        <OrderCartModal
          isOpen={orderModalOpen}
          onClose={() => setOrderModalOpen(false)}
          patient={orderModalPatient}
          stagedOrders={stagedOrdersByPatient[orderModalPatientId] || []}
          onUpdateStagedOrders={(updated) => {
            setStagedOrdersByPatient((prev) => {
              const next = { ...prev, [orderModalPatientId]: updated };
              saveStagedOrders(next);
              return next;
            });
          }}
          onOrderTransmitted={(receipt) => {
            setWorkspaceMessage(`✓ Orders authorized and dispatched! ${receipt.summaryText}`);
            window.setTimeout(() => setWorkspaceMessage(""), 5000);
          }}
          initialTab={orderModalTab}
          prefillLab={orderModalPrefillLab}
        />
      )}

      {workspaceMessage && <div className="workspace-toast">{workspaceMessage}</div>}
    </main>
  );
}
