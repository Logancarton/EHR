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

/**
 * The billing and financial-integration prototypes, moved here by P9-0.
 *
 * They were live workspace destinations carrying invented claims, invented revenue
 * and buttons that announced a clearinghouse transmission. The layout was worth
 * keeping and the framing was not, so they live behind the preview rule like any
 * other prototype: no workspace chrome, no request, no record.
 */
export const BILLING_PREVIEW_ROUTE = "/preview/billing";

export function isPreviewRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === PREVIEW_ROUTE_PREFIX || pathname.startsWith(`${PREVIEW_ROUTE_PREFIX}/`);
}
