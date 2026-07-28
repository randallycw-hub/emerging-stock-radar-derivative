# Public Snapshot Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic runner that ingests the three required approved datasets and atomically publishes their D1 snapshot pointers only when all datasets are eligible.

**Architecture:** Keep adapters and repository contracts unchanged. Add a runner-level function that receives a repository, adapters, clock, and run identifier; it ingests 94025, 11406, and 11586, then calls the existing publication gate. Add tests against the in-memory repository contract and a small CLI entrypoint for controlled execution; scheduling is deferred until the first successful manual run.

**Tech Stack:** TypeScript, existing pipeline adapters, repository contracts, Node test runner, Wrangler/D1 runtime.

## Global Constraints

- Only datasets `94025`, `11406`, and `11586` are required for public publication.
- Dataset `28567` remains optional enrichment and must not block publication.
- No fixtures or live transport fallbacks may be exposed by the public read model.
- Any failed or ineligible dataset must leave existing published pointers unchanged.
- CPU-heavy commands must remain low-load and use no more than two worker threads.

---

### Task 1: Define runner contract and failing tests

**Files:**
- Create: `tests/pipeline/public-snapshot-runner.test.mjs`
- Create: `lib/pipeline/orchestration/public-snapshot-runner.ts`

**Interfaces:**
- Produce `runPublicSnapshotIngestion(options): Promise<PublicationDecision>`.
- `options` contains `repository`, `adapters`, `clock`, and `publicationRunId`.

- [ ] **Step 1: Write failing tests** for all three datasets publishing atomically and for one failed dataset preserving pointers.
- [ ] **Step 2: Run `node --test tests/pipeline/public-snapshot-runner.test.mjs` and verify the missing-runner failure.**
- [ ] **Step 3: Implement the smallest runner using `ingestDataset` and `publishPublicSnapshot`.**
- [ ] **Step 4: Re-run the focused tests and verify both paths pass.**
- [ ] **Step 5: Run the existing pipeline contract tests.**

### Task 2: Add a controlled execution entrypoint

**Files:**
- Create: `scripts/run-public-snapshot-ingestion.mjs`
- Modify: `package.json`

**Interfaces:**
- CLI loads configured approved adapters, creates the runtime D1 repository, runs the runner, and exits non-zero when publication is false.

- [ ] **Step 1: Add a CLI test for non-zero exit on an unavailable dataset.**
- [ ] **Step 2: Run the test and verify it fails before the script exists.**
- [ ] **Step 3: Implement the CLI with explicit environment validation and no fixture fallback.**
- [ ] **Step 4: Run the focused CLI test and existing lint/typecheck.**

### Task 3: Verify remote D1 publication path

**Files:**
- Modify: `docs/architecture/production-data-pipeline.md`
- Modify: `README.md`

- [ ] **Step 1: Document the manual command and expected success response.**
- [ ] **Step 2: Run the command against the configured D1 binding with low-load limits.**
- [ ] **Step 3: Query `/api/public-snapshot` and verify HTTP 200 with all three datasets.**
- [ ] **Step 4: Run the full test, lint, typecheck, and build suites.**

