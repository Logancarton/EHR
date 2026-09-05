"use client";

import { useState } from "react";
import {
  type ProviderPreferences,
  type DensityMode,
  type HeaderDensity,
  type OverviewCardId,
  type TodayWidgetId,
  builtInPresets,
  applyPreset,
  saveCustomPreset,
  deleteCustomPreset,
  resetToDefaults,
  savePreferences,
} from "../lib/preference-engine";

type CustomizerTab = "presets" | "density" | "today" | "overview" | "encounter";

export default function WorkspaceCustomizer({
  isOpen,
  onClose,
  preferences,
  onUpdatePreferences,
  onToast,
}: {
  isOpen: boolean;
  onClose: () => void;
  preferences: ProviderPreferences;
  onUpdatePreferences: (updated: ProviderPreferences) => void;
  onToast?: (msg: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<CustomizerTab>("presets");
  const [newPresetName, setNewPresetName] = useState("");

  if (!isOpen) return null;

  function update(partial: Partial<ProviderPreferences>) {
    const updated = { ...preferences, ...partial };
    savePreferences(updated);
    onUpdatePreferences(updated);
  }

  function handleSelectPreset(presetId: string) {
    const updated = applyPreset(presetId, preferences);
    onUpdatePreferences(updated);
    if (onToast) onToast(`Applied “${builtInPresets[presetId]?.name || presetId}” layout preset`);
  }

  function handleSaveNewPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    const name = newPresetName.trim();
    const updated = saveCustomPreset(name, preferences);
    onUpdatePreferences(updated);
    setNewPresetName("");
    if (onToast) onToast(`Saved custom preset “${name}”`);
  }

  function handleDeletePreset(presetId: string) {
    const updated = deleteCustomPreset(presetId, preferences);
    onUpdatePreferences(updated);
    if (onToast) onToast("Deleted custom preset");
  }

  function handleReset() {
    if (confirm("Reset all workspace layout preferences to default?")) {
      const reset = resetToDefaults();
      onUpdatePreferences(reset);
      if (onToast) onToast("Reset layout to standard defaults");
    }
  }

  // Reordering helpers for Overview cards
  function moveOverviewCard(index: number, direction: "up" | "down") {
    const currentOrder = [...preferences.overview.cardOrder];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;
    const updated: ProviderPreferences = {
      ...preferences,
      overview: {
        ...preferences.overview,
        cardOrder: currentOrder,
      },
    };
    savePreferences(updated);
    onUpdatePreferences(updated);
  }

  // Reordering helpers for Today widgets
  function moveTodayWidget(index: number, direction: "up" | "down") {
    const currentOrder = [...preferences.today.widgetOrder];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const temp = currentOrder[index];
    currentOrder[index] = currentOrder[targetIndex];
    currentOrder[targetIndex] = temp;
    const updated: ProviderPreferences = {
      ...preferences,
      today: {
        ...preferences.today,
        widgetOrder: currentOrder,
      },
    };
    savePreferences(updated);
    onUpdatePreferences(updated);
  }

  const cardLabels: Record<OverviewCardId, { title: string; subtitle: string }> = {
    snapshot: { title: "Clinical Snapshot", subtitle: "“What matters now” quick review box" },
    diagnoses: { title: "Active Diagnoses", subtitle: "DSM-5 / ICD-10 psychiatric problem list" },
    medications: { title: "Current Medications", subtitle: "Active prescriptions & surveillance schedule" },
    timeline: { title: "Recent Clinical Activity", subtitle: "Unified chronological encounter timeline" },
  };

  const todayLabels: Record<TodayWidgetId, { title: string; subtitle: string }> = {
    briefing: { title: "AI Morning Briefing", subtitle: "Context synthesis of today's urgent clinical queue" },
    metrics: { title: "Daily Metric Cards", subtitle: "Counters for Waiting, In-Visit, Upcoming, and Completed" },
    roster: { title: "Patient Flow Roster", subtitle: "Searchable daily schedule stream with status buttons" },
    queue: { title: "Action Queue Sidebar", subtitle: "Urgent lab alerts, unsigned notes, and prescription tasks" },
    shortcuts: { title: "Daily Shortcuts", subtitle: "One-click access to active charts and tools" },
  };

  return (
    <div className="customizer-backdrop" onClick={onClose}>
      <aside
        className="customizer-drawer"
        role="dialog"
        aria-label="Workspace Layout Preferences"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="customizer-header">
          <div className="customizer-title-wrap">
            <span className="spark">⚙️</span>
            <div>
              <h3>Layout &amp; Preferences</h3>
              <p>Customize what shows in your workspace, adjust density, and save presets.</p>
            </div>
          </div>
          <button type="button" className="customizer-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <nav className="customizer-tabs">
          <button
            type="button"
            className={activeTab === "presets" ? "active" : ""}
            onClick={() => setActiveTab("presets")}
          >
            Presets
          </button>
          <button
            type="button"
            className={activeTab === "density" ? "active" : ""}
            onClick={() => setActiveTab("density")}
          >
            Density &amp; Shell
          </button>
          <button
            type="button"
            className={activeTab === "today" ? "active" : ""}
            onClick={() => setActiveTab("today")}
          >
            Today Dashboard
          </button>
          <button
            type="button"
            className={activeTab === "overview" ? "active" : ""}
            onClick={() => setActiveTab("overview")}
          >
            Patient Chart
          </button>
          <button
            type="button"
            className={activeTab === "encounter" ? "active" : ""}
            onClick={() => setActiveTab("encounter")}
          >
            Encounter Note
          </button>
        </nav>

        {/* Content Body */}
        <div className="customizer-body">
          {/* TAB 1: PRESETS */}
          {activeTab === "presets" && (
            <div className="customizer-section">
              <span className="eyebrow">Built-In Clinical Presets</span>
              <p className="section-help-text">
                Quickly adapt your workstation for different clinician workflows.
              </p>

              <div className="preset-cards-grid">
                {Object.values(builtInPresets).map((preset) => {
                  const isActive = preferences.activePresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`preset-card ${isActive ? "active" : ""}`}
                      onClick={() => handleSelectPreset(preset.id)}
                    >
                      <div className="preset-card-top">
                        <span className="preset-icon">{preset.icon}</span>
                        <strong>{preset.name}</strong>
                        {isActive && <span className="active-badge">Active</span>}
                      </div>
                      <p>{preset.description}</p>
                    </div>
                  );
                })}
              </div>

              {/* Custom Presets */}
              <div className="custom-presets-wrap" style={{ marginTop: "20px" }}>
                <span className="eyebrow">Your Saved Custom Presets</span>
                {Object.keys(preferences.customPresets).length === 0 ? (
                  <p className="empty-subtext">
                    No custom presets saved yet. Set your preferred toggles and save a preset below!
                  </p>
                ) : (
                  <div className="custom-preset-list">
                    {Object.entries(preferences.customPresets).map(([id, p]) => {
                      const isActive = preferences.activePresetId === id;
                      const displayName = id.replace(/^custom-/, "").replace(/-\d{4}$/, "");
                      return (
                        <div key={id} className={`custom-preset-item ${isActive ? "active" : ""}`}>
                          <button
                            type="button"
                            className="preset-select-btn"
                            onClick={() => handleSelectPreset(id)}
                          >
                            <span>★</span>
                            <strong>{displayName.toUpperCase()}</strong>
                            {isActive && <small>(Active)</small>}
                          </button>
                          <button
                            type="button"
                            className="preset-delete-btn"
                            title="Delete preset"
                            onClick={() => handleDeletePreset(id)}
                          >
                            🗑
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Save new preset form */}
                <form className="save-preset-form" onSubmit={handleSaveNewPreset}>
                  <input
                    type="text"
                    placeholder="Name your current layout (e.g. Morning Med Flow)..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                  />
                  <button type="submit" disabled={!newPresetName.trim()} className="primary-sub">
                    Save as Preset
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: DENSITY & SHELL */}
          {activeTab === "density" && (
            <div className="customizer-section">
              <span className="eyebrow">Information Density</span>
              <p className="section-help-text">
                Control padding, margins, and data compactness throughout charts and notes.
              </p>

              <div className="density-picker">
                <button
                  type="button"
                  className={`density-option ${preferences.density === "comfortable" ? "active" : ""}`}
                  onClick={() => update({ density: "comfortable" })}
                >
                  <div className="density-visual comfortable-vis">
                    <span />
                    <span />
                  </div>
                  <strong>Comfortable</strong>
                  <small>Standard Google spacing &amp; breathable layout</small>
                </button>

                <button
                  type="button"
                  className={`density-option ${preferences.density === "compact" ? "active" : ""}`}
                  onClick={() => update({ density: "compact" })}
                >
                  <div className="density-visual compact-vis">
                    <span />
                    <span />
                    <span />
                  </div>
                  <strong>Compact</strong>
                  <small>High density, tighter tables &amp; reduced whitespace</small>
                </button>

                <button
                  type="button"
                  className={`density-option ${preferences.density === "minimal" ? "active" : ""}`}
                  onClick={() => update({ density: "minimal" })}
                >
                  <div className="density-visual minimal-vis">
                    <span />
                  </div>
                  <strong>Zen / Minimal</strong>
                  <small>Distraction-free focus with maximum writing area</small>
                </button>
              </div>

              <span className="eyebrow" style={{ marginTop: "24px" }}>
                Patient Header Style
              </span>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="headerDensity"
                    checked={preferences.headerDensity === "full"}
                    onChange={() => update({ headerDensity: "full" })}
                  />
                  <div>
                    <strong>Full Header</strong>
                    <small>Avatar, DOB, age, pronouns, MRN &amp; action buttons</small>
                  </div>
                </label>
                <label>
                  <input
                    type="radio"
                    name="headerDensity"
                    checked={preferences.headerDensity === "compact"}
                    onChange={() => update({ headerDensity: "compact" })}
                  />
                  <div>
                    <strong>Compact Header</strong>
                    <small>Streamlined single-line banner</small>
                  </div>
                </label>
                <label>
                  <input
                    type="radio"
                    name="headerDensity"
                    checked={preferences.headerDensity === "minimal"}
                    onChange={() => update({ headerDensity: "minimal" })}
                  />
                  <div>
                    <strong>Minimal Header</strong>
                    <small>Patient name and vital status tag only</small>
                  </div>
                </label>
              </div>

              <span className="eyebrow" style={{ marginTop: "24px" }}>
                Workspace Rails
              </span>
              <div className="toggle-list">
                <label className="toggle-row">
                  <div>
                    <strong>Google Companion Rail</strong>
                    <small>Right 52px rail for AI, Scratchpad, Tasks &amp; Calculators</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.showCompanionRail}
                    onChange={(e) => update({ showCompanionRail: e.target.checked })}
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: TODAY DASHBOARD */}
          {activeTab === "today" && (
            <div className="customizer-section">
              <span className="eyebrow">Today Dashboard Modules</span>
              <p className="section-help-text">
                Toggle and reorder widgets displayed on your morning encounter hub.
              </p>

              <div className="reorderable-list">
                {preferences.today.widgetOrder.map((widgetId, index) => {
                  const meta = todayLabels[widgetId];
                  let isVisible = true;
                  if (widgetId === "briefing") isVisible = preferences.today.showMorningBriefing;
                  if (widgetId === "metrics") isVisible = preferences.today.showMetrics;
                  if (widgetId === "roster") isVisible = preferences.today.showScheduleSearch;
                  if (widgetId === "queue") isVisible = preferences.today.showActionQueue;
                  if (widgetId === "shortcuts") isVisible = preferences.today.showQuickReferences;

                  function toggle(checked: boolean) {
                    const todayState = { ...preferences.today };
                    if (widgetId === "briefing") todayState.showMorningBriefing = checked;
                    if (widgetId === "metrics") todayState.showMetrics = checked;
                    if (widgetId === "roster") todayState.showScheduleSearch = checked;
                    if (widgetId === "queue") todayState.showActionQueue = checked;
                    if (widgetId === "shortcuts") todayState.showQuickReferences = checked;
                    update({ today: todayState });
                  }

                  return (
                    <div key={widgetId} className={`reorderable-item ${!isVisible ? "dimmed" : ""}`}>
                      <div className="reorder-controls">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveTodayWidget(index, "up")}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === preferences.today.widgetOrder.length - 1}
                          onClick={() => moveTodayWidget(index, "down")}
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="item-text">
                        <strong>{meta?.title || widgetId}</strong>
                        <small>{meta?.subtitle}</small>
                      </div>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={isVisible}
                        onChange={(e) => toggle(e.target.checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: PATIENT CHART OVERVIEW */}
          {activeTab === "overview" && (
            <div className="customizer-section">
              <span className="eyebrow">Patient Chart Overview Cards</span>
              <p className="section-help-text">
                Toggle visibility and reorder the clinical cards shown in the patient overview.
              </p>

              <div className="reorderable-list">
                {preferences.overview.cardOrder.map((cardId, index) => {
                  const meta = cardLabels[cardId];
                  let isVisible = true;
                  if (cardId === "snapshot") isVisible = preferences.overview.showSnapshot;
                  if (cardId === "diagnoses") isVisible = preferences.overview.showDiagnoses;
                  if (cardId === "medications") isVisible = preferences.overview.showMedications;
                  if (cardId === "timeline") isVisible = preferences.overview.showTimeline;

                  function toggle(checked: boolean) {
                    const overviewState = { ...preferences.overview };
                    if (cardId === "snapshot") overviewState.showSnapshot = checked;
                    if (cardId === "diagnoses") overviewState.showDiagnoses = checked;
                    if (cardId === "medications") overviewState.showMedications = checked;
                    if (cardId === "timeline") overviewState.showTimeline = checked;
                    update({ overview: overviewState });
                  }

                  return (
                    <div key={cardId} className={`reorderable-item ${!isVisible ? "dimmed" : ""}`}>
                      <div className="reorder-controls">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveOverviewCard(index, "up")}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === preferences.overview.cardOrder.length - 1}
                          onClick={() => moveOverviewCard(index, "down")}
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <div className="item-text">
                        <strong>{meta?.title || cardId}</strong>
                        <small>{meta?.subtitle}</small>
                      </div>
                      <input
                        type="checkbox"
                        className="toggle-switch"
                        checked={isVisible}
                        onChange={(e) => toggle(e.target.checked)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 5: ENCOUNTER NOTE */}
          {activeTab === "encounter" && (
            <div className="customizer-section">
              <span className="eyebrow">Encounter Note Sections</span>
              <p className="section-help-text">
                Toggle clinical note blocks and the longitudinal past encounter search drawer.
              </p>

              <div className="toggle-list">
                <label className="toggle-row">
                  <div>
                    <strong>Longitudinal Past Notes Search</strong>
                    <small>Keyword search across previous visits, titration history, and HPIs</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showPastEncountersSearch}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showPastEncountersSearch: e.target.checked },
                      })
                    }
                  />
                </label>

                <label className="toggle-row">
                  <div>
                    <strong>Interval History</strong>
                    <small>Presentation, recent changes, and timeline since last visit</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showIntervalHistory}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showIntervalHistory: e.target.checked },
                      })
                    }
                  />
                </label>

                <label className="toggle-row">
                  <div>
                    <strong>Response to Treatment</strong>
                    <small>Symptom changes, psychiatric stability, functional improvement</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showTreatmentResponse}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showTreatmentResponse: e.target.checked },
                      })
                    }
                  />
                </label>

                <label className="toggle-row">
                  <div>
                    <strong>Side Effects &amp; Safety Concerns</strong>
                    <small>Adverse effects, adherence, safety check</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showSideEffects}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showSideEffects: e.target.checked },
                      })
                    }
                  />
                </label>

                <label className="toggle-row">
                  <div>
                    <strong>Clinical Assessment</strong>
                    <small>Diagnostic impression and clinical reasoning</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showAssessment}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showAssessment: e.target.checked },
                      })
                    }
                  />
                </label>

                <label className="toggle-row">
                  <div>
                    <strong>Treatment Plan</strong>
                    <small>Medication titrations, surveillance labs, follow-up timing</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={preferences.encounter.showPlan}
                    onChange={(e) =>
                      update({
                        encounter: { ...preferences.encounter, showPlan: e.target.checked },
                      })
                    }
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="customizer-footer">
          <button type="button" className="btn-secondary-link" onClick={handleReset}>
            ↺ Reset to Defaults
          </button>
          <button type="button" className="btn-primary-done" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}
