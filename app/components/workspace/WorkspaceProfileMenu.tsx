"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { type ProviderPreferences } from "../../lib/preference-engine";
import {
  type PracticeTemplate,
  type PracticeTemplateState,
} from "../../lib/workspace-templates";
import {
  WORKSPACE_NAVIGATION_MENU_OPEN_EVENT,
  dispatchWorkspaceEvent,
  subscribeWorkspaceEvent,
} from "../../lib/workspace-events";

type WorkspaceProfileMenuProps = {
  settingsTrigger?: boolean;
  preferences: ProviderPreferences;
  practice: PracticeTemplateState;
  onApplyTemplate: (template: PracticeTemplate) => void;
  onSaveFavorite: (name: string) => void;
  onDeleteFavorite: (id: string) => void;
  onApplyFavorite: (id: string) => void;
  onOpenCustomizer?: () => void;
  onOpenClinicalMonitoring?: () => void;
  onResetDefaults?: () => void;
  /** Only supplied when the actor may edit the practice's defaults. */
  onSavePracticeDefault?: (name: string) => void;
  onDeletePracticeDefault?: (id: string) => void;
};

const MENU_WIDTH = 304;

/**
 * Workspace layout customization and saved personal arrangements.
 */
export default function WorkspaceProfileMenu({
  settingsTrigger = false,
  preferences,
  practice,
  onApplyTemplate,
  onSaveFavorite,
  onDeleteFavorite,
  onApplyFavorite,
  onOpenCustomizer,
  onOpenClinicalMonitoring,
  onResetDefaults,
  onSavePracticeDefault,
  onDeletePracticeDefault,
}: WorkspaceProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [naming, setNaming] = useState<"favorite" | "practice" | null>(null);
  const [draftName, setDraftName] = useState("");
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const favorites = Object.entries(preferences.customPresets ?? {});
  const activeId = preferences.activePresetId;
  const customPracticeTemplates = practice.usingBuiltIns ? [] : practice.templates;
  const activeLabel = preferences.customPresets?.[activeId]
    ? favoriteName(activeId)
    : "Customize Layout";

  function favoriteName(id: string) {
    const middle = id.replace(/^custom-/, "").replace(/-\d+$/, "");
    return middle ? middle.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Saved layout";
  }

  function placeMenu() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(
      Math.max(8, rect.right - MENU_WIDTH),
      Math.max(8, window.innerWidth - MENU_WIDTH - 8),
    );
    setPosition({ top: rect.bottom + 8, left });
  }

  useEffect(() => {
    return subscribeWorkspaceEvent(WORKSPACE_NAVIGATION_MENU_OPEN_EVENT, (detail) => {
      if (detail?.id !== "workspace") {
        setOpen(false);
        setNaming(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setNaming(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        setOpen(false);
        setNaming(null);
        anchorRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open]);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  function commitName() {
    const name = draftName.trim();
    if (!name) return;
    if (naming === "practice") onSavePracticeDefault?.(name);
    else onSaveFavorite(name);
    setDraftName("");
    setNaming(null);
    setOpen(false);
  }

  return (
    <div className="profile-menu-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`${settingsTrigger ? "icon-button" : "profile-menu-btn"} ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label={settingsTrigger ? "Preferences" : "Customize workspace layout"}
        title={settingsTrigger ? "Preferences" : "Customize workspace layout"}
        onClick={() => {
          dispatchWorkspaceEvent(WORKSPACE_NAVIGATION_MENU_OPEN_EVENT, { id: "workspace" });
          placeMenu();
          setOpen((value) => !value);
        }}
      >
        <Icon name={settingsTrigger ? "settings" : "tune"} size="sm" />
        {!settingsTrigger && <span>{activeLabel}</span>}
        {!settingsTrigger && <Icon name="expand_more" size="sm" />}
      </button>

      {open && (
        <div
          className="profile-menu"
          role="region"
          aria-label="Workspace options"
          style={position ? { top: position.top, left: position.left } : undefined}
        >
          <div className="profile-menu-group profile-menu-primary">
            <div className="profile-menu-intro">
              <strong>Preferences</strong>
              <span>Workspace layout and clinical attention rules.</span>
            </div>
            {onOpenCustomizer && (
              <div className="profile-menu-item">
                <button
                  type="button"
                  className="profile-menu-pick"
                  onClick={() => {
                    setOpen(false);
                    onOpenCustomizer();
                  }}
                >
                  <Icon name="tune" />
                  <span>
                    <strong>Customize layout</strong>
                    <small>Widgets, cards, metrics &amp; density</small>
                  </span>
                </button>
              </div>
            )}
            {onOpenClinicalMonitoring && (
              <div className="profile-menu-item">
                <button
                  type="button"
                  className="profile-menu-pick"
                  onClick={() => {
                    setOpen(false);
                    onOpenClinicalMonitoring();
                  }}
                >
                  <Icon name="monitor_heart" />
                  <span>
                    <strong>Clinical monitoring</strong>
                    <small>Medication lab &amp; vital attention intervals</small>
                  </span>
                </button>
              </div>
            )}
            {onResetDefaults && (
              <div className="profile-menu-item">
                <button
                  type="button"
                  className="profile-menu-pick"
                  onClick={() => {
                    setOpen(false);
                    onResetDefaults();
                  }}
                >
                  <Icon name="restart_alt" />
                  <span>
                    <strong>Reset layout</strong>
                    <small>Restore the default workspace</small>
                  </span>
                </button>
              </div>
            )}
          </div>

          {customPracticeTemplates.length > 0 && (
            <div className="profile-menu-group">
              <span className="profile-menu-head">Practice layouts</span>
              {customPracticeTemplates.map((template) => (
                <div
                  key={template.id}
                  className={`profile-menu-item ${activeId === template.id ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="profile-menu-pick"
                    onClick={() => {
                      onApplyTemplate(template);
                      setOpen(false);
                    }}
                  >
                    <Icon name={template.icon} />
                    <span>
                      <strong>{template.name}</strong>
                      <small>{template.description || "Practice layout"}</small>
                    </span>
                  </button>
                  {activeId === template.id && <Icon name="check" size="sm" />}
                  {practice.canEdit && !template.builtIn && onDeletePracticeDefault && (
                    <button
                      type="button"
                      className="profile-menu-delete"
                      aria-label={`Delete practice layout ${template.name}`}
                      title="Delete this practice default"
                      onClick={() => onDeletePracticeDefault(template.id)}
                    >
                      <Icon name="delete" size="sm" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="profile-menu-group">
            <span className="profile-menu-head">Saved layouts</span>
            {favorites.length === 0 && (
              <p className="profile-menu-empty">No saved layouts yet.</p>
            )}
            {favorites.map(([id]) => (
              <div key={id} className={`profile-menu-item ${activeId === id ? "active" : ""}`}>
                <button
                  type="button"
                  className="profile-menu-pick"
                  onClick={() => {
                    onApplyFavorite(id);
                    setOpen(false);
                  }}
                >
                  <Icon name="bookmark" />
                  <span>
                    <strong>{favoriteName(id)}</strong>
                    <small>Your saved layout</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="profile-menu-delete"
                  aria-label={`Delete ${favoriteName(id)}`}
                  title="Delete this layout"
                  onClick={() => onDeleteFavorite(id)}
                >
                  <Icon name="delete" size="sm" />
                </button>
              </div>
            ))}

            {naming ? (
              <div className="profile-menu-namer">
                <input
                  ref={inputRef}
                  value={draftName}
                  maxLength={40}
                  placeholder={naming === "practice" ? "Name this practice default" : "Name this layout"}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitName();
                    if (event.key === "Escape") setNaming(null);
                  }}
                />
                <button type="button" disabled={!draftName.trim()} onClick={commitName}>
                  Save
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="profile-menu-save"
                onClick={() => setNaming("favorite")}
              >
                <Icon name="add" size="sm" />
                Save current layout
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
