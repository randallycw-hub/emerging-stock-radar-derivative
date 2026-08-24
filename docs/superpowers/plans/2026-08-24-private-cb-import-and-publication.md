# Private CB Import and Publication Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Build a localhost-only CBAS and CB issuance import pipeline that preserves private snapshots, reports differences, and emits public-safe data only after explicit approval.

**Architecture:** A Node CLI is the management boundary. It reads local \`.xlsx\` files, validates exact worksheet schemas, maps to immutable snapshots below the current user's local application-data directory, and calculates deterministic differences. The existing static site continues to read public data only; neither importer nor raw spreadsheets are staged for deployment.

**Tech Stack:** Node.js 22 ESM, ExcelJS, Node crypto/fs, existing static-showcase generation scripts, Node test runner.

**Spec:** \`docs/superpowers/specs/2026-08-24-private-cb-data-import-design.md\`

## Global Constraints

- The management tool opens no network listener and has no public route, navigation item, upload control, or bundle.
- The default store is under \`%LOCALAPPDATA%\`; tests inject a temporary root. Raw spreadsheets never enter Git.
- Only \`.xlsx\` is accepted. Reject macros, invalid ZIP signatures, files over 15 MiB, unknown sheets, missing headers, invalid dates and duplicate canonical keys before writing a snapshot.
- Every snapshot stores kind, source date, SHA-256, import time, row count, source rights and validation diagnostics.
- \`licensed-private\` values never enter a public static generation. Only an explicit \`licensed-public\` release can pass the publication gate.
- A failed candidate preserves the prior approved public snapshot byte-for-byte.
- Do not import personal data, credentials, portfolios, or third-party private/member data. CPU-intensive commands use at most two threads and BelowNormal priority.

---

### Task 1: Private storage and safe input contract

**Files:**
- Create: \`lib/private-cb-import/contracts.mjs\`
- Create: \`lib/private-cb-import/storage.mjs\`
- Create: \`tests/private-cb-import/storage.test.mjs\`
- Modify: \`package.json\`
- Modify: \`package-lock.json\`

**Interfaces:**
- \`validateImportFile({ filePath, maxBytes? }) -> { absolutePath, bytes, sha256 }\`
- \`createPrivateStore({ root? }) -> { saveSnapshot, readSnapshot, readLatest, listSnapshots }\`

- [ ] **Step 1: Write failing tests**

\`\`\`js
test("private snapshots are immutable and outside the site root", async () => {
  const store = createPrivateStore({ root: await mkdtemp(join(tmpdir(), "cb-private-")) });
  const snapshot = { kind: "cbas", sourceDate: "2026-08-24", sha256: "a".repeat(64), records: [] };
  await store.saveSnapshot(snapshot);
  await assert.rejects(() => store.saveSnapshot({ ...snapshot, records: [{ bondCode: "17172" }] }), /immutable/i);
});

test("input validation rejects macros, oversize files and non-ZIP bytes", async () => {
  await assert.rejects(() => validateImportFile({ filePath: "bad.xlsm" }), /\.xlsx/i);
  await assert.rejects(() => validateImportFile({ filePath: oversizedPath, maxBytes: 8 }), /size/i);
  await assert.rejects(() => validateImportFile({ filePath: textPath }), /ZIP signature/i);
});
\`\`\`

- [ ] **Step 2: Run the test and confirm RED**

Run: \`node --test tests/private-cb-import/storage.test.mjs\`

Expected: FAIL because the storage contract is not implemented.

- [ ] **Step 3: Implement the smallest safe contract**

\`\`\`js
export const PRIVATE_SOURCE_RIGHTS = new Set(["licensed-private", "licensed-public"]);

export async function validateImportFile({ filePath, maxBytes = 15 * 1024 * 1024 }) {
  if (extname(filePath).toLowerCase() !== ".xlsx") throw new Error("only .xlsx files are accepted");
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) throw new Error("input file size is invalid");
  const signature = await readPrefix(filePath, 4);
  if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) throw new Error("input is missing XLSX ZIP signature");
  return { absolutePath: resolve(filePath), bytes: stat.size, sha256: await sha256File(filePath) };
}
\`\`\`

Add \`exceljs@4.4.0\` for local decoding only. Snapshot filenames derive from SHA-256 and store metadata plus canonical data atomically.

- [ ] **Step 4: Verify GREEN and dependency health**

Run: \`node --test tests/private-cb-import/storage.test.mjs\` then \`npm audit --omit=dev --audit-level=high\`

Expected: tests pass and audit has zero high vulnerabilities.

- [ ] **Step 5: Commit**

\`\`\`bash
git add package.json package-lock.json lib/private-cb-import tests/private-cb-import/storage.test.mjs
git commit -m "feat: add private CB import storage"
\`\`\`

### Task 2: Parse the CBAS workbook

**Files:**
- Create: \`lib/private-cb-import/cbas-parser.mjs\`
- Create: \`tests/private-cb-import/cbas-parser.test.mjs\`

**Interfaces:**
- \`parseCbasWorkbook(input) -> { kind: "cbas", sourceDate, sourceRights, quoteRecords, dueRecords, conversionStops, diagnostics }\`
- Quote identity is \`bondCode\`; due and conversion-stop identity is \`bondCode + eventDate\`.

- [ ] **Step 1: Write failing workbook-mapping tests**

\`\`\`js
test("CBAS parser maps quotes, force-redemption and close-conversion sections", async () => {
  const input = await writeCbasFixtureWorkbook({ reportDate: "2026-08-24", bondCode: "17172" });
  const result = await parseCbasWorkbook({ ...(await validateImportFile({ filePath: input })), sourceRights: "licensed-private" });
  assert.equal(result.sourceDate, "2026-08-24");
  assert.equal(result.quoteRecords[0].bondCode, "17172");
  assert.equal(result.dueRecords[0].status, "強贖");
});

test("CBAS parser rejects unknown worksheets and duplicate canonical rows", async () => {
  await assert.rejects(() => parseCbasWorkbook(unknownSheetInput), /unknown CBAS worksheet/i);
  await assert.rejects(() => parseCbasWorkbook(duplicateInput), /duplicate/i);
});
\`\`\`

- [ ] **Step 2: Run RED**

Run: \`node --test tests/private-cb-import/cbas-parser.test.mjs\`

Expected: FAIL because the parser export is missing.

- [ ] **Step 3: Implement a strict allowlist**

\`\`\`js
const CBAS_SHEETS = new Set([
  "金融交易部資產交換選擇權報價表",
  "即將到期",
  "轉(交)換公司債停止轉(交)換資訊",
]);

export async function parseCbasWorkbook(input) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(input.absolutePath);
  assertExactSheetNames(workbook, CBAS_SHEETS);
  return freezeSnapshot({
    kind: "cbas",
    sourceDate: readReportDate(workbook.getWorksheet("金融交易部資產交換選擇權報價表")),
    sourceRights: input.sourceRights,
    ...mapCbasSheets(workbook),
  });
}
\`\`\`

Map the 23-column quote sheet, the 10-column upcoming-due sheet, and the 5-column close-conversion sheet. Reject non-five/six-digit bond codes, invalid ISO dates and non-finite numeric values. Preserve no formulas, styles, comments, hyperlinks, or macros.

- [ ] **Step 4: Run GREEN**

Run: \`node --test tests/private-cb-import/cbas-parser.test.mjs\`

Expected: all tests pass; all workbook fixtures are temporary.

- [ ] **Step 5: Commit**

\`\`\`bash
git add lib/private-cb-import/cbas-parser.mjs tests/private-cb-import/cbas-parser.test.mjs
git commit -m "feat: parse private CBAS snapshots"
\`\`\`

### Task 3: Parse issuance updates and compute differences

**Files:**
- Create: \`lib/private-cb-import/issuance-parser.mjs\`
- Create: \`lib/private-cb-import/diff.mjs\`
- Create: \`tests/private-cb-import/issuance-diff.test.mjs\`

**Interfaces:**
- \`parseIssuanceWorkbook(input) -> { kind: "issuance", sourceDate, sourceRights, records, diagnostics }\`
- \`diffSnapshots(previous, candidate) -> { added, changed, removed, unchanged, invalid }\`
- Issuance identity is required \`bondCode\`; changed entries include sorted changed field names and before/after values.

- [ ] **Step 1: Write failing parser/diff tests**

\`\`\`js
test("issuance parser maps the 18-column IPO sheet and extracts filename date", async () => {
  const snapshot = await parseIssuanceWorkbook({ ...(await validateImportFile({ filePath })), sourceRights: "licensed-private" });
  assert.equal(snapshot.sourceDate, "2026-08-21");
  assert.deepEqual(snapshot.records[0], assert.objectContains({ bondCode: "89365", issuerCode: "8936", listingDate: "2026-08-17" }));
});

test("diff separates added, changed and removed bond codes", () => {
  const report = diffSnapshots({ records: [{ bondCode: "89365", listingDate: "2026-08-17" }, { bondCode: "30811" }] }, { records: [{ bondCode: "89365", listingDate: "2026-08-24" }, { bondCode: "49731" }] });
  assert.deepEqual(report.added.map((row) => row.bondCode), ["49731"]);
  assert.deepEqual(report.changed[0].fields, ["listingDate"]);
  assert.deepEqual(report.removed.map((row) => row.bondCode), ["30811"]);
});
\`\`\`

- [ ] **Step 2: Run RED**

Run: \`node --test tests/private-cb-import/issuance-diff.test.mjs\`

Expected: FAIL because parser and diff exports are missing.

- [ ] **Step 3: Implement deterministic parsing and difference output**

\`\`\`js
export function diffSnapshots(previous, candidate) {
  const before = indexUnique(previous?.records ?? [], (record) => record.bondCode);
  const after = indexUnique(candidate?.records ?? [], (record) => record.bondCode);
  return buildSortedDiff(before, after);
}
\`\`\`

Require \`CB發行案件更新_YYYYMMDD.xlsx\`; map issuer, bond, dates, event stage, premium, conversion price and remarks. Treat \`TCRI/擔保\` as private. Reject filename date mismatch, blank bond code, invalid dates and duplicate codes.

- [ ] **Step 4: Run GREEN**

Run: \`node --test tests/private-cb-import/issuance-diff.test.mjs\`

Expected: all classifications are stable and sorted by bond code.

- [ ] **Step 5: Commit**

\`\`\`bash
git add lib/private-cb-import/issuance-parser.mjs lib/private-cb-import/diff.mjs tests/private-cb-import/issuance-diff.test.mjs
git commit -m "feat: compare private CB issuance snapshots"
\`\`\`

### Task 4: Add the local import command and release gate

**Files:**
- Create: \`scripts/private-cb-import.mjs\`
- Create: \`lib/private-cb-import/publication.mjs\`
- Create: \`tests/private-cb-import/publication.test.mjs\`
- Modify: \`package.json\`
- Modify: \`README.md\`

**Interfaces:**
- \`npm run private:cb-import -- --kind cbas|issuance --file <absolute-xlsx-path> --rights licensed-private|licensed-public\`
- \`createPublicCandidate({ approvedSnapshot, previousPublic })\`
- \`publishPublicCandidate({ candidate, outputPath, approvedBy })\`

- [ ] **Step 1: Write failing public-gate tests**

\`\`\`js
test("public candidate strips private CBAS and TCRI fields", () => {
  const candidate = createPublicCandidate({ approvedSnapshot: privateSnapshot, previousPublic: priorPublic });
  assert.equal(candidate.records[0].tcri, undefined);
  assert.equal(candidate.records[0].cbMarketPrice, undefined);
});

test("rejected candidate leaves previous public bytes unchanged", async () => {
  await writeFile(outputPath, priorText, "utf8");
  await assert.rejects(() => publishPublicCandidate({ candidate: { status: "rejected" }, outputPath, approvedBy: "local" }), /ready/i);
  assert.equal(await readFile(outputPath, "utf8"), priorText);
});
\`\`\`

- [ ] **Step 2: Run RED**

Run: \`node --test tests/private-cb-import/publication.test.mjs\`

Expected: FAIL because the publication gate is not implemented.

- [ ] **Step 3: Implement explicit rights and atomic output**

\`\`\`js
const PRIVATE_FIELDS = new Set(["tcri", "optionQuote", "discountRate", "optionExpiryDate", "putPrice", "conversionValue", "cbMarketPrice", "premiumDiscountRate", "referenceQuote", "volatility21d", "spread"]);

export function createPublicCandidate({ approvedSnapshot, previousPublic }) {
  if (approvedSnapshot.sourceRights !== "licensed-public") throw new Error("public release requires licensed-public rights");
  return validatePublicCandidate(stripFields(approvedSnapshot, PRIVATE_FIELDS), previousPublic);
}
\`\`\`

The command accepts named arguments only, rejects relative paths and unknown flags, prints only snapshot/date/count/diff summary, and has no network/upload/deploy capability. Publication requires a separate explicit local command.

- [ ] **Step 4: Run GREEN**

Run: \`node --test tests/private-cb-import/publication.test.mjs && npm run private:cb-import -- --help\`

Expected: tests pass and help confirms local-only behavior.

- [ ] **Step 5: Commit**

\`\`\`bash
git add package.json README.md scripts/private-cb-import.mjs lib/private-cb-import/publication.mjs tests/private-cb-import/publication.test.mjs
git commit -m "feat: add private CB import command"
\`\`\`

### Task 5: Improve public presentation and release safely

**Files:**
- Modify: \`static-showcase/assets/bonds-page.js\`
- Modify: \`static-showcase/assets/bond-detail-page.js\`
- Modify: \`tests/static-showcase-bond-ui.test.mjs\`
- Modify: \`tests/static-showcase-bond-detail.test.mjs\`

**Interfaces:**
- \`bondListPresentation(view).qualityLabel\` must only be \`已驗證\` or \`部分公開資料\`.
- Public values still originate only from the verified static generation; private values are never substituted.

- [ ] **Step 1: Write failing presentation test**

\`\`\`js
test("public list never emits pending or unapproved-data placeholders", () => {
  const presentation = bondListPresentation({ dataQuality: "partial", missingReasons: ["MISSING_CB_CLOSE"] });
  assert.equal(presentation.qualityLabel, "部分公開資料");
  assert.doesNotMatch(renderBondList(presentation), /待補|待確認|無核准公開資料/);
});
\`\`\`

- [ ] **Step 2: Run RED**

Run: \`node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-bond-detail.test.mjs\`

Expected: FAIL because the current list calls partial data \`待補\`.

- [ ] **Step 3: Implement transparent public copy**

\`\`\`js
qualityLabel: view.dataQuality === "complete" && !view.missingReasons?.length
  ? "已驗證"
  : "部分公開資料";
\`\`\`

Keep last valid verified values and source dates. Do not use guesses, zeroes, private data, or other bond values to fill gaps.

- [ ] **Step 4: Run GREEN**

Run: \`node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-bond-detail.test.mjs\`

Expected: all affected UI tests pass with no pending/unapproved placeholder.

- [ ] **Step 5: Merge, validate, build and publish**

Merge the existing \`157c471\` public screener/source disclosure commit and this work into the isolated branch. Import the three supplied spreadsheets with \`licensed-private\` rights, so that the import/diff path is verified without releasing their raw values.

Run \`npm test\`, \`npm run typecheck\`, \`npm run lint\`, and \`npm audit --omit=dev --audit-level=high\` under BelowNormal priority and two worker threads. Build with \`npm run build\`; inspect the local bond page; search \`dist/client/market-site\` for \`CBAS|TCRI|licensed-private|CB發行案件更新\` and require no matches. Merge only verified changes to \`main\`, then deploy the public-safe static site through the existing Sites hosting procedure.

Expected: the published page has the improved public screeners and source disclosure, no public pending placeholders, no raw workbook/private fields, and a reported deployment URL/data date.

- [ ] **Step 6: Commit**

\`\`\`bash
git add static-showcase/assets/bonds-page.js static-showcase/assets/bond-detail-page.js tests/static-showcase-bond-ui.test.mjs tests/static-showcase-bond-detail.test.mjs
git commit -m "fix: clarify partial public CB coverage"
\`\`\`

