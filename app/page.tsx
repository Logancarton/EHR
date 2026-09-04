"use client";

import { useMemo, useState } from "react";

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

export default function Home() {
  const [openPatientIds, setOpenPatientIds] = useState(["maya-chen", "jordan-reed"]);
  const [activePatientId, setActivePatientId] = useState("maya-chen");
  const [section, setSection] = useState<Section>("Overview");
  const [query, setQuery] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const activePatient = patients.find((patient) => patient.id === activePatientId) ?? patients[0];
  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return patients.filter((patient) =>
      `${patient.name} ${patient.mrn}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  function openPatient(id: string) {
    setOpenPatientIds((current) => (current.includes(id) ? current : [...current, id]));
    setActivePatientId(id);
    setSection("Overview");
    setQuery("");
  }

  function closePatient(id: string) {
    setOpenPatientIds((current) => {
      const remaining = current.filter((patientId) => patientId !== id);
      if (id === activePatientId) {
        setActivePatientId(remaining.at(-1) ?? patients[0].id);
      }
      return remaining;
    });
  }

  function dropTab(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    setOpenPatientIds((current) => {
      const next = [...current];
      const from = next.indexOf(draggedId);
      const to = next.indexOf(targetId);
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      return next;
    });
    setDraggedId(null);
  }

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

        <div className="patient-search-wrap">
          <span className="search-icon">⌕</span>
          <input
            aria-label="Search patients"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search patient, MRN, phone..."
          />
          <kbd>⌘ K</kbd>
          {filteredPatients.length > 0 && (
            <div className="search-results">
              {filteredPatients.map((patient) => (
                <button key={patient.id} onClick={() => openPatient(patient.id)}>
                  <span className="avatar small">{patient.initials}</span>
                  <span>
                    <strong>{patient.name}</strong>
                    <small>{patient.mrn} · DOB {patient.dob}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="top-actions">
          <button className="icon-button" aria-label="Notifications">○</button>
          <div className="provider-avatar">LC</div>
        </div>
      </header>

      <aside className="left-rail">
        <button className="rail-item active"><span>⌂</span>Today</button>
        <button className="rail-item"><span>◉</span>Patients</button>
        <button className="rail-item"><span>□</span>Schedule</button>
        <button className="rail-item"><span>✉</span>Inbox <em>3</em></button>
        <button className="rail-item"><span>✓</span>Tasks <em>5</em></button>
        <div className="rail-spacer" />
        <button className="rail-item"><span>⚙</span>Settings</button>
      </aside>

      <section className={`workspace ${aiOpen ? "with-ai" : ""}`}>
        <div className="browser-tabs">
          <button className="home-tab" title="Home">⌂</button>
          {openPatientIds.map((id) => {
            const patient = patients.find((item) => item.id === id);
            if (!patient) return null;
            return (
              <div
                key={patient.id}
                draggable
                onDragStart={() => setDraggedId(patient.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropTab(patient.id)}
                className={`browser-tab ${patient.id === activePatientId ? "active" : ""}`}
                onClick={() => setActivePatientId(patient.id)}
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
          <button className="new-tab" onClick={() => setQuery("a")}>＋</button>
          <div className="tab-spacer" />
          <button className={`ai-toggle ${aiOpen ? "active" : ""}`} onClick={() => setAiOpen((value) => !value)}>
            ✦ AI
          </button>
        </div>

        <div className="patient-header">
          <div className="patient-identity">
            <div className="avatar">{activePatient.initials}</div>
            <div>
              <div className="patient-name-line">
                <h1>{activePatient.name}</h1>
                <span className="status-pill">{activePatient.status}</span>
              </div>
              <p>DOB {activePatient.dob} · {activePatient.age} yrs · {activePatient.pronouns} · MRN {activePatient.mrn}</p>
            </div>
          </div>
          <div className="patient-actions">
            <button>Message</button>
            <button>Schedule</button>
            <button className="primary">＋ New encounter</button>
          </div>
        </div>

        {activePatient.alert && (
          <div className="clinical-alert"><strong>Attention:</strong> {activePatient.alert}<button>Review</button></div>
        )}

        <nav className="section-tabs">
          {sections.map((item) => (
            <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>
              {item}
            </button>
          ))}
        </nav>

        <div className="content-area">
          {section === "Overview" && <Overview patient={activePatient} />}
          {section === "Encounter" && <Encounter patient={activePatient} />}
          {section === "Meds" && <MedicationList patient={activePatient} />}
          {section === "Labs" && <Placeholder title="Labs" text="Lab results, trends, orders, and monitoring requirements will live here." />}
          {section === "Messages" && <Placeholder title="Messages" text="Patient communication will stay attached to the patient workspace instead of becoming a separate silo." />}
          {section === "History" && <Placeholder title="Longitudinal history" text="A unified chronological record of visits, medications, diagnoses, labs, messages, and imported records." />}
        </div>
      </section>

      {aiOpen && <AiPanel patient={activePatient} section={section} />}
    </main>
  );
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

function AiPanel({ patient, section }: { patient: Patient; section: Section }) {
  return (
    <aside className="ai-panel">
      <div className="ai-header"><div><span className="spark">✦</span><div><strong>Clinical AI</strong><small>Context: {patient.name} · {section}</small></div></div><button>•••</button></div>
      <div className="ai-context"><span>LIVE CONTEXT</span><p>AI follows the active patient and workspace. It can reason over authorized chart context without forcing you into a separate app.</p></div>
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
