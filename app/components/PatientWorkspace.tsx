"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TodayDashboard from "./TodayDashboard";
import { SIDEBAR_VISIBILITY_EVENT, SIDEBAR_VISIBILITY_REQUEST_EVENT } from "./DynamicSidebar";
import WorkspaceCustomizer from "./WorkspaceCustomizer";
import PatientHeader from "./workspace/PatientHeader";
import SectionTabs from "./workspace/SectionTabs";
import PatientOverview from "./patient/PatientOverview";
import PatientMedications from "./patient/PatientMedications";
import PatientLabs from "./patient/PatientLabs";
import PatientDocuments from "./patient/PatientDocuments";
import PatientMessages from "./patient/PatientMessages";
import PatientHistory from "./patient/PatientHistory";
import PatientInformationDrawer from "./patient/PatientInformationDrawer";
import EncounterWorkspace from "./encounter/EncounterWorkspace";
import ClinicalAiPanel from "./companion/ClinicalAiPanel";
import ScratchpadPanel from "./companion/ScratchpadPanel";
import TasksPanel from "./companion/TasksPanel";
import CalculatorPanel from "./companion/CalculatorPanel";
import OrderCartModal from "./orders/OrderCartModal";
import AuditComplianceModal from "./compliance/AuditComplianceModal";
import Button from "./ui/Button";
import Icon from "./ui/Icon";
import RailResizeHandle from "./ui/RailResizeHandle";
import ToolPinMenu from "./ui/ToolPinMenu";
import WorkspaceProfileMenu from "./workspace/WorkspaceProfileMenu";
import {
  BUILT_IN_TEMPLATES,
  type PracticeTemplateState,
  adoptTemplate,
  deletePracticeTemplate,
  fetchPracticeTemplates,
  savePracticeTemplate,
} from "../lib/workspace-templates";
import { RIGHT_RAIL, readStoredRailWidth } from "../lib/rail-resize";
import { useToolPins } from "../lib/use-tool-pins";
import { pinnedTools, writeToolPins } from "../lib/workspace-tools";
import { api } from "../lib/api-client";

import {
  type Patient,
  type Section,
  resolveSectionFromCommand,
} from "../domain/patient";
import {
  findRosterPatient,
  resolveRosterPatientFromCommand,
  retainAccessiblePatientIds,
  usePatientRoster,
} from "../lib/patient-roster";
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
  applyPreset,
  builtInPresets,
  saveCustomPreset,
  deleteCustomPreset,
} from "../lib/preference-engine";
import { correctSpeechTranscript } from "../lib/psychiatric-vocabulary";

/** The right rail renders whatever is pinned to it; ids come from the registry. */
type CompanionToolId = string;

type OmniboxFilterId = "all" | "actions" | "patients" | "ai" | "apps";

/**
 * The omnibox filters, declared once. Both the results view and the suggestions
 * view render from this list, so a filter cannot exist in one and not the other,
 * and every label keeps the same glyph from the icon system.
 */
