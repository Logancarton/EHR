/**
 * Where the repository-owned design previews live.
 *
 * A preview is a synthetic prototype for review, not a clinical surface. It renders
 * its own shell so it cannot be mistaken for a live record view, which means the
 * workspace chrome — rails, window managers, workspace restoration — must not mount
 * underneath it. `AppChrome` asks this module, and the same answer is asserted in
 * `tests/dashboard-preview-model.test.ts`, so the rule is checkable without a browser.
 */

export const PREVIEW_ROUTE_PREFIX = "/preview";

/** The DB-1 dashboard prototype. */
export const DASHBOARD_PREVIEW_ROUTE = "/preview/dashboard";

export function isPreviewRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === PREVIEW_ROUTE_PREFIX || pathname.startsWith(`${PREVIEW_ROUTE_PREFIX}/`);
}
