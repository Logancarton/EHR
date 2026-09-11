"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import {
  COCKPIT_METRICS,
  COCKPIT_PRESETS,
  type CockpitMetricId,
  matchingCockpitPreset,
  moveCockpitMetric,
  toggleCockpitMetric,
} from "../../lib/cockpit-metrics";

type CockpitMenuProps = {
  tiles: CockpitMetricId[];
  onChange: (next: CockpitMetricId[]) => void;
};

const MENU_WIDTH = 312;

/**
 * Builds the cockpit: which counters are on it, in what order.
 *
 * The presets are offered as starting points rather than modes — picking one
 * writes its tiles into the same editable list, so the next change is an edit
 * of your own arrangement and not a departure from a named preset.
 */
export default function CockpitMenu({ tiles, onChange }: CockpitMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const activePreset = matchingCockpitPreset(tiles);

  /**
   * The dashboard is nested inside several scroll panes, every one of which
   * would clip an absolutely-positioned dropdown. The menu is therefore fixed
   * to the viewport and placed from the button's measured position, kept a
   * margin away from both edges so it can never open off-screen.
   */
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
      if (!anchorRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    // The button moves when the dashboard scrolls or the window resizes, and a
    // viewport-fixed menu would otherwise stay behind.
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  return (
    <div className="cockpit-menu-anchor" ref={anchorRef}>
      <button
        type="button"
        className={`card-tool-btn cockpit-menu-btn ${open ? "active" : ""}`}
        aria-expanded={open}
        aria-label="Choose cockpit tiles"
        title="Choose which counters this cockpit shows"
        onClick={() => {
          placeMenu();
          setOpen((value) => !value);
        }}
      >
        <Icon name="tune" size="sm" />
      </button>

      {open && (
        <div
          className="cockpit-menu"
          style={position ? { top: position.top, left: position.left } : undefined}
        >
          <div className="cockpit-menu-head">
            <strong>Cockpit</strong>
            <small>Pick the counters worth your attention.</small>
          </div>

          <div className="cockpit-preset-row">
            {COCKPIT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`cockpit-preset ${activePreset?.id === preset.id ? "active" : ""}`}
                title={preset.description}
                onClick={() => onChange([...preset.tiles])}
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="cockpit-tile-list">
            {COCKPIT_METRICS.map((metric) => {
              const index = tiles.indexOf(metric.id);
              const shown = index >= 0;
              return (
                <div key={metric.id} className={`cockpit-tile-row ${shown ? "is-shown" : ""}`}>
                  <button
                    type="button"
                    className="cockpit-tile-toggle"
                    role="switch"
                    aria-checked={shown}
                    onClick={() => onChange(toggleCockpitMetric(tiles, metric.id))}
                  >
                    <Icon name={shown ? "check_box" : "check_box_outline_blank"} size="sm" />
                    <span>
                      <strong>{metric.label}</strong>
                      <small>{metric.hint}</small>
                    </span>
                  </button>

                  <span className="cockpit-tile-order">
                    <button
                      type="button"
                      disabled={!shown || index === 0}
                      aria-label={`Move ${metric.label} earlier`}
                      title="Move earlier"
                      onClick={() => onChange(moveCockpitMetric(tiles, metric.id, -1))}
                    >
                      <Icon name="arrow_upward" size="sm" />
                    </button>
                    <button
                      type="button"
                      disabled={!shown || index === tiles.length - 1}
                      aria-label={`Move ${metric.label} later`}
                      title="Move later"
                      onClick={() => onChange(moveCockpitMetric(tiles, metric.id, 1))}
                    >
                      <Icon name="arrow_downward" size="sm" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
