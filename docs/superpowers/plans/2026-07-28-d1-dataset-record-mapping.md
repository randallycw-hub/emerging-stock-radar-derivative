# D1 Dataset Record Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete typed D1 persistence and reads for datasets 94025, 28567, 11406, and 11586 so later orchestration and the public homepage can consume verified normalized records.

**Architecture:** Keep `PipelineRepository` dataset-neutral at its boundary and add a focused mapper module that validates each `DatasetRecord.value`, emits fixed prepared SQL, and maps explicit D1 result columns back to domain values. Parent and child rows are written in one D1 batch; reads reconstruct bonds with put rights and listing applications with underwriters without `SELECT *`, dynamic table names, external fetches, or fallback data.

**Tech Stack:** TypeScript 5.9, Node.js 22 test runner, Cloudflare D1-compatible prepared statements, existing normalized source-verification types.

## Global Constraints

- CPU-intensive commands use low priority and no more than 2 threads.
- Formal brand remains `興債觀測網`; subtitle remains `興櫃公司、可轉債與上市櫃進度資訊`.
- Do not add Yahoo, broker websites, unauthorized APIs, real-time or delayed prices, volume, arbitrage, recommendations, membership, payments, ads, deployment, or remote D1 resources.
- All SQL is fixed, uses prepared statements and bind parameters, and contains no `SELECT *` or `INSERT OR REPLACE`.
- Dataset, snapshot, source, and resource isolation must fail closed.
- Do not push, merge, or deploy.

---

## File Structure

- Create `lib/pipeline/repositories/d1-dataset-mappers.ts`: validate typed values, define fixed insert/select statements, flatten child rows, and reconstruct domain values.
- Modify `lib/pipeline/repositories/d1.ts`: delegate dataset record writes/reads to the mapper and complete pointer reads.
- Create `tests/pipeline/d1-dataset-records.test.mjs`: focused offline D1 mock tests for four datasets, child rows, isolation, and explicit SQL.
- Modify `tests/pipeline/d1-repository.test.mjs`: retain repository-wide prohibited SQL/global fetch assertions.
- Modify `docs/architecture/d1-schema.md`: document the repository mapping contract and unsupported-value behavior.

### Task 1: Mapper contracts and fail-closed dispatch

**Files:**
- Create: `lib/pipeline/repositories/d1-dataset-mappers.ts`
- Test: `tests/pipeline/d1-dataset-records.test.mjs`

**Interfaces:**
- Consumes: `D1Database`, `D1Prepared` from `d1.ts`; `DatasetId`, `DatasetRecord` from `types.ts`.
- Produces:
  - `writeD1DatasetRecords(db: D1Database, datasetId: DatasetId, snapshotId: string, records: readonly DatasetRecord[]): Promise<void>`
  - `readD1DatasetRecords(db: D1Database, datasetId: DatasetId, snapshotId: string): Promise<readonly DatasetRecord[]>`

- [ ] **Step 1: Write failing dispatch and validation tests**

```js
test("D1 dataset mapper rejects mismatched dataset and snapshot identities", async () => {
  const db = createRecordingD1();
  const repo = createD1PipelineRepository(db, fixedDependencies);
  await assert.rejects(
    repo.writeDatasetRecords("94025", "snapshot-a", [{
      datasetId: "28567",
      snapshotId: "snapshot-a",
      naturalIdentity: "1101:2026-06",
      value: {},
    }]),
    /DATASET_RECORD_SCOPE_MISMATCH/,
  );
  assert.equal(db.calls.length, 0);
});

test("D1 dataset mapper rejects unsupported value shapes before SQL", async () => {
  const db = createRecordingD1();
  const repo = createD1PipelineRepository(db, fixedDependencies);
  await assert.rejects(
    repo.writeDatasetRecords("94025", "snapshot-a", [{
      datasetId: "94025",
      snapshotId: "snapshot-a",
      naturalIdentity: "bad",
      value: { companyCode: "" },
    }]),
    /INVALID_DATASET_RECORD/,
  );
  assert.equal(db.calls.length, 0);
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs`  
Expected: FAIL because mapper functions and repository delegation do not exist.

- [ ] **Step 3: Add mapper dispatch and common scope validation**

