# Database migrations

This directory is append-only migration history.

- `registry.ts` is the single explicit execution order.
- `runner.ts` owns the durable `schema_migrations` ledger and one-migration-per-transaction execution.
- Each dated module owns one immutable historical migration.
- `historical-support.ts` contains SQLite transformations already coupled to issued migrations; changing those helpers can change an old upgrade path, so treat them as immutable infrastructure.
- Development/demo seeding and legacy `ensure*Foundation()` compatibility routines remain outside this registry.

Do not rename, renumber, squash, delete, or semantically rewrite an applied migration. A fresh schema may already contain a field introduced by an old migration; that does not make the historical migration obsolete for older databases.
