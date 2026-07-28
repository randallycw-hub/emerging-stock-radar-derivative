import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createD1PipelineRepository } from "../../lib/pipeline/repositories/d1.ts";
import { normalize28567Row, parse28567Csv } from "../../lib/source-verification/source-28567.ts";
import { normalize11406Row } from "../../lib/source-verification/source-11406.ts";
import { normalize94025Row, parse94025Csv } from "../../lib/source-verification/source-94025.ts";

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
        async all() { return { results: typeof selectRows === "function" ? selectRows(sql) : selectRows }; },
        async run() { return { success: true }; },
      };
    },
    async batch(statements) {
      calls.push({ batch: statements });
      return batchResults ?? statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
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

function syntheticTwoPutRight11406Row() {
  return {
    officialDataDate: "20260723",
    issuerCode: "3522",
    issuerName: "Synthetic issuer",
    bondCode: "SYN11406",
    sourceBondTypeCode: "5",
    seriesNumber: "1",
    trancheNumber: "",
    shortName: "Synthetic bond",
    issueDate: "20231218",
    listingDate: "20231218",
    maturityDate: "20261218",
    issueAmount: "150000000",
    outstandingAmount: "123100000",
    couponRate: "0.000000",
    securedText: "1",
    securityDescription: "Synthetic security",
    initialConversionPrice: "19.5000",
    conversionStartDate: "20240319",
    conversionEndDate: "20261218",
    putDatesText: "20241218、20251218",
    putPrice: "101.0025、101.0025",
    underwriter: "Synthetic underwriter",
    trustee: "Synthetic trustee",
    outstandingChangeDate: "20250228",
    outstandingChangeReason: "Synthetic change reason",
    offeringMethod: "7",
  };
}

test("D1 mapper stores a normalized two-put-right 11406 bond parent before ordered children", async () => {
  const snapshotId = "snapshot-11406";
  const bond = normalize11406Row(syntheticTwoPutRight11406Row());
  assert.deepEqual(bond.putDates, ["2024-12-18", "2025-12-18"]);
  assert.equal(bond.putPrice, "101.0025");
  const db = createRecordingD1((sql) => {
    if (sql.includes("FROM bond_issuances")) return [{
      snapshotId,
      bondCode: bond.bondCode,
      bondName: bond.shortName,
      issuerCompanyCode: bond.issuerCode,
      issuerCompanyName: bond.issuerName,
      issueDate: bond.issueDate,
      listingDate: bond.listingDate ?? null,
      maturityDate: bond.maturityDate,
      issueAmount: bond.issueAmount,
      currentOutstandingBalance: bond.outstandingAmount,
      couponRate: bond.couponRate ?? null,
      guaranteeStatus: "secured",
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
    }];
    if (sql.includes("FROM bond_put_rights")) return [
      { snapshotId, bondCode: bond.bondCode, sequence: 1, putDate: bond.putDates[0], putPrice: bond.putPrice },
      { snapshotId, bondCode: bond.bondCode, sequence: 2, putDate: bond.putDates[1], putPrice: bond.putPrice },
    ];
    return [];
  });
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
  assert.deepEqual(roundTripped.value.putDates, bond.putDates);
  assert.equal(roundTripped.value.putPrice, bond.putPrice);
  assertFixedSql(db, snapshotId);
});

test("D1 mapper rejects a failed 11406 bond parent write", async () => {
  const bond = normalize11406Row(syntheticTwoPutRight11406Row());
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
  const bond = normalize11406Row(syntheticTwoPutRight11406Row());
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