```ts
function assertRecordScope(datasetId: DatasetId, snapshotId: string, record: DatasetRecord): void {
  if (record.datasetId !== datasetId || record.snapshotId !== snapshotId || !record.naturalIdentity) {
    throw new RepositoryError("DATASET_RECORD_SCOPE_MISMATCH");
  }
}

export async function writeD1DatasetRecords(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
  records: readonly DatasetRecord[],
): Promise<void> {
  records.forEach((record) => assertRecordScope(datasetId, snapshotId, record));
  const statements = records.flatMap((record) => bindInsertStatements(db, datasetId, snapshotId, record));
  if (statements.length === 0) return;
  const results = await db.batch(statements);
  if (results.some((result) => result.success === false)) throw new RepositoryError("DATASET_RECORD_WRITE_FAILED");
}
```

Implement an exhaustive `switch (datasetId)` in both `bindInsertStatements` and `readD1DatasetRecords`; the `default` branch assigns to `never` so a new dataset cannot silently fall through.

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs`  
Expected: scope and invalid-shape tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/repositories/d1-dataset-mappers.ts tests/pipeline/d1-dataset-records.test.mjs
git commit -m "test: define d1 dataset mapping contract"
```

### Task 2: Monthly revenue and company profile mappings

**Files:**
- Modify: `lib/pipeline/repositories/d1-dataset-mappers.ts`
- Modify: `lib/pipeline/repositories/d1.ts`
- Modify: `tests/pipeline/d1-dataset-records.test.mjs`

**Interfaces:**
- Consumes: `NormalizedMonthlyRevenue94025` from `lib/source-verification/source-94025.ts`; `NormalizedCompany28567` from `lib/source-verification/source-28567.ts`.
- Produces: D1 round trips for `emerging_monthly_revenue` and `public_company_profiles`.

- [ ] **Step 1: Write failing 94025 and 28567 round-trip tests**

Create representative records by importing the existing normalizers and fixture rows used in `tests/source-verification/`. Assert:

```js
assert.deepEqual(await repo.readDatasetRecords("94025", snapshotId), [{
  datasetId: "94025",
  snapshotId,
  naturalIdentity: normalizedRevenue.sourceRecordId,
  value: normalizedRevenue,
}]);
assert.deepEqual(await repo.readDatasetRecords("28567", snapshotId), [{
  datasetId: "28567",
  snapshotId,
  naturalIdentity: normalizedProfile.sourceRecordId,
  value: normalizedProfile,
}]);
```

Also assert every recorded SQL statement uses `?` bind placeholders and no recorded SQL contains `SELECT *`, interpolated `snapshotId`, or `INSERT OR REPLACE`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs`  
Expected: FAIL because 94025/28567 statements and row mappers are absent.

- [ ] **Step 3: Implement fixed parent-table statements**

Add explicit insert column lists matching `migrations/0002_pipeline_dataset_records.sql`. Validate all required string fields before preparing SQL. Bind nullable fields as `null`, never as missing positional arguments.

Add explicit select aliases, for example:

```ts
const REVENUE_SELECT = `
SELECT snapshot_id as snapshotId, company_code as companyCode,
company_name as companyName, industry, report_date as reportDate,
revenue_year_month as revenueYearMonth,
current_month_revenue_thousands_twd as currentMonthRevenueThousandsTwd,
previous_month_revenue_thousands_twd as previousMonthRevenueThousandsTwd,
previous_year_same_month_revenue_thousands_twd as previousYearSameMonthRevenueThousandsTwd,
month_over_month_percent as monthOverMonthPercent,
year_over_year_percent as yearOverYearPercent,
current_year_cumulative_revenue_thousands_twd as currentYearCumulativeRevenueThousandsTwd,
previous_year_cumulative_revenue_thousands_twd as previousYearCumulativeRevenueThousandsTwd,
cumulative_year_over_year_percent as cumulativeYearOverYearPercent,
source_record_identity as sourceRecordId, source_id as sourceId,
resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash
FROM emerging_monthly_revenue WHERE snapshot_id = ? ORDER BY company_code, revenue_year_month`;
```

Modify `D1PipelineRepository.writeDatasetRecords` and `readDatasetRecords` to delegate to the mapper.

- [ ] **Step 4: Run tests**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs tests/pipeline/d1-repository.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/repositories/d1-dataset-mappers.ts lib/pipeline/repositories/d1.ts tests/pipeline/d1-dataset-records.test.mjs
git commit -m "feat: map company datasets to d1"
```

