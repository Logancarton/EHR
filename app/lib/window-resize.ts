export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | null;

const RESIZE_HIT_AREA = 10;

// Descendants (including SVG icons) inherit the control's interaction boundary.
const CONTROL_SELECTOR = [
  "button", "input", "textarea", "select", "option", "label", "a[href]", "summary",
  "[contenteditable]:not([contenteditable='false'])", "[tabindex]",
  "[role='button']", "[role='link']", "[role='textbox']", "[role='checkbox']",
  "[role='radio']", "[role='switch']", "[role='slider']", "[role='combobox']",
  "[role='spinbutton']", "[role='listbox']", "[role='menuitem']", "[role='tab']",
].join(",");

export function isWindowControlTarget(target: Element | null, pane: HTMLElement): boolean {
  const control = target?.closest(CONTROL_SELECTOR);
  return Boolean(control && control !== pane && pane.contains(control));
}

export function resizeDirectionAtPoint(
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  controlTarget = false,
): ResizeDirection {
  if (controlTarget || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;

  const nearLeft = x - rect.left <= RESIZE_HIT_AREA;
  const nearRight = rect.right - x <= RESIZE_HIT_AREA;
  const nearTop = y - rect.top <= RESIZE_HIT_AREA;
  const nearBottom = rect.bottom - y <= RESIZE_HIT_AREA;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  return null;
}
