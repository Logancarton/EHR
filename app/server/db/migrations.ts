// Compatibility facade: existing callers continue importing "./migrations".
export { DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_NAME } from "./migrations/constants";
export type { DatabaseMigration } from "./migrations/types";
export { APPLICATION_MIGRATIONS } from "./migrations/registry";
export { applyMigrations } from "./migrations/runner";
