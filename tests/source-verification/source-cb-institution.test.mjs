import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCbInstitutionDaily,
} from "../../lib/source-verification/source-cb-institution.ts";

const fixtureDirectory = new URL(
  "../fixtures/source-verification/cb-institution/",
  import.meta.url,
);

async function jsonFixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), "utf8"));
}

function withUnknownRootKey(fixture) {
  return { ...structuredClone(fixture), unexpected: true };
}

function withTableDate(fixture, date) {
  const copy = structuredClone(fixture);
  copy.tables[0].date = date;
  return copy;
}

function withDuplicateFirstRow(fixture) {
  const copy = structuredClone(fixture);
  copy.tables[0].data.push(structuredClone(copy.tables[0].data[0]));
  copy.tables[0].totalCount += 1;
  return copy;
}

function withTotalNet(fixture, totalNetUnits) {
  const copy = structuredClone(fixture);
  copy.tables[0].data[1][11] = totalNetUnits;
  return copy;
}

test("parses the positional institutional columns and face-value unit", async () => {
  const fixture = await jsonFixture("daily-minimal.json");

  const result = parseCbInstitutionDaily(fixture);

  assert.equal(result.tradingDate, "2026-08-07");
  assert.equal(result.tradingUnitFaceValueTwd, "100000");
  assert.deepEqual(result.records[1], {
    bondCode: "54642", bondName: "霖宏二", tradingDate: "2026-08-07",
    foreignBuyUnits: "65", foreignSellUnits: "0", foreignNetUnits: "65",
    trustBuyUnits: "0", trustSellUnits: "0", trustNetUnits: "0",
    dealerBuyUnits: "4", dealerSellUnits: "0", dealerNetUnits: "4",
    totalNetUnits: "69",
  });
});

test("normalizes TPEx grouped institutional units before validating arithmetic", async () => {
  const fixture = await jsonFixture("daily-minimal.json");
  fixture.tables[0].data[0] = [
    "61876", "萬潤六", "0", "0", "0", "0", "0", "0", "1,707", "8", "1,699", "1,699",
  ];

  const result = parseCbInstitutionDaily(fixture);

  assert.deepEqual(result.records[0], {
    bondCode: "61876", bondName: "萬潤六", tradingDate: "2026-08-07",
    foreignBuyUnits: "0", foreignSellUnits: "0", foreignNetUnits: "0",
    trustBuyUnits: "0", trustSellUnits: "0", trustNetUnits: "0",
    dealerBuyUnits: "1707", dealerSellUnits: "8", dealerNetUnits: "1699",
    totalNetUnits: "1699",
  });
});

test("rejects schema drift, date mismatch, duplicate codes and arithmetic mismatch", async () => {
  const fixture = await jsonFixture("daily-minimal.json");

  assert.throws(() => parseCbInstitutionDaily(withUnknownRootKey(fixture)), /unknown root field/);
  assert.throws(() => parseCbInstitutionDaily(withTableDate(fixture, "115/08/06")), /date mismatch/);
  assert.throws(() => parseCbInstitutionDaily(withDuplicateFirstRow(fixture)), /duplicate bond code/);
  assert.throws(() => parseCbInstitutionDaily(withTotalNet(fixture, "70")), /total net units/);
});

test("rejects contract changes before normalizing institutional rows", async () => {
  const fixture = await jsonFixture("daily-minimal.json");
  const unknownTable = structuredClone(fixture);
  unknownTable.tables[0].unexpected = true;
  const reorderedFields = structuredClone(fixture);
  [reorderedFields.tables[0].fields[2], reorderedFields.tables[0].fields[3]] = [
    reorderedFields.tables[0].fields[3],
    reorderedFields.tables[0].fields[2],
  ];
  const missingFaceValue = structuredClone(fixture);
  missingFaceValue.tables[0].title = "115年08月07日 三大法人日交易資訊";
  const invalidInteger = structuredClone(fixture);
  invalidInteger.tables[0].data[0][2] = "0.5";

  assert.throws(() => parseCbInstitutionDaily(unknownTable), /unknown table field/);
  assert.throws(() => parseCbInstitutionDaily(reorderedFields), /fields do not match/);
  assert.throws(() => parseCbInstitutionDaily(missingFaceValue), /face-value unit/);
  assert.throws(() => parseCbInstitutionDaily(invalidInteger), /signed integer/);
});
