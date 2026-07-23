import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseFixtureMetadata,
  verifyFixtureContent,
  verifyFixtureIntegrity,
} from "../../lib/source-verification/fixture-metadata.ts";
import { parseCsv } from "../../lib/source-verification/csv.ts";
import {
  compare11406ResourceSchemas,
  normalize11406Row,
  parse11406Csv,
  parse11406Json,
} from "../../lib/source-verification/source-11406.ts";

const fixtureDirectory = new URL("../fixtures/source-verification/11406/", import.meta.url);
const approvedCsvHeaders = [
  "資料日期",
  "機構代碼",
  "機構名稱",
  "債券代碼",
  "債券種類",
  "債券期",
  "債券別",
  "債券簡稱",
  "發行日期",
  "掛牌日期",
  "到期日期",
  "發行總額",
  "目前餘額",
  "票面利率",
  "有無擔保",
  "債券擔保情形",
  "發行時轉換價格",
  "轉換期間起",
  "迄",
  "賣回權日期",
  "賣回權價格",
  "承銷機構",
  "受託人",
  "最近餘額變動日",
  "最近餘額變動原因",
  "募集方式",
];

async function fixtureBytes(name) {
  return readFile(new URL(name, fixtureDirectory));
}

async function fixtureText(name) {
  return readFile(new URL(name, fixtureDirectory), "utf8");
}

// Every row returned here is synthetic test-only data, never an official fixture record.
function synthetic11406Row(patch = {}) {
  return {
    officialDataDate: "20260723",
    issuerCode: "3522",
    issuerName: "合成測試發行人",
    bondCode: "SYN001",
    sourceBondTypeCode: "5",
    seriesNumber: "1",
    trancheNumber: "",
    shortName: "合成測試債",
    issueDate: "20231218",
    listingDate: "2023-12-18",
    maturityDate: "115/12/18",
    issueAmount: "150000000",
    outstandingAmount: "123100000",
    couponRate: "0.000000",
    securedText: "1",
    securityDescription: "合成測試擔保人",
    initialConversionPrice: "19.5000",
    conversionStartDate: "20240319",
    conversionEndDate: "20261218",
    putDatesText: "20251218",
    putPrice: "101.0025",
    underwriter: "合成測試承銷商",
    trustee: "合成測試受託人",
    outstandingChangeDate: "20250228",
    outstandingChangeReason: "合成測試餘額異動",
    offeringMethod: "7",
    ...patch,
  };
}

test("11406 official fixtures have reviewed metadata, exact hashes, row counts and versions", async () => {
  const metadataValues = JSON.parse(await fixtureText("metadata.json"));
  assert.equal(metadataValues.length, 2);

  const metadata = metadataValues.map(parseFixtureMetadata);
  assert.deepEqual(metadata.map((item) => item.resourceRole), ["csv", "openapi_json"]);
  for (const item of metadata) {
    assert.equal(item.schemaVersion, "dataset-11406-raw-v1");
    assert.equal(item.fixtureVersion, "official-minimal-v1");
    assert.equal(item.fixtureRowCount, 2);
  }

  const csvBytes = await fixtureBytes("csv-minimal.csv");
  const csvRows = parseCsv(csvBytes.toString("utf8"));
  verifyFixtureIntegrity(metadata[0], csvBytes, csvRows.length);
  verifyFixtureContent(metadata[0], csvRows, approvedCsvHeaders);

  const jsonBytes = await fixtureBytes("openapi-minimal.json");
  const jsonRows = JSON.parse(jsonBytes.toString("utf8"));
  verifyFixtureIntegrity(metadata[1], jsonBytes, jsonRows.length);
});

test("11406 CSV preserves the official trailing-space header while parsing its approved alias", async () => {
  const text = await fixtureText("csv-minimal.csv");
  assert.match(text.split(/\r?\n/, 1)[0], /債券擔保情形 ,發行時轉換價格/);
  assert.equal(parse11406Csv(text).length, 2);
});