const OMNIBOX_FILTERS: ReadonlyArray<{ id: OmniboxFilterId; label: string; icon?: string }> = [
  { id: "all", label: "All" },
  { id: "actions", label: "Actions", icon: "bolt" },
  { id: "patients", label: "Patients", icon: "person" },
  { id: "ai", label: "AI Ops", icon: "auto_awesome" },
  { id: "apps", label: "Apps", icon: "grid_view" },
];

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="card placeholder">
      <div className="placeholder-icon"><Icon name="construction" size="lg" /></div>
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
  if (section === "Documents")
    return <PatientDocuments patient={patient} />;
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
  // The accessible roster is the only runtime patient truth this shell has. Nothing
  // is open until it says which charts this clinician may reach, so the workspace
  // starts on Today rather than inventing a patient to sit behind.
  const { patients: roster, status: rosterStatus, refresh: refreshRoster } = usePatientRoster();
  const [activeView, setActiveView] = useState<"today" | "patient">("today");
  const [openPatientIds, setOpenPatientIds] = useState<string[]>([]);
  const [detachedPatientIds, setDetachedPatientIds] = useState<string[]>([]);
  const [patientSections, setPatientSections] = useState<Record<string, Section>>({});
  const [activePatientId, setActivePatientId] = useState("");
  const section = patientSections[activePatientId] ?? "Overview";
  function setPatientSection(patientId: string, next: Section) {
    setPatientSections((current) => ({ ...current, [patientId]: next }));
  }
  function setSection(next: Section) {
    setPatientSection(activePatientId, next);
  }
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCompanionPanel, setActiveCompanionPanel] = useState<CompanionToolId | null>(null);
  const { pins, toggle: togglePinnedTool } = useToolPins();
  const companionToolIds = useMemo(() => pins.right, [pins]);
  const [addToolMenuOpen, setAddToolMenuOpen] = useState(false);
  // Total width the rail reserves: the icon strip, plus whatever the clinician
  // has dragged open beside it.
  const [companionRailWidth, setCompanionRailWidth] = useState(RIGHT_RAIL.min);
  // The practice's shared layouts. Starts on the shipped fallbacks so the
  // switcher is never empty while the request is in flight.
  const [practiceTemplates, setPracticeTemplates] = useState<PracticeTemplateState>({
    templates: BUILT_IN_TEMPLATES,
    canEdit: false,
    membershipRole: "member",
    usingBuiltIns: true,
  });

  useEffect(() => {
    void fetchPracticeTemplates().then(setPracticeTemplates);
  }, []);

  /** Width the rail opens to on a click, when it has not been dragged before. */
  const COMPANION_DEFAULT_OPEN = RIGHT_RAIL.min + 360;
  /** The width the clinician last dragged to, so a click reopens at their size. */
  const preferredCompanionWidth = useRef(COMPANION_DEFAULT_OPEN);

  /**
   * Clicking a tool and dragging the edge are two ways to do the same thing, so
   * they share one path: selecting a tool opens the rail far enough to show it,
   * de-selecting closes the rail back to the icon strip.
   */
  const toggleCompanionPanel = useCallback((id: CompanionToolId) => {
    setActiveCompanionPanel((current) => {
      const next = current === id ? null : id;
      setCompanionRailWidth((width) => {
        if (!next) return RIGHT_RAIL.min;
        return width > RIGHT_RAIL.revealAt ? width : preferredCompanionWidth.current;
      });
      return next;
    });
  }, []);

  /** Dragging the rail shut is also a way to close the open panel. */
  const handleCompanionWidth = useCallback((width: number) => {
    setCompanionRailWidth(width);
    if (width <= RIGHT_RAIL.min) {
      setActiveCompanionPanel(null);
      return;
    }
    preferredCompanionWidth.current = width;
    // Dragging the rail open is a request to see something, so if nothing is
    // selected the first pinned tool opens rather than revealing a blank gap.
    setActiveCompanionPanel((current) => current ?? companionToolIds[0] ?? null);
  }, [companionToolIds]);

  useEffect(() => {
    const stored = readStoredRailWidth("right", RIGHT_RAIL);
    if (stored > RIGHT_RAIL.revealAt) preferredCompanionWidth.current = stored;
  }, []);

  const companionAddRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!addToolMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!companionAddRef.current?.contains(event.target as Node)) setAddToolMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddToolMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [addToolMenuOpen]);

  // The workspace reserves the rail's width as a margin, so the stylesheet needs
  // the current value or the note would slide underneath as the rail grows.
  useEffect(() => {
    document.documentElement.style.setProperty("--right-rail-w", `${companionRailWidth}px`);
  }, [companionRailWidth]);

  const companionTools = useMemo(() => pinnedTools(pins, "right"), [pins]);

  // Unpinning the tool whose panel is open would otherwise leave the panel up
  // with no rail button to close it.
  useEffect(() => {
    if (activeCompanionPanel && !companionToolIds.includes(activeCompanionPanel)) {
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
    }
  }, [companionToolIds, activeCompanionPanel]);
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

  /**
   * Applies a preference change and makes it durable.
   *
   * Preferences are loaded from the server on boot, so a change that only touched
   * React state looked applied until the next reload and then silently reverted.
   * Hiding a dashboard section, collapsing a card, or switching density is the
   * clinician tuning their own workspace; it has to survive the session. Every
   * preference-changing surface routes through here for that reason.
   */
  const persistPreferences = useCallback((updated: ProviderPreferences) => {
    setPreferences(updated);
    api.preferences.save(updated).catch(() => {
      // The workspace still reflects the change; only durability was lost.
      setWorkspaceMessage("Layout change could not be saved and may not persist.");
      window.setTimeout(() => setWorkspaceMessage(""), 3500);
    });
  }, []);

  // Hiding the companion tools means hiding the tools, not just their launcher.
  // A preset like Zen sets the preference directly, so the open panel has to follow
  // it here rather than only in the rail's own hide button.
  useEffect(() => {
    if (!preferences.showCompanionRail) {
      setActiveCompanionPanel(null);
      setCompanionRailWidth(RIGHT_RAIL.min);
    }
  }, [preferences.showCompanionRail]);

  // The sidebar renders outside this tree, so its visibility crosses the boundary as
  // an event pair: the current value goes out, and a clinician's collapse/expand
  // comes back to be persisted here with every other preference.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_VISIBILITY_EVENT, { detail: { visible: preferences.showSidebar } }),
    );
  }, [preferences.showSidebar]);

  useEffect(() => {
    function handleRequest(event: Event) {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      if (typeof detail?.visible !== "boolean") return;
      if (detail.visible === preferences.showSidebar) return;
      persistPreferences({ ...preferences, showSidebar: detail.visible });
    }

    window.addEventListener(SIDEBAR_VISIBILITY_REQUEST_EVENT, handleRequest);
    return () => window.removeEventListener(SIDEBAR_VISIBILITY_REQUEST_EVENT, handleRequest);
  }, [preferences, persistPreferences]);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stagedOrdersByPatient, setStagedOrdersByPatient] = useState<Record<string, ClinicalOrder[]>>(() => loadStagedOrders());
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderModalPatientId, setOrderModalPatientId] = useState<string>("");
  const [orderModalTab, setOrderModalTab] = useState<"cart" | "prescribe" | "labs">("cart");
  const [orderModalPrefillLab, setOrderModalPrefillLab] = useState<string | undefined>(undefined);
  const [omniboxFilter, setOmniboxFilter] = useState<OmniboxFilterId>("all");
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  // The administrative record opens beside the chart rather than over it, so the
  // clinician does not lose the patient they were reading.
  const [patientInfoOpen, setPatientInfoOpen] = useState(false);
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const waffleRef = useRef<HTMLDivElement | null>(null);

  // Hydrate preferences, tasks, and scratch notes from home-base SQLite backend
  useEffect(() => {
    api.preferences
      .get("dr-carton")
      .then((remotePrefs) => {
        if (remotePrefs) setPreferences(remotePrefs);
      })
      .catch(() => {
        setPreferences(loadPreferences());
      });

    api.tasks
      .list()
      .then((remoteTasks) => {
        if (remoteTasks && remoteTasks.length > 0) setTasks(remoteTasks);
      })
      .catch(() => {});

    api.tasks
      .getScratchNotes()
      .then((remoteNotes) => {
        if (remoteNotes && remoteNotes.length > 0) setScratchpadNotes(remoteNotes);
      })
      .catch(() => {});
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

  const activePatient = findRosterPatient(activePatientId, roster);
  const orderModalPatient = findRosterPatient(orderModalPatientId, roster) ?? activePatient;
  const dockedPatientIds = openPatientIds.filter((id) => !detachedPatientIds.includes(id));

  /**
   * Access can change under a saved workspace: a chart moves to another organization,
   * an assignment is withdrawn, a patient is merged away. Once the roster is
   * authoritative, ids it no longer contains are dropped rather than left on screen
   * as tabs the backend will refuse to answer for.
   */
  useEffect(() => {
    if (rosterStatus !== "ready") return;
    const keep = (current: string[]) => {
      const retained = retainAccessiblePatientIds(current, roster);
      return retained.length === current.length ? current : retained;
    };
    setOpenPatientIds(keep);
    setDetachedPatientIds(keep);
    setActivePatientId((current) => (current && !findRosterPatient(current, roster) ? "" : current));
  }, [rosterStatus, roster]);

  // Nothing reachable is open, so there is no chart to show. Today is the safe
  // landing place; a blank patient pane is not.
  useEffect(() => {
    if (activeView === "patient" && !activePatient) setActiveView("today");
  }, [activeView, activePatient]);

  function handleOpenOrderCart(patientId: string, tab: "cart" | "prescribe" | "labs" = "cart", prefill?: string) {
    setOrderModalPatientId(patientId);
    setOrderModalTab(tab);
    setOrderModalPrefillLab(prefill);
    setOrderModalOpen(true);
  }

  function handleDraftLabOrder(patientId: string, labName: string) {
    const p = findRosterPatient(patientId, roster);
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
    const p = findRosterPatient(patientId, roster);
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
  const commandPatient = useMemo(() => resolveRosterPatientFromCommand(query, roster), [query, roster]);
  const commandSection = useMemo(() => resolveSectionFromCommand(query), [query]);

  const filteredPatients = useMemo(() => {
    if (!normalizedQuery) return [];
    return roster.filter((patient) => {
      const searchable = `${patient.name} ${patient.mrn} ${patient.dob}`.toLowerCase();
      const nameParts = patient.name.toLowerCase().split(" ");
      return (
        searchable.includes(normalizedQuery) ||
        nameParts.some((part) => part.length > 2 && normalizedQuery.includes(part))
      );
    });
  }, [normalizedQuery, roster]);

  const queryClinicalAnswer = useMemo<ClinicalQueryAnswer | null>(() => {
    if (!activePatient) return null;
    return executeClinicalQuery(query, activePatient, preferences, roster);
  }, [query, activePatient, preferences, roster]);

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
      const correctedTranscript = correctSpeechTranscript(transcript.trimStart());
      setQuery(correctedTranscript);
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

  function openPatient(id: string, targetSection?: Section) {
    if (!isReachablePatient(id)) return;
    setOpenPatientIds((current) => (current.includes(id) ? current : [...current, id]));
    setDetachedPatientIds((current) => current.filter((patientId) => patientId !== id));
    setActivePatientId(id);
    if (targetSection) setPatientSection(id, targetSection);
    setActiveView("patient");
    dismissOmnibox();
  }

  /**
   * Closes the omnibox after it has been acted on.
   *
   * The input is blurred rather than only flagged closed: leaving DOM focus on a box
   * the component believes is unfocused means the next `focus()` fires no event, and
   * the clinician's next keystrokes go into a search that never shows results.
   */
  function dismissOmnibox() {
    setQuery("");
    setSearchFocused(false);
    commandInputRef.current?.blur();
  }

  function handleStartVisit(patientId: string, patientName: string) {
    if (!isReachablePatient(patientId)) return;
    setOpenPatientIds((current) => (current.includes(patientId) ? current : [...current, patientId]));
    setDetachedPatientIds((current) => current.filter((id) => id !== patientId));
    setActivePatientId(patientId);
    setPatientSection(patientId, "Encounter");
    setActiveView("patient");
    setWorkspaceMessage(`Started encounter for ${patientName}`);
    window.setTimeout(() => setWorkspaceMessage(""), 3000);
  }

  function handleOpenChart(patientId: string, targetSection?: string) {
    if (!isReachablePatient(patientId)) return;
    setOpenPatientIds((current) => (current.includes(patientId) ? current : [...current, patientId]));
    setDetachedPatientIds((current) => current.filter((id) => id !== patientId));
    setActivePatientId(patientId);
    if (targetSection) setPatientSection(patientId, targetSection as Section);
    setActiveView("patient");
  }

  /**
   * Every entry point into a chart passes through here. A schedule row, a saved
   * workspace, a queue link or a voice command may all name a patient this clinician
   * cannot reach; opening a tab for one would show a chart the backend then refuses
   * to fill. Until the roster is authoritative, nothing is treated as reachable.
   */
  function isReachablePatient(patientId: string) {
    if (findRosterPatient(patientId, roster)) return true;
    if (rosterStatus === "ready") {
      setWorkspaceMessage("That patient is not in your accessible roster.");
      window.setTimeout(() => setWorkspaceMessage(""), 3000);
    }
    return false;
  }

  function handleEncounterSigned(patientId: string) {
    const p = findRosterPatient(patientId, roster);
    // The signed encounter changed the chart on the server. The roster is re-read
    // rather than edited in place: a client-side write would be a second truth that
    // survives only until the next reload.
    void refreshRoster();
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
      persistPreferences(aiPref.updatedPreferences);
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

    const targetPatient = resolveRosterPatientFromCommand(command, roster);
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
    if (activeCompanionPanel !== "ai") toggleCompanionPanel("ai");
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
    setPatientSections((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    setOpenPatientIds((current) => {
      const remaining = current.filter((patientId) => patientId !== id);
      if (id === activePatientId) {
        const nextDocked = remaining.filter((patientId) => !detachedAfterClose.includes(patientId));
        // Closing the last chart leaves no patient active; the view effect returns
        // the clinician to Today rather than to an arbitrary other patient.
        setActivePatientId(nextDocked.at(-1) ?? remaining.at(-1) ?? "");
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
    setPatientSections((current) => ({
      ...current,
      [id]: current[id] ?? "Overview",
    }));

    if (id === activePatientId) {
      const nextActive = docked.find((patientId) => patientId !== id);
      if (nextActive) {
        setActivePatientId(nextActive);
      }
    }

    setDraggedId(null);
  }

  function splitScreenPatient(targetId: string) {
    if (!isReachablePatient(targetId)) return;
    setOpenPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));

    if (activePatientId === targetId) {
      const remainingDocked = openPatientIds.filter(
        (id) => id !== targetId && !detachedPatientIds.includes(id)
      );
      if (remainingDocked.length > 0) {
        setActivePatientId(remainingDocked[0]);
      } else {
        // A detached chart needs a docked one beside it. With no second accessible
        // patient there is nothing to pair it with, so the chart stays where it is.
        const companion = roster.find((p) => p.id !== targetId)?.id;
        if (!companion) {
          setWorkspaceMessage("Open a second patient to use split screen.");
          window.setTimeout(() => setWorkspaceMessage(""), 2500);
          return;
        }
        setOpenPatientIds((current) => (current.includes(companion) ? current : [...current, companion]));
        setActivePatientId(companion);
      }
    }

    setDetachedPatientIds((current) => (current.includes(targetId) ? current : [...current, targetId]));
    setPatientSections((current) => ({
      ...current,
      [targetId]: current[targetId] ?? "Overview",
    }));
    setActiveView("patient");
    setWorkspaceMessage(`Split screen opened with ${findRosterPatient(targetId, roster)?.name || targetId}`);
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
    : commandSection && activePatient
      ? `Open ${activePatient.name} · ${commandSection}`
      : query.trim()
        ? `Ask Clinical AI: “${query.trim()}”`
        : "";

  return (
    <main className={`app-shell density-${preferences.density}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" title="Clinical Bond">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/clinical-bond-mark.png" alt="" width={22} height={22} />
          </div>
          <div>
            <strong>Clinical Bond</strong>
            <span>Psychiatric Clinical Workspace</span>
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
            onChange={(event) => {
              // Typing is proof the box is focused. The focus event alone is not
              // enough: after a result is chosen the box can still hold DOM focus,
              // so a re-focus would be a no-op and the results would stay hidden.
              setSearchFocused(true);
              setQuery(event.target.value);
            }}
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
          <span className="command-ai-badge"><span><Icon name="auto_awesome" /></span> AI</span>
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
              <div className="omnibox-filter-tabs" role="group" aria-label="Filter omnibox results">
                {OMNIBOX_FILTERS.map(({ id, label, icon }) => (
                  <Button
                    key={id}
                    size="sm"
                    icon={icon}
                    pressed={omniboxFilter === id}
                    // Keeps the omnibox focused: a chip that blurs the box closes the
                    // results the clinician is filtering.
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setOmniboxFilter(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              {(omniboxFilter === "all" || omniboxFilter === "ai" || omniboxFilter === "actions") && queryClinicalAnswer && (
                <div className="query-answer-card">
                  <div className="query-answer-header">
                    <span className="query-answer-title">
                      <span><Icon name="auto_awesome" /></span> {queryClinicalAnswer.title}
                    </span>
                    <span className="query-confidence-badge">Protocol Verified</span>
                  </div>
                  <p>{queryClinicalAnswer.body}</p>
                  <div className="query-card-actions">
                    {queryClinicalAnswer.isSplitScreen && (
                      <Button
                        variant="primary"
                        size="sm"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          splitScreenPatient(queryClinicalAnswer.patientId);
                          dismissOmnibox();
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Split Screen"}
                      </Button>
                    )}
                    {queryClinicalAnswer.orderType === "prescribe" && (
                      <Button
                        variant="primary"
                        size="sm"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          handleOpenOrderCart(queryClinicalAnswer.patientId, "prescribe", queryClinicalAnswer.prefillDrug);
                          dismissOmnibox();
                        }}
                      >
                        {queryClinicalAnswer.actionLabel || "Stage to Cart"}
                      </Button>
                    )}
                    {!queryClinicalAnswer.isSplitScreen && !queryClinicalAnswer.orderType && queryClinicalAnswer.actionLabel && (
                      <Button
                        variant="primary"
                        size="sm"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openPatient(queryClinicalAnswer.patientId, queryClinicalAnswer.actionSection ?? "Overview")}
                      >
                        {queryClinicalAnswer.actionLabel}
                      </Button>
                    )}
                    {queryClinicalAnswer.labOrderName && (
                      <Button
                        size="sm"
                        icon="add"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          handleDraftLabOrder(queryClinicalAnswer.patientId, queryClinicalAnswer.labOrderName!);
                          dismissOmnibox();
                        }}
                      >
                        Stage Lab Order
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {(omniboxFilter === "all" || omniboxFilter === "ai") && query.trim() && (
                <button className="ai-command-result" onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand(query)}>
                  <span className="command-result-icon"><Icon name="auto_awesome" /></span>
                  <span>
                    <strong>{commandLabel}</strong>
                    <small>{commandPatient || commandSection ? "AI-routed workspace command" : "Send to Clinical AI with the active chart context"}</small>
                  </span>
                  <span className="enter-hint"><Icon name="keyboard_return" size="sm" label="Press Enter" /></span>
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
              <div className="omnibox-filter-tabs" role="group" aria-label="Filter omnibox suggestions">
                {OMNIBOX_FILTERS.filter(({ id }) => id !== "patients" && id !== "apps").map(({ id, label, icon }) => (
                  <Button
                    key={id}
                    size="sm"
                    icon={icon}
                    pressed={omniboxFilter === id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setOmniboxFilter(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="result-group-label">Try a clinical question or command</div>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("When were Jordan's labs last done?"); }}><span className="command-result-icon"><Icon name="auto_awesome" /></span><span><strong>When were Jordan&apos;s labs last done?</strong><small>Check surveillance dates & protocol status</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("Refill Maya's Sertraline"); }}><span className="command-result-icon"><Icon name="medication" /></span><span><strong>Refill Maya&apos;s Sertraline</strong><small>Stage e-prescription directly to DrFirst cart</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("Split screen Jordan"); }}><span className="command-result-icon"><Icon name="splitscreen" /></span><span><strong>Split screen Jordan Reed</strong><small>Open side-by-side dual chart comparison</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery("What changed since last visit in Maya"); }}><span className="command-result-icon"><Icon name="bar_chart" /></span><span><strong>What changed since last visit in Maya</strong><small>Summon longitudinal AI interval briefing</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("Switch to zen mode")}><span className="command-result-icon"><Icon name="self_improvement" /></span><span><strong>Switch to Zen mode</strong><small>Minimalist distraction-free layout</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => { setAuditModalOpen(true); setSearchFocused(false); }}><span className="command-result-icon"><Icon name="shield" /></span><span><strong>HIPAA Audit Trail &amp; Database Monitor</strong><small>Inspect immutable SQLite ledger &amp; live compliance log</small></span></button>
            </div>
          )}
        </div>

        <div className="top-actions">
          {/* Layout switcher. Replaces the Zen | Balanced | Cockpit segmented
              control, which pinned three of the five practice defaults into
              permanent chrome and hid saved layouts entirely. */}
          <WorkspaceProfileMenu
            preferences={preferences}
            practice={practiceTemplates}
            onApplyTemplate={(template) => {
              const next = adoptTemplate(template, preferences);
              persistPreferences(next);
              writeToolPins({ left: next.rails.left, right: next.rails.right });
              setWorkspaceMessage(`Switched to ${template.name}`);
              window.setTimeout(() => setWorkspaceMessage(""), 2500);
            }}
            onApplyFavorite={(id) => {
              const next = applyPreset(id, preferences);
              persistPreferences(next);
              // Rails are owned by their own store, so they have to be told the
              // layout moved or both rails would keep the previous pins.
              writeToolPins({ left: next.rails.left, right: next.rails.right });
              setWorkspaceMessage("Switched to your saved layout");
              window.setTimeout(() => setWorkspaceMessage(""), 2500);
            }}
            onSaveFavorite={(name) => {
              const next = saveCustomPreset(name, preferences);
              persistPreferences(next);
              setWorkspaceMessage(`Saved "${name}" to your layouts`);
              window.setTimeout(() => setWorkspaceMessage(""), 2500);
            }}
            onDeleteFavorite={(id) => {
              const next = deleteCustomPreset(id, preferences);
              persistPreferences(next);
              setWorkspaceMessage("Layout deleted");
              window.setTimeout(() => setWorkspaceMessage(""), 2000);
            }}
            onSavePracticeDefault={
              practiceTemplates.canEdit
                ? (name) => {
                    void savePracticeTemplate({ name, preferences }).then(async (result) => {
                      if (!result.ok) {
                        setWorkspaceMessage(result.error ?? "Could not save that layout");
                      } else {
                        setPracticeTemplates(await fetchPracticeTemplates());
                        setWorkspaceMessage(`"${name}" is now a practice default`);
                      }
                      window.setTimeout(() => setWorkspaceMessage(""), 3000);
                    });
                  }
                : undefined
            }
            onDeletePracticeDefault={
              practiceTemplates.canEdit
                ? (id) => {
                    void deletePracticeTemplate(id).then(async (result) => {
                      if (!result.ok) {
                        setWorkspaceMessage(result.error ?? "Could not delete that layout");
                      } else {
                        setPracticeTemplates(await fetchPracticeTemplates());
                        setWorkspaceMessage("Practice default removed");
                      }
                      window.setTimeout(() => setWorkspaceMessage(""), 2500);
                    });
                  }
                : undefined
            }
          />
          <div className="topbar-apps-anchor" ref={waffleRef}>
            <button
              type="button"
              className={`icon-button waffle-launcher ${waffleOpen ? "active" : ""}`}
              aria-label="Google Apps Launcher"
              title="Clinical Bond workspaces"
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
                  <strong>Clinical Bond</strong>
                  <small>Switch clinical or administrative workspaces</small>
                </div>
                <div className="apps-drawer-grid">
                  {googleWorkspaceApps.map((app) => (
                    <button
                      key={app.id}
                      type="button"
                      className="app-drawer-item"
                      onClick={() => {
                        // Route through the same event the sidebar uses, so every
                        // entry lands on a real workspace instead of a toast that
                        // claims a switch that never happened.
                        if (app.id === "today" || app.id === "schedule") {
                          setActiveView("today");
                        } else if (app.id === "patients") {
                          setActiveView("patient");
                        }
                        window.dispatchEvent(
                          new CustomEvent("ehr-switch-view", { detail: { view: app.id } }),
                        );
                        setWaffleOpen(false);
                      }}
                    >
                      <span className="app-drawer-icon"><Icon name={app.icon} /></span>
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
            className="icon-button"
            aria-label="HIPAA Compliance & Database Monitor"
            title="HIPAA Audit Trail & Home-Base Database Monitor ()"
            onClick={() => setAuditModalOpen(true)}
          >
            <span style={{ fontSize: "16px" }}><Icon name="shield" /></span>
          </button>
          <button
            type="button"
            className="icon-button topbar-layout-btn"
            aria-label="Layout & Preferences"
            title="Customize workspace modularity & layout preferences ()"
            onClick={() => setCustomizerOpen(true)}
          >
            <span style={{ fontSize: "15px" }}><Icon name="settings" /></span>
          </button>
          <div className="provider-avatar" title="Logan Carton (Attending Physician)">LC</div>
        </div>
      </header>

      <section
        className={`workspace ${activeCompanionPanel !== null ? "with-companion" : ""} ${
          preferences.showCompanionRail ? "" : "without-companion-rail"
        }`}
      >
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
            <Icon name="home" />
          </button>
          {dockedPatientIds.map((id) => {
            const patient = findRosterPatient(id, roster);
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
                data-patient-section={patientSections[patient.id] ?? "Overview"}
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
                ><Icon name="close" size="sm" /></button>
              </div>
            );
          })}
          <button
            type="button"
            className="new-tab"
            aria-label="Open a patient chart"
            title="Open a patient chart"
            onClick={() => { commandInputRef.current?.focus(); setSearchFocused(true); }}
          ><Icon name="add" size="sm" /></button>
          <div className="tab-spacer" />
          {detachedPatientIds.length > 0 && <span className="detached-count">{detachedPatientIds.length} split</span>}
          <button
            className={`ai-toggle ${activeCompanionPanel === "ai" ? "active" : ""}`}
            onClick={() => setActiveCompanionPanel((curr) => (curr === "ai" ? null : "ai"))}
          >
            <Icon name="auto_awesome" /> Assistant
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

          {activeView === "today" || !activePatient ? (
            <section className="primary-workspace-pane">
              <TodayDashboard
                preferences={preferences}
                onUpdatePreferences={persistPreferences}
                onOpenCustomizer={() => setCustomizerOpen(true)}
                onStartVisit={(patientId, patientName) => {
                  handleStartVisit(patientId, patientName);
                }}
                onOpenChart={(patientId, targetSection) => {
                  handleOpenChart(patientId, targetSection);
                }}
                onDraftLabOrder={(patientName, labName) => {
                  const target = roster.find((p) => p.name === patientName) ?? activePatient;
                  if (target) handleDraftLabOrder(target.id, labName);
                }}
              />
            </section>
          ) : (
            <section className="primary-workspace-pane" data-scroll-patient-id={activePatient.id} data-scroll-section={section}>
              <PatientHeader
                patient={activePatient}
                headerDensity={preferences.headerDensity}
                onOpenPatientInformation={() => setPatientInfoOpen(true)}
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
                  onUpdatePreferences={persistPreferences}
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
            const patient = findRosterPatient(id, roster);
            if (!patient) return null;
            const paneSection = patientSections[id] ?? "Overview";

            return (
              <section className="detached-patient-pane" key={id} data-scroll-patient-id={id} data-scroll-section={paneSection}>
                <div
                  className="detached-pane-header"
                  draggable
                  onDragStart={(event) => startPatientDrag(id, event)}
                  onDragEnd={() => setDraggedId(null)}
                  title="Drag this header back to the tab bar to dock"
                >
                  <span className="pane-drag-handle" aria-hidden="true"><Icon name="drag_indicator" /></span>
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
                  onChange={(nextSection) => setPatientSections((current) => ({ ...current, [id]: nextSection }))}
                />
                <div className={`detached-content ${paneSection === "Encounter" ? "encounter-mode" : ""}`}>
                  <PatientSection
                    patient={patient}
                    section={paneSection}
                    preferences={preferences}
                    onUpdatePreferences={persistPreferences}
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
        <aside
          className={`companion-rail ${addToolMenuOpen ? "menu-open" : ""}`}
          aria-label="Companion tools"
        >
          <RailResizeHandle
            side="right"
            width={companionRailWidth}
            geometry={RIGHT_RAIL}
            onWidth={handleCompanionWidth}
            label="Resize companion tools"
          />

          <div className="companion-rail-strip">
            {companionTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`companion-rail-btn ${activeCompanionPanel === tool.id ? "active" : ""}`}
                title={`${tool.label} — ${tool.hint}`}
                aria-label={tool.label}
                aria-pressed={activeCompanionPanel === tool.id}
                onClick={() => toggleCompanionPanel(tool.id)}
              >
                <Icon name={tool.icon} />
              </button>
            ))}

            <div className="companion-rail-divider" />

            <div className="companion-add-anchor" ref={companionAddRef}>
              <button
                type="button"
                className={`companion-rail-btn add-btn ${addToolMenuOpen ? "active" : ""}`}
                title="Add a tool to this rail"
                aria-label="Add a tool"
                aria-expanded={addToolMenuOpen}
                onClick={() => setAddToolMenuOpen((open) => !open)}
              >
                <Icon name="add" />
              </button>

              {addToolMenuOpen && (
                <div className="companion-add-menu">
                  <div className="companion-add-heading">
                    <strong>Workspaces &amp; tools</strong>
                    <small>Pin anything to either rail.</small>
                  </div>
                  <ToolPinMenu
                    pins={pins}
                    onToggle={togglePinnedTool}
                    origin="right"
                    onOpenTool={(id) => {
                      setAddToolMenuOpen(false);
                      toggleCompanionPanel(id);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="companion-rail-divider" />

            <button
              type="button"
              className="companion-rail-btn hide-rail-btn"
              title="Hide companion tools"
              aria-label="Hide companion tools"
              onClick={() => persistPreferences({ ...preferences, showCompanionRail: false })}
            >
              <Icon name="chevron_right" />
            </button>
          </div>
        </aside>
      )}

      {/* Hiding the rail leaves a handle rather than removing the tools with no way
          back. The Layout Customizer is several clicks away and easy to forget. */}
      {!preferences.showCompanionRail && (
        <button
          type="button"
          className="companion-reopen-handle"
          title="Show companion tools"
          aria-label="Show companion tools"
          onClick={() => persistPreferences({ ...preferences, showCompanionRail: true })}
        >
          ‹
        </button>
      )}

      {/* Active Companion Panel (Gemini AI, Keep Scratchpad, Google Tasks, Calculator) */}
      {/* Clinical AI reads one chart. With none open it says so rather than
          answering about a patient the clinician never chose. */}
      {activeCompanionPanel === "ai" && !activePatient && (
        <aside className="companion-panel">
          <div className="companion-panel-header">
            <div>
              <span className="spark"><Icon name="auto_awesome" /></span>
              <div>
                <strong>Clinical AI</strong>
                <small>Chart-aware assistance</small>
              </div>
            </div>
            <button
              type="button"
              className="companion-close-btn"
              aria-label="Close"
              onClick={() => setActiveCompanionPanel(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="companion-empty-state">
            <p>Open a patient chart to ask Clinical AI about it.</p>
          </div>
        </aside>
      )}
      {activeCompanionPanel === "ai" && activePatient && (
        <ClinicalAiPanel
          patient={activePatient}
          section={section}
          isScheduleView={activeView === "today"}
          command={globalAiPrompt}
          preferences={preferences}
          onUpdatePreferences={persistPreferences}
          onOpenCustomizer={() => setCustomizerOpen(true)}
          onClose={() => setActiveCompanionPanel(null)}
          onNavigateSection={(sec) => setSection(sec)}
          onInsertToNote={(text) => {
            if (activePatient) {
              window.dispatchEvent(
                new CustomEvent("ehr-insert-to-note", {
                  detail: { text, patientId: activePatient.id },
                }),
              );
            }
            setWorkspaceMessage("Inserted AI clinical synthesis into note!");
            window.setTimeout(() => setWorkspaceMessage(""), 2400);
          }}
          onSplitScreen={(targetId) => splitScreenPatient(targetId)}
        />
      )}

      {activeCompanionPanel === "scratchpad" && (
        <ScratchpadPanel
          notes={scratchpadNotes}
          newNoteText={newNoteText}
          setNewNoteText={setNewNoteText}
          onAddNote={(text) => {
            if (!text.trim()) return;
            const newNote: ScratchNote = { id: `note-${Date.now()}`, text, time: "Just now", color: "note-yellow", patientId: activePatient?.id };
            setScratchpadNotes([newNote, ...scratchpadNotes]);
            setNewNoteText("");
            api.tasks.createScratchNote(text, "note-yellow", activePatient?.id).catch(() => {});
          }}
          onDeleteNote={(id) => {
            setScratchpadNotes(scratchpadNotes.filter((n) => n.id !== id));
            api.tasks.deleteScratchNote(id).catch(() => {});
          }}
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
            api.tasks.toggle(id).catch(() => {});
          }}
          onAddTask={(text) => {
            if (!text.trim()) return;
            const newTask: ClinicalTask = { id: `task-${Date.now()}`, text, completed: false, due: "Today", patientId: activePatient?.id };
            setTasks([...tasks, newTask]);
            setNewTaskText("");
            api.tasks.create(text, activePatient?.id, "Today").catch(() => {});
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
          onClose={() => toggleCompanionPanel("calc")}
        />
      )}

      {activeCompanionPanel === "messages" && activePatient && (
        <section className="companion-panel companion-messages-panel" aria-label="Patient messages">
          <div className="companion-panel-header">
            <div>
              <strong>Messages</strong>
              <small>{activePatient.name}</small>
            </div>
            <button
              type="button"
              aria-label="Close messages"
              onClick={() => toggleCompanionPanel("messages")}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="companion-panel-body">
            <PatientMessages
              patient={activePatient}
              onOpenOrderCart={(tab, prefill) => handleOpenOrderCart(activePatient.id, tab, prefill)}
              onAddTask={(text) => {
                setTasks((prev) => [...prev, { id: `task-${Date.now()}`, text, completed: false, due: "Today" }]);
                setWorkspaceMessage(`Added task: "${text}"`);
                window.setTimeout(() => setWorkspaceMessage(""), 3000);
              }}
              onToast={(msg) => {
                setWorkspaceMessage(msg);
                window.setTimeout(() => setWorkspaceMessage(""), 2400);
              }}
            />
          </div>
        </section>
      )}

      <WorkspaceCustomizer
        isOpen={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        preferences={preferences}
        onUpdatePreferences={persistPreferences}
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
            setWorkspaceMessage(`Orders authorized and dispatched! ${receipt.summaryText}`);
            window.setTimeout(() => setWorkspaceMessage(""), 5000);
          }}
          initialTab={orderModalTab}
          prefillLab={orderModalPrefillLab}
        />
      )}

      <AuditComplianceModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />

      {patientInfoOpen && activePatient && (
        <PatientInformationDrawer
          key={activePatient.id}
          patientId={activePatient.id}
          patientName={activePatient.name}
          onClose={() => setPatientInfoOpen(false)}
        />
      )}

      {workspaceMessage && <div className="workspace-toast">{workspaceMessage}</div>}
    </main>
  );
}
