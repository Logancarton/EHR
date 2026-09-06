"use client";

import { useState, useMemo } from "react";
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
  const [draggedCardId, setDraggedCardId] = useState<OverviewCardId | null>(null);
  const [dropTargetCardId, setDropTargetCardId] = useState<OverviewCardId | null>(null);

  function hideCard(key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: false },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function showCard(key: "showSnapshot" | "showDiagnoses" | "showMedications" | "showTimeline") {
    if (!onUpdatePreferences) return;
    const next = {
      ...preferences,
      overview: { ...preferences.overview, [key]: true },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function resetCards() {
    if (!onUpdatePreferences) return;
    const next: ProviderPreferences = {
      ...preferences,
      overview: {
        ...preferences.overview,
        showSnapshot: true,
        showDiagnoses: true,
        showMedications: true,
        showTimeline: true,
        cardOrder: ["snapshot", "diagnoses", "medications", "timeline"],
        collapsedCards: {},
        cardSpans: {},
        pinnedCards: {},
      },
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

  function toggleCardSpan(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const currentSpan = preferences.overview.cardSpans?.[cardId] ?? (cardId === "snapshot" || cardId === "timeline" ? 2 : 1);
    const nextSpan = currentSpan === 2 ? 1 : 2;
    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardSpans: {
          ...(preferences.overview.cardSpans || {}),
          [cardId]: nextSpan as 1 | 2,
        },
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function togglePinCard(cardId: OverviewCardId) {
    if (!onUpdatePreferences) return;
    const isPinned = preferences.overview.pinnedCards?.[cardId] || false;
    let nextOrder = [...preferences.overview.cardOrder];

    if (!isPinned) {
      // Move to top if pinning
      nextOrder = [cardId, ...nextOrder.filter((id) => id !== cardId)];
    }

    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: nextOrder,
        pinnedCards: {
          ...(preferences.overview.pinnedCards || {}),
          [cardId]: !isPinned,
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

  function handleDragStart(cardId: OverviewCardId, event: React.DragEvent) {
    setDraggedCardId(cardId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
  }

  function handleDragOver(cardId: OverviewCardId, event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropTargetCardId !== cardId) {
      setDropTargetCardId(cardId);
    }
  }

  function handleDrop(targetCardId: OverviewCardId, event: React.DragEvent) {
    event.preventDefault();
    const sourceCardId = event.dataTransfer.getData("text/plain") as OverviewCardId;
    setDraggedCardId(null);
    setDropTargetCardId(null);

    if (!sourceCardId || sourceCardId === targetCardId || !onUpdatePreferences) return;

    const currentOrder = [...preferences.overview.cardOrder];
    const sourceIndex = currentOrder.indexOf(sourceCardId);
    const targetIndex = currentOrder.indexOf(targetCardId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Remove source and insert before target
    currentOrder.splice(sourceIndex, 1);
    currentOrder.splice(targetIndex, 0, sourceCardId);

    const next = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: currentOrder,
      },
    };
    savePreferences(next);
    onUpdatePreferences(next);
  }

  function handleDragEnd() {
    setDraggedCardId(null);
    setDropTargetCardId(null);
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

  const hasHiddenCards =
    !preferences.overview.showSnapshot ||
    !preferences.overview.showDiagnoses ||
    !preferences.overview.showMedications ||
    !preferences.overview.showTimeline;

  return (
    <div className="overview-grid">
      {preferences.overview.cardOrder.map((cardId, index) => {
        const isDragging = draggedCardId === cardId;
        const isDropTarget = dropTargetCardId === cardId && draggedCardId !== cardId;
        const isPinned = preferences.overview.pinnedCards?.[cardId] || false;
        const defaultSpan = cardId === "snapshot" || cardId === "timeline" ? 2 : 1;
        const span = preferences.overview.cardSpans?.[cardId] ?? defaultSpan;
        const spanClass = span === 2 ? "col-span-2 wide-card" : "";

        if (cardId === "snapshot") {
          if (!preferences.overview.showSnapshot) return null;
          const isCollapsed = preferences.overview.collapsedCards.snapshot || false;
          return (
            <section
              key="snapshot"
              className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
              onDragOver={(e) => handleDragOver("snapshot", e)}
              onDrop={(e) => handleDrop("snapshot", e)}
            >
              <div className="card-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    className="card-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart("snapshot", e)}
                    onDragEnd={handleDragEnd}
                    title="Drag to rearrange card"
                  >
                    ⠿
                  </span>
                  <div>
                    <span className="eyebrow">Clinical snapshot</span>
                    <h2>What matters now</h2>
                  </div>
                </div>
                <div className="overview-card-header-actions">
                  <button
                    type="button"
                    className={`card-header-btn ${isPinned ? "pinned" : ""}`}
                    onClick={() => togglePinCard("snapshot")}
                    title={isPinned ? "Unpin card" : "Pin card to top"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCardSpan("snapshot")}
                    title={span === 2 ? "Narrow to 1 column" : "Expand to full width"}
                  >
                    {span === 2 ? "⇱" : "⇲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCollapse("snapshot")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn close-tool"
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
            <section
              key="diagnoses"
              className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
              onDragOver={(e) => handleDragOver("diagnoses", e)}
              onDrop={(e) => handleDrop("diagnoses", e)}
            >
              <div className="card-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    className="card-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart("diagnoses", e)}
                    onDragEnd={handleDragEnd}
                    title="Drag to rearrange card"
                  >
                    ⠿
                  </span>
                  <h2>Diagnoses</h2>
                </div>
                <div className="overview-card-header-actions">
                  <button
                    type="button"
                    className={`card-header-btn ${isPinned ? "pinned" : ""}`}
                    onClick={() => togglePinCard("diagnoses")}
                    title={isPinned ? "Unpin card" : "Pin card to top"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCardSpan("diagnoses")}
                    title={span === 2 ? "Narrow to 1 column" : "Expand to full width"}
                  >
                    {span === 2 ? "⇱" : "⇲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCollapse("diagnoses")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn close-tool"
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
          return (
            <section
              key="medications"
              className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
              onDragOver={(e) => handleDragOver("medications", e)}
              onDrop={(e) => handleDrop("medications", e)}
            >
              <div className="card-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    className="card-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart("medications", e)}
                    onDragEnd={handleDragEnd}
                    title="Drag to rearrange card"
                  >
                    ⠿
                  </span>
                  <h2>Current medications</h2>
                </div>
                <div className="overview-card-header-actions">
                  <button
                    type="button"
                    className={`card-header-btn ${isPinned ? "pinned" : ""}`}
                    onClick={() => togglePinCard("medications")}
                    title={isPinned ? "Unpin card" : "Pin card to top"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCardSpan("medications")}
                    title={span === 2 ? "Narrow to 1 column" : "Expand to full width"}
                  >
                    {span === 2 ? "⇱" : "⇲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCollapse("medications")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn close-tool"
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
            <section
              key="timeline"
              className={`card overview-card-container ${spanClass} ${isCollapsed ? "is-collapsed" : ""} ${isDragging ? "is-dragging" : ""} ${isDropTarget ? "drop-target-active" : ""}`}
              onDragOver={(e) => handleDragOver("timeline", e)}
              onDrop={(e) => handleDrop("timeline", e)}
            >
              <div className="card-heading">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    className="card-drag-handle"
                    draggable
                    onDragStart={(e) => handleDragStart("timeline", e)}
                    onDragEnd={handleDragEnd}
                    title="Drag to rearrange card"
                  >
                    ⠿
                  </span>
                  <h2>Recent clinical activity</h2>
                </div>
                <div className="overview-card-header-actions">
                  <button
                    type="button"
                    className={`card-header-btn ${isPinned ? "pinned" : ""}`}
                    onClick={() => togglePinCard("timeline")}
                    title={isPinned ? "Unpin card" : "Pin card to top"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCardSpan("timeline")}
                    title={span === 2 ? "Narrow to 1 column" : "Expand to full width"}
                  >
                    {span === 2 ? "⇱" : "⇲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn"
                    onClick={() => toggleCollapse("timeline")}
                    title={isCollapsed ? "Expand card" : "Collapse card"}
                  >
                    {isCollapsed ? "▼" : "▲"}
                  </button>
                  <button
                    type="button"
                    className="card-header-btn close-tool"
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

      {hasHiddenCards && (
        <div className="overview-restore-bar">
          <span>Hidden cards:</span>
          {!preferences.overview.showSnapshot && (
            <button
              type="button"
              className="overview-restore-pill"
              onClick={() => showCard("showSnapshot")}
            >
              ＋ Show Snapshot
            </button>
          )}
          {!preferences.overview.showDiagnoses && (
            <button
              type="button"
              className="overview-restore-pill"
              onClick={() => showCard("showDiagnoses")}
            >
              ＋ Show Diagnoses
            </button>
          )}
          {!preferences.overview.showMedications && (
            <button
              type="button"
              className="overview-restore-pill"
              onClick={() => showCard("showMedications")}
            >
              ＋ Show Medications
            </button>
          )}
          {!preferences.overview.showTimeline && (
            <button
              type="button"
              className="overview-restore-pill"
              onClick={() => showCard("showTimeline")}
            >
              ＋ Show Activity Timeline
            </button>
          )}
          <button type="button" className="overview-reset-pill" onClick={resetCards}>
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}
