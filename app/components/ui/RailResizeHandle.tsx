"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type RailGeometry,
  type RailSide,
  isRailRevealed,
  railWidthForKey,
  settleRailWidth,
  storeRailWidth,
  widthFromPointer,
} from "../../lib/rail-resize";

type RailResizeHandleProps = {
  side: RailSide;
  width: number;
  geometry: RailGeometry;
  onWidth: (width: number) => void;
  label: string;
};

/**
 * The grab strip on a rail's inner edge.
 *
 * Pointer capture is what makes the drag survive leaving the handle: without it
 * the pointer outruns a 6px strip on the first fast drag and the rail sticks
 * mid-resize. Width is reported continuously so the rail grows under the
 * cursor, and only settled (snapped and persisted) when the drag ends.
 */
export default function RailResizeHandle({
  side,
  width,
  geometry,
  onWidth,
  label,
}: RailResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is an optimisation, not a requirement — without it the drag
      // still tracks while the pointer stays over the handle.
    }
    setDragging(true);
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      onWidth(widthFromPointer(side, event.clientX, window.innerWidth, geometry));
    },
    [dragging, geometry, onWidth, side],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Nothing to release.
      }
      setDragging(false);
      const settled = settleRailWidth(widthRef.current, geometry);
      onWidth(settled);
      storeRailWidth(side, settled);
    },
    [dragging, geometry, onWidth, side],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const next = railWidthForKey(event.key, side, widthRef.current, geometry);
      if (next === null) return;
      event.preventDefault();
      onWidth(next);
      storeRailWidth(side, next);
    },
    [geometry, onWidth, side],
  );

  // While dragging, the whole document gets the resize cursor and stops
  // selecting text — otherwise the pointer leaves the handle and the cursor
  // flickers back to a caret over every paragraph it crosses.
  useEffect(() => {
    if (!dragging) return;
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [dragging]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={geometry.min}
      aria-valuemax={geometry.max}
      tabIndex={0}
      className={`rail-resize-handle rail-resize-${side} ${dragging ? "dragging" : ""} ${
        isRailRevealed(width, geometry) ? "revealed" : ""
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => {
        const next = width > geometry.min ? geometry.min : geometry.revealAt;
        onWidth(next);
        storeRailWidth(side, next);
      }}
    >
      <span className="rail-resize-grip" aria-hidden="true" />
    </div>
  );
}