test("11406 CSV and OpenAPI expose equivalent field roles without asserting row equality", async () => {
  const csvRows = parse11406Csv(await fixtureText("csv-minimal.csv"));
  const jsonRows = parse11406Json(JSON.parse(await fixtureText("openapi-minimal.json")));

  assert.deepEqual(
    compare11406ResourceSchemas(csvRows, jsonRows),
    { equivalent: true, missingInCsv: [], missingInJson: [] },
  );
  assert.deepEqual(new Set(csvRows.map((row) => row.officialDataDate)), new Set(["20260723"]));
  assert.deepEqual(new Set(jsonRows.map((row) => row.officialDataDate)), new Set(["20260722"]));
  assert.notDeepEqual(csvRows, jsonRows);
});

test("11406 maps every CSV and OpenAPI alias to its unique source-field sentinel", () => {
  const sentinelAliases = [
    ["officialDataDate", "資料日期", "Date", "20260724"],
    ["issuerCode", "機構代碼", "IssuerCode", "ISSUER-SENTINEL-02"],
    ["issuerName", "機構名稱", "IssuerName", "發行人哨兵03"],
    ["bondCode", "債券代碼", "BondCode", "BOND-SENTINEL-04"],
    ["sourceBondTypeCode", "債券種類", "BondType", "TYPE-SENTINEL-05"],
    ["seriesNumber", "債券期", "SeriesNumber", "SERIES-SENTINEL-06"],
    ["trancheNumber", "債券別", "TrancheNumber", "TRANCHE-SENTINEL-07"],
    ["shortName", "債券簡稱", "ShortName", "債券簡稱哨兵08"],
    ["issueDate", "發行日期", "IssueDate", "20240109"],
    ["listingDate", "掛牌日期", "ListingDate", "20240210"],
    ["maturityDate", "到期日期", "MaturityDate", "20281211"],
    ["issueAmount", "發行總額", "IssueAmount", "11000012"],
    ["outstandingAmount", "目前餘額", "OutstandingAmount", "10000013"],
    ["couponRate", "票面利率", "CouponRate", "票面利率哨兵14"],
    ["securedText", "有無擔保", "Guaranteed", "1"],
    ["securityDescription", "債券擔保情形 ", "GuaranteeDescription", "擔保說明哨兵16"],
    [
      "initialConversionPrice",
      "發行時轉換價格",
      "Conversion/ExchangePriceAtIssuance",
      "17.5",
    ],
    [
      "conversionStartDate",
      "轉換期間起",
      "Conversion/ExchangePeriodStartDate",
      "20240318",
    ],
    [
      "conversionEndDate",
      "迄",
      "Conversion/ExchangePeriodEndDate",
      "20271219",
    ],
    ["putDatesText", "賣回權日期", "PutOptionDate", "20261120"],
    ["putPrice", "賣回權價格", "PutOptionPrice", "121.21"],
    ["underwriter", "承銷機構", "Underwriter", "承銷機構哨兵22"],
    ["trustee", "受託人", "Trustee", "受託人哨兵23"],
    [
      "outstandingChangeDate",
      "最近餘額變動日",
      "OutstandingChangeDate",
      "20250524",
    ],
    [
      "outstandingChangeReason",
      "最近餘額變動原因",
      "OutstandingChangeDescription",
      "餘額異動哨兵25",
    ],
    ["offeringMethod", "募集方式", "OfferingMethod", "募集方式哨兵26"],
  ];
  assert.equal(new Set(sentinelAliases.map(([field]) => field)).size, 26);
  assert.equal(new Set(sentinelAliases.map(([, , , value]) => value)).size, 26);

  const expectedRow = Object.fromEntries(
    sentinelAliases.map(([field, , , value]) => [field, value]),
  );
  const csvText = [
    sentinelAliases.map(([, alias]) => alias).join(","),
    sentinelAliases.map(([, , , value]) => JSON.stringify(value)).join(","),
  ].join("\n");
  const jsonValue = [Object.fromEntries(
    sentinelAliases.map(([, , alias, value]) => [alias, value]),
  )];

  assert.deepEqual(parse11406Csv(csvText), [expectedRow]);
  assert.deepEqual(parse11406Json(jsonValue), [expectedRow]);
});

