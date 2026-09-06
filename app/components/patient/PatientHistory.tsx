"use client";

import { useState, useMemo } from "react";
import { type Patient } from "../../domain/patient";
import {
  patientEncounterHistory,
  patientLabHistory,
  type PastEncounter,
  type LabObservation,
} from "../../lib/clinical-protocols";

type HistoryStreamType = "all" | "encounters" | "meds" | "labs";

type MedicationMilestone = {
  id: string;
  date: string;
  medication: string;
  action: "Started" | "Titrated" | "Continued" | "Adjusted";
  detail: string;
};

// Synthetic medication titration milestones matching patient history
const patientMedicationMilestones: Record<string, MedicationMilestone[]> = {
  "maya-chen": [
    {
      id: "med-m-1",
      date: "Aug 12, 2026",
      medication: "Guanfacine ER",
      action: "Titrated",
      detail: "Increased from 1 mg to 2 mg nightly at bedtime. Good response for sleep onset latency and evening ADHD emotional dysregulation.",
    },
    {
      id: "med-m-2",
      date: "Jul 15, 2026",
      medication: "Guanfacine ER",
      action: "Started",
      detail: "Initiated 1 mg nightly at bedtime for evening restlessness and sleep phase delay.",
    },
    {
      id: "med-m-3",
      date: "May 19, 2026",
      medication: "Sertraline (Zoloft)",
      action: "Titrated",
      detail: "Titrated from 50 mg to 100 mg daily for panic attacks and generalized anxiety.",
    },
  ],
  "jordan-reed": [
    {
      id: "med-jr-1",
      date: "Aug 21, 2026",
      medication: "Lamotrigine (Lamictal)",
      action: "Continued",
      detail: "Maintained at 150 mg daily. Mood stable, denies rash or adverse effects.",
    },
    {
      id: "med-jr-2",
      date: "Jun 10, 2026",
      medication: "Lamotrigine (Lamictal)",
      action: "Titrated",
      detail: "Stepped up from 100 mg to 150 mg daily for mood stabilization.",
    },
    {
      id: "med-jr-3",
      date: "Jun 10, 2026",
      medication: "Quetiapine (Seroquel)",
      action: "Continued",
      detail: "Maintained at 100 mg nightly. Reliable sleep maintenance.",
    },
  ],
  "sofia-martinez": [
    {
      id: "med-sm-1",
      date: "Jul 29, 2026",
      medication: "Fluoxetine (Prozac)",
      action: "Continued",
      detail: "Maintained at 30 mg daily with breakfast for adolescent depression.",
    },
  ],
};

