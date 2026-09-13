"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CompanionResizeHandleProps {
  width: number;
  onWidthChange: (newWidth: number) => void;
  onClose?: () => void;
  minWidth?: number;
  maxWidth?: number;
  collapseThreshold?: number;
}

export const COMPANION_DEFAULT_WIDTH = 380;
export const COMPANION_WIDE_WIDTH = 560;
export const COMPANION_MIN_WIDTH = 260;
export const COMPANION_COLLAPSE_THRESHOLD = 200;
export const COMPANION_STORAGE_KEY = "ehr-companion-panel-width-v1";

export function readStoredCompanionWidth(): number {
  if (typeof window === "undefined") return COMPANION_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(COMPANION_STORAGE_KEY);
    if (!raw) return COMPANION_DEFAULT_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= COMPANION_MIN_WIDTH ? parsed : COMPANION_DEFAULT_WIDTH;
  } catch {
    return COMPANION_DEFAULT_WIDTH;
  }
}

export function storeCompanionWidth(w: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COMPANION_STORAGE_KEY, String(Math.round(w)));
  } catch {
    // Ignore storage quota / security errors
  }
}

export default function CompanionResizeHandle({
  width,
  onWidthChange,
  onClose,
  minWidth = COMPANION_MIN_WIDTH,
  maxWidth = 840,
  collapseThreshold = COMPANION_COLLAPSE_THRESHOLD,
}: CompanionResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startW: number; lastW: number }>({
    startX: 0,
    startW: width,
    lastW: width,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Fallback if capture not available
      }

      dragRef.current = {
        startX: e.clientX,
        startW: width,
        lastW: width,
      };
      setDragging(true);
      document.body.classList.add("resizing-companion");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();

      const deltaX = dragRef.current.startX - e.clientX; // Dragging left increases width
      const maxAllowed = Math.min(maxWidth, window.innerWidth - 80);
      const rawW = dragRef.current.startW + deltaX;

      dragRef.current.lastW = rawW;

      if (rawW >= minWidth) {
        const clamped = Math.min(maxAllowed, rawW);
        onWidthChange(clamped);
      }
    },
    [dragging, maxWidth, minWidth, onWidthChange],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();

      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }

      setDragging(false);
      document.body.classList.remove("resizing-companion");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";

      const finalW = dragRef.current.lastW;
      if (finalW < collapseThreshold) {
        onClose?.();
      } else {
        const maxAllowed = Math.min(maxWidth, window.innerWidth - 80);
        const settled = Math.min(maxAllowed, Math.max(minWidth, Math.round(finalW)));
        onWidthChange(settled);
        storeCompanionWidth(settled);
      }
    },
    [collapseThreshold, dragging, maxWidth, minWidth, onClose, onWidthChange],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const next = width > 460 ? COMPANION_DEFAULT_WIDTH : COMPANION_WIDE_WIDTH;
      const maxAllowed = Math.min(maxWidth, window.innerWidth - 80);
      const settled = Math.min(maxAllowed, next);
      onWidthChange(settled);
      storeCompanionWidth(settled);
    },
    [maxWidth, onWidthChange, width],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = 32;
      const maxAllowed = Math.min(maxWidth, window.innerWidth - 80);
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.min(maxAllowed, width + step);
        onWidthChange(next);
        storeCompanionWidth(next);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = width - step;
        if (next < collapseThreshold) {
          onClose?.();
        } else {
          const settled = Math.max(minWidth, next);
          onWidthChange(settled);
          storeCompanionWidth(settled);
        }
      } else if (e.key === "Home") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "End") {
        e.preventDefault();
        onWidthChange(maxAllowed);
        storeCompanionWidth(maxAllowed);
      }
    },
    [collapseThreshold, maxWidth, minWidth, onClose, onWidthChange, width],
  );

  useEffect(() => {
    return () => {
      document.body.classList.remove("resizing-companion");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel width"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      tabIndex={0}
      className={`companion-resize-border ${dragging ? "dragging" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      title="Drag to resize panel (double-click to toggle wide/standard)"
    >
      <span className="companion-resize-grip" aria-hidden="true" />
    </div>
  );
}
