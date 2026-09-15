"use client";

import Icon from "./Icon";
import {
  AVAILABLE_WORKSPACE_TOOLS,
  type RailSideKey,
  type ToolPins,
  isPinned,
  surfaceForSide,
  toolSupports,
} from "../../lib/workspace-tools";

type ToolPinMenuProps = {
  pins: ToolPins;
  onToggle: (side: RailSideKey, id: string) => void;
  /** The rail this menu was opened from, and the only rail it can change. */
  origin: RailSideKey;
  onOpenTool?: (id: string, side: RailSideKey) => void;
};

const SIDE_LABEL: Record<RailSideKey, string> = {
  left: "Left Sidebar",
  right: "Right Rail",
};

const SHORT_LABEL: Record<RailSideKey, string> = {
  left: "Left",
  right: "Right",
};

/**
 * The pin list, scoped to the rail it was opened from.
 *
 * It used to render both rails' toggles in every menu — a two-column grid where
 * the left rail's menu could pin things to the right rail and vice versa. That
 * looked symmetrical and read as a control panel, but it meant the button you
 * opened had no relationship to the row you clicked: opening the left menu and
 * hitting the right-hand chip moved a tool to a rail you were not looking at.
 * A menu that belongs to a rail changes that rail.
 *
 * Moving a tool *between* rails is still possible and still explicit — it is a
 * named action on the rail item's own context menu, where one tool is selected and
 * one thing happens.
 *
 * A tool with no renderer for this rail is not listed. It was shown first as a
 * dashed em-dash chip and then as a "Right Rail only" note, and both were clutter:
 * a row whose only content is "not here" costs a line of a scrolling list to say
 * nothing you can act on. The menu lists what you can pin here.
 */
export default function ToolPinMenu({ pins, onToggle, origin, onOpenTool }: ToolPinMenuProps) {
  const opposite: RailSideKey = origin === "left" ? "right" : "left";
  const originSurface = surfaceForSide(origin);
  // What this rail can actually render. Anything else belongs to the other menu.
  const tools = AVAILABLE_WORKSPACE_TOOLS.filter((tool) => toolSupports(tool.id, originSurface));

  return (
    <div className="tool-pin-menu" data-pin-menu-origin={origin}>
      <div className="tool-pin-summary">
        <span>
          {SIDE_LABEL[origin]}: <strong>{pins[origin].length} pinned</strong>
        </span>
        <span>·</span>
        <span className="tool-pin-summary-muted">
          {SIDE_LABEL[opposite]} is pinned from its own menu
        </span>
      </div>

      <div className="tool-pin-header-row">
        <span className="col-name">Tool</span>
        <div className="col-toggles-header">
          <span className="col-side-label is-origin">{SIDE_LABEL[origin]}</span>
        </div>
      </div>

      <div className="tool-pin-list">
        {tools.map((tool) => {
          const pinnedHere = isPinned(pins, origin, tool.id);

          return (
            <div key={tool.id} className={`tool-pin-row ${pinnedHere ? "is-pinned" : ""}`}>
              <button
                type="button"
                className="tool-pin-identity"
                disabled={!pinnedHere || !onOpenTool}
                title={pinnedHere ? `Open ${tool.label}` : tool.hint}
                onClick={() => onOpenTool?.(tool.id, origin)}
              >
                <span className="tool-icon-wrap">
                  <Icon name={tool.icon} />
                </span>
                <span className="tool-text-wrap">
                  <strong>{tool.label}</strong>
                  <small>{tool.hint}</small>
                </span>
              </button>

              <div className="tool-pin-toggles">
                <button
                  type="button"
                  className={`tool-pin-chip ${pinnedHere ? "is-pinned" : "not-pinned"}`}
                  aria-pressed={pinnedHere}
                  aria-label={`${pinnedHere ? "Unpin" : "Pin"} ${tool.label} ${pinnedHere ? "from" : "to"} ${SIDE_LABEL[origin]}`}
                  title={`${pinnedHere ? "Click to unpin from" : "Click to pin to"} ${SIDE_LABEL[origin]}`}
                  onClick={() => onToggle(origin, tool.id)}
                >
                  {pinnedHere ? (
                    <>
                      <span className="chip-default">
                        <Icon name="push_pin" size="sm" filled />
                        <span>Pinned</span>
                      </span>
                      <span className="chip-hover">
                        <Icon name="close" size="sm" />
                        <span>Unpin</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Icon name="add" size="sm" />
                      <span>{SHORT_LABEL[origin]}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
