"use client";

import { useRef } from "react";
import { type Section, sections } from "../../domain/patient";
import Icon from "../ui/Icon";

/**
 * The chart's section tabs.
 *
 * A tablist rather than a row of toggle buttons: the sections are alternative views
 * of one chart, which is what `aria-selected` means and what arrow-key navigation
 * between them assumes. The `active` class is kept because the workspace restores a
 * chart by reading which tab carries it.
 *
 * The trailing control opens every *other* section sideways as columns, so a
 * clinician who needs labs beside the note does not have to choose between them.
 * It is deliberately not a tab: it selects no section, so it stays outside the
 * tablist's roving focus and arrow-key cycle.
 */
export default function SectionTabs({
  value,
  onChange,
  compact = false,
  columnsOpen,
  onToggleColumns,
}: {
  value: Section;
  onChange: (section: Section) => void;
  compact?: boolean;
  columnsOpen?: boolean;
  onToggleColumns?: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  /**
   * Arrow keys move between sections, Home/End jump to the ends — the behaviour a
   * clinician who does not reach for the mouse already expects from a tablist.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const offset =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    let nextIndex: number | null = null;

    if (offset !== 0) {
      const current = sections.indexOf(value);
      nextIndex = (current + offset + sections.length) % sections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = sections.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const next = sections[nextIndex];
    onChange(next);
    // Focus follows selection, or the clinician's keyboard would keep operating the
    // tab they just moved away from.
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      ?.[nextIndex]?.focus();
  }

  return (
    <div className={`section-tabs-bar ${compact ? "compact" : ""}`}>
      {/* role="tablist" fully replaces this element's semantics for assistive
          tech, and <nav> is a landmark role the tablist pattern doesn't call
          for, so it's a <div> rather than a native landmark element. Per the
          ARIA APG tablist pattern, focus belongs on the active tab via roving
          tabindex (below) rather than on the tablist container itself. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        ref={listRef}
        className={`section-tabs ${compact ? "compact-section-tabs" : ""}`}
        role="tablist"
        aria-label="Chart sections"
        onKeyDown={handleKeyDown}
      >
        {sections.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={value === item}
            // Only the selected tab is in the tab order; arrow keys move within.
            tabIndex={value === item ? 0 : -1}
            className={value === item ? "active" : ""}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {onToggleColumns && (
        <button
          type="button"
          className={`section-columns-toggle ${columnsOpen ? "is-open" : ""}`}
          aria-pressed={columnsOpen ?? false}
          onClick={onToggleColumns}
          title={
            columnsOpen
              ? "Close the columns and return to one section"
              : "Open the other sections side by side"
          }
        >
          <Icon name={columnsOpen ? "close_fullscreen" : "view_column"} size="sm" />
          <span>{columnsOpen ? "Close columns" : "Columns"}</span>
        </button>
      )}
    </div>
  );
}
