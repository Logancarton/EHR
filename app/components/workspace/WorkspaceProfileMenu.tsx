"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import { type ProviderPreferences } from "../../lib/preference-engine";
import {
  BUILT_IN_TEMPLATES,
  type PracticeTemplate,
  type PracticeTemplateState,
} from "../../lib/workspace-templates";

type WorkspaceProfileMenuProps = {
  preferences: ProviderPreferences;
  practice: PracticeTemplateState;
  onApplyTemplate: (template: PracticeTemplate) => void;
  onSaveFavorite: (name: string) => void;
  onDeleteFavorite: (id: string) => void;
  onApplyFavorite: (id: string) => void;
  /** Only supplied when the actor may edit the practice's defaults. */
  onSavePracticeDefault?: (name: string) => void;
  onDeletePracticeDefault?: (id: string) => void;
};

const MENU_WIDTH = 320;

/**
 * Switches between practice defaults and the clinician's own saved layouts.
 *
 * This replaces the Zen / Balanced / Cockpit segmented control, which froze
 * three of the five built-in layouts into permanent chrome and hid the
 * save-your-own capability entirely.
 *
 * The two groups differ in who owns them. Practice defaults are read-only here:
 * a provider returns to one, but cannot edit it, so one person tidying their
 * screen can never rearrange everyone else's. Favourites are personal and fully
 * editable — saving one captures the whole layout, rails included.
 */
export default function WorkspaceProfileMenu({
  preferences,
  practice,
  onApplyTemplate,
  onSaveFavorite,
  onDeleteFavorite,
  onApplyFavorite,
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
  const templates = practice.templates.length ? practice.templates : BUILT_IN_TEMPLATES;
  const activeLabel =
    templates.find((template) => template.id === activeId)?.name ??
    (preferences.customPresets?.[activeId] ? favoriteName(activeId) : "Custom layout");

  function favoriteName(id: string) {
    // Favourites are keyed `custom-<slug>-<stamp>`; recover the words for display.
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
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setNaming(null);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setNaming(null);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
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
        className={`profile-menu-btn ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label="Switch workspace layout"
        title={`Layout: ${activeLabel}`}
        onClick={() => {
          placeMenu();
          setOpen((value) => !value);
        }}
      >
        <Icon name="dashboard_customize" size="sm" />
        <span>{activeLabel}</span>
        <Icon name="expand_more" size="sm" />
      </button>

      {open && (
        <div
          className="profile-menu"
          style={position ? { top: position.top, left: position.left } : undefined}
        >
          <div className="profile-menu-group">
            <span className="profile-menu-head">Practice defaults</span>
            <p className="profile-menu-note">
              {practice.canEdit
                ? "Set for the practice. Everyone can return to these; only you can change them."
                : "Set for the practice. Return to one any time."}
            </p>
            {templates.map((template) => (
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
                {/* A shipped fallback has no server row, so there is nothing to
                    delete until the practice saves one of its own. */}
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

            {practice.canEdit && onSavePracticeDefault && (
              <button
                type="button"
                className="profile-menu-save"
                onClick={() => setNaming("practice")}
              >
                <Icon name="add" size="sm" />
                Save current as practice default
              </button>
            )}
          </div>

          <div className="profile-menu-group">
            <span className="profile-menu-head">My layouts</span>
            {favorites.length === 0 && (
              <p className="profile-menu-note">
                Arrange the workspace how you like it, then save it here.
              </p>
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