### Task 3: Bond issuance and put-right mappings

**Files:**
- Modify: `lib/pipeline/repositories/d1-dataset-mappers.ts`
- Modify: `tests/pipeline/d1-dataset-records.test.mjs`

**Interfaces:**
- Consumes: `NormalizedBondIssue11406` from `lib/source-verification/source-11406.ts`.
- Produces: one `bond_issuances` parent plus ordered `bond_put_rights` children per normalized bond record.

- [ ] **Step 1: Write failing bond parent/child tests**

Use an existing 11406 fixture with at least two put rights. Assert the batch contains one parent statement followed by child statements with sequences `1` and `2`, and the read result reconstructs the original ordered `putRights` array.

Add a failure case where the parent batch result has `success: false`; expect `DATASET_RECORD_WRITE_FAILED`.

- [ ] **Step 2: Run focused bond tests and confirm failure**

Run: `node --test --test-name-pattern="bond|put right" tests/pipeline/d1-dataset-records.test.mjs`  
Expected: FAIL because 11406 mapping is absent.

- [ ] **Step 3: Implement fixed bond parent and child SQL**

Prepare `bond_issuances` first, then one `bond_put_rights` insert per child. Bind `sequence` from the array position plus one. Read parents ordered by `bond_code`, read children ordered by `bond_code, sequence`, group children by bond code, and reconstruct one `DatasetRecord` per parent.

Reject a put right without `putDate` or `putPrice`, a duplicate/nonpositive sequence, or a record whose `naturalIdentity` differs from the normalized source identity.

- [ ] **Step 4: Run focused and schema tests**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs tests/pipeline/d1-schema-contract.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/repositories/d1-dataset-mappers.ts tests/pipeline/d1-dataset-records.test.mjs
git commit -m "feat: map bond records to d1"
```

### Task 4: Listing application and underwriter mappings

**Files:**
- Modify: `lib/pipeline/repositories/d1-dataset-mappers.ts`
- Modify: `tests/pipeline/d1-dataset-records.test.mjs`

**Interfaces:**
- Consumes: `NormalizedListingApplicationWithStage11586` from `lib/pipeline/adapters/11586-csv.ts`.
- Produces: one `listing_applications` parent plus ordered `listing_application_underwriters` children per application.

- [ ] **Step 1: Write failing listing parent/child tests**

Use an existing 11586 fixture with multiple underwriters. Assert parent chronology maps only to `complete` or `partial`, children retain source order, and the read result reconstructs the original `underwriters` array and derived `stage`.

Assert that underwriting price fields are neither accepted nor included in any SQL.

- [ ] **Step 2: Run focused listing tests and confirm failure**

Run: `node --test --test-name-pattern="listing|underwriter" tests/pipeline/d1-dataset-records.test.mjs`  
Expected: FAIL because 11586 mapping is absent.

- [ ] **Step 3: Implement fixed listing parent and child SQL**

Prepare the parent followed by ordered child inserts. Read parents by `official_index, company_code`, read children by parent identity and `sequence`, then rebuild the normalized value. Validate stage against:

```ts
type ListingApplicationStage11586 =
  | "applied"
  | "listing_review_completed"
  | "board_approved"
  | "contract_filed_or_regulator_approved"
  | "listed_for_trading";
