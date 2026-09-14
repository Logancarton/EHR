/**
 * Where a viewport-fixed menu goes.
 *
 * Menus on the dashboard are `position: fixed` because the surfaces they open from
 * sit inside several scroll panes, each of which would clip an absolutely-positioned
 * dropdown. Fixed positioning solves the clipping and introduces the opposite
 * problem: nothing constrains the menu to the screen any more, so a tall menu opened
 * from a button low on the page runs off the bottom and its last options simply
 * cannot be reached. A `max-height` against `100vh` does not fix that — the cap has
 * to be measured against the space actually left below the button.
 *
 * Pure arithmetic, so the rule is checkable without a browser.
 */

export type MenuAnchorRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type MenuViewport = { width: number; height: number };

export type MenuPlacement = {
  top: number;
  left: number;
  /** Cap for the menu's own height; it scrolls internally beyond this. */
  maxHeight: number;
  /** Which side of the anchor the menu opened on, for styling and for tests. */
  side: "below" | "above";
};

export function placeViewportMenu({
  anchor,
  menuWidth,
  viewport,
  gap = 8,
  margin = 8,
  minHeight = 160,
}: {
  anchor: MenuAnchorRect;
  menuWidth: number;
  viewport: MenuViewport;
  /** Space between the anchor and the menu. */
  gap?: number;
  /** Space kept clear of every viewport edge. */
  margin?: number;
  /**
   * Below this, flipping is pointless and the menu should open on whichever side
   * has more room and scroll internally.
   */
  minHeight?: number;
}): MenuPlacement {
  // Right-aligned to the anchor, then pulled inside both edges. `Math.max(margin, …)`
  // last so that a menu wider than the viewport starts at the left margin rather
  // than at a negative coordinate.
  const left = Math.max(margin, Math.min(anchor.right - menuWidth, viewport.width - menuWidth - margin));

  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;

  // Prefer below, as every menu here is a dropdown. Flip only when below cannot
  // show a usable amount and above can show more.
  const openAbove = spaceBelow < minHeight && spaceAbove > spaceBelow;

  if (openAbove) {
    const maxHeight = Math.max(0, spaceAbove);
    return { top: Math.max(margin, anchor.top - gap - maxHeight), left, maxHeight, side: "above" };
  }

  return {
    top: anchor.bottom + gap,
    // Never negative: a button already below the fold would otherwise produce a
    // menu with a nonsensical cap.
    maxHeight: Math.max(0, spaceBelow),
    left,
    side: "below",
  };
}
