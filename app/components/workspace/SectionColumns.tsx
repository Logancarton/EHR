"use client";

import type { ReactNode } from "react";
import { type Section, sections } from "../../domain/patient";
import Icon from "../ui/Icon";

/**
 * The chart's sections, opened sideways.
 *
 * This is the answer to the thing tabs are bad at: a clinician reading a note
 * almost always wants one other section in view — labs beside the assessment, meds
 * beside the plan — and a tab bar forces them to choose one and remember the other.
 *
 * Every section other than the one currently selected becomes a column. A column
 * header promotes that section to the whole pane, which is the gesture the tab bar
 * was standing in for all along: fan out, look, commit to one.
 *
 * Columns render their real section content, not a summary. A preview that is not
 * the thing itself is a second surface to keep correct, and in a chart that is how
 * two versions of the same clinical fact end up on screen at once.
 */

export interface SectionColumnsProps {
  /** The section the chart is on; it leads and is not repeated as a column. */
  active: Section;
  /** Promote a column to the full pane and close the fan-out. */
  onPromote: (section: Section) => void;
  onClose: () => void;
  /** Renders one section's real content. */
  renderSection: (section: Section) => ReactNode;
}

export default function SectionColumns({
  active,
  onPromote,
  onClose,
  renderSection,
}: SectionColumnsProps) {
  const others = sections.filter((item) => item !== active);

  return (
    <div className="section-columns" role="group" aria-label="Chart sections side by side">
      {/* The section the clinician was already on keeps the lead position and a
          wider column, because fanning the others out is not a decision to stop
          working on this one. */}
      <section className="section-column is-lead" aria-label={`${active} (current section)`}>
        <header className="section-column-head">
          <span className="column-title">
            <Icon name="check_circle" size="sm" filled />
            {active}
          </span>
          <button
            type="button"
            className="column-close-btn"
            onClick={onClose}
            title="Close the columns and return to one section"
            aria-label="Close the columns"
          >
            <Icon name="close_fullscreen" size="sm" />
          </button>
        </header>
        <div className="section-column-body">{renderSection(active)}</div>
      </section>

      {others.map((item) => (
        <section className="section-column" key={item} aria-label={item}>
          <header className="section-column-head">
            <button
              type="button"
              className="column-title column-promote-btn"
              onClick={() => onPromote(item)}
              title={`Open ${item} as the whole pane`}
            >
              {item}
              <Icon name="open_in_full" size="sm" />
            </button>
          </header>
          <div className="section-column-body">{renderSection(item)}</div>
        </section>
      ))}
    </div>
  );
}
