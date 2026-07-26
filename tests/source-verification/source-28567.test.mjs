import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertUnique28567Identities,
  join28567To94025Coverage,
  normalize28567Row,
  parse28567Csv,
  parse28567Json,
  Source28567ValidationError,
} from "../../lib/source-verification/source-28567.ts";

const dir = new URL("../fixtures/source-verification/28567/", import.meta.url);
const text = (name) => readFile(new URL(name, dir), "utf8");

test("28567 CSV and OpenAPI fixtures expose the same canonical fields", async () => {
  const [csv, json] = await Promise.all([text("csv-minimal.csv"), text("openapi-minimal.json")]);
  const csvRow = normalize28567Row(parse28567Csv(csv)[0]);
  const jsonRow = normalize28567Row(parse28567Json(JSON.parse(json))[0]);
  assert.deepEqual(jsonRow, csvRow);
});

test("28567 normalizes dates, URLs and capital while excluding market status", () => {
  const row = normalize28567Row({
    companyCode: "A", companyName: "Name", companyShortName: "Short", industryName: "Industry",
    websiteUrl: "https://example.com", establishmentDate: "0900101", paidInCapital: "1,000.00",
    chairperson: "Chair", generalManager: "Manager", taxId: "12345678", address: "Address",
  });
  assert.equal(row.establishmentDate, "2001-01-01");
  assert.equal(row.paidInCapital, "1000");
  assert.equal(row.sourceRecordId, "A:12345678");
  assert.equal("isEmerging" in row, false);
});

test("28567 rejects unknown, duplicate and malformed identity data", () => {
  const base = {
    companyCode: "A", companyName: "Name", companyShortName: "Short", industryName: "Industry",
    websiteUrl: "https://example.com", establishmentDate: "0900101", paidInCapital: "1000",
    chairperson: "Chair", generalManager: "Manager", taxId: "12345678", address: "Address",
  };
  assert.throws(() => normalize28567Row({ ...base, marketStatus: "emerging" }), Source28567ValidationError);
  assert.throws(() => assertUnique28567Identities([normalize28567Row(base), normalize28567Row(base)]), /duplicate identity/);
  assert.throws(() => normalize28567Row({ ...base, websiteUrl: "not-a-url" }), /absolute URL/);
});

test("28567 joins only the 94025 coverage set and rejects ambiguous profiles", () => {
  const profile = normalize28567Row({
    companyCode: "A", companyName: "Name", companyShortName: "Short", industryName: "Industry",
    websiteUrl: "https://example.com", establishmentDate: "0900101", paidInCapital: "1000",
    chairperson: "Chair", generalManager: "Manager", taxId: "12345678", address: "Address",
  });
  const result = join28567To94025Coverage(["A", "MISSING"], [profile]);
  assert.deepEqual(result.matched.map((row) => row.companyCode), ["A"]);
  assert.deepEqual(result.unmatchedCoverageCodes, ["MISSING"]);
  assert.deepEqual(result.ambiguousCodes, []);
  const duplicate = { ...profile, sourceRecordId: "A:87654321", taxId: "87654321" };
  const ambiguous = join28567To94025Coverage(["A"], [profile, duplicate]);
  assert.deepEqual(ambiguous.ambiguousCodes, ["A"]);
  assert.deepEqual(ambiguous.matched, []);
});
