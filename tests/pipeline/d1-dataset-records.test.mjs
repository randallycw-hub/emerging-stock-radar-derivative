import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1PipelineRepository } from "../../lib/pipeline/repositories/d1.ts";
import { normalize28567Row, parse28567Csv } from "../../lib/source-verification/source-28567.ts";
import { normalize11406Row, parse11406Csv } from "../../lib/source-verification/source-11406.ts";
import { normalize94025Row, parse94025Csv } from "../../lib/source-verification/source-94025.ts";
import { Source11586CsvAdapter } from "../../lib/pipeline/adapters/11586-csv.ts";
import { parse11586Csv } from "../../lib/source-verification/source-11586.ts";

const fixedDependencies = { clock: () => "2026-07-28T00:00:00.000Z" };

function createRecordingD1(selectRows = [], batchResults) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ sql, binds: [] });
      return {
        bind(...binds) {
          calls.at(-1).binds = binds;
          return this;
        },
        async first() { return null; },
        async all() {
          const selected = typeof selectRows === "function" ? selectRows(sql) : selectRows;
          return Array.isArray(selected) ? { success: true, results: selected } : selected;
        },
        async run() { return { success: true }; },
      };
    },
    async batch(statements) {
      calls.push({ batch: statements });
      return batchResults ?? statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

function isChildRead(sql) {
  return sql.includes("FROM bond_put_rights") || sql.includes("FROM listing_application_underwriters");
}

async function normalizedFixtureRecords() {
  const [revenueCsv, profileCsv] = await Promise.all([
    readFile(new URL("../fixtures/source-verification/94025/csv-minimal.csv", import.meta.url), "utf8"),
    readFile(new URL("../fixtures/source-verification/28567/csv-minimal.csv", import.meta.url), "utf8"),
  ]);
  const revenueRow = parse94025Csv(revenueCsv).find((row) => row.companyCode === "4172");
  if (!revenueRow) throw new Error("94025 fixture is missing the optional-field representative row");
  return {
    revenue: normalize94025Row(revenueRow),
    profile: normalize28567Row(parse28567Csv(profileCsv)[0]),
  };
}

async function officialOnePutRight11406Bond() {
  const csv = await readFile(
    new URL("../fixtures/source-verification/11406/csv-minimal.csv", import.meta.url),
    "utf8",
  );
  const row = parse11406Csv(csv).find((candidate) => candidate.bondCode === "35221");
  if (!row) throw new Error("official 11406 fixture is missing its coded one-put-right bond");
  return normalize11406Row(row);
}

async function syntheticTwoPutRight11406Bond() {
  const raw = JSON.parse(await readFile(
    new URL("../fixtures/pipeline/11406/synthetic-two-put-right-raw.json", import.meta.url),
    "utf8",
  ));
  return normalize11406Row(raw);
}

async function official11586ListingApplication(index = 0) {
  const csv = await readFile(
    new URL("../fixtures/source-verification/11586/csv-minimal.csv", import.meta.url),
    "utf8",
  );
  const application = new Source11586CsvAdapter().normalize(parse11586Csv(csv))[index];
  if (!application) throw new Error(`official 11586 fixture is missing application ${index}`);
  return application;
}

function syntheticMultipleUnderwriter11586Contract(officialApplication) {
  // Pipeline-only contract data derived from the official fixture; it is not source provenance.
  return {
    ...officialApplication,
    sourceRecordId: `${officialApplication.sourceRecordId}:synthetic-underwriters`,
    underwriters: [officialApplication.underwriters[0], "Synthetic second underwriter"],
  };
}

function syntheticUnavailableCapital11586Contract(officialApplication) {
  // Pipeline-only normalized contract case; the official fixture remains unchanged.
  return {
    ...officialApplication,
    sourceRecordId: `${officialApplication.sourceRecordId}:synthetic-unavailable-capital`,
    applicationCapitalThousandsTwd: "",
  };
}

function createListingRoundTripD1(snapshotId, application, options = {}) {
  const underwriterRows = application.underwriters.map((underwriterName, index) => ({
    snapshotId,
    sourceRecordId: application.sourceRecordId,
    sequence: index + 1,
    underwriterName,
  }));
  return createRecordingD1((sql) => {
    if (sql.includes("FROM listing_applications")) return [{
      snapshotId,
      sourceRecordId: application.sourceRecordId,
      officialIndex: application.sourceRecordId,
      companyCode: application.companyCode,
      companyShortName: application.companyName,
      chairmanName: application.chairmanName,
      applicationDate: application.applicationDate,
      applicationCapitalThousandsTwd: application.applicationCapitalThousandsTwd || null,
      listingReviewDate: application.listingReviewDate ?? null,
      boardApprovalDate: application.boardApprovalDate ?? null,
      listingContractApprovalOrFilingDate: application.listingContractApprovalOrFilingDate ?? null,
      listingDate: application.listingDate ?? null,
      note: application.note,
      chronologyStatus: application.stage === "listed_for_trading" ? "complete" : "partial",
      sourceId: "11586",
      resourceId: "11586-csv",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      responseHash: "sha256:11586",
      ...options.parentOverrides,
    }];
    if (sql.includes("FROM listing_application_underwriters")) {
      return options.childRowsForSql ? options.childRowsForSql(sql, underwriterRows) : underwriterRows;
    }
    return [];
  });
}

function createBondRoundTripD1(snapshotId, bond, options = {}) {
  const putRightRows = bond.putDates.map((putDate, index) => ({
    snapshotId,
    sourceRecordId: bond.bondId,
    bondCode: bond.bondCode,
    sequence: index + 1,
    putDate,
    putPrice: bond.putPrice,
  }));
  return createRecordingD1((sql) => {
    if (sql.includes("FROM bond_issuances")) return [{
      snapshotId,
      bondCode: bond.bondCode,
      bondName: bond.shortName,
      issuerCompanyCode: bond.issuerCode,
      issuerCompanyName: bond.issuerName,
      sourceBondTypeCode: bond.sourceBondTypeCode,
      seriesNumber: bond.seriesNumber ?? null,
      trancheNumber: bond.trancheNumber ?? null,
      issueDate: bond.issueDate,
      listingDate: bond.listingDate ?? null,
      maturityDate: bond.maturityDate,
      issueAmount: bond.issueAmount,
      currentOutstandingBalance: bond.outstandingAmount,
      couponRate: bond.couponRate ?? null,
      guaranteeStatus: "secured",
      securityDescription: bond.securityDescription ?? null,
      initialConversionPrice: bond.initialConversionPrice ?? null,
      conversionStartDate: bond.conversionStartDate ?? null,
      conversionEndDate: bond.conversionEndDate ?? null,
      underwriter: bond.underwriter ?? null,
      trustee: bond.trustee ?? null,
      latestBalanceChangeDate: bond.outstandingChangeDate ?? null,
      latestBalanceChangeReason: bond.outstandingChangeReason ?? null,
      offeringMethod: bond.offeringMethod ?? null,
      officialDataDate: bond.officialDataDate,
      sourceRecordId: bond.bondId,
      sourceId: "11406",
      resourceId: "11406-csv",
      fetchedAt: "2026-07-28T00:00:00.000Z",
      responseHash: "sha256:11406",
      ...options.parentOverrides,
    }];
    if (sql.includes("FROM bond_put_rights")) {
      return options.childRowsForSql ? options.childRowsForSql(sql, putRightRows) : putRightRows;
    }
    return [];
  });
}

test("D1 mapper round-trips the official 11406 fixture's one put right", async () => {
  const snapshotId = "snapshot-11406-official";
  const bond = await officialOnePutRight11406Bond();
  assert.deepEqual(bond.putDates, ["2025-12-18"]);
  assert.equal(bond.putPrice, "101.0025");
  const db = createBondRoundTripD1(snapshotId, bond);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("11406", snapshotId, [{
    datasetId: "11406", snapshotId, naturalIdentity: bond.bondId, value: bond,
  }]);
  const [roundTripped] = await repo.readDatasetRecords("11406", snapshotId);
  assert.deepEqual(roundTripped.value, bond);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper orders prices and round-trips a synthetic raw two-put-right 11406 fixture", async () => {
  const snapshotId = "snapshot-11406-synthetic";
  const bond = await syntheticTwoPutRight11406Bond();
  assert.deepEqual(bond.putDates, ["2024-12-18", "2025-12-18"]);
  assert.equal(bond.putPrice, "101.0025");
  const db = createBondRoundTripD1(snapshotId, bond);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("11406", snapshotId, [{
    datasetId: "11406", snapshotId, naturalIdentity: bond.bondId, value: bond,
  }]);
  const inserts = db.calls.filter((call) => typeof call.sql === "string" && call.sql.startsWith("INSERT INTO bond_"));
  assert.equal(inserts.length, 3);
  assert.match(inserts[0].sql, /^INSERT INTO bond_issuances/);
  assert.match(inserts[1].sql, /^INSERT INTO bond_put_rights/);
  assert.match(inserts[2].sql, /^INSERT INTO bond_put_rights/);
  assert.deepEqual(inserts.slice(1).map((call) => call.binds[2]), [1, 2]);
  assert.deepEqual(inserts.slice(1).map((call) => call.binds[3]), bond.putDates);
  assert.deepEqual(inserts.slice(1).map((call) => call.binds[4]), [bond.putPrice, bond.putPrice]);
  const [roundTripped] = await repo.readDatasetRecords("11406", snapshotId);
  assert.deepEqual(roundTripped.value, bond);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper rejects a failed 11406 bond parent write", async () => {
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createRecordingD1([], [{ success: false, meta: { changes: 0 } }]);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("11406", "snapshot-failed-bond", [{
      datasetId: "11406", snapshotId: "snapshot-failed-bond", naturalIdentity: bond.bondId, value: bond,
    }]),
    /DATASET_RECORD_WRITE_FAILED/,
  );
});

