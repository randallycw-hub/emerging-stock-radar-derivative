# Production Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build a source-allowlisted, fixture-tested, snapshot-published V1 data pipeline for approved official resources without exposing partial or unauthorized data.

**Architecture:** Each approved resource has one adapter that fetches only its exact registry URL, validates raw transport, normalizes into domain records, and writes a staging snapshot. A repository abstraction supports an in-memory implementation first and D1 later; publication is an atomic pointer switch after completeness checks. Query services read only the published pointer and return DTOs with source provenance and health state.

**Tech Stack:** Existing TypeScript/Next.js app, Node test runner, Zod/domain schemas already present, SQLite-compatible D1 SQL migrations, Cloudflare scheduled worker only after staging approval.

## Global Constraints

- Only resources marked `VERIFIED_FOR_IMPLEMENTATION` may have formal adapters: 11406 CSV, 94025 selected primary resource, 11586 CSV, 28567 CSV.
- 11586 and 28567 datasets remain `APPROVED_FOR_V1_DESIGN`; no production approval is implied.
- 28567 is enrichment-only and joins exact company codes from the 94025 coverage set; it never determines emerging status.
- 11586 OpenAPI and 28567 OpenAPI are `SUSPENDED`, comparison-only, and never ingestion or fallback paths.
- No Yahoo, CBAS, broker source, reverse-engineered endpoint, HTML scraping, realtime/delayed quote, trade recommendation, or price-derived analytics.
- Default tests use fixtures, mock HTTP, and in-memory repositories; live smoke tests are separate and never publish.
- Official calendar dates remain `YYYY-MM-DD` in Asia/Taipei; only fetch/run timestamps are UTC ISO datetimes.
- Failed or partial runs never move the published pointer, delete the previous snapshot, or emit disappearance/zero-balance events.
- This plan does not authorize D1 creation, remote migration, hosting changes, deployment, push, or merge.

---

## File map

Create `lib/pipeline/types.ts` for run, snapshot, health, and publication types. Create `lib/pipeline/http-client.ts` for exact-host HTTP policy. Create one adapter module per source under `lib/pipeline/adapters/`. Create `lib/pipeline/repository.ts` and `lib/pipeline/in-memory-repository.ts` for persistence contracts. Create `lib/pipeline/publication.ts`, `lib/pipeline/diff.ts`, `lib/pipeline/events.ts`, `lib/pipeline/services.ts`, and `lib/pipeline/dto.ts` for orchestration and read boundaries. Create SQL only under `db/migrations/` and never execute it remotely in this project phase. Tests mirror each module under `tests/pipeline/`; live checks live under `scripts/live-source-smoke/` and are not referenced by `npm test`.

### Task 1: Pipeline contracts and source allowlist

**Files:** Create `lib/pipeline/types.ts`, `lib/pipeline/source-registry.ts`, test `tests/pipeline/contracts.test.mjs`.

**Interfaces:** Define `SourceId = "11406" | "94025" | "11586" | "28567"`; `ResourceId` values for each approved CSV; `IngestionRun`, `RawSnapshotMetadata`, `StagingSnapshot`, `PublishedSnapshotPointer`, `SourceHealth`, and `PublicationResult`. Export `getApprovedResource(sourceId): ApprovedResource` and reject suspended/unregistered resources.

- [ ] Write tests asserting exact URL/host, status, dataset stage, and suspended-resource rejection.
- [ ] Run `node --test tests/pipeline/contracts.test.mjs`; expect failure because modules do not exist.
- [ ] Implement literal allowlist sourced from the committed Registry evidence; no runtime fallback list.
- [ ] Re-run focused tests; expect all contract assertions to pass.
- [ ] Commit `feat: define production pipeline contracts and source allowlist`.

### Task 2: Exact-host HTTP client

**Files:** Create `lib/pipeline/http-client.ts`, test `tests/pipeline/http-client.test.mjs`.

**Interfaces:** `fetchApprovedResource(resource: ApprovedResource, options: HttpOptions): Promise<RawHttpResponse>`; enforce HTTPS, host/path equality, timeout, maximum bytes, content-type allowlist, redirect refusal, one bounded retry for transport errors, and response SHA-256.

