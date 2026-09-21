"use client";

import { useState } from "react";
import Icon from "../ui/Icon";
import WebsiteManagerWorkspace from "./WebsiteManagerWorkspace";
import SocialMediaWorkspace from "./SocialMediaWorkspace";

/**
 * Brand is the major workspace Website and Social Media consolidate into (D-085, UI-6).
 *
 * It is a container, not a rewrite. Each section renders the same component the old
 * `website` and `social_media` modules render, so their content, drafts, and honest
 * unconfigured-gateway notices are the originals rather than a second copy that could
 * drift from them.
 *
 * Both sections stay mounted once visited. Switching sections is a presentation change,
 * not a teardown: a half-written post or an edited practice headline is still there when
 * the clinician comes back, which is the same state contract the companion lifecycle
 * holds itself to.
 */

type BrandSection = "website" | "social";

const SECTIONS: { id: BrandSection; label: string; icon: string; hint: string }[] = [
  { id: "website", label: "Website", icon: "language", hint: "Public site & booking portal" },
  { id: "social", label: "Social media", icon: "campaign", hint: "Channels & reputation" },
];

export default function BrandWorkspace() {
  const [section, setSection] = useState<BrandSection>("website");
  const [visited, setVisited] = useState<Set<BrandSection>>(() => new Set<BrandSection>(["website"]));

  function selectSection(next: BrandSection) {
    setSection(next);
    setVisited((previous) => (previous.has(next) ? previous : new Set(previous).add(next)));
  }

  return (
    <div className="brand-workspace" data-brand-workspace="">
      <div className="brand-section-tabs" role="tablist" aria-label="Brand sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`brand-tab-${item.id}`}
            aria-selected={section === item.id}
            aria-controls={`brand-panel-${item.id}`}
            data-brand-section={item.id}
            className={`brand-section-tab ${section === item.id ? "active" : ""}`}
            onClick={() => selectSection(item.id)}
          >
            <Icon name={item.icon} size="sm" />
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>

      {SECTIONS.map((item) =>
        visited.has(item.id) ? (
          <div
            key={item.id}
            role="tabpanel"
            id={`brand-panel-${item.id}`}
            aria-labelledby={`brand-tab-${item.id}`}
            className="brand-section-panel"
            hidden={section !== item.id}
          >
            {item.id === "website" ? <WebsiteManagerWorkspace /> : <SocialMediaWorkspace />}
          </div>
        ) : null,
      )}
    </div>
  );
}
