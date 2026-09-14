"use client";

import { useEffect, useRef, useState } from "react";
import Button from "../ui/Button";
import Icon from "../ui/Icon";
import {
  DEFAULT_ROSTER_FIELDS,
  ROSTER_FIELDS,
  type RosterFieldId,
  filterRosterFieldsByCapabilities,
  sanitizeRosterFields,
} from "../../domain/roster-fields";
import { useAuthSession } from "../auth/AuthSessionGate";

export interface RosterFieldChooserProps {
  selectedFields: readonly RosterFieldId[];
  onChange: (fields: RosterFieldId[]) => void;
}

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
            <span>Roster Columns</span>
            <button
              type="button"
              className="field-chooser-reset"
              onClick={handleReset}
              title="Reset columns to recommended defaults"
            >
              Reset defaults
            </button>
          </div>

          <ul className="field-chooser-list">
            {availableFields.map((field) => {
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
        </div>
      )}
    </div>
  );
}