export default function PatientHistory({
  patient,
  onInsertText,
  onToast,
}: {
  patient: Patient;
  onInsertText?: (text: string) => void;
  onToast?: (msg: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeStream, setActiveStream] = useState<HistoryStreamType>("all");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [intervalSummary, setIntervalSummary] = useState<string | null>(null);

  const pastEncounters = useMemo(() => patientEncounterHistory[patient.id] || [], [patient.id]);
  const labs = useMemo(() => patientLabHistory[patient.id] || [], [patient.id]);
  const medMilestones = useMemo(() => patientMedicationMilestones[patient.id] || [], [patient.id]);

  // Unified Chronological Events List
  type TimelineEvent =
    | { type: "encounter"; date: string; data: PastEncounter }
    | { type: "med"; date: string; data: MedicationMilestone }
    | { type: "lab"; date: string; data: LabObservation };

  const allEvents = useMemo(() => {
    const list: TimelineEvent[] = [];
    pastEncounters.forEach((enc) => list.push({ type: "encounter", date: enc.date, data: enc }));
    medMilestones.forEach((m) => list.push({ type: "med", date: m.date, data: m }));
    labs.forEach((l) => list.push({ type: "lab", date: l.date, data: l }));

    // Sort descending by date (parse approximate dates)
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pastEncounters, medMilestones, labs]);

  // Filtered by stream and query
  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allEvents.filter((evt) => {
      if (activeStream !== "all") {
        if (activeStream === "encounters" && evt.type !== "encounter") return false;
        if (activeStream === "meds" && evt.type !== "med") return false;
        if (activeStream === "labs" && evt.type !== "lab") return false;
      }

      if (!q) return true;

      if (evt.type === "encounter") {
        return (
          evt.data.chiefComplaint.toLowerCase().includes(q) ||
          evt.data.hpi.toLowerCase().includes(q) ||
          evt.data.assessment.toLowerCase().includes(q) ||
          evt.data.plan.toLowerCase().includes(q)
        );
      }
      if (evt.type === "med") {
        return (
          evt.data.medication.toLowerCase().includes(q) ||
          evt.data.detail.toLowerCase().includes(q) ||
          evt.data.action.toLowerCase().includes(q)
        );
      }
      if (evt.type === "lab") {
        return (
          evt.data.testName.toLowerCase().includes(q) ||
          evt.data.value.toLowerCase().includes(q) ||
          evt.data.code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allEvents, activeStream, searchQuery]);

  // Ambient AI Interval Synthesis
  function handleSynthesizeInterval() {
    setIsSynthesizing(true);
    setTimeout(() => {
      let text = "";
      if (patient.id === "maya-chen") {
        text = `• Interval Trajectory: Sleep onset latency decreased from 90 min to 25 min following Guanfacine ER titration (1mg -> 2mg nightly). No daytime drowsiness.\n• Medication Adherence: Sertraline 100mg maintained; panic symptoms well-controlled.\n• Outstanding Surveillance: Blood pressure & pulse check recommended (last checked Aug 12: 116/74, HR 68).`;
      } else if (patient.id === "jordan-reed") {
        text = `• Interval Trajectory: Mood stabilized on Lamotrigine 150mg daily; sleep maintained on Quetiapine 100mg bedtime.\n• Metabolic Protocol Alert: Overdue for annual fasting lipid panel & HbA1c (last done June 2025; >365 days elapsed).\n• Weight change: +6 lbs noted over past year; monitoring recommended.`;
      } else {
        text = `• Interval Trajectory: Fluoxetine 30mg daily well-tolerated with breakfast; mild transient afternoon fatigue resolving.\n• Affective Status: Depressive symptoms in partial remission; academic transition underway.\n• Follow-up: Re-evaluate PHQ-9 score at upcoming session.`;
      }
      setIntervalSummary(text);
      setIsSynthesizing(false);
      if (onToast) onToast("✦ AI synthesized interval trajectory from past visits and labs!");
    }, 450);
  }

  function handleInsertIntervalToNote() {
    if (!intervalSummary) return;
    if (onInsertText) onInsertText(`[Interval Change Synthesis]:\n${intervalSummary}`);
    if (onToast) onToast("Inserted interval briefing into active encounter note!");
  }

  return (
    <div className="patient-history-container">
      {/* TOP HEADER & SEARCH BAR */}
      <div className="history-top-header">
        <div className="history-title-col">
          <span className="eyebrow">Longitudinal flowsheet</span>
          <h2>Patient Timeline &amp; Trajectory</h2>
        </div>

        <div className="history-search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past notes, medications, lab values..."
          />
          {searchQuery && (
            <button type="button" className="clear-search-btn" onClick={() => setSearchQuery("")}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* AMBIENT AI INTERVAL SYNTHESIS CARD */}
      <div className="ai-interval-card">
        <div className="interval-card-header">
          <div className="interval-header-left">
            <span className="spark">✦</span>
            <div>
              <strong>Ambient AI Interval Synthesis</strong>
              <p>Compares prior visits, medication titrations, and labs to summarize what changed over time.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-synthesize-interval"
            onClick={handleSynthesizeInterval}
            disabled={isSynthesizing}
          >
            {isSynthesizing ? "Analyzing History..." : "✦ What Changed Since Last Visit?"}
          </button>
        </div>

        {intervalSummary && (
          <div className="interval-summary-box">
            <pre className="interval-summary-text">{intervalSummary}</pre>
            <div className="interval-action-bar">
              <button
                type="button"
                className="btn-insert-interval"
                onClick={handleInsertIntervalToNote}
              >
                📋 Insert Interval Summary into Active Encounter Draft
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STREAM TOGGLES */}
      <div className="history-stream-tabs">
        <button
          type="button"
          className={`stream-tab ${activeStream === "all" ? "active" : ""}`}
          onClick={() => setActiveStream("all")}
        >
          All Events ({allEvents.length})
        </button>
        <button
          type="button"
          className={`stream-tab ${activeStream === "encounters" ? "active" : ""}`}
          onClick={() => setActiveStream("encounters")}
        >
          📋 Clinical Visits ({pastEncounters.length})
        </button>
        <button
          type="button"
          className={`stream-tab ${activeStream === "meds" ? "active" : ""}`}
          onClick={() => setActiveStream("meds")}
        >
          💊 Medication Milestones ({medMilestones.length})
        </button>
        <button
          type="button"
          className={`stream-tab ${activeStream === "labs" ? "active" : ""}`}
          onClick={() => setActiveStream("labs")}
        >
          🔬 Diagnostic Labs ({labs.length})
        </button>
      </div>

      {/* TIMELINE FEED */}
      <div className="timeline-feed">
        {filteredEvents.length === 0 ? (
          <div className="no-events-box">No events found matching current filters.</div>
        ) : (
          filteredEvents.map((evt, index) => (
            <div key={index} className={`timeline-card stream-${evt.type}`}>
              {/* Encounter Note Event */}
              {evt.type === "encounter" && (
                <div className="event-content">
                  <div className="event-header-row">
                    <span className="event-type-badge encounter">Clinical Visit</span>
                    <strong className="event-title">{evt.data.type}</strong>
                    <time className="event-date">{evt.date}</time>
                  </div>
                  <div className="event-meta-line">
                    <span>Provider: {evt.data.provider}</span>
                  </div>
                  <div className="event-body-section">
                    <strong>Chief Complaint:</strong> {evt.data.chiefComplaint}
                  </div>
                  <div className="event-body-section">
                    <strong>HPI:</strong> {evt.data.hpi}
                  </div>
                  <div className="event-body-section">
                    <strong>Assessment:</strong> {evt.data.assessment}
                  </div>
                  <div className="event-body-section plan-box">
                    <strong>Plan:</strong>
                    <pre>{evt.data.plan}</pre>
                  </div>
                  {onInsertText && (
                    <div className="event-actions">
                      <button
                        type="button"
                        className="btn-event-action"
                        onClick={() => {
                          onInsertText(`[Prior Plan ${evt.date}]:\n${evt.data.plan}`);
                          if (onToast) onToast(`Copied ${evt.date} plan into active note!`);
                        }}
                      >
                        📋 Insert Prior Plan to Current Encounter
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Medication Milestone Event */}
              {evt.type === "med" && (
                <div className="event-content">
                  <div className="event-header-row">
                    <span className="event-type-badge med">Rx Titration</span>
                    <strong className="event-title">
                      {evt.data.action}: {evt.data.medication}
                    </strong>
                    <time className="event-date">{evt.date}</time>
                  </div>
                  <p className="event-body-text">{evt.data.detail}</p>
                </div>
              )}

              {/* Diagnostic Lab Event */}
              {evt.type === "lab" && (
                <div className="event-content">
                  <div className="event-header-row">
                    <span className="event-type-badge lab">Lab Result</span>
                    <strong className="event-title">{evt.data.testName}</strong>
                    <time className="event-date">{evt.date}</time>
                  </div>
                  <div className="event-lab-values">
                    <span>Result: <strong>{evt.data.value}</strong> {evt.data.unit !== "multi" && evt.data.unit}</span>
                    <span>Ref Range: {evt.data.referenceRange}</span>
                    {evt.data.flag && (
                      <span className={`lab-flag ${evt.data.flag}`}>{evt.data.flag}</span>
                    )}
                    <span className="lab-loinc-meta">LOINC {evt.data.code}</span>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
