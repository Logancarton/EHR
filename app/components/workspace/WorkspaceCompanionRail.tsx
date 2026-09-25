"use client";

import type { RefObject } from "react";
import Icon from "../ui/Icon";
import RailResizeHandle from "../ui/RailResizeHandle";
import RailContextMenu from "../ui/RailContextMenu";
import ToolPinMenu from "../ui/ToolPinMenu";
import { RIGHT_RAIL } from "../../lib/rail-resize";
import { useWorkspaceBadgeCounts } from "../../lib/use-workspace-badges";
import {
  describeToolBadge,
  type RailSideKey,
  type ToolPins,
  type WorkspaceTool,
} from "../../lib/workspace-tools";
import type {
  CompanionContextMenuState,
  CompanionToolId,
} from "../../lib/use-companion-rail-controller";

export interface WorkspaceCompanionRailProps {
  showCompanionRail: boolean;
  addToolMenuOpen: boolean;
  setAddToolMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  companionAddRef: RefObject<HTMLDivElement | null>;
  companionRailWidth: number;
  handleCompanionWidth: (width: number) => void;
  companionTools: WorkspaceTool[];
  activeCompanionPanel: CompanionToolId | null;
  toggleCompanionPanel: (id: CompanionToolId) => void;
  companionContextMenu: CompanionContextMenuState | null;
  setCompanionContextMenu: React.Dispatch<
    React.SetStateAction<CompanionContextMenuState | null>
  >;
  pins: ToolPins;
  togglePinnedTool: (side: RailSideKey, id: string) => void;
  onHideRail: () => void;
  onShowRail: () => void;
}

/**
 * Renders the right companion rail launcher strip, add-tool menu, context menu,
 * and the reopen handle when hidden.
 */
export default function WorkspaceCompanionRail({
  showCompanionRail,
  addToolMenuOpen,
  setAddToolMenuOpen,
  companionAddRef,
  companionRailWidth,
  handleCompanionWidth,
  companionTools,
  activeCompanionPanel,
  toggleCompanionPanel,
  companionContextMenu,
  setCompanionContextMenu,
  pins,
  togglePinnedTool,
  onHideRail,
  onShowRail,
}: WorkspaceCompanionRailProps) {
  /**
   * A count follows its destination (UI-7a). Tasks kept a standing open-task count
   * in the Clinical menu, and UI-7b moved the destination here, so the count comes
   * with it rather than becoming a number nothing in the shell shows. Only the
   * surfaces that publish a count contribute a key, so this is empty for the rest.
   */
  const badgeCounts = useWorkspaceBadgeCounts();

  return (
    <>
      {showCompanionRail && (
        <aside
          className={`companion-rail ${addToolMenuOpen ? "menu-open" : ""}`}
          aria-label="Companion tools"
        >
          <RailResizeHandle
            side="right"
            width={companionRailWidth}
            geometry={RIGHT_RAIL}
            onWidth={handleCompanionWidth}
            label="Resize companion tools"
          />

          <div className="companion-rail-strip">
            {companionTools.map((tool) => {
              const pending = badgeCounts[tool.id] ?? 0;
              const badgeText = pending > 0 ? describeToolBadge(tool.id, pending) : "";
              return (
                <button
                  key={tool.id}
                  type="button"
                  data-tool-id={tool.id}
                  className={`companion-rail-btn ${activeCompanionPanel === tool.id ? "active" : ""}`}
                  aria-label={tool.label}
                  aria-describedby={badgeText ? `companion-rail-badge-${tool.id}` : undefined}
                  aria-pressed={activeCompanionPanel === tool.id}
                  onClick={() => toggleCompanionPanel(tool.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCompanionContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      tool,
                    });
                  }}
                >
                  <Icon name={tool.icon} />
                  {badgeText ? (
                    <span id={`companion-rail-badge-${tool.id}`} className="sr-only">
                      {badgeText}
                    </span>
                  ) : null}
                  {pending > 0 && (
                    <span className="companion-rail-count" aria-hidden="true">
                      {pending > 99 ? "99+" : pending}
                    </span>
                  )}
                  {/* The label appears only on hover or keyboard focus: the rail
                      stays icon-quiet, but no clinician has to memorise it. */}
                  <span className="companion-rail-tooltip" role="presentation" aria-hidden="true">
                    <strong>{tool.label}</strong>
                    {badgeText ? <span>{badgeText}</span> : null}
                  </span>
                </button>
              );
            })}

            <div className="companion-rail-divider" />

            <div className="companion-add-anchor" ref={companionAddRef}>
              <button
                type="button"
                className={`companion-rail-btn add-btn ${addToolMenuOpen ? "active" : ""}`}
                aria-label="Add a tool"
                aria-expanded={addToolMenuOpen}
                onClick={() => setAddToolMenuOpen((open) => !open)}
              >
                <Icon name="add" />
                <span className="companion-rail-tooltip" aria-hidden="true">
                  <strong>Add a tool</strong>
                </span>
              </button>

              {addToolMenuOpen && (
                <div className="companion-add-menu">
                  <div className="companion-add-heading">
                    <strong>Workspaces &amp; tools</strong>
                    <small>Pin anything to this rail.</small>
                  </div>
                  <ToolPinMenu
                    pins={pins}
                    onToggle={togglePinnedTool}
                    origin="right"
                    onOpenTool={(id) => {
                      setAddToolMenuOpen(false);
                      toggleCompanionPanel(id);
                    }}
                  />
                </div>
              )}
            </div>

            <div className="companion-rail-divider" />

            <button
              type="button"
              className="companion-rail-btn hide-rail-btn"
              aria-label="Hide companion tools"
              onClick={onHideRail}
            >
              <Icon name="chevron_right" />
              <span className="companion-rail-tooltip" aria-hidden="true">
                <strong>Hide tools</strong>
              </span>
            </button>
          </div>
        </aside>
      )}

      {!showCompanionRail && (
        <button
          type="button"
          className="companion-reopen-handle"
          title="Show companion tools"
          aria-label="Show companion tools"
          onClick={onShowRail}
        >
          ‹
        </button>
      )}

      {companionContextMenu && (
        <RailContextMenu
          x={companionContextMenu.x}
          y={companionContextMenu.y}
          tool={companionContextMenu.tool}
          side="right"
          canMoveToOpposite={false}
          onUnpin={() => {
            togglePinnedTool("right", companionContextMenu.tool.id);
            setCompanionContextMenu(null);
          }}
          onClose={() => setCompanionContextMenu(null)}
        />
      )}
    </>
  );
}
