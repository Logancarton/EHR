"use client";

import { useMemo } from "react";
import { type Patient } from "../../domain/patient";
import {
  type ProviderPreferences,
  type OverviewCardId,
  defaultPreferences,
  savePreferences,
} from "../../lib/preference-engine";
import {
  calculateMonitoringStatus,
  patientLabHistory,
  patientEncounterHistory,
} from "../../lib/clinical-protocols";

export default function PatientOverview({
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
