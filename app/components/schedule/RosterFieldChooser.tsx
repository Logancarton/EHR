"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import {
  DEFAULT_ROSTER_FIELDS,
  ROSTER_FIELDS,
  type RosterFieldCategory,
  type RosterFieldId,
  filterRosterFieldsByCapabilities,
  sanitizeRosterFields,
} from "../../domain/roster-fields";
import { useAuthSession } from "../auth/AuthSessionGate";

export interface RosterFieldChooserProps {
  selectedFields: readonly RosterFieldId[];
  onChange: (fields: RosterFieldId[]) => void;
}

const FIELD_GROUPS: readonly {
  category: RosterFieldCategory;
  label: string;
  summary: string;
}[] = [
  { category: "identity", label: "Patient", summary: "Identity and recognition" },
  { category: "scheduling", label: "Visit", summary: "Timing, type, modality, and clinician" },
  { category: "clinical", label: "Clinical", summary: "Reason, readiness, and safety" },
  { category: "operations", label: "Workflow & admin", summary: "Status, room, assignments, and coverage" },
];

export default function RosterFieldChooser({
  selectedFields,
  onChange,
}: RosterFieldChooserProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { permissions } = useAuthSession();

  const availableFields = filterRosterFieldsByCapabilities(ROSTER_FIELDS, permissions);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleToggle(fieldId: RosterFieldId) {
    const isSelected = selectedFields.includes(fieldId);
    let next: RosterFieldId[];
    if (isSelected) {
      next = selectedFields.filter((id) => id !== fieldId);
    } else {
      next = [...selectedFields, fieldId];
    }
    onChange(sanitizeRosterFields(next, permissions));
  }

  function handleReset() {
    onChange(sanitizeRosterFields(DEFAULT_ROSTER_FIELDS, permissions));
  }

  function handleShowAll() {
    onChange(sanitizeRosterFields(availableFields.map((field) => field.id), permissions));
  }

  function handleCategoryToggle(category: RosterFieldCategory) {
    const categoryFields = availableFields.filter((field) => field.category === category);
    const optionalIds = categoryFields.filter((field) => !field.permanent).map((field) => field.id);
    const allOptionalShown = optionalIds.length > 0 && optionalIds.every((id) => selectedFields.includes(id));

    const next = allOptionalShown
      ? selectedFields.filter((id) => !optionalIds.includes(id))
      : [...selectedFields, ...optionalIds];

    onChange(sanitizeRosterFields(next, permissions));
  }

  return (
    <div ref={containerRef} className="roster-field-chooser-container">
      <Button
        size="sm"
        variant="tertiary"
        icon="view_column"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Customize roster columns"
        title="Choose visible columns on the appointment roster"
        onClick={() => setOpen((prev) => !prev)}
      >
        Columns
      </Button>

      {open && (
        <div
          className="roster-field-chooser-popover"
          role="dialog"
          aria-label="Customize roster columns"
        >
          <div className="field-chooser-header">
            <div>
              <strong>Roster Columns</strong>
              <span>{selectedFields.length} shown</span>
            </div>
            <div className="field-chooser-header-actions">
              <button
                type="button"
                className="field-chooser-reset"
                onClick={handleShowAll}
                title="Show every column you are allowed to view"
              >
                Show all
              </button>
              <button
                type="button"
                className="field-chooser-reset"
                onClick={handleReset}
                title="Reset columns to recommended defaults"
              >
                Defaults
              </button>
            </div>
          </div>

          <div className="field-chooser-groups">
            {FIELD_GROUPS.map((group) => {
              const groupFields = availableFields.filter((field) => field.category === group.category);
              if (groupFields.length === 0) return null;
              const optionalFields = groupFields.filter((field) => !field.permanent);
              const allOptionalShown =
                optionalFields.length > 0 &&
                optionalFields.every((field) => selectedFields.includes(field.id));

              return (
                <section key={group.category} className="field-chooser-group">
                  <div className="field-chooser-group-head">
                    <div>
                      <strong>{group.label}</strong>
                      <span>{group.summary}</span>
                    </div>
                    {optionalFields.length > 0 && (
                      <button
                        type="button"
                        className="field-group-toggle"
                        onClick={() => handleCategoryToggle(group.category)}
                      >
                        {allOptionalShown ? "Hide optional" : "Show all"}
                      </button>
                    )}
                  </div>

                  <ul className="field-chooser-list">
                    {groupFields.map((field) => {
                      const checked = selectedFields.includes(field.id);
                      const isLocked = Boolean(field.permanent);

                      return (
                        <li key={field.id} className="field-chooser-item">
                          <label className={`field-checkbox-label ${isLocked ? "is-locked" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isLocked}
                              onChange={() => handleToggle(field.id)}
                            />
                            <span className="field-label-text">
                              {field.label}
                              {isLocked && <small className="field-locked-pill">Required</small>}
                            </span>
                          </label>
                          <span className="field-summary-text">{field.summary}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
