# Task 4 — D1 IPO event snapshot persistence

## Delivered

- Added `migrations/0005_ipo_event_snapshots.sql` with immutable IPO snapshot rows, a singleton current-pointer table, its foreign key, and the date/generated-at index.
- Added `createIpoSnapshotRepository(db)` with `readCurrent()` and atomic `publish()`.
- Snapshot IDs are deterministic SHA-256 hashes of the full snapshot payload. Publication uses one D1 batch for the immutable snapshot insert and pointer upsert; a missing or unsuccessful batch result raises `IPO_SNAPSHOT_PUBLISH_FAILED`.
- `readCurrent()` validates the stored payload's public snapshot envelope and fails closed with `IPO_SNAPSHOT_READ_FAILED` if it is malformed.
- Extended D1 schema coverage and added repository coverage for a successful pointer replacement plus a failed batch that preserves the prior readable snapshot.

## TDD evidence

1. Added the schema and repository tests before their implementation.
2. Ran `node --test tests/pipeline/d1-schema-contract.test.mjs tests/ipo-events-repository.test.mjs` with `UV_THREADPOOL_SIZE=2` and observed the expected missing migration/module failures.
3. Added the migration and minimal repository implementation.
4. Reran the focused tests successfully after correcting the test D1 fake's pointer bind position.

## Verification

All commands used `UV_THREADPOOL_SIZE=2`; typecheck was run at Windows `BelowNormal` priority.

```text
node --test tests/pipeline/d1-schema-contract.test.mjs tests/ipo-events-repository.test.mjs
8 passed, 0 failed

npm.cmd run typecheck
tsc --noEmit exited 0

git diff --check
exited 0
```

## Concern

The repository already contains `0005_bond_contract_completeness.sql`. This task's exact required filename is therefore added alongside it as `0005_ipo_event_snapshots.sql`; it is lexically ordered after the bond migration and does not rewrite any existing migration.
