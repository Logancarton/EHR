import type { DatabaseMigration } from "./types";
import { addColumnIfMissing } from "./historical-support";

/** Immutable historical migration. Do not rename its ID or change its semantics. */
export const migration: DatabaseMigration = {
  id: "2026-09-21-002-hr-item-source",
  description: "Record whether an HR item was seeded or assigned by a person (D-086)",
  apply(db) {
    // The development seed rewrites its own items on every boot so their relative due
    // dates stay meaningful as the fixture ages. Once owners and managers can assign
    // items from the interface, that rewrite would silently delete their work — a
    // fixture quietly outranking a real assignment is precisely the failure this
    // project forbids. So provenance becomes explicit rather than inferred from an id
    // shape: the seed refreshes only rows it authored and never touches the rest.
    //
    // 'assigned' is the default because every row written by the assignment service is
    // one, and because a row of unknown origin must be treated as somebody's work
    // rather than as disposable fixture.
    addColumnIfMissing(db, "hr_record_items", "source", "TEXT NOT NULL DEFAULT 'assigned'");

    // Every row that exists at this moment was written by the seed: this migration is
    // what makes assignment possible, so nothing else can have authored one yet. The
    // backfill is what lets the seed keep recognizing its own rows on databases that
    // predate the column — without it the seed would try to re-insert its fixed item
    // ids and fail the primary key on the next boot.
    db.exec("UPDATE hr_record_items SET source = 'seed'");
  },
};
