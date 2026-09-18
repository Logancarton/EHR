"use client";

import { useEffect, useRef } from "react";
import Icon from "./Icon";
import { type WorkspaceTool, type RailSideKey } from "../../lib/workspace-tools";

type RailContextMenuProps = {
  x: number;
  y: number;
  tool: WorkspaceTool;
  side: RailSideKey;
  canMoveToOpposite: boolean;
  onUnpin: () => void;
  onMoveToOpposite?: () => void;
  onOpen?: () => void;
  onClose: () => void;
};

export default function RailContextMenu({
  x,
  y,
  tool,
  side,
  canMoveToOpposite,
  onUnpin,
  onMoveToOpposite,
  onOpen,
  onClose,
}: RailContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // A keyboard user opening this menu should land inside it, not need to Tab
    // to it from wherever focus already was.
    menuRef.current?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust coordinates if menu overflows window edge
  const menuWidth = 220;
  const menuHeight = 160;
  const safeX = typeof window !== "undefined" ? Math.min(x, window.innerWidth - menuWidth - 12) : x;
  const safeY = typeof window !== "undefined" ? Math.min(y, window.innerHeight - menuHeight - 12) : y;

  const currentRailName = side === "left" ? "Sidebar" : "Companion Rail";
  const oppositeRailName = side === "left" ? "Right Rail" : "Left Sidebar";

  return (
    <div
      ref={menuRef}
      className="rail-context-menu"
      style={{ top: `${safeY}px`, left: `${safeX}px` }}
      role="menu"
      aria-label={`${tool.label} options`}
      // Not in the tab order (menuitem buttons already are); focused
      // programmatically on open so keyboard users land inside the menu.
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="rail-context-menu-header">
        <Icon name={tool.icon} size="sm" />
        <strong>{tool.label}</strong>
      </div>

      <div className="rail-context-menu-items">
        <button
          type="button"
          className="rail-context-menu-item danger"
          role="menuitem"
          onClick={() => {
            onUnpin();
            onClose();
          }}
        >
          <Icon name="close" size="sm" />
          <span>Unpin from {currentRailName}</span>
        </button>

        {canMoveToOpposite && onMoveToOpposite && (
          <button
            type="button"
            className="rail-context-menu-item"
            role="menuitem"
            onClick={() => {
              onMoveToOpposite();
              onClose();
            }}
          >
            <Icon name="swap_horiz" size="sm" />
            <span>Pin to {oppositeRailName}</span>
          </button>
        )}

        {onOpen && (
          <button
            type="button"
            className="rail-context-menu-item"
            role="menuitem"
            onClick={() => {
              onOpen();
              onClose();
            }}
          >
            <Icon name="open_in_new" size="sm" />
            <span>Open {tool.label}</span>
          </button>
        )}
      </div>
    </div>
  );
}