test("D1 mapper rejects a 11406 batch that omits a put-right result", async () => {
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createRecordingD1([], [
    { success: true, meta: { changes: 1 } },
    { success: true, meta: { changes: 1 } },
  ]);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("11406", "snapshot-truncated-bond", [{
      datasetId: "11406", snapshotId: "snapshot-truncated-bond", naturalIdentity: bond.bondId, value: bond,
    }]),
    /DATASET_RECORD_WRITE_FAILED/,
  );
});

test("D1 mapper rejects a gap in one-based bond put-right sequences", async () => {
  const snapshotId = "snapshot-bond-sequence-gap";
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createBondRoundTripD1(snapshotId, bond, {
    childRowsForSql(_sql, rows) {
      return rows.map((row, index) => ({ ...row, sequence: index === 1 ? 3 : row.sequence }));
    },
  });

  await assert.rejects(
    createD1PipelineRepository(db, fixedDependencies).readDatasetRecords("11406", snapshotId),
    /INVALID_DATASET_RECORD/,
  );
});

test("D1 mapper rejects duplicate bond put-right dates", async () => {
  const snapshotId = "snapshot-bond-duplicate-put-date";
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createBondRoundTripD1(snapshotId, bond, {
    childRowsForSql(_sql, rows) {
      return rows.map((row, index) => ({ ...row, putDate: index === 1 ? rows[0].putDate : row.putDate }));
    },
  });

  await assert.rejects(
    createD1PipelineRepository(db, fixedDependencies).readDatasetRecords("11406", snapshotId),
    /INVALID_DATASET_RECORD/,
  );
});

