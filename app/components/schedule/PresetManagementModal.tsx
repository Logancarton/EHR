"use client";

import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import Button from "../ui/Button";
import {
  type NamedLayoutPreset,
  type ProviderPreferences,
  applyPreset,
  builtInPresets,
  createNamedPreset,
  deleteNamedPreset,
  duplicateNamedPreset,
  isPresetModified,
  renameNamedPreset,
  revertToActivePreset,
  updateNamedPreset,
  adoptPracticeTemplate,
} from "../../lib/preference-engine";
import {
  fetchPracticeTemplates,
  type PracticeTemplate,
} from "../../lib/workspace-templates";

export interface PresetManagementModalProps {
  isOpen: boolean;
  preferences: ProviderPreferences;
  onClose: () => void;
  onUpdatePreferences: (updated: ProviderPreferences) => void;
}

export default function PresetManagementModal({
  isOpen,
  preferences,
  onClose,
  onUpdatePreferences,
}: PresetManagementModalProps) {
  const [activeTab, setActiveTab] = useState<"all" | "save-new" | "templates">("all");
  const [newPresetName, setNewPresetName] = useState("");
  const [newPresetDescription, setNewPresetDescription] = useState("");
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [duplicatingPresetId, setDuplicatingPresetId] = useState<string | null>(null);
  const [duplicateValue, setDuplicateValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmOverwriteId, setConfirmOverwriteId] = useState<string | null>(null);
  const [practiceTemplates, setPracticeTemplates] = useState<PracticeTemplate[]>([]);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchPracticeTemplates().then((state) => {
      setPracticeTemplates(state.templates.filter((t) => !t.builtIn));
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (confirmDeleteId || confirmOverwriteId || editingPresetId || duplicatingPresetId) {
          setConfirmDeleteId(null);
          setConfirmOverwriteId(null);
          setEditingPresetId(null);
          setDuplicatingPresetId(null);
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, confirmDeleteId, confirmOverwriteId, editingPresetId, duplicatingPresetId, onClose]);

  if (!isOpen) return null;

  const isModified = isPresetModified(preferences);
  const activeId = preferences.activePresetId;
  const activePreset = builtInPresets[activeId] || preferences.namedPresets[activeId];
  const activeName = activePreset?.name || activeId;
  const isBuiltInActive = Boolean(builtInPresets[activeId]);

  function showFeedback(msg: string) {
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(null), 3000);
  }

  function handleSaveNewPreset(e: React.FormEvent) {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    const updated = createNamedPreset(
      newPresetName.trim(),
      preferences,
      newPresetDescription.trim(),
    );
    onUpdatePreferences(updated);
    setNewPresetName("");
    setNewPresetDescription("");
    setActiveTab("all");
    showFeedback(`Saved new preset “${newPresetName.trim()}”`);
  }

  function handleApply(id: string) {
    const updated = applyPreset(id, preferences);
    onUpdatePreferences(updated);
    showFeedback(`Switched layout to “${builtInPresets[id]?.name || preferences.namedPresets[id]?.name || id}”`);
  }

  function handleRevert() {
    const updated = revertToActivePreset(preferences);
    onUpdatePreferences(updated);
    showFeedback(`Reverted layout back to saved “${activeName}” settings`);
  }

  function handleConfirmOverwrite(id: string) {
    try {
      const updated = updateNamedPreset(id, preferences);
      onUpdatePreferences(updated);
      setConfirmOverwriteId(null);
      showFeedback(`Updated saved preset “${preferences.namedPresets[id]?.name || id}”`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update preset";
      showFeedback(msg);
      setConfirmOverwriteId(null);
    }
  }

  function handleConfirmDelete(id: string) {
    try {
      const updated = deleteNamedPreset(id, preferences);
      onUpdatePreferences(updated);
      setConfirmDeleteId(null);
      showFeedback("Preset deleted");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete preset";
      showFeedback(msg);
      setConfirmDeleteId(null);
    }
  }

  function handleRename(id: string) {
    if (!renameValue.trim()) return;
    try {
      const updated = renameNamedPreset(id, renameValue.trim(), preferences);
      onUpdatePreferences(updated);
      setEditingPresetId(null);
      setRenameValue("");
      showFeedback(`Renamed preset to “${renameValue.trim()}”`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to rename preset";
      showFeedback(msg);
    }
  }

  function handleDuplicate(id: string) {
    if (!duplicateValue.trim()) return;
    try {
      const updated = duplicateNamedPreset(id, duplicateValue.trim(), preferences);
      onUpdatePreferences(updated);
      setDuplicatingPresetId(null);
      setDuplicateValue("");
      showFeedback(`Duplicated preset as “${duplicateValue.trim()}”`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to duplicate preset";
      showFeedback(msg);
    }
  }

  function handleAdoptTemplate(template: PracticeTemplate) {
    const updated = adoptPracticeTemplate(template, preferences);
    onUpdatePreferences(updated);
    showFeedback(`Adopted “${template.name}” into your personal presets`);
  }

  const customPresetList = Object.values(preferences.namedPresets);

  return (
    <div className="preset-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preset-modal-title">
      <div className="preset-modal-card">
        {/* Modal Header */}
        <div className="preset-modal-header">
          <div className="preset-modal-title-group">
            <Icon name="dashboard_customize" size="md" className="preset-title-icon" />
            <div>
              <h2 id="preset-modal-title" className="preset-modal-title">Workspace Presets & Layouts</h2>
              <p className="preset-modal-subtitle">
                Active: <strong>{activeName}</strong>
                {isModified && <span className="preset-modified-tag"> (Modified)</span>}
              </p>
            </div>
          </div>
          <button type="button" className="preset-modal-close" onClick={onClose} aria-label="Close presets modal">
            <Icon name="close" size="sm" />
          </button>
        </div>

        {/* Feedback banner */}
        {statusFeedback && (
          <div className="preset-modal-feedback" role="status">
            <Icon name="info" size="sm" />
            <span>{statusFeedback}</span>
          </div>
        )}

        {/* Modal Tabs */}
        <div className="preset-modal-tabs">
          <button
            type="button"
            className={`preset-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            My Presets ({3 + customPresetList.length})
          </button>
          <button
            type="button"
            className={`preset-tab-btn ${activeTab === "save-new" ? "active" : ""}`}
            onClick={() => setActiveTab("save-new")}
          >
            Save Working Layout as New...
          </button>
          {practiceTemplates.length > 0 && (
            <button
              type="button"
              className={`preset-tab-btn ${activeTab === "templates" ? "active" : ""}`}
              onClick={() => setActiveTab("templates")}
            >
              Practice Templates ({practiceTemplates.length})
            </button>
          )}
        </div>

        {/* Tab 1: All Presets List */}
        {activeTab === "all" && (
          <div className="preset-modal-body">
            {isModified && (
              <div className="preset-modified-callout">
                <div className="preset-callout-text">
                  <Icon name="edit_note" size="sm" />
                  <span>Your current working layout has unsaved modifications relative to <strong>{activeName}</strong>.</span>
                </div>
                <div className="preset-callout-actions">
                  <Button variant="tertiary" size="sm" onClick={handleRevert}>
                    Revert Changes
                  </Button>
                  {!isBuiltInActive && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmOverwriteId(activeId)}
                    >
                      Update “{activeName}”
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={() => setActiveTab("save-new")}>
                    Save as New Preset
                  </Button>
                </div>
              </div>
            )}

            <div className="preset-section">
              <h3 className="preset-section-heading">Built-in Layouts</h3>
              <div className="preset-grid">
                {Object.values(builtInPresets).map((preset) => {
                  const isActive = preferences.activePresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className={`preset-item-card ${isActive ? "active" : ""}`}
                    >
                      <div className="preset-item-header">
                        <span className="preset-badge built-in">Built-in</span>
                        {isActive && <span className="preset-badge active">Active</span>}
                      </div>
                      <div className="preset-item-title">{preset.name}</div>
                      <div className="preset-item-desc">{preset.description}</div>
                      <div className="preset-item-footer">
                        {isActive ? (
                          <span className="preset-active-label">Currently Active</span>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => handleApply(preset.id)}>
                            Apply Layout
                          </Button>
                        )}
                        <button
                          type="button"
                          className="preset-icon-btn"
                          title="Duplicate as personal preset"
                          onClick={() => {
                            setDuplicatingPresetId(preset.id);
                            setDuplicateValue(`${preset.name} (Custom)`);
                          }}
                        >
                          <Icon name="content_copy" size="sm" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {customPresetList.length > 0 && (
              <div className="preset-section">
                <h3 className="preset-section-heading">Personal Saved Presets</h3>
                <div className="preset-grid">
                  {customPresetList.map((preset) => {
                    const isActive = preferences.activePresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`preset-item-card ${isActive ? "active" : ""}`}
                      >
                        <div className="preset-item-header">
                          <span className="preset-badge personal">
                            {preset.isPracticeTemplate ? "Adopted Template" : "Personal"}
                          </span>
                          {isActive && <span className="preset-badge active">Active</span>}
                        </div>
                        <div className="preset-item-title">{preset.name}</div>
                        {preset.description && (
                          <div className="preset-item-desc">{preset.description}</div>
                        )}
                        <div className="preset-item-footer">
                          {isActive ? (
                            <span className="preset-active-label">Currently Active</span>
                          ) : (
                            <Button variant="secondary" size="sm" onClick={() => handleApply(preset.id)}>
                              Apply Layout
                            </Button>
                          )}
                          <div className="preset-actions-cluster">
                            <button
                              type="button"
                              className="preset-icon-btn"
                              title="Update preset with current layout"
                              onClick={() => setConfirmOverwriteId(preset.id)}
                            >
                              <Icon name="save" size="sm" />
                            </button>
                            <button
                              type="button"
                              className="preset-icon-btn"
                              title="Duplicate preset"
                              onClick={() => {
                                setDuplicatingPresetId(preset.id);
                                setDuplicateValue(`${preset.name} Copy`);
                              }}
                            >
                              <Icon name="content_copy" size="sm" />
                            </button>
                            <button
                              type="button"
                              className="preset-icon-btn"
                              title="Rename preset"
                              onClick={() => {
                                setEditingPresetId(preset.id);
                                setRenameValue(preset.name);
                              }}
                            >
                              <Icon name="edit" size="sm" />
                            </button>
                            <button
                              type="button"
                              className="preset-icon-btn danger"
                              title="Delete preset"
                              onClick={() => setConfirmDeleteId(preset.id)}
                            >
                              <Icon name="delete" size="sm" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Save as New Preset Form */}
        {activeTab === "save-new" && (
          <form className="preset-modal-body" onSubmit={handleSaveNewPreset}>
            <p className="preset-form-notice">
              This will capture your current working layout (visible widgets, roster fields, columns, order, and densities) into an independent personal named preset.
            </p>
            <div className="form-group">
              <label htmlFor="new-preset-name" className="form-label">
                Preset Name <span className="required-star">*</span>
              </label>
              <input
                id="new-preset-name"
                type="text"
                className="form-input"
                placeholder="e.g. Afternoon Psychopharm Focus"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-preset-desc" className="form-label">
                Description (optional)
              </label>
              <textarea
                id="new-preset-desc"
                className="form-textarea"
                rows={2}
                placeholder="Brief summary of what this layout is optimized for..."
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
              />
            </div>
            <div className="preset-form-actions">
              <Button variant="tertiary" type="button" onClick={() => setActiveTab("all")}>
                Cancel
              </Button>
              {newPresetName.trim() ? (
                <Button variant="primary" type="submit">
                  Save Preset
                </Button>
              ) : (
                <Button variant="primary" type="submit" disabled disabledReason="Enter a preset name first">
                  Save Preset
                </Button>
              )}
            </div>
          </form>
        )}

        {/* Tab 3: Practice Templates */}
        {activeTab === "templates" && (
          <div className="preset-modal-body">
            <p className="preset-form-notice">
              Practice templates are shared organization layouts. Adopting one creates an independent copy in your personal presets. If practice templates are later updated or deleted, your personal layout is never modified.
            </p>
            <div className="preset-grid">
              {practiceTemplates.map((template) => (
                <div key={template.id} className="preset-item-card">
                  <div className="preset-item-header">
                    <span className="preset-badge template">Practice Template</span>
                    {template.appliesToRole && (
                      <span className="preset-role-pill">{template.appliesToRole}</span>
                    )}
                  </div>
                  <div className="preset-item-title">{template.name}</div>
                  <div className="preset-item-desc">{template.description}</div>
                  <div className="preset-item-footer">
                    <Button variant="primary" size="sm" onClick={() => handleAdoptTemplate(template)}>
                      Adopt Template
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-modal: Overwrite Confirmation */}
        {confirmOverwriteId && (
          <div className="sub-modal-backdrop" role="alertdialog">
            <div className="sub-modal-card">
              <div className="sub-modal-header">
                <Icon name="warning" size="md" className="sub-modal-icon-warning" />
                <h3>Update Preset Confirmation</h3>
              </div>
              <p>
                Are you sure you want to overwrite <strong>{preferences.namedPresets[confirmOverwriteId]?.name || confirmOverwriteId}</strong> with your current working layout?
              </p>
              <div className="sub-modal-actions">
                <Button variant="tertiary" onClick={() => setConfirmOverwriteId(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => handleConfirmOverwrite(confirmOverwriteId)}>
                  Confirm Update
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Delete Confirmation */}
        {confirmDeleteId && (
          <div className="sub-modal-backdrop" role="alertdialog">
            <div className="sub-modal-card">
              <div className="sub-modal-header">
                <Icon name="delete" size="md" className="sub-modal-icon-danger" />
                <h3>Delete Preset Confirmation</h3>
              </div>
              <p>
                Are you sure you want to permanently delete <strong>{preferences.namedPresets[confirmDeleteId]?.name || confirmDeleteId}</strong>?
              </p>
              <div className="sub-modal-actions">
                <Button variant="tertiary" onClick={() => setConfirmDeleteId(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => handleConfirmDelete(confirmDeleteId)}>
                  Delete Preset
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Rename Form */}
        {editingPresetId && (
          <div className="sub-modal-backdrop" role="dialog">
            <div className="sub-modal-card">
              <h3>Rename Preset</h3>
              <div className="form-group" style={{ marginTop: "1rem" }}>
                <input
                  type="text"
                  className="form-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="sub-modal-actions">
                <Button variant="tertiary" onClick={() => setEditingPresetId(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => handleRename(editingPresetId)}>
                  Save Name
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-modal: Duplicate Form */}
        {duplicatingPresetId && (
          <div className="sub-modal-backdrop" role="dialog">
            <div className="sub-modal-card">
              <h3>Duplicate Preset</h3>
              <div className="form-group" style={{ marginTop: "1rem" }}>
                <input
                  type="text"
                  className="form-input"
                  value={duplicateValue}
                  onChange={(e) => setDuplicateValue(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="sub-modal-actions">
                <Button variant="tertiary" onClick={() => setDuplicatingPresetId(null)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => handleDuplicate(duplicatingPresetId)}>
                  Duplicate
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