- [ ] Add mock tests for success, timeout, non-2xx, redirect, wrong host, HTML content, oversized body, and retry exhaustion.
- [ ] Run focused tests and verify RED.
- [ ] Implement using injected `fetch` and clock; never call a second resource after failure.
- [ ] Verify response metadata contains status, content type, bytes, hash, and UTC fetched time.
- [ ] Commit `feat: add approved-source http client`.

### Task 3: Adapter response contracts

**Files:** Create `lib/pipeline/adapters/types.ts`, `lib/pipeline/adapters/11406.ts`, `94025.ts`, `11586.ts`, `28567.ts`; tests under `tests/pipeline/adapters/`.

**Interfaces:** `SourceAdapter<RawRecord, DomainRecord>` with `sourceId`, `resourceId`, `parseRaw`, `normalize`, `validateIntegrity`, and `buildSnapshotMetadata`. Each adapter consumes only the existing source-verification parser and approved CSV fixture aliases.

- [ ] Add fixture contract tests for every adapter and assert unknown fields, empty payloads, duplicate identities, malformed dates/numbers, and schema drift fail closed.
- [ ] Run adapter tests and verify RED.
- [ ] Implement adapters as pure transformations; no fetch, persistence, scheduler, or DTO imports.
- [ ] For 28567, require a 94025 coverage set input and return unmatched/ambiguous diagnostics without status inference.
- [ ] Verify all adapter tests pass and no suspended OpenAPI URL is referenced.
- [ ] Commit `feat: implement approved source adapter contracts`.

### Task 4: Raw snapshot and ingestion-run repository

**Files:** Create `lib/pipeline/repository.ts`, `lib/pipeline/in-memory-repository.ts`, tests `tests/pipeline/in-memory-repository.test.mjs`.

**Interfaces:** `Repository` methods `createIngestionRun`, `saveRawSnapshot`, `saveStagingSnapshot`, `saveDiffs`, `saveEvents`, `getPublishedPointer`, `publishSnapshot`, `getSourceHealth`, and `listSnapshotRecords`. In-memory implementation must clone inputs and enforce run ownership.

- [ ] Write repository contract tests for idempotent run IDs, defensive copies, staging isolation, and pointer immutability on failed runs.
- [ ] Run tests and verify RED.
- [ ] Implement maps keyed by run ID, snapshot ID, source ID, and published pointer.
- [ ] Verify no method can publish a partial snapshot or delete the previous pointer.
- [ ] Commit `feat: add repository abstraction and in-memory implementation`.

### Task 5: D1 schema and migration design

**Files:** Create `db/migrations/0001_pipeline.sql`, `docs/architecture/production-data-pipeline.md`; test `tests/pipeline/migration-shape.test.mjs`.

**Interfaces:** Tables `ingestion_runs`, `source_snapshots`, `emerging_monthly_revenue`, `public_company_profiles`, `bond_issuances`, `listing_applications`, `published_snapshots`, `record_diffs`, `derived_events`, `source_health`. Indexes cover `companyCode`, `bondId`, `eventDate`, `eventKind`, `sourceId`, and published pointer lookup.

- [ ] Test migration text for primary keys, unique natural identities, provenance columns, status constraints, and required indexes.
- [ ] Run migration-shape test and verify RED.
- [ ] Write idempotent SQL with staging/published separation and UTC timestamp columns; store official dates as text.
- [ ] Document rows-read, rows-written, storage monitoring, retention, and the absence of cross-request transaction assumptions.
- [ ] Verify no remote D1 command is run.
- [ ] Commit `docs: design pipeline d1 schema and migration`.

### Task 6: Completeness checks and transactional publication

**Files:** Create `lib/pipeline/publication.ts`, test `tests/pipeline/publication.test.mjs`.

**Interfaces:** `runIngestion(adapter, repository, clock): Promise<PublicationResult>`; `validateCompleteness(staging): CompletenessReport`; `publishIfComplete(staging, report): PublishedSnapshotPointer`.

- [ ] Add failing tests for every required sequence: run, raw metadata/hash/rows, schema, normalize, integrity, staging, diff/events, completeness, pointer switch.
- [ ] Add failure tests proving pointer and prior data remain unchanged, with no disappearance or zero-balance event.
- [ ] Implement explicit state machine `RUNNING -> STAGED -> PUBLISHED` or `FAILED/PARTIAL`; PARTIAL is health-only.
- [ ] Verify publication occurs once after all sources selected for a snapshot succeed.
- [ ] Commit `feat: publish only complete validated snapshots`.