test("11406 normalizes official contract terms but never emits market data", async () => {
  const csvRows = parse11406Csv(await fixtureText("csv-minimal.csv"));
  const coded = normalize11406Row(csvRows.find((row) => row.bondCode === "35221"));
  const uncoded = normalize11406Row(csvRows.find((row) => row.issuerCode === "00009815"));

  assert.equal(coded.bondId, "bond:35221");
  assert.deepEqual(coded.putDates, ["2025-12-18"]);
  assert.equal(coded.putPrice, "101.0025");
  assert.equal(coded.initialConversionPrice, "19.5");
  assert.equal(coded.secured, true);
  assert.equal(coded.securityDescription, "兆豐國際商業銀行股份有限公司");
  assert.equal(uncoded.bondCode, undefined);
  assert.match(uncoded.bondId, /^bond:sha256:[0-9a-f]{64}$/);
  assert.equal(uncoded.initialConversionPrice, undefined);
  assert.equal(uncoded.putPrice, undefined);
  assert.deepEqual(uncoded.putDates, []);

  for (const value of [coded, uncoded]) {
    for (const banned of ["price", "quote", "volume", "closePrice", "issuerMarket"]) {
      assert.equal(banned in value, false);
    }
    assert.equal("fetchedAt" in value, false);
    assert.equal("sourceAttribution" in value, false);
  }
});

test("11406 parsers require every exact official alias and reject unknown aliases", async () => {
  const json = JSON.parse(await fixtureText("openapi-minimal.json"));
  const missing = structuredClone(json);
  delete missing[0].IssuerName;
  assert.throws(() => parse11406Json(missing), /missing required field.*IssuerName/);

  const unknown = structuredClone(json);
  unknown[0].UnexpectedOfficialKey = "";
  assert.throws(() => parse11406Json(unknown), /unknown key.*UnexpectedOfficialKey/);

  const csv = await fixtureText("csv-minimal.csv");
  const [csvHeader, ...csvDataLines] = csv.trimEnd().split(/\r?\n/);
  const unknownCsv = [
    `非官方欄位,${csvHeader}`,
    ...csvDataLines.map((line) => `"合成測試值",${line}`),
  ].join("\n");
  assert.throws(() => parse11406Csv(unknownCsv), /unknown key.*非官方欄位/);

  const missingCsv = [
    csvHeader.split(",").slice(1).join(","),
    ...csvDataLines.map((line) => line.replace(/^"[^"]*",/, "")),
  ].join("\n");
  assert.throws(() => parse11406Csv(missingCsv), /missing required field.*資料日期/);
});

test("11406 parsers reject non-string cells, empty datasets and duplicate identities", async () => {
  const json = JSON.parse(await fixtureText("openapi-minimal.json"));
  assert.throws(
    () => parse11406Json([{ ...json[0], IssueAmount: 2000000 }]),
    /IssueAmount must be a string/,
  );
  assert.throws(() => parse11406Json([]), /must contain at least one row/);
  assert.throws(() => parse11406Csv(approvedCsvHeaders.join(",")), /must contain at least one row/);
  assert.throws(() => parse11406Json([json[1], structuredClone(json[1])]), /duplicate bond identity/);
});

test("11406 required text and required dates reject empty, whitespace and dash placeholders", () => {
  for (const issuerName of ["", "   ", "-", "—", "－"]) {
    assert.throws(
      () => normalize11406Row(synthetic11406Row({ issuerName })),
      /issuerName.*required/,
    );
  }
  for (const issueDate of ["", " ", "-", "—", "－"]) {
    assert.throws(
      () => normalize11406Row(synthetic11406Row({ issueDate })),
      /issueDate.*required/,
    );
  }
});

test("11406 optional text and dates turn empty or dash placeholders into undefined", () => {
  for (const placeholder of ["", "   ", "-", "—", "－"]) {
    const normalized = normalize11406Row(synthetic11406Row({
      listingDate: placeholder,
      underwriter: placeholder,
      trustee: placeholder,
    }));
    assert.equal(normalized.listingDate, undefined);
    assert.equal(normalized.underwriter, undefined);
    assert.equal(normalized.trustee, undefined);
  }
});

test("11406 accepts commas, explicit 元 or 仟元 suffixes and percent coupon deterministically", () => {
  const value = normalize11406Row(synthetic11406Row({
    issueAmount: "1,000,000仟元",
    outstandingAmount: "999,999,999元",
    couponRate: "1.2500%",
  }));
  assert.equal(value.issueAmount, "1000000000");
  assert.equal(value.outstandingAmount, "999999999");
  assert.equal(value.couponRate, "1.25");
});

test("11406 preserves a trimmed non-numeric official coupon clause", () => {
  const value = normalize11406Row(synthetic11406Row({
    couponRate: "  依發行條件採浮動利率  ",
  }));
  assert.equal(value.couponRate, "依發行條件採浮動利率");
  assert.equal(
    normalize11406Row(synthetic11406Row({ couponRate: "—" })).couponRate,
    undefined,
  );
});

test("11406 preserves trimmed coupon clauses containing digits or percent signs", () => {
  for (const [couponRate, expected] of [
    ["  年利率1.5%  ", "年利率1.5%"],
    ["  0%至2%  ", "0%至2%"],
  ]) {
    assert.equal(
      normalize11406Row(synthetic11406Row({ couponRate })).couponRate,
      expected,
    );
  }
});

test("11406 rejects malformed numeric-looking coupon text instead of preserving it as a clause", () => {
  for (const couponRate of ["1..2", "1,00%", "1.2%%", ".5%", "+1%", "1 %"]) {
    assert.throws(
      () => normalize11406Row(synthetic11406Row({ couponRate })),
      /couponRate/,
    );
  }
});

test("11406 rejects malformed, negative and inconsistent amounts", () => {
  for (const issueAmount of ["NT$1", "一百元", "1萬元", "1,00", "-1", "1元元"]) {
    assert.throws(
      () => normalize11406Row(synthetic11406Row({ issueAmount })),
      /issueAmount/,
    );
  }
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ couponRate: "-0.1%" })),
    /couponRate/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({
      issueAmount: "100",
      outstandingAmount: "100.01",
    })),
    /outstandingAmount.*issueAmount/,
  );
});

