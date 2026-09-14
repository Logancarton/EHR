"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../ui/Icon";
import {
  COCKPIT_METRICS,
  type CockpitMetricId,
  moveCockpitMetric,
  toggleCockpitMetric,
} from "../../lib/cockpit-metrics";
import { placeViewportMenu, type MenuPlacement } from "../../lib/viewport-menu";

type CockpitMenuProps = {
  tiles: CockpitMetricId[];
  onChange: (next: CockpitMetricId[]) => void;
};

const MENU_WIDTH = 312;

/**
 * Builds the daily metrics: which counters are displayed, in what order.
 */
export default function CockpitMenu({ tiles, onChange }: CockpitMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPlacement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  /**
   * The dashboard is nested inside several scroll panes, every one of which
   * would clip an absolutely-positioned dropdown. The menu is therefore fixed
   * to the viewport and placed from the button's measured position.
   *
   * Fixed positioning is also why the height has to be measured rather than
   * capped: this menu used a `max-height` against the whole viewport, so opened
   * from a button low on the page it ran past the bottom edge and its last
   * counters could not be reached at all. `placeViewportMenu` caps it against
   * the room actually below the button, and flips it above when there is none.
   */
  function placeMenu() {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(
      placeViewportMenu({
        anchor: rect,
        menuWidth: MENU_WIDTH,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    );
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
        aria-label="Choose metric counters"
        title="Choose which counters to show"
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
          data-menu-side={position?.side}
          style={
            position
              ? { top: position.top, left: position.left, maxHeight: position.maxHeight }
              : undefined
          }
        >
          <div className="cockpit-menu-head">
            <strong>Daily Metric Counters</strong>
            <small>Pick and order the counters worth your attention.</small>
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
