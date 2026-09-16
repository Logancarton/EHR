/** Floating windows and snaps share the visible canvas, below every row of chrome. */
export function workspaceBounds() {
  const rect = document.querySelector<HTMLElement>(".workspace-body")?.getBoundingClientRect();
  if (rect && rect.width > 0 && rect.height > 0) {
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
  }
  // During hydration the canvas may not exist yet. Use the measured tab edge,
  // never a historical header/sidebar size, and fit again once the shell is ready.
  const top = document.querySelector(".browser-tabs")?.getBoundingClientRect().bottom ?? 0;
  return { left: 0, top, right: window.innerWidth, bottom: window.innerHeight,
    width: window.innerWidth, height: Math.max(0, window.innerHeight - top) };
}
