"use client";

import Icon from "./Icon";
import {
  AVAILABLE_WORKSPACE_TOOLS,
  type RailSideKey,
  type ToolPins,
  isPinned,
  isRequiredPatientTool,
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

/** Right companions are configurable; legacy left-menu calls render nothing (D-117). */
export default function ToolPinMenu({ pins, onToggle, origin, onOpenTool }: ToolPinMenuProps) {
  if (origin === "left") return null;
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
          {"Other workspaces are in Home and Open workspace"}
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
          const required = origin === "right" && isRequiredPatientTool(tool.id);
          const pinnedHere = required || isPinned(pins, origin, tool.id);

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
                  disabled={required}
                  aria-pressed={pinnedHere}
                  aria-label={required ? `${tool.label} is always available` : `${pinnedHere ? "Unpin" : "Pin"} ${tool.label} ${pinnedHere ? "from" : "to"} ${SIDE_LABEL[origin]}`}
                  title={required ? "Always available" : `${pinnedHere ? "Click to unpin from" : "Click to pin to"} ${SIDE_LABEL[origin]}`}
                  onClick={() => onToggle(origin, tool.id)}
                >
                  {required ? <span>Always available</span> : pinnedHere ? (
                    <>
                      <span className="chip-default">
                        <Icon name="push_pin" size="sm" filled />
                        <span>Pinned</span>
                      </span>
                      <span className="chip-hover">
                        <Icon name="keep_off" size="sm" />
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
