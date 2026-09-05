"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Section = "Overview" | "Encounter" | "Meds" | "Labs" | "Messages" | "History";

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
  const [openPatientIds, setOpenPatientIds] = useState(["maya-chen", "jordan-reed"]);
  const [detachedPatientIds, setDetachedPatientIds] = useState<string[]>([]);
  const [detachedSections, setDetachedSections] = useState<Record<string, Section>>({});
  const [activePatientId, setActivePatientId] = useState("maya-chen");
  const [section, setSection] = useState<Section>("Overview");
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const [globalAiPrompt, setGlobalAiPrompt] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const commandInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

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
    setQuery("");
    setSearchFocused(false);
  }

  function runAiCommand(rawCommand: string) {
    const command = rawCommand.trim();
    if (!command) return;

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
    setAiOpen(true);
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">E</div>
          <div>
            <strong>EHR</strong>
            <span>Clinical Workspace</span>
          </div>
        </div>

        <div className={`patient-search-wrap ${isListening ? "listening" : ""}`}>
          <span className="command-ai-badge"><span>✦</span> AI</span>
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
            placeholder={isListening ? "Listening…" : "Ask AI, find a patient, or open a workspace…"}
          />
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
              <div className="result-group-label">Try a command</div>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("Open Jordan Reed medications")}><span className="command-result-icon">✦</span><span><strong>Open Jordan Reed medications</strong><small>Navigate by natural language</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("Show Maya Chen labs")}><span className="command-result-icon">✦</span><span><strong>Show Maya Chen labs</strong><small>Patient + workspace in one command</small></span></button>
              <button onMouseDown={(event) => event.preventDefault()} onClick={() => runAiCommand("What needs my attention today?")}><span className="command-result-icon">✦</span><span><strong>What needs my attention today?</strong><small>Send a global question to Clinical AI</small></span></button>
            </div>
          )}
        </div>

        <div className="top-actions">
          <button className="icon-button" aria-label="Notifications">○</button>
          <div className="provider-avatar">LC</div>
        </div>
      </header>

      <section className={`workspace ${aiOpen ? "with-ai" : ""}`}>
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
          <button className="home-tab" title="Home">⌂</button>
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
                className={`browser-tab ${patient.id === activePatientId ? "active" : ""}`}
                onClick={() => setActivePatientId(patient.id)}
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
          <button className={`ai-toggle ${aiOpen ? "active" : ""}`} onClick={() => setAiOpen((value) => !value)}>
            ✦ AI
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

          <section className="primary-workspace-pane">
            <PatientHeader patient={activePatient} />

            {activePatient.alert && (
              <div className="clinical-alert"><strong>Attention:</strong> {activePatient.alert}<button>Review</button></div>
            )}

            <SectionTabs value={section} onChange={setSection} />
            <div className="content-area">
              <PatientSection patient={activePatient} section={section} />
            </div>
          </section>

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
                <div className="detached-content">
                  <PatientSection patient={patient} section={paneSection} />
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {workspaceMessage && <div className="workspace-toast">{workspaceMessage}</div>}
      {aiOpen && <AiPanel patient={activePatient} section={section} command={globalAiPrompt} />}
    </main>
  );
}