test("D1 mapper rejects mismatched bond child identity", async () => {
  const snapshotId = "snapshot-bond-child-identity";
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createBondRoundTripD1(snapshotId, bond, {
    childRowsForSql(_sql, rows) {
      return rows.map((row, index) => ({
        ...row,
        sourceRecordId: index === 1 ? "bond:other-source-record" : row.sourceRecordId,
      }));
    },
  });

  await assert.rejects(
    createD1PipelineRepository(db, fixedDependencies).readDatasetRecords("11406", snapshotId),
    /INVALID_DATASET_RECORD/,
  );
});

test("D1 mapper rejects malformed bond child dates and prices", async () => {
  const bond = await syntheticTwoPutRight11406Bond();
  for (const [name, childOverride] of [
    ["date", { putDate: "not-an-iso-date" }],
    ["price", { putPrice: "not-a-positive-decimal" }],
  ]) {
    const snapshotId = `snapshot-bond-invalid-${name}`;
    const db = createBondRoundTripD1(snapshotId, bond, {
      childRowsForSql(_sql, rows) {
        return rows.map((row, index) => ({ ...row, ...(index === 1 ? childOverride : {}) }));
      },
    });

    await assert.rejects(
      createD1PipelineRepository(db, fixedDependencies).readDatasetRecords("11406", snapshotId),
      /INVALID_DATASET_RECORD/,
    );
  }
});

