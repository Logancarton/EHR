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
  /** The rail this menu was opened from, listed first. */
  origin: RailSideKey;
  onOpenTool?: (id: string, side: RailSideKey) => void;
};

const SIDE_LABEL: Record<RailSideKey, string> = {
  left: "Left rail",
  right: "Right rail",
};

const SIDE_EXPLAINER: Record<RailSideKey, string> = {
  left: "opens full window",
  right: "opens in the right panel",
};

/**
 * The pin list both nine-dot menus share.
 *
 * Every tool offers a pin toggle per rail, so the same tool can live on one
 * side, the other, or both, whichever menu you opened. A rail a tool has no
 * renderer for is shown as unavailable rather than hidden — otherwise the
 * asymmetry looks like a bug rather than a property of the tool.
 */
export default function ToolPinMenu({ pins, onToggle, origin, onOpenTool }: ToolPinMenuProps) {
  const sides: RailSideKey[] = origin === "left" ? ["left", "right"] : ["right", "left"];

  return (
    <div className="tool-pin-menu">
      <div className="tool-pin-legend">
        {sides.map((side) => (
          <span key={side}>
            <strong>{SIDE_LABEL[side]}</strong> {SIDE_EXPLAINER[side]}
          </span>
        ))}
      </div>

      <div className="tool-pin-list">
        {AVAILABLE_WORKSPACE_TOOLS.map((tool) => {
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
                <Icon name={tool.icon} />
                <span>
                  <strong>{tool.label}</strong>
                  <small>{tool.hint}</small>
                </span>
              </button>

              <span className="tool-pin-toggles">
                {sides.map((side) => {
                  const supported = toolSupports(tool.id, surfaceForSide(side));
                  const on = isPinned(pins, side, tool.id);
                  return (
                    <button
                      key={side}
                      type="button"
                      className={`tool-pin-toggle ${on ? "on" : ""}`}
                      disabled={!supported}
                      aria-pressed={on}
                      aria-label={`${on ? "Unpin" : "Pin"} ${tool.label} — ${SIDE_LABEL[side]}`}
                      title={
                        supported
                          ? `${on ? "Unpin from" : "Pin to"} the ${side} rail — ${SIDE_EXPLAINER[side]}`
                          : `${tool.label} has no ${side === "left" ? "full-window" : "panel"} view`
                      }
                      onClick={() => onToggle(side, tool.id)}
                    >
                      <Icon
                        name={side === "left" ? "dock_to_right" : "dock_to_left"}
                        size="sm"
                        filled={on}
                      />
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
