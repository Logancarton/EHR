import type { DatabaseSync } from "node:sqlite";

export type DatabaseMigration = {
  id: string;
  description: string;
  apply(db: DatabaseSync): void;
};