test("11406 accepts YYYYMMDD, ISO and ROC dates and rejects invalid lifecycle order", () => {
  const value = normalize11406Row(synthetic11406Row({
    officialDataDate: "2026-07-23",
    issueDate: "112/12/18",
    listingDate: "20231218",
    maturityDate: "2026-12-18",
  }));
  assert.equal(value.officialDataDate, "2026-07-23");
  assert.equal(value.issueDate, "2023-12-18");
  assert.equal(value.listingDate, "2023-12-18");
  assert.equal(value.maturityDate, "2026-12-18");

  for (const issueDate of ["20230229", "2023-13-01", "112/02/29", "12/01/01"]) {
    assert.throws(
      () => normalize11406Row(synthetic11406Row({ issueDate })),
      /issueDate.*valid/,
    );
  }
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ maturityDate: "2023-12-17" })),
    /maturityDate.*issueDate/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ listingDate: "2027-01-01" })),
    /listingDate.*lifecycle/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({
      conversionStartDate: "2025-01-02",
      conversionEndDate: "2025-01-01",
    })),
    /conversionStartDate.*conversionEndDate/,
  );
});

test("11406 requires maturityDate to be strictly later than issueDate", () => {
  assert.throws(
    () => normalize11406Row(synthetic11406Row({
      issueDate: "20231218",
      maturityDate: "20231218",
      listingDate: "20231218",
      conversionStartDate: "20231218",
      conversionEndDate: "20231218",
      putDatesText: "",
      putPrice: "0",
    })),
    /maturityDate.*after issueDate/,
  );
});

