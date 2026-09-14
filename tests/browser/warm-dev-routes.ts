import { request } from "@playwright/test";

/**
 * Compiles the routes the suite exercises before the first assertion runs.
 *
 * `webServer.url` only waits for `/` to answer. Everything else in a Turbopack dev
 * server is compiled on demand, so the first spec to touch the dashboard pays for
 * compiling the appointment and queue routes inside its own timeout — several
 * seconds on a cold CI runner, and none of it a property of the code under test.
 * The dashboard opens more of those routes since DB-0 gave it an authoritative
 * schedule and a source-backed attention queue, which pushed that first spec closer
 * to its budget.
 *
 * This changes no assertion and no timeout. It moves first-compile cost out of the
 * measurement, so a slow run means slow code rather than a cold server. Failures
 * here are swallowed on purpose: a route that cannot be warmed is the suite's
 * problem to report properly, not this file's.
 */
const WARM_PATHS = [
  "/api/auth/me",
  "/api/preferences",
  "/api/patients",
  "/api/workspace-state",
  "/api/appointments",
  "/api/practice-queues?queue=labs",
  "/api/practice-queues?queue=unsigned",
  "/api/practice-queues?queue=documents",
  "/api/tasks?type=task",
  "/api/organization/workspace-templates",
];

export default async function warmDevRoutes() {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || 3100}`;

  const context = await request.newContext({ baseURL });
  try {
    // Unauthenticated is enough: a 401 has still compiled the route, and warming
    // deliberately creates no session and writes nothing.
    await Promise.all(WARM_PATHS.map((path) => context.get(path).catch(() => undefined)));
  } finally {
    await context.dispose();
  }
}