test("D1 mapper scopes bond put-right reads through selected source parents", async () => {
  const snapshotId = "snapshot-bond-source-scope";
  const bond = await syntheticTwoPutRight11406Bond();
  const db = createBondRoundTripD1(snapshotId, bond, {
    childRowsForSql(sql, rows) {
      if (sql.includes("JOIN bond_issuances")) return rows;
      return [...rows, {
        snapshotId,
        sourceRecordId: "bond:orphan-from-another-source",
        bondCode: "ORPHAN",
        sequence: 1,
        putDate: "2025-01-01",
        putPrice: "100",
      }];
    },
  });
  const repo = createD1PipelineRepository(db, fixedDependencies);

  const [roundTripped] = await repo.readDatasetRecords("11406", snapshotId);
  assert.deepEqual(roundTripped.value, bond);
  const childRead = db.calls.find((call) => (
    typeof call.sql === "string" && call.sql.includes("FROM bond_put_rights")
  ));
  assert.deepEqual(childRead.binds, [snapshotId, "11406", "11406-csv"]);
});

test("D1 mapper writes listing applications before ordered underwriters and round-trips their stage", async () => {
  const snapshotId = "snapshot-11586";
  const officialApplication = await official11586ListingApplication();
  const application = syntheticMultipleUnderwriter11586Contract(officialApplication);
  const db = createListingRoundTripD1(snapshotId, application);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("11586", snapshotId, [{
    datasetId: "11586", snapshotId, naturalIdentity: application.sourceRecordId, value: application,
  }]);

  const inserts = db.calls.filter((call) => typeof call.sql === "string" && call.sql.startsWith("INSERT INTO listing_"));
  assert.equal(inserts.length, 1 + application.underwriters.length);
  assert.match(inserts[0].sql, /^INSERT INTO listing_applications/);
  assert.deepEqual(inserts.slice(1).map((call) => call.binds[2]), [1, 2]);
  assert.deepEqual(inserts.slice(1).map((call) => call.binds[3]), application.underwriters);
  assert.equal(inserts[0].binds[13], "complete");
  assert.doesNotMatch(inserts.map((call) => call.sql).join("\n"), /underwriting.?price|stock.?price|\bprice\b|volume|recommendation/i);

  const [roundTripped] = await repo.readDatasetRecords("11586", snapshotId);
  assert.deepEqual(roundTripped.value.underwriters, application.underwriters);
  assert.equal(roundTripped.value.stage, application.stage);
  assert.equal(roundTripped.value.chairmanName, application.chairmanName);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper persists the official partial listing chronology", async () => {
  const snapshotId = "snapshot-11586-partial";
  const application = await official11586ListingApplication(1);
  const db = createListingRoundTripD1(snapshotId, application);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("11586", snapshotId, [{
    datasetId: "11586", snapshotId, naturalIdentity: application.sourceRecordId, value: application,
  }]);

  const parentInsert = db.calls.find((call) => typeof call.sql === "string" && call.sql.startsWith("INSERT INTO listing_applications"));
  assert.equal(parentInsert.binds[13], "partial");
  const [roundTripped] = await repo.readDatasetRecords("11586", snapshotId);
  assert.equal(roundTripped.value.stage, "applied");
  assert.equal(roundTripped.value.chairmanName, application.chairmanName);
});