test("11406 sorts and de-duplicates synthetic multi-put dates when all prices are equal", () => {
  const value = normalize11406Row(synthetic11406Row({
    maturityDate: "20271218",
    conversionEndDate: "20271218",
    putDatesText: "116/01/02、115/01/02、115/01/02",
    putPrice: "101.00、101、101.000",
  }));
  assert.deepEqual(value.putDates, ["2026-01-02", "2027-01-02"]);
  assert.equal(value.putPrice, "101");
});

test("11406 rejects synthetic multi-put count mismatch or distinct prices as unsupported", () => {
  assert.throws(
    () => normalize11406Row(synthetic11406Row({
      maturityDate: "20271218",
      conversionEndDate: "20271218",
      putDatesText: "115/01/02、116/01/02",
      putPrice: "101",
    })),
    /put date and price counts must match/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({
      maturityDate: "20271218",
      conversionEndDate: "20271218",
      putDatesText: "115/01/02、116/01/02",
      putPrice: "101、102",
    })),
    /multiple distinct put prices.*unsupported/,
  );
});

test("11406 treats no put date plus zero as no contract and rejects other date-price gaps", () => {
  const none = normalize11406Row(synthetic11406Row({ putDatesText: "", putPrice: "0.0000" }));
  assert.deepEqual(none.putDates, []);
  assert.equal(none.putPrice, undefined);
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ putDatesText: "", putPrice: "101" })),
    /putDatesText.*putPrice/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ putDatesText: "20250101", putPrice: "0" })),
    /putPrice.*positive/,
  );
});

test("11406 outstanding change date and reason must be present as a pair", () => {
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ outstandingChangeReason: "" })),
    /outstanding change date and reason.*pair/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ outstandingChangeDate: "" })),
    /outstanding change date and reason.*pair/,
  );
  const none = normalize11406Row(synthetic11406Row({
    outstandingChangeDate: "—",
    outstandingChangeReason: "-",
  }));
  assert.equal(none.outstandingChangeDate, undefined);
  assert.equal(none.outstandingChangeReason, undefined);
});

test("11406 maps official secured codes and requires a description for secured issues", () => {
  assert.equal(normalize11406Row(synthetic11406Row()).secured, true);
  assert.equal(
    normalize11406Row(synthetic11406Row({
      securedText: "2",
      securityDescription: "",
    })).secured,
    false,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ securityDescription: "" })),
    /securityDescription.*secured/,
  );
  assert.throws(
    () => normalize11406Row(synthetic11406Row({ securedText: "0" })),
    /securedText.*1 or 2/,
  );
});

test("11406 uncoded identity is deterministic and rejects incomplete composite keys", () => {
  const row = synthetic11406Row({
    bondCode: "",
    issuerCode: "00009815",
    sourceBondTypeCode: "5",
    seriesNumber: "115",
    trancheNumber: "1",
    issueDate: "20260309",
    listingDate: "",
    maturityDate: "20360308",
    conversionStartDate: "20260309",
    conversionEndDate: "20360308",
    putDatesText: "",
    putPrice: "0",
  });
  const first = normalize11406Row(row);
  const second = normalize11406Row(structuredClone(row));
  assert.equal(first.bondId, second.bondId);
  assert.match(first.bondId, /^bond:sha256:[0-9a-f]{64}$/);

  for (const missingKey of [
    "issuerCode",
    "sourceBondTypeCode",
    "seriesNumber",
    "trancheNumber",
    "issueDate",
  ]) {
    assert.throws(
      () => normalize11406Row({ ...row, [missingKey]: "" }),
      /incomplete composite identity|required/,
    );
  }
});

test("11406 source module has no forbidden endpoint or market-data surface", async () => {
  const source = await readFile(
    new URL("../../lib/source-verification/source-11406.ts", import.meta.url),
    "utf8",
  );
  const forbiddenEndpoint = ["bond", "cb", "daily"].join("_");
  const forbiddenFields = [
    ["close", "Price"].join(""),
    ["daily", "Volume"].join(""),
    ["issuer", "Market"].join(""),
  ];
  assert.equal(source.includes(forbiddenEndpoint), false);
  for (const field of forbiddenFields) assert.equal(source.includes(field), false);
});
