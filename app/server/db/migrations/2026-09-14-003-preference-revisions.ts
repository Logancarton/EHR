import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration =   {
    id: "2026-09-14-003-preference-revisions",
    description: "Add revision counter to provider preferences for optimistic concurrency",
    apply(db) {
      addColumnIfMissing(db, "provider_preferences", "revision", "INTEGER NOT NULL DEFAULT 1");
    },
  };
