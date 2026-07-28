# Published Snapshot Read Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide one server-side read boundary that returns a coherent public snapshot from the three published dataset pointers.

**Architecture:** The read model loads pointers first, validates that all required pointers reference eligible snapshots from the approved source/resource pair and share one publication run, then reads records from those exact snapshot IDs. Missing, stale, mismatched, or invalid pointers return an explicit unavailable result; no fixture, external fetch, or partial public dataset is substituted.

**Tech Stack:** TypeScript 5.9, existing `PipelineRepository`, Node.js test runner.

## Global Constraints

- Required public datasets are `94025`, `11406`, and `11586`; `28567` is optional enrichment only.
- Reads are server-side repository operations and never contact an external source.
- No quote, realtime, volume, recommendation, arbitrage, or fallback fields.
- Preserve exact snapshot IDs and publication provenance in the returned model.

---

### Task 1: Public snapshot read contract

**Files:**
- Create: `lib/pipeline/read-models/public-snapshot.ts`
- Test: `tests/pipeline/public-snapshot-read-model.test.mjs`

**Interfaces:**
- Consumes: `PipelineRepository` pointers, snapshots, and dataset records.
- Produces: `readPublishedPublicSnapshot(repository)` returning either `{ status: "published", publicationRunId, publishedAt, datasets }` or `{ status: "unavailable", reasons }`.

- [ ] **Step 1: Write failing tests** for complete reads, missing pointers, publication-run mismatch, snapshot scope/eligibility mismatch, and no partial datasets.
- [ ] **Step 2: Run** `node --test tests/pipeline/public-snapshot-read-model.test.mjs` and confirm failure.
- [ ] **Step 3: Implement** deterministic dataset ordering, explicit source/resource checks, exact pointer-to-snapshot checks, and defensive cloned records.
- [ ] **Step 4: Run** focused tests and existing pipeline tests.
- [ ] **Step 5: Commit** `feat: add published public snapshot read model`.

### Task 2: Optional profile enrichment boundary

**Files:**
- Modify: `lib/pipeline/read-models/public-snapshot.ts`
- Modify: `tests/pipeline/public-snapshot-read-model.test.mjs`

- [ ] **Step 1: Write failing tests** proving 28567 profiles are attached only when their pointer is present, eligible, source-scoped, and publication-run aligned; otherwise the public snapshot remains published with `enrichmentStatus: "unavailable"`.
- [ ] **Step 2: Implement** optional profile map keyed by company code without making it part of the three-dataset publication gate.
- [ ] **Step 3: Run** focused tests and typecheck.
- [ ] **Step 4: Commit** `feat: add optional profile enrichment to read model`.

### Task 3: Documentation and verification

**Files:**
- Create: `docs/architecture/public-snapshot-read-model.md`

- [ ] **Step 1: Document** the unavailable behavior, provenance fields, required dataset set, and optional enrichment rule.
- [ ] **Step 2: Run** `npm test -- --test-concurrency=2`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check` at below-normal priority.
- [ ] **Step 3: Audit** for fixture imports, external fetches, prohibited fields, and partial-publication paths.
- [ ] **Step 4: Commit** `docs: define published snapshot read model`.

## Execution Boundary

This plan stops at a verified server-side read model. The next stage will adapt the homepage and API route to this model, then apply the approved Cloud Dancer × Transformative Teal UI shell.
