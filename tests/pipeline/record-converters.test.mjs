import test from "node:test";
import assert from "node:assert/strict";
import { toDatasetRecords } from "../../lib/pipeline/orchestration/record-converters.ts";

const base = { runId: "run-1", sourceId: "94025", resourceId: "94025-csv", executionStatus: "succeeded", integrityReport: { canPublishCandidate: true }, records: [] };

test("converts monthly revenue with a stable company-month identity", () => {
  const result = toDatasetRecords("94025", "snapshot-1", {
    ...base,
    records: [{ companyCode: "A1", companyName: "Alpha", industryName: "Tech", yearMonth: "2026-06", sourcePublishedOn: "2026-07-01", revenueUnit: "仟元", currentMonthRevenue: "10" }],
  });
  assert.equal(result[0].naturalIdentity, "A1:2026-06");
  assert.equal(result[0].value.companyCode, "A1");
});

test("converts bond and listing records without prohibited transport fields", () => {
  const bond = toDatasetRecords("11406", "snapshot-b", { ...base, sourceId: "11406", resourceId: "11406-csv", records: [{ bondId: "B1", issuerCode: "C1", issuerName: "Issuer", shortName: "Bond", sourceBondTypeCode: "CB", issueDate: "2026-01-01", maturityDate: "2030-01-01", issueAmount: "10", outstandingAmount: "10", secured: false, putDates: [], officialDataDate: "2026-07-01" }] });
  assert.equal(bond[0].naturalIdentity, "B1");
  assert.equal(Object.hasOwn(bond[0].value, "price"), false);
  const listing = toDatasetRecords("11586", "snapshot-l", { ...base, sourceId: "11586", resourceId: "11586-csv", records: [{ sourceDatasetId: "11586", sourceRecordId: "L1", companyCode: "C1", companyName: "Issuer", applicationDate: "2026-01-01", chairmanName: "Chair", applicationCapitalThousandsTwd: "", underwriters: [], note: "", stage: "applied" }] });
  assert.equal(listing[0].naturalIdentity, "L1");
  assert.equal(Object.hasOwn(listing[0].value, "underwritingPrice"), false);
});

test("converts company profile records with their source identity", () => {
  const result = toDatasetRecords("28567", "snapshot-c", { ...base, sourceId: "28567", resourceId: "28567-csv", records: [{ sourceDatasetId: "28567", sourceRecordId: "C1:T1", companyCode: "C1", companyName: "Issuer", companyShortName: "Issuer", industryName: "Tech", websiteUrl: "https://example.test", establishmentDate: "2020-01-01", paidInCapital: "10", chairperson: "Chair", generalManager: "GM", taxId: "T1", address: "Address" }] });
  assert.equal(result[0].naturalIdentity, "C1:T1");
});

test("rejects failed results and duplicate identities before persistence", () => {
  assert.throws(() => toDatasetRecords("94025", "snapshot-1", { ...base, executionStatus: "failed_parse" }), /ADAPTER_NOT_SUCCESSFUL/);
  assert.throws(() => toDatasetRecords("94025", "snapshot-1", { ...base, records: [{ companyCode: "A1", companyName: "A", industryName: "T", yearMonth: "2026-06", sourcePublishedOn: "2026-07-01", revenueUnit: "仟元", currentMonthRevenue: "1" }, { companyCode: "A1", companyName: "A", industryName: "T", yearMonth: "2026-06", sourcePublishedOn: "2026-07-01", revenueUnit: "仟元", currentMonthRevenue: "1" }] }), /DUPLICATE_NATURAL_IDENTITY/);
});
