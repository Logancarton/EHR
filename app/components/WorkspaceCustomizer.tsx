"use client";

import { useState } from "react";
import {
  type ProviderPreferences,
  type DensityMode,
  type HeaderDensity,
  type OverviewCardId,
  type TodayWidgetId,
  applyPreset,
  saveCustomPreset,
  deleteCustomPreset,
  resetToDefaults,
  savePreferences,
} from "../lib/preference-engine";
import Icon from "./ui/Icon";

type CustomizerTab = "today" | "overview" | "density" | "encounter" | "saved";

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
  const [activeTab, setActiveTab] = useState<CustomizerTab>("today");
  const [newPresetName, setNewPresetName] = useState("");

  if (!isOpen) return null;

  function update(partial: Partial<ProviderPreferences>) {
    const updated = { ...preferences, ...partial };
    savePreferences(updated);
    onUpdatePreferences(updated);
  }

  function handleSelectSavedPreset(presetId: string) {
    const updated = applyPreset(presetId, preferences);
    onUpdatePreferences(updated);
    if (onToast) onToast(`Applied layout`);
  }

  function handleSaveNewPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    const name = newPresetName.trim();
    const updated = saveCustomPreset(name, preferences);
    onUpdatePreferences(updated);
    setNewPresetName("");
    if (onToast) onToast(`Saved layout “${name}”`);
  }

  function handleDeletePreset(presetId: string) {
    const updated = deleteCustomPreset(presetId, preferences);
    onUpdatePreferences(updated);
    if (onToast) onToast("Deleted layout");
  }

  function handleReset() {
    if (confirm("Reset all workspace layout preferences to clean defaults?")) {
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
    team: { title: "Team Collaboration", subtitle: "Presence, shared patients, and task handoffs" },
    shortcuts: { title: "Daily Shortcuts", subtitle: "One-click access to active charts and tools" },
    arrivals: { title: "Waiting Room & Arrivals", subtitle: "Live patient check-in queue, elapsed wait times, and room assignments" },
    "visit-prep": { title: "Visit Preparation", subtitle: "Pre-visit chart summaries with verified clinical facts and unknowns" },
    "care-completion": { title: "Care Completion", subtitle: "Patients you pinned, and the loops still open for each of them" },
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
            <span className="spark"><Icon name="settings" /></span>
            <div>
              <h3>Layout &amp; Preferences</h3>
              <p>Customize what shows in your workspace, adjust density, and save presets.</p>
            </div>
          </div>
          <button type="button" className="customizer-close-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        {/* Tab Navigation */}
        <nav className="customizer-tabs">
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
            className={activeTab === "density" ? "active" : ""}
            onClick={() => setActiveTab("density")}
          >
            Density &amp; Shell
          </button>
          <button
            type="button"
            className={activeTab === "encounter" ? "active" : ""}
            onClick={() => setActiveTab("encounter")}
          >
            Encounter Note
          </button>
          <button
            type="button"
            className={activeTab === "saved" ? "active" : ""}
            onClick={() => setActiveTab("saved")}
          >
            Saved Layouts
          </button>
        </nav>

        {/* Content Body */}
        <div className="customizer-body">
          {/* TAB: SAVED LAYOUTS */}
          {activeTab === "saved" && (
            <div className="customizer-section">
              <span className="eyebrow">Personal Saved Layouts</span>
              <p className="section-help-text">
                Bookmark and recall your personalized workspace arrangements.
              </p>

              <div className="custom-presets-wrap">
                {Object.keys(preferences.customPresets).length === 0 ? (
                  <p className="empty-subtext">
                    No custom layouts saved yet. Adjust your preferred widgets or density and save a layout below!
                  </p>
                ) : (
                  <div className="custom-preset-list">
                    {Object.entries(preferences.customPresets).map(([id]) => {
                      const isActive = preferences.activePresetId === id;
                      const displayName = id.replace(/^custom-/, "").replace(/-\d{4}$/, "");
                      return (
                        <div key={id} className={`custom-preset-item ${isActive ? "active" : ""}`}>
                          <button
                            type="button"
                            className="preset-select-btn"
                            onClick={() => handleSelectSavedPreset(id)}
                          >
                            <span>★</span>
                            <strong>{displayName.toUpperCase()}</strong>
                            {isActive && <small>(Active)</small>}
                          </button>
                          <button
                            type="button"
                            className="preset-delete-btn"
                            title="Delete layout"
                            onClick={() => handleDeletePreset(id)}
                          >
                            <Icon name="delete" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Save new layout form */}
                <form className="save-preset-form" onSubmit={handleSaveNewPreset}>
                  <input
                    type="text"
                    placeholder="Name your current layout (e.g. Outpatient Schedule)..."
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                  />
                  <button type="submit" disabled={!newPresetName.trim()} className="primary-sub">
                    Save as Layout
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
                  <strong>Minimal Focus</strong>
                  <small>Streamlined spacing with maximum writing canvas</small>
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

              <span className="eyebrow" style={{ marginTop: "24px" }}>
                Default Landing View (Reversible)
              </span>
              <p className="section-help-text">
                Choose the primary surface opened on first login or when all charts are closed.
              </p>
              <div className="radio-group">
                <label>
                  <input
                    type="radio"
                    name="defaultLandingView"
                    checked={(preferences.defaultLandingView ?? "today") === "today"}
                    onChange={() => update({ defaultLandingView: "today" })}
                  />
                  <div>
                    <strong>Today Dashboard (Default)</strong>
                    <small>Encounter schedule, patient arrivals, clinical queue &amp; practice cockpit</small>
                  </div>
                </label>
                <label>
                  <input
                    type="radio"
                    name="defaultLandingView"
                    checked={preferences.defaultLandingView === "home"}
                    onChange={() => update({ defaultLandingView: "home" })}
                  />
                  <div>
                    <strong>Home Launchpad (Legacy)</strong>
                    <small>Distraction-free Zen launchpad with practice shortcut tiles</small>
                  </div>
                </label>
              </div>

              <span className="eyebrow" style={{ marginTop: "24px" }}>
                Privacy &amp; Compliance Display Mode
              </span>
              <div className="toggle-list">
                <label className="toggle-row">
                  <div>
                    <strong>Privacy Display Mode</strong>
                    <small>Shoulder-surfing protection: masks patient names, MRNs, and complaints on screen until hovered. Does not replace authorization.</small>
                  </div>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={Boolean(preferences.privacyMode)}
                    onChange={(e) => update({ privacyMode: e.target.checked })}
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
                  if (widgetId === "team") isVisible = preferences.today.showTeamWindow !== false;
                  if (widgetId === "shortcuts") isVisible = preferences.today.showQuickReferences;
                  if (widgetId === "arrivals") isVisible = Boolean(preferences.today.showArrivals);
                  if (widgetId === "visit-prep") isVisible = Boolean(preferences.today.showVisitPrep);

                  function toggle(checked: boolean) {
                    const todayState = { ...preferences.today };
                    if (widgetId === "briefing") todayState.showMorningBriefing = checked;
                    if (widgetId === "metrics") todayState.showMetrics = checked;
                    if (widgetId === "roster") todayState.showScheduleSearch = checked;
                    if (widgetId === "queue") todayState.showActionQueue = checked;
                    if (widgetId === "team") todayState.showTeamWindow = checked;
                    if (widgetId === "shortcuts") todayState.showQuickReferences = checked;
                    if (widgetId === "arrivals") todayState.showArrivals = checked;
                    if (widgetId === "visit-prep") todayState.showVisitPrep = checked;
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
                          <Icon name="arrow_upward" />
                        </button>
                        <button
                          type="button"
                          disabled={index === preferences.today.widgetOrder.length - 1}
                          onClick={() => moveTodayWidget(index, "down")}
                          title="Move down"
                        >
                          <Icon name="arrow_downward" />
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
                          <Icon name="arrow_upward" />
                        </button>
                        <button
                          type="button"
                          disabled={index === preferences.overview.cardOrder.length - 1}
                          onClick={() => moveOverviewCard(index, "down")}
                          title="Move down"
                        >
                          <Icon name="arrow_downward" />
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