```

Reject unknown stages and fields named `underwritingPrice`, `price`, `stockPrice`, `volume`, or `recommendation`.

- [ ] **Step 4: Run focused and prohibited-field tests**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs tests/source-verification/*.test.mjs`  
Expected: PASS with no banned runtime field or source findings.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/repositories/d1-dataset-mappers.ts tests/pipeline/d1-dataset-records.test.mjs
git commit -m "feat: map listing applications to d1"
```

### Task 5: Published pointer read and repository integration

**Files:**
- Modify: `lib/pipeline/repositories/d1.ts`
- Modify: `tests/pipeline/d1-repository.test.mjs`
- Modify: `docs/architecture/d1-schema.md`

**Interfaces:**
- Consumes: `PublishedSnapshotPointer`, `DatasetId`.
- Produces: `getPublishedSnapshotPointer(datasetId): Promise<PublishedSnapshotPointer | undefined>` with explicit row mapping and dataset isolation.

- [ ] **Step 1: Write failing pointer-read tests**

```js
test("D1 repository reads the pointer only for the requested dataset", async () => {
  const db = createRecordingD1({
    first: {
      datasetId: "94025",
      sourceId: "94025",
      resourceId: "94025-csv",
      currentSnapshotId: "snapshot-2",
      previousSnapshotId: "snapshot-1",
      publicationRunId: "run-2",
      publishedAt: "2026-07-28T00:00:00.000Z",
    },
  });
  assert.equal((await createRepo(db).getPublishedSnapshotPointer("94025")).currentSnapshotId, "snapshot-2");
  assert.match(db.sql[0], /WHERE dataset_id = \?/);
  assert.equal(db.binds[0][0], "94025");
});
```

Add an empty-row case returning `undefined`.

- [ ] **Step 2: Run pointer tests and confirm failure**

Run: `node --test --test-name-pattern="pointer" tests/pipeline/d1-repository.test.mjs`  
Expected: FAIL because the method currently always returns `undefined`.

- [ ] **Step 3: Implement explicit pointer mapping**

Use a fixed select:

```sql
SELECT dataset_id as datasetId, source_id as sourceId, resource_id as resourceId,
current_snapshot_id as currentSnapshotId, previous_snapshot_id as previousSnapshotId,
publication_run_id as publicationRunId, published_at as publishedAt
FROM published_snapshot_pointers WHERE dataset_id = ?
```

Update `docs/architecture/d1-schema.md` with the four-table mapping, child ordering, invalid-shape behavior, and the rule that D1 reads never contact an external source.

- [ ] **Step 4: Run repository tests**

Run: `node --test tests/pipeline/d1-repository.test.mjs tests/pipeline/d1-dataset-records.test.mjs tests/pipeline/repository-contracts.test.mjs`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/repositories/d1.ts tests/pipeline/d1-repository.test.mjs docs/architecture/d1-schema.md
git commit -m "feat: complete d1 repository reads"
```

### Task 6: Full verification and task boundary

**Files:**
- Modify only if verification exposes a defect in files already listed in Tasks 1–5.

**Interfaces:**
- Consumes: completed D1 dataset mapper and repository.
- Produces: a clean, reviewed Task K-equivalent implementation boundary ready for ingestion orchestration planning.

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/pipeline/d1-dataset-records.test.mjs tests/pipeline/d1-repository.test.mjs tests/pipeline/d1-schema-contract.test.mjs tests/pipeline/repository-contracts.test.mjs`  
Expected: all tests PASS.

- [ ] **Step 2: Run full low-load verification**

Run in a below-normal-priority PowerShell process with `UV_THREADPOOL_SIZE=2`:

```powershell
$env:UV_THREADPOOL_SIZE='2'
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Expected: every command exits `0`; record exact test counts rather than assuming them.

- [ ] **Step 3: Audit prohibited sources and fields**

Run:

```powershell
rg -n -i -g '!node_modules/**' -g '!dist/**' -g '!.git/**' "yahoo|finance\\.yahoo|stockPrice|tradingVolume|recommendation|underwritingPrice" app lib worker scripts
rg -n "SELECT \\*|INSERT OR REPLACE" lib/pipeline/repositories tests/pipeline
```

Expected: first command returns only explicit rejection guards if any; second returns only test assertions and no production SQL.

- [ ] **Step 4: Confirm scope**

Run: `git status --short --branch` and `git log -6 --oneline`.  
Expected: clean worktree on a dedicated implementation branch; no remote D1, binding, orchestrator, scheduler, API, homepage, deployment, push, or merge changes.

- [ ] **Step 5: Request code review**

Use `superpowers:requesting-code-review` against the implementation branch. Fix only findings within this plan, rerun affected focused tests and the full verification, then create a final corrective commit if needed.

---

## Follow-on Plans

After this plan passes review, write separate plans in this order:

1. Ingestion orchestration and three-dataset atomic publication gate.
2. Published snapshot read models and server-side homepage aggregation.
3. Cloud Dancer × Transformative Teal design system and shared responsive shell.
4. Formal homepage and three research-page families.
5. Accessibility, visual regression, production-readiness, and deployment approval gate.