test("D1 mapper persists unavailable normalized listing capital as NULL and restores an empty string", async () => {
  const snapshotId = "snapshot-11586-unavailable-capital";
  const application = syntheticUnavailableCapital11586Contract(await official11586ListingApplication());
  const db = createListingRoundTripD1(snapshotId, application);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("11586", snapshotId, [{
    datasetId: "11586", snapshotId, naturalIdentity: application.sourceRecordId, value: application,
  }]);

  const parentInsert = db.calls.find((call) => (
    typeof call.sql === "string" && call.sql.startsWith("INSERT INTO listing_applications")
  ));
  assert.equal(parentInsert.binds[7], null);
  const [roundTripped] = await repo.readDatasetRecords("11586", snapshotId);
  assert.deepEqual(roundTripped.value, application);
});

test("D1 mapper rejects malformed and out-of-order listing dates before SQL", async () => {
  const application = await official11586ListingApplication();
  for (const value of [
    { ...application, listingReviewDate: "2026-01-01" },
    { ...application, boardApprovalDate: "2026-99-99" },
  ]) {
    const db = createRecordingD1();
    const repo = createD1PipelineRepository(db, fixedDependencies);
    await assert.rejects(
      repo.writeDatasetRecords("11586", "snapshot-invalid-listing-dates", [{
        datasetId: "11586",
        snapshotId: "snapshot-invalid-listing-dates",
        naturalIdentity: application.sourceRecordId,
        value,
      }]),
      /INVALID_DATASET_RECORD/,
    );
    assert.equal(db.calls.length, 0);
  }
});

test("D1 mapper rejects malformed and out-of-order listing chronology read rows", async () => {
  const snapshotId = "snapshot-invalid-listing-read";
  const application = await official11586ListingApplication();
  for (const parentOverrides of [
    { listingReviewDate: "not-an-iso-date" },
    { listingReviewDate: "2026-01-01" },
  ]) {
    const db = createListingRoundTripD1(snapshotId, application, { parentOverrides });
    const repo = createD1PipelineRepository(db, fixedDependencies);
    await assert.rejects(repo.readDatasetRecords("11586", snapshotId), /INVALID_DATASET_RECORD/);
  }
});

test("D1 mapper scopes listing underwriter reads to the selected source parents", async () => {
  const snapshotId = "snapshot-11586-source-scope";
  const application = syntheticMultipleUnderwriter11586Contract(await official11586ListingApplication());
  const db = createListingRoundTripD1(snapshotId, application, {
    childRowsForSql(sql, expectedRows) {
      if (sql.includes("JOIN listing_applications")) return expectedRows;
      return [...expectedRows, {
        snapshotId,
        sourceRecordId: "orphan-from-another-source",
        sequence: 1,
        underwriterName: "must not be selected",
      }];
    },
  });
  const repo = createD1PipelineRepository(db, fixedDependencies);

  const [roundTripped] = await repo.readDatasetRecords("11586", snapshotId);
  assert.deepEqual(roundTripped.value.underwriters, application.underwriters);
  const childRead = db.calls.find((call) => typeof call.sql === "string" && call.sql.includes("FROM listing_application_underwriters"));
  assert.deepEqual(childRead.binds, [snapshotId, "11586", "11586-csv"]);
});

test("D1 mapper rejects prohibited listing pricing and market fields before SQL", async () => {
  const application = await official11586ListingApplication();
  for (const prohibitedField of ["underwritingPrice", "price", "stockPrice", "volume", "recommendation"]) {
    const db = createRecordingD1();
    const repo = createD1PipelineRepository(db, fixedDependencies);
    await assert.rejects(
      repo.writeDatasetRecords("11586", "snapshot-prohibited-listing", [{
        datasetId: "11586",
        snapshotId: "snapshot-prohibited-listing",
        naturalIdentity: application.sourceRecordId,
        value: { ...application, [prohibitedField]: "not permitted" },
      }]),
      /INVALID_DATASET_RECORD/,
    );
    assert.equal(db.calls.length, 0);
  }
});