### Task 7: Diff engine and derived events

**Files:** Create `lib/pipeline/diff.ts`, `lib/pipeline/events.ts`, tests `tests/pipeline/diff-events.test.mjs`.

**Interfaces:** `computeRecordDiff(previous, current): RecordDiff[]`; `generateEvents(snapshot, clock): DerivedEvent[]`. Event text must state `本事件由本站依官方公開資料欄位自動整理`.

- [ ] Test add/update/remove classification, stable identity, date-only comparisons, and no events on incomplete snapshots.
- [ ] Test 11406 maturity/conversion/put dates and 11586 partial chronology without inventing absent dates; test 94025 coverage changes and 28567 unmatched/ambiguous diagnostics.
- [ ] Implement deterministic event IDs from source, record identity, event kind, and official date; preserve Asia/Taipei dates.
- [ ] Verify no price, quote, volume, arbitrage, recommendation, or prediction fields are generated.
- [ ] Commit `feat: add snapshot diff and derived event engine`.

### Task 8: Query services and API DTOs

**Files:** Create `lib/pipeline/services.ts`, `lib/pipeline/dto.ts`, tests `tests/pipeline/services.test.mjs`.

**Interfaces:** `getEmergingCoverage`, `getCompanyProfile`, `getBonds`, `getListingApplications`, `getEvents`; DTOs include source ID, dataset name, published/fetched timestamps, stale/health state, and explicit empty/error states.

- [ ] Test services read the published pointer only, reject staging rows, expose suspended-source warnings, and return no fake fallback.
- [ ] Implement pagination and indexed query parameters to avoid full-table list scans.
- [ ] Add route-boundary tests for noindex preview behavior and production unavailable states; do not modify production pages in this plan.
- [ ] Commit `feat: add published-data query services and dtos`.

### Task 9: Scheduler, health, and live smoke isolation

**Files:** Create `worker/data-sync.ts`, `lib/pipeline/health.ts`, `scripts/live-source-smoke/28567.mjs`, `scripts/live-source-smoke/94025.mjs`, `scripts/live-source-smoke/11406.mjs`, `scripts/live-source-smoke/11586.mjs`; tests `tests/pipeline/health.test.mjs`.

**Interfaces:** `runScheduledSync(sourceId, deps)`; `recordSourceHealth`; smoke scripts return status/schema/hash diagnostics and never call repository publication.

- [ ] Test lock acquisition, duplicate-run prevention, timeout, retry exhaustion, suspended source, stale threshold, and manual disable.
- [ ] Implement schedule configuration only after staging validation; use one approved resource per source and no failover.
- [ ] Keep live smoke commands outside `npm test`; record HTTP status, schema result, check time, and failure classification.
- [ ] Commit `feat: add isolated source health and sync scheduler`.

### Task 10: Staging acceptance and production gate

**Files:** Create `docs/operations/production-approval-checklist.md`, `tests/pipeline/acceptance.test.mjs`.

**Interfaces:** Checklist requires fixture contracts, adapter mocks, staging D1 tests, rollback proof, published attribution pages, source re-review, and manual approval per resource.

- [ ] Add acceptance tests asserting no production enablement when any resource is not `APPROVED_FOR_PRODUCTION`.
- [ ] Run complete offline test suite and staging-only tests against an ephemeral D1-compatible database.
- [ ] Perform manual smoke tests without writing production data; verify attribution, stale states, no fallback, and pointer rollback.
- [ ] Record reviewer approval and commit `docs: add production data pipeline acceptance gate`.

## Verification commands

Run after each task’s focused tests, and before any implementation commit:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Live smoke tests use explicit commands such as `node scripts/live-source-smoke/28567.mjs`; they are never imported by the default test script and never write a published snapshot.

## Self-review

- Source states and no-fallback restrictions are covered by Tasks 1, 3, 6, 9, and 10.
- All four approved CSV resources have separate adapter tasks and fixture contracts.
- 94025 coverage-first and 28567 enrichment-only semantics are enforced in Tasks 3 and 7.
- Staging/published pointer publication, rollback, stale state, and failure behavior are covered by Tasks 4, 5, 6, and 10.
- D1 indexes and monitoring are specified without executing migrations remotely.
- Live network access is isolated from default tests.
- No placeholder terms are used; every task has paths, interfaces, tests, commands, expected outcomes, and a commit boundary.