function PatientHeader({ patient }: { patient: Patient }) {
  return (
    <div className="patient-header">
      <div className="patient-identity">
        <div className="avatar">{patient.initials}</div>
        <div>
          <div className="patient-name-line">
            <h1>{patient.name}</h1>
            <span className="status-pill">{patient.status}</span>
          </div>
          <p>DOB {patient.dob} · {patient.age} yrs · {patient.pronouns} · MRN {patient.mrn}</p>
        </div>
      </div>
      <div className="patient-actions">
        <button>Message</button>
        <button>Schedule</button>
        <button className="primary">＋ New encounter</button>
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

function PatientSection({ patient, section }: { patient: Patient; section: Section }) {
  if (section === "Overview") return <Overview patient={patient} />;
  if (section === "Encounter") return <Encounter patient={patient} />;
  if (section === "Meds") return <MedicationList patient={patient} />;
  if (section === "Labs") return <Placeholder title="Labs" text="Lab results, trends, orders, and monitoring requirements will live here." />;
  if (section === "Messages") return <Placeholder title="Messages" text="Patient communication will stay attached to the patient workspace instead of becoming a separate silo." />;
  return <Placeholder title="Longitudinal history" text="A unified chronological record of visits, medications, diagnoses, labs, messages, and imported records." />;
}

function Overview({ patient }: { patient: Patient }) {
  return (
    <div className="overview-grid">
      <section className="card wide-card">
        <div className="card-heading"><div><span className="eyebrow">Clinical snapshot</span><h2>What matters now</h2></div><button>View timeline</button></div>
        <div className="snapshot-grid">
          <div><span>Last visit</span><strong>{patient.lastVisit}</strong><small>Medication management follow-up</small></div>
          <div><span>Next visit</span><strong>{patient.nextVisit}</strong><small>30 minute follow-up</small></div>
          <div><span>Recent status</span><strong>Improving</strong><small>Symptoms reported as more manageable</small></div>
        </div>
      </section>

      <section className="card">
        <div className="card-heading"><h2>Diagnoses</h2><button>Edit</button></div>
        <div className="stack-list">
          {patient.diagnoses.map((diagnosis, index) => <div key={diagnosis}><span className="code">F{index + 4}x.x</span><strong>{diagnosis}</strong></div>)}
        </div>
      </section>

      <section className="card">
        <div className="card-heading"><h2>Current medications</h2><button>Manage</button></div>
        <div className="stack-list">
          {patient.meds.map((medication) => <div key={medication}><span className="med-icon">Rx</span><strong>{medication}</strong><small>Active</small></div>)}
        </div>
      </section>

      <section className="card wide-card">
        <div className="card-heading"><h2>Recent clinical activity</h2><button>See all</button></div>
        <div className="timeline">
          <div><span className="timeline-dot" /><time>Aug 21</time><p><strong>Follow-up completed</strong><br />Symptoms, medication response, and treatment plan reviewed.</p></div>
          <div><span className="timeline-dot" /><time>Aug 18</time><p><strong>Patient message</strong><br />Medication question resolved through portal message.</p></div>
          <div><span className="timeline-dot" /><time>Aug 08</time><p><strong>Lab result received</strong><br />Results linked to monitoring workflow.</p></div>
        </div>
      </section>
    </div>
  );
}

function Encounter({ patient }: { patient: Patient }) {
  return (
    <div className="encounter-layout">
      <section className="card encounter-card">
        <div className="encounter-top"><div><span className="eyebrow">Draft encounter</span><h2>{patient.name} · Follow-up</h2></div><span className="draft-pill">Unsaved draft</span></div>
        <label>Interval history<textarea defaultValue="Patient presents for scheduled psychiatric medication-management follow-up. " /></label>
        <div className="two-column-fields">
          <label>Response to treatment<textarea placeholder="Symptoms, function, benefit..." /></label>
          <label>Side effects / concerns<textarea placeholder="Side effects, adherence, safety..." /></label>
        </div>
        <label>Assessment<textarea placeholder="Clinical assessment..." /></label>
        <label>Plan<textarea placeholder="Medication changes, monitoring, follow-up..." /></label>
        <div className="encounter-footer"><button>Save draft</button><button className="primary">Review & sign</button></div>
      </section>
    </div>
  );
}

function MedicationList({ patient }: { patient: Patient }) {
  return (
    <section className="card medication-card">
      <div className="card-heading"><div><span className="eyebrow">Medication list</span><h2>Active prescriptions</h2></div><button className="primary">＋ Prescribe</button></div>
      <div className="med-table">
        {patient.meds.map((medication) => (
          <div className="med-row" key={medication}><div className="med-icon">Rx</div><div><strong>{medication}</strong><small>Active · Oral</small></div><span>Last reviewed {patient.lastVisit}</span><button>•••</button></div>
        ))}
      </div>
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return <section className="card placeholder"><div className="placeholder-icon">◇</div><h2>{title}</h2><p>{text}</p><button>Build this workspace</button></section>;
}

function AiPanel({ patient, section, command }: { patient: Patient; section: Section; command: string }) {
  return (
    <aside className="ai-panel">
      <div className="ai-header"><div><span className="spark">✦</span><div><strong>Clinical AI</strong><small>Context: {patient.name} · {section}</small></div></div><button>•••</button></div>
      <div className="ai-context"><span>LIVE CONTEXT</span><p>AI follows the active patient and workspace. It can reason over authorized chart context without forcing you into a separate app.</p></div>
      {command && (
        <div className="ai-global-command">
          <span>GLOBAL COMMAND</span>
          <strong>{command}</strong>
          <small>Captured by the universal AI bar. Model execution will connect here once the secure AI backend is added.</small>
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
        <button>Summarize chart</button><button>Compare last 3 visits</button><button>Draft assessment</button><button>Check medication history</button>
      </div>
      <div className="ai-composer"><textarea placeholder={`Ask about ${patient.name}...`} /><div><span>Chart context on</span><button>↑</button></div></div>
      <p className="ai-disclaimer">Prototype only. No real PHI or clinical decision support is connected.</p>
    </aside>
  );
}