test("D1 mapper rejects an unknown listing application stage before SQL", async () => {
  const application = await official11586ListingApplication();
  const db = createRecordingD1();
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("11586", "snapshot-invalid-listing-stage", [{
      datasetId: "11586",
      snapshotId: "snapshot-invalid-listing-stage",
      naturalIdentity: application.sourceRecordId,
      value: { ...application, stage: "not-a-listing-stage" },
    }]),
    /INVALID_DATASET_RECORD/,
  );
  assert.equal(db.calls.length, 0);
});

test("D1 mapper fails closed when any dataset parent read reports failure or lacks result evidence", async () => {
  for (const datasetId of ["94025", "28567", "11406", "11586"]) {
    for (const failedResult of [
      { success: false, results: [] },
      { success: true },
      { results: [] },
    ]) {
      const db = createRecordingD1((sql) => (isChildRead(sql)
        ? { success: true, results: [] }
        : failedResult));
      const repo = createD1PipelineRepository(db, fixedDependencies);

      await assert.rejects(
        repo.readDatasetRecords(datasetId, `snapshot-failed-parent-${datasetId}`),
        (error) => error?.name === "RepositoryError" && error?.code === "DATASET_RECORD_READ_FAILED",
      );
    }
  }
});

test("D1 mapper fails closed when a bond or listing child read reports failure or lacks result evidence", async () => {
  for (const datasetId of ["11406", "11586"]) {
    for (const failedResult of [
      { success: false, results: [] },
      { success: true },
      { results: [] },
    ]) {
      const db = createRecordingD1((sql) => (isChildRead(sql)
        ? failedResult
        : { success: true, results: [] }));
      const repo = createD1PipelineRepository(db, fixedDependencies);

      await assert.rejects(
        repo.readDatasetRecords(datasetId, `snapshot-failed-child-${datasetId}`),
        (error) => error?.name === "RepositoryError" && error?.code === "DATASET_RECORD_READ_FAILED",
      );
    }
  }
});

function assertFixedSql(db, snapshotId) {
  const sql = db.calls.filter((call) => typeof call.sql === "string").map((call) => call.sql);
  assert.ok(sql.length > 0);
  for (const statement of sql) {
    assert.match(statement, /\?/);
    assert.doesNotMatch(statement, /SELECT\s+\*/i);
    assert.doesNotMatch(statement, /INSERT\s+OR\s+REPLACE/i);
    assert.equal(statement.includes(snapshotId), false);
  }
}

function parseInsertSelectShape(sql) {
  const match = /^INSERT INTO [^(]+\(([^)]+)\)\s+SELECT\s+(.+?)\s+FROM\s+/is.exec(sql);
  assert.ok(match, "expected fixed INSERT ... SELECT statement");
  return {
    destinationColumns: match[1].split(",").map((column) => column.trim()),
    selectExpressions: match[2].split(",").map((expression) => expression.trim()),
    placeholderCount: [...sql.matchAll(/\?/g)].length,
  };
}

