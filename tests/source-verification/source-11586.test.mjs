import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFixtureMetadata, sha256Hex, verifyFixtureIntegrity } from "../../lib/source-verification/fixture-metadata.ts";

import {
  assertUnique11586Applications,
  compare11586ResourceSchemas,
  normalize11586Application,
  parse11586Csv,
  parse11586Json,
} from "../../lib/source-verification/source-11586.ts";

const fixtureText = (name) => readFile(
  new URL(`../../tests/fixtures/source-verification/11586/${name}`, import.meta.url),
  "utf8",
);

test("11586 fixture parses CSV and OpenAPI rows into the same canonical fields", async () => {
  const csvRows = parse11586Csv(await fixtureText("csv-minimal.csv"));
  const jsonRows = parse11586Json(JSON.parse(await fixtureText("openapi-minimal.json")));
  assert.equal(csvRows.length, 2);
  assert.deepEqual(compare11586ResourceSchemas(csvRows, jsonRows), {
    equivalent: true,
    missingInCsv: [],
    missingInJson: [],
  });
});

test("11586 normalized mapping preserves dates and excludes underwriting price", async () => {
  const [row] = parse11586Csv(await fixtureText("csv-minimal.csv"));
  const normalized = normalize11586Application(row);
  assert.deepEqual(normalized, {
    sourceDatasetId: "11586",
    sourceRecordId: "TWSE:1234",
    companyCode: "1234",
    companyName: "測試公司",
    applicationDate: "2026-01-05",
    chairmanName: "測試董事長",
    applicationCapitalThousandsTwd: "123456",
    listingReviewDate: "2026-02-10",
    boardApprovalDate: "2026-02-20",
    listingContractApprovalOrFilingDate: "2026-03-01",
    listingDate: "2026-04-15",
    underwriters: ["測試承銷商"],
    note: "",
  });
  assert.equal("underwritingPrice" in normalized, false);
});

test("11586 rejects semantic JSON field shifts instead of silently accepting them", async () => {
  const official = JSON.parse(await fixtureText("openapi-minimal.json"));
  const shifted = structuredClone(official);
  [shifted[0].companyName, shifted[0].chairmanName] = [
    shifted[0].chairmanName,
    shifted[0].companyName,
  ];
  assert.equal(compare11586ResourceSchemas(parse11586Json(official), parse11586Json(shifted)).equivalent, false);
});

test("11586 accepts blank optional dates and rejects impossible chronology", () => {
  const blank = {
    sourceRecordId: "TWSE:9999",
    companyCode: "9999",
    companyName: "空日期公司",
    applicationDate: "2026-01-05",
    chairmanName: "",
    applicationCapitalThousandsTwd: "",
    listingReviewDate: "",
    boardApprovalDate: "",
    listingContractApprovalOrFilingDate: "",
    listingDate: "",
    underwriters: "",
    underwritingPrice: "120.5",
    note: "",
  };
  assert.equal(normalize11586Application(blank).listingDate, undefined);
  assert.throws(() => normalize11586Application({ ...blank, listingDate: "2025-12-01" }), /chronology|listingDate/);
});

test("11586 rejects duplicate application identity and unknown fields", () => {
  const row = {
    sourceRecordId: "TWSE:1234",
    companyCode: "1234",
    companyName: "測試公司",
    applicationDate: "2026-01-05",
    chairmanName: "",
    applicationCapitalThousandsTwd: "",
    listingReviewDate: "",
    boardApprovalDate: "",
    listingContractApprovalOrFilingDate: "",
    listingDate: "",
    underwriters: "",
    underwritingPrice: "",
    note: "",
  };
  const normalized = normalize11586Application(row);
  assert.throws(() => assertUnique11586Applications([normalized, normalized]), /duplicate/);
  assert.throws(() => normalize11586Application({ ...row, unexpected: "x" }), /unknown/);
});

test("11586 fixture metadata records both resources and integrity hashes", async () => {
  const metadata = JSON.parse(await fixtureText("metadata.json"));
  const csvMetadata = parseFixtureMetadata(metadata.csv);
  const jsonMetadata = parseFixtureMetadata(metadata.openapi);
  assert.equal(csvMetadata.datasetId, "11586");
  assert.equal(csvMetadata.resourceRole, "csv");
  assert.equal(csvMetadata.resourceUrl, "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data");
  assert.equal(csvMetadata.sourceRowCount, 695);
  assert.equal(jsonMetadata.resourceRole, "openapi_json");
  assert.equal(jsonMetadata.sourceRowCount, 695);
  assert.equal(jsonMetadata.sourceResponseSha256, "sha256:f15a53807561b1da17355d899c5a030beaac714905e8b249882a6329350ea3fd");
  const csvBytes = new Uint8Array(await readFile(new URL("../../tests/fixtures/source-verification/11586/csv-minimal.csv", import.meta.url)));
  assert.equal(sha256Hex(csvBytes), csvMetadata.fixtureSha256);
  verifyFixtureIntegrity(csvMetadata, csvBytes, 2);
  const openapiBytes = new Uint8Array(await readFile(new URL("../../tests/fixtures/source-verification/11586/openapi-minimal.json", import.meta.url)));
  assert.equal(sha256Hex(openapiBytes), jsonMetadata.fixtureSha256);
  verifyFixtureIntegrity(jsonMetadata, openapiBytes, 2);
});

test("11586 evidence records the live endpoint field-shift risk without upgrading the registry", async () => {
  const evidence = await readFile(new URL("../../docs/source-verification/11586-evidence.md", import.meta.url), "utf8");
  assert.match(evidence, /APPROVED_FOR_V1_DESIGN/);
  assert.match(evidence, /applylistingLocal/);
  assert.match(evidence, /field-shift|misalignment/i);
  assert.match(evidence, /VERIFIED_FOR_IMPLEMENTATION/);
});
