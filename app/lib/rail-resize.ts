/**
 * Drag-to-expand geometry for the two workspace rails.
 *
 * Both rails start as a narrow strip of icons and grow continuously as the
 * clinician drags the inner edge outward. Past a reveal threshold the rail
 * stops being a strip of buttons and starts showing what is attached to it —
 * labels on the left, the live companion panel on the right.
 *
 * The arithmetic lives here rather than in the drag handler so the snapping and
 * clamping rules can be tested without a pointer, and so both rails share one
 * definition of what "collapsed" and "revealed" mean.
 */

export type RailSide = "left" | "right";

export type RailGeometry = {
  /** Narrowest useful width: icons only, the rail's resting state. */
  min: number;
  /** Width at or above which the rail reveals its attached content. */
  revealAt: number;
  /** Widest the rail may grow, so it can never swallow the note. */
  max: number;
};

/** Labels appear beside the workspace icons, Gmail-style. */
export const LEFT_RAIL: RailGeometry = { min: 76, revealAt: 168, max: 360 };

/** The active companion panel opens inline and grows with the drag. */
export const RIGHT_RAIL: RailGeometry = { min: 52, revealAt: 132, max: 640 };

/** Released within this many pixels of `min`, the rail settles back closed. */
export const COLLAPSE_SNAP = 24;

export function clampRailWidth(width: number, geometry: RailGeometry): number {
  if (!Number.isFinite(width)) return geometry.min;
  return Math.min(geometry.max, Math.max(geometry.min, Math.round(width)));
}

/**
 * Turns a pointer position into a rail width. The left rail grows with x; the
 * right rail grows as x approaches the left edge, so it is measured from the
 * viewport's right edge instead.
 */
export function widthFromPointer(
  side: RailSide,
  clientX: number,
  viewportWidth: number,
  geometry: RailGeometry,
): number {
  const raw = side === "left" ? clientX : viewportWidth - clientX;
  return clampRailWidth(raw, geometry);
}

/**
 * Applied when the drag ends. A rail nudged only a few pixels open was almost
 * certainly a mis-drag, so it settles closed rather than leaving a sliver of
 * half-revealed content.
 */
export function settleRailWidth(width: number, geometry: RailGeometry): number {
  const clamped = clampRailWidth(width, geometry);
  return clamped <= geometry.min + COLLAPSE_SNAP ? geometry.min : clamped;
}

/** Whether the rail is wide enough to show its attached content. */
export function isRailRevealed(width: number, geometry: RailGeometry): boolean {
  return clampRailWidth(width, geometry) >= geometry.revealAt;
}

/**
 * Keyboard resizing, so the rail is not drag-only. Arrow keys step; Home and
 * End jump to the extremes.
 */
export function railWidthForKey(
  key: string,
  side: RailSide,
  width: number,
  geometry: RailGeometry,
  step = 32,
): number | null {
  const outward = side === "left" ? "ArrowRight" : "ArrowLeft";
  const inward = side === "left" ? "ArrowLeft" : "ArrowRight";

  if (key === outward) return clampRailWidth(width + step, geometry);
  if (key === inward) return clampRailWidth(width - step, geometry);
  if (key === "Home") return geometry.min;
  if (key === "End") return geometry.max;
  return null;
}

const STORAGE_PREFIX = "ehr-rail-width-v1:";

export function readStoredRailWidth(side: RailSide, geometry: RailGeometry): number {
  if (typeof window === "undefined") return geometry.min;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + side);
    if (!raw) return geometry.min;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? geometry.min : clampRailWidth(parsed, geometry);
  } catch {
    return geometry.min;
  }
}

export function storeRailWidth(side: RailSide, width: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + side, String(Math.round(width)));
  } catch {
    // A rail that cannot remember its width still works; nothing to recover.
  }
}
