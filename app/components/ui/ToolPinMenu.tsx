"use client";

import Icon from "./Icon";
import {
  AVAILABLE_WORKSPACE_TOOLS,
  type RailSideKey,
  type ToolPins,
  isPinned,
  toolSupports,
} from "../../lib/workspace-tools";

type ToolPinMenuProps = {
  pins: ToolPins;
  onToggle: (side: RailSideKey, id: string) => void;
  /** The rail this menu was opened from. */
  origin: RailSideKey;
  onOpenTool?: (id: string, side: RailSideKey) => void;
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
  const pinnedCountLeft = pins.left.length;
  const pinnedCountRight = pins.right.length;

  return (
    <div className="tool-pin-menu">
      <div className="tool-pin-summary">
        <span>Left Sidebar: <strong>{pinnedCountLeft} pinned</strong></span>
        <span>·</span>
        <span>Right Panel: <strong>{pinnedCountRight} pinned</strong></span>
      </div>

      <div className="tool-pin-header-row">
        <span className="col-name">Tool</span>
        <div className="col-toggles-header">
          <span className={`col-side-label ${origin === "left" ? "is-origin" : ""}`}>
            Left Sidebar
          </span>
          <span className={`col-side-label ${origin === "right" ? "is-origin" : ""}`}>
            Right Rail
          </span>
        </div>
      </div>

      <div className="tool-pin-list">
        {AVAILABLE_WORKSPACE_TOOLS.map((tool) => {
          const pinnedLeft = isPinned(pins, "left", tool.id);
          const pinnedRight = isPinned(pins, "right", tool.id);
          const supportedLeft = toolSupports(tool.id, "full");
          const supportedRight = toolSupports(tool.id, "panel");
          const pinnedHere = origin === "left" ? pinnedLeft : pinnedRight;

          return (
            <div
              key={tool.id}
              className={`tool-pin-row ${pinnedHere ? "is-pinned" : ""}`}
            >
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
                {/* Left Sidebar Pin Button */}
                {supportedLeft ? (
                  <button
                    type="button"
                    className={`tool-pin-chip ${pinnedLeft ? "is-pinned" : "not-pinned"}`}
                    aria-pressed={pinnedLeft}
                    aria-label={`${pinnedLeft ? "Unpin" : "Pin"} ${tool.label} ${pinnedLeft ? "from" : "to"} Left Sidebar`}
                    title={`${pinnedLeft ? "Click to unpin from" : "Click to pin to"} Left Sidebar`}
                    onClick={() => onToggle("left", tool.id)}
                  >
                    {pinnedLeft ? (
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
                        <span>Left</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span
                    className="tool-pin-chip is-disabled"
                    title={`${tool.label} cannot open as full workspace`}
                  >
                    —
                  </span>
                )}

                {/* Right Companion Rail Pin Button */}
                {supportedRight ? (
                  <button
                    type="button"
                    className={`tool-pin-chip ${pinnedRight ? "is-pinned" : "not-pinned"}`}
                    aria-pressed={pinnedRight}
                    aria-label={`${pinnedRight ? "Unpin" : "Pin"} ${tool.label} ${pinnedRight ? "from" : "to"} Right Rail`}
                    title={`${pinnedRight ? "Click to unpin from" : "Click to pin to"} Right Rail`}
                    onClick={() => onToggle("right", tool.id)}
                  >
                    {pinnedRight ? (
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
                        <span>Right</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span
                    className="tool-pin-chip is-disabled"
                    title={`${tool.label} cannot open in right panel`}
                  >
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