test("D1 mapper round-trips a normalized 94025 monthly revenue record", async () => {
  const snapshotId = "snapshot-94025";
  const { revenue } = await normalizedFixtureRecords();
  const db = createRecordingD1([{
    snapshotId,
    companyCode: revenue.companyCode,
    companyName: revenue.companyName,
    industry: revenue.industryName,
    reportDate: revenue.sourcePublishedOn,
    revenueYearMonth: revenue.yearMonth,
    currentMonthRevenueThousandsTwd: revenue.currentMonthRevenue,
    previousMonthRevenueThousandsTwd: revenue.previousMonthRevenue ?? null,
    previousYearSameMonthRevenueThousandsTwd: revenue.priorYearMonthRevenue ?? null,
    monthOverMonthPercent: revenue.monthOverMonthPercent ?? null,
    yearOverYearPercent: revenue.yearOverYearPercent ?? null,
    currentYearCumulativeRevenueThousandsTwd: revenue.cumulativeRevenue ?? null,
    previousYearCumulativeRevenueThousandsTwd: revenue.priorYearCumulativeRevenue ?? null,
    cumulativeYearOverYearPercent: revenue.cumulativeYearOverYearPercent ?? null,
    sourceRecordId: `${revenue.companyCode}:${revenue.yearMonth}`,
    sourceId: "94025",
    resourceId: "94025-csv",
    fetchedAt: "2026-07-28T00:00:00.000Z",
    responseHash: "sha256:94025",
  }]);
  const repo = createD1PipelineRepository(db, fixedDependencies);
  const naturalIdentity = `${revenue.companyCode}:${revenue.yearMonth}`;

  await repo.writeDatasetRecords("94025", snapshotId, [{
    datasetId: "94025", snapshotId, naturalIdentity, value: revenue,
  }]);
  assert.deepEqual(await repo.readDatasetRecords("94025", snapshotId), [{
    datasetId: "94025", snapshotId, naturalIdentity, value: revenue,
  }]);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper round-trips a normalized 28567 company profile record", async () => {
  const snapshotId = "snapshot-28567";
  const { profile } = await normalizedFixtureRecords();
  const db = createRecordingD1([{
    snapshotId,
    companyCode: profile.companyCode,
    companyName: profile.companyName,
    companyShortName: profile.companyShortName,
    unifiedBusinessNumber: profile.taxId,
    paidInCapital: profile.paidInCapital,
    chairperson: profile.chairperson,
    generalManager: profile.generalManager,
    industryCode: null,
    industryName: profile.industryName,
    establishmentDate: profile.establishmentDate,
    companyAddress: profile.address,
    companyPhone: null,
    companyWebsite: profile.websiteUrl,
    publicOfferingDate: null,
    sourceRecordId: profile.sourceRecordId,
    sourceId: "28567",
    resourceId: "28567-csv",
    fetchedAt: "2026-07-28T00:00:00.000Z",
    responseHash: "sha256:28567",
  }]);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await repo.writeDatasetRecords("28567", snapshotId, [{
    datasetId: "28567", snapshotId, naturalIdentity: profile.sourceRecordId, value: profile,
  }]);
  const insert = db.calls.find((call) => (
    typeof call.sql === "string" && call.sql.startsWith("INSERT INTO public_company_profiles")
  ));
  const shape = parseInsertSelectShape(insert.sql);
  assert.equal(shape.destinationColumns.length, 20);
  assert.equal(shape.selectExpressions.length, 20);
  assert.equal(shape.placeholderCount, 17);
  assert.equal(insert.binds.length, 17);
  assert.deepEqual(await repo.readDatasetRecords("28567", snapshotId), [{
    datasetId: "28567", snapshotId, naturalIdentity: profile.sourceRecordId, value: profile,
  }]);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper rejects writes when the source snapshot cannot prove dataset and resource scope", async () => {
  const snapshotId = "snapshot-without-approved-source";
  const { revenue } = await normalizedFixtureRecords();
  const db = createRecordingD1([], [{ success: true, meta: { changes: 0 } }]);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("94025", snapshotId, [{
      datasetId: "94025", snapshotId, naturalIdentity: `${revenue.companyCode}:${revenue.yearMonth}`, value: revenue,
    }]),
    /DATASET_RECORD_WRITE_FAILED/,
  );
});

test("D1 mapper rejects writes without an affected-row count", async () => {
  const snapshotId = "snapshot-without-change-metadata";
  const { revenue } = await normalizedFixtureRecords();
  const db = createRecordingD1([], [{ success: true }]);
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("94025", snapshotId, [{
      datasetId: "94025", snapshotId, naturalIdentity: `${revenue.companyCode}:${revenue.yearMonth}`, value: revenue,
    }]),
    /DATASET_RECORD_WRITE_FAILED/,
  );
});

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
      value: { revenueUnit: "仟元", companyCode: "" },
    }]),
    /INVALID_DATASET_RECORD/,
  );
  assert.equal(db.calls.length, 0);
});
