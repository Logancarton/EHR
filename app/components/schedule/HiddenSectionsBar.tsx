"use client";

import type { TodayWidgetId } from "../../lib/preference-engine";

/**
 * The counterweight to dismissal.
 *
 * Hiding a section used to be a one-way door in practice: the toast pointed at the
 * Layout Customizer, several clicks away, so a clinician who cleared the dashboard
 * had no obvious way back. Dismissal is only safe when restoring is visible from
 * where the dismissing happened, so anything hidden stays listed here — one line,
 * one click to bring it back, and nothing at all when nothing is hidden.
 */
export type HiddenSection = { id: TodayWidgetId; label: string };

export type HiddenSectionsBarProps = {
  hidden: readonly HiddenSection[];
  onRestore: (id: TodayWidgetId) => void;
  onRestoreAll: () => void;
};

export function HiddenSectionsBar({ hidden, onRestore, onRestoreAll }: HiddenSectionsBarProps) {
  if (hidden.length === 0) return null;

  return (
    <div className="hidden-sections-bar" aria-label="Hidden dashboard sections">
      <span className="hidden-sections-label">
        {hidden.length} hidden
      </span>
      <div className="hidden-sections-chips">
        {hidden.map((section) => (
          <button
            key={section.id}
            type="button"
            className="hidden-section-chip"
            onClick={() => onRestore(section.id)}
            title={`Show ${section.label} again`}
          >
            <span aria-hidden="true">＋</span> {section.label}
          </button>
        ))}
      </div>
      {hidden.length > 1 && (
        <button type="button" className="hidden-sections-restore-all" onClick={onRestoreAll}>
          Restore all
        </button>
      )}
    </div>
  );
}
