# Ingestion Orchestration and Atomic Publication Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist adapter results as immutable snapshots and publish one coherent three-dataset view only when 94025, 11406, and 11586 all pass their integrity gates.

**Architecture:** Adapters remain pure fetch/parse/normalize/integrity units. A new orchestrator converts their typed results into repository records, creates an immutable snapshot per dataset, and advances dataset pointers with compare-and-set semantics. A publication coordinator records a shared publication decision and never advances any pointer when a required dataset is absent or invalid; the existing 28567 profile dataset remains an enrichment dependency and is not a public gate.

**Tech Stack:** TypeScript 5.9, Node.js test runner, existing `PipelineRepository`/`InMemoryPipelineRepository`, Cloudflare D1-compatible repository contracts.

## Global Constraints

- CPU-intensive commands use below-normal priority and at most two worker threads.
- No fixture fallback, external fetch inside repositories, realtime/quote/volume/recommendation fields, or remote D1/deployment changes.
- All snapshots are immutable; publication uses explicit compare-and-set and preserves the previous pointer on failure.
- Public publication requires datasets `94025`, `11406`, and `11586`; dataset `28567` is enrichment-only.
- SQL remains fixed and parameterized; no dynamic table names, `SELECT *`, or `INSERT OR REPLACE`.

---

### Task 1: Typed adapter-to-snapshot record conversion

**Files:**
- Create: `lib/pipeline/orchestration/record-converters.ts`
- Test: `tests/pipeline/record-converters.test.mjs`

**Interfaces:**
- Consumes: `AdapterExecutionResult` and normalized dataset types from the four existing adapters.
- Produces: `toDatasetRecords(datasetId, snapshotId, result)` returning `DatasetRecord[]`, with stable natural identities and no transport-only fields.

- [ ] **Step 1: Write failing tests** for all four datasets, empty results, duplicate identities, and rejection of prohibited price/quote fields.
- [ ] **Step 2: Run** `node --test tests/pipeline/record-converters.test.mjs` and confirm failure.
- [ ] **Step 3: Implement** exhaustive dataset dispatch; validate `runId`, source/resource identity, record identity, and clone values before returning records.
- [ ] **Step 4: Run** the focused tests and confirm pass.
- [ ] **Step 5: Commit** `feat: convert adapter results to dataset records`.

### Task 2: Single-dataset ingestion orchestration

**Files:**
- Create: `lib/pipeline/orchestration/ingest-dataset.ts`
- Test: `tests/pipeline/ingest-dataset.test.mjs`

**Interfaces:**
- Consumes: a `SourceAdapter`, `PipelineRepository`, clock, and approved HTTP client.
- Produces: `ingestDataset(options)` returning `{ run, snapshot, records }`, or a structured failed run with no pointer change. It never advances a published pointer; only Task 3 may publish.

- [ ] **Step 1: Write failing tests** for successful persistence, invalid integrity, fetch failure, idempotent snapshot IDs, and preservation of the previous pointer.
- [ ] **Step 2: Run** the focused test and confirm failure.
- [ ] **Step 3: Implement** run creation, adapter execution, immutable snapshot creation, dataset record write, eligibility evaluation, and compare-and-set pointer promotion inside `withTransaction`.
- [ ] **Step 4: Run** focused orchestration plus repository tests.
- [ ] **Step 5: Commit** `feat: orchestrate immutable dataset ingestion`.

### Task 3: Three-dataset atomic publication coordinator

**Files:**
- Create: `lib/pipeline/orchestration/publication-gate.ts`
- Test: `tests/pipeline/publication-gate.test.mjs`
- Modify: `lib/pipeline/repositories/contracts.ts` only if a minimal read contract is required.

**Interfaces:**
- Consumes: three successful `ingestDataset` results and the repository.
- Produces: `publishPublicSnapshot(results, context)` returning a decision with `published: boolean`, dataset snapshot IDs, reasons, and timestamp.

- [ ] **Step 1: Write failing tests** proving all three datasets are required, invalid/missing results do not move any pointer, concurrent CAS conflict returns `published: false`, and a complete set advances all three pointers.
- [ ] **Step 2: Run** `node --test tests/pipeline/publication-gate.test.mjs` and confirm failure.
- [ ] **Step 3: Implement** deterministic dataset ordering, shared publication run ID, preflight validation, and sequential CAS updates inside one repository transaction; throw on partial commit in D1 and return a blocked decision in the in-memory coordinator.
- [ ] **Step 4: Run** focused plus full pipeline tests.
- [ ] **Step 5: Commit** `feat: gate public publication on complete datasets`.

### Task 4: Documentation and verification boundary

**Files:**
- Modify: `docs/architecture/d1-schema.md`
- Create: `docs/architecture/ingestion-publication.md`

- [ ] **Step 1: Document** run/snapshot/record/pointer lifecycle, the three-dataset gate, 28567 enrichment role, and failure behavior.
- [ ] **Step 2: Run** `npm test -- --test-concurrency=2`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` at below-normal priority.
- [ ] **Step 3: Audit** for prohibited sources/fields and dynamic SQL.
- [ ] **Step 4: Commit** `docs: define ingestion publication lifecycle`.

## Execution Boundary

This plan stops after a verified local publication gate. It does not add schedulers, remote bindings, deployment, or homepage UI. The next plan will build published snapshot read models and server-side homepage aggregation on this contract.
