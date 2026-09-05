"use client";

import { type Section, sections } from "../../domain/patient";

export default function SectionTabs({
  value,
  onChange,
  compact = false,
}: {
  value: Section;
  onChange: (section: Section) => void;
  compact?: boolean;
}) {
  return (
    <nav className={`section-tabs ${compact ? "compact-section-tabs" : ""}`}>
      {sections.map((item) => (
        <button
          key={item}
          type="button"
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}
