"use client";

import { useRef } from "react";
import { type Section, sections } from "../../domain/patient";

/**
 * The chart's section tabs.
 *
 * A tablist rather than a row of toggle buttons: the sections are alternative views
 * of one chart, which is what `aria-selected` means and what arrow-key navigation
 * between them assumes. The `active` class is kept because the workspace restores a
 * chart by reading which tab carries it.
 */
export default function SectionTabs({
  value,
  onChange,
  compact = false,
}: {
  value: Section;
  onChange: (section: Section) => void;
  compact?: boolean;
}) {
  const listRef = useRef<HTMLElement | null>(null);

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
    <nav
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
    </nav>
  );
}
