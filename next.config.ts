import type { NextConfig } from "next";

/**
 * The browser suite runs its own `next dev` against this same directory, very often
 * while a developer's dev server is already running. `EHR_BROWSER_SUITE` is how that
 * server says so; see playwright.config.ts, which already isolates the suite's
 * database the same way.
 */
const browserSuite = process.env.EHR_BROWSER_SUITE === "1";

const nextConfig: NextConfig = {
  // Next 16 guards against two dev servers sharing a build directory with a lock at
  // `<distDir>/dev/lock`, so a second server in the default `.next` exits before
  // Playwright can reach it. CI leaves the variable unset and builds into `.next`.
  distDir: browserSuite ? ".next-playwright" : ".next",

  // The dev indicator is Next's own tooling, not part of the product, and it renders
  // a portal over the bottom-left corner — where the sidebar's hide control sits. It
  // swallows that click, which is a fact about the overlay rather than about the
  // workspace. Only the suite's server turns it off; a developer keeps theirs.
  ...(browserSuite ? { devIndicators: false as const } : {}),
};

export default nextConfig;
