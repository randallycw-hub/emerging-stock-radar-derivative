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
  assertUnique94025CompanyCodes,
  compare94025ResourceSchemas,
  normalize94025Percent,
  normalize94025Revenue,
  normalize94025Row,
  parseMonthlyRevenueCsv,
  parse94025Csv,
  parse94025Json,
} from "../../lib/source-verification/source-94025.ts";

const fixtureDirectory = new URL("../fixtures/source-verification/94025/", import.meta.url);
const approvedAliases = [
  "出表日期",
  "資料年月",
  "公司代號",
  "公司名稱",
  "產業別",
  "營業收入-當月營收",
  "營業收入-上月營收",
  "營業收入-去年當月營收",
  "營業收入-上月比較增減(%)",
  "營業收入-去年同月增減(%)",
  "累計營業收入-當月累計營收",
  "累計營業收入-去年累計營收",
  "累計營業收入-前期比較增減(%)",
  "備註",
];

async function fixtureBytes(name) {
  return readFile(new URL(name, fixtureDirectory));
}

async function fixtureText(name) {
  return readFile(new URL(name, fixtureDirectory), "utf8");
}

test("94025 CSV API remains an exact wrapper around the shared monthly revenue parser", async () => {
  const text = await fixtureText("csv-minimal.csv");

  assert.deepEqual(
    parse94025Csv(text),
    parseMonthlyRevenueCsv(text, "94025 CSV"),
  );
});

// Every row returned here is synthetic test-only data, never an official fixture record.
function synthetic94025Row(patch = {}) {
  return {
    sourcePublishedOn: "1150717",
    yearMonth: "11506",
    companyCode: "SYN1",
    companyName: "合成測試公司",
    industryName: "合成測試產業",
    currentMonthRevenue: "100",
    previousMonthRevenue: "90",
    priorYearMonthRevenue: "80",
    monthOverMonthPercent: "11.1",
    yearOverYearPercent: "25",
    cumulativeRevenue: "600",
    priorYearCumulativeRevenue: "500",
    cumulativeYearOverYearPercent: "20",
    noteText: "-",
    ...patch,
  };
}

test("94025 keeps metadata, CSV, OAS and OpenAPI roles distinct with reviewed integrity", async () => {
  const container = JSON.parse(await fixtureText("metadata.json"));
  assert.deepEqual(Object.keys(container).sort(), [
    "csv",
    "metadataPageUrl",
    "oasUrl",
    "openapi",
  ]);
  assert.equal(container.metadataPageUrl, "https://data.gov.tw/dataset/94025");
  assert.equal(container.oasUrl, "https://openapi.twse.com.tw/v1/swagger.json");
  assert.notEqual(
    new URL(container.csv.resourceUrl).host,
    new URL(container.openapi.resourceUrl).host,
  );
  assert.equal("primaryResourceRole" in container, false);

  const csvMetadata = parseFixtureMetadata(container.csv);
  const openapiMetadata = parseFixtureMetadata(container.openapi);
  assert.deepEqual(
    [csvMetadata.resourceRole, openapiMetadata.resourceRole],
    ["csv", "openapi_json"],
  );

  for (const metadata of [csvMetadata, openapiMetadata]) {
    assert.equal(metadata.sourceId, "data-gov-94025");
    assert.equal(metadata.datasetName, "興櫃公司每月營業收入彙總表");
    assert.equal(metadata.schemaVersion, "dataset-94025-raw-v1");
    assert.equal(metadata.fixtureVersion, "official-minimal-v1");
    assert.equal(metadata.sourceRowCount, 354);
    assert.equal(metadata.fixtureRowCount, 3);
    assert.equal(metadata.providerName, "金融監督管理委員會證券期貨局");
    assert.equal(metadata.licenseName, "政府資料開放授權條款－第1版");
    assert.deepEqual(metadata.privacyReview, {
      containsPersonalData: false,
      excludedFields: ["個人姓名", "電話", "電子郵件"],
      minimized: true,
      deidentified: false,
      rationale: "三列備註經人工檢查僅含公司層級營收說明，未保存個人姓名、電話或電子郵件等聯絡人個資。",
    });
    assert.match(metadata.samplingMethod, /354列.*1260\/2245\/4172.*完整14欄.*351列/);
  }
  assert.deepEqual(
    {
      resourceUrl: csvMetadata.resourceUrl,
      fetchedAt: csvMetadata.fetchedAt,
      httpStatus: csvMetadata.httpStatus,
      httpContentType: csvMetadata.httpContentType,
      sourceResponseSha256: csvMetadata.sourceResponseSha256,
    },
    {
      resourceUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
      fetchedAt: "2026-07-23T06:10:42.382Z",
      httpStatus: 200,
      httpContentType: "text/csv",
      sourceResponseSha256: "sha256:f9bc7d149bb5a602fc798f0f1f5f007d0f8eff1aa6cd2a68f80084636249ac44",
    },
  );
  assert.deepEqual(
    {
      resourceUrl: openapiMetadata.resourceUrl,
      fetchedAt: openapiMetadata.fetchedAt,
      httpStatus: openapiMetadata.httpStatus,
      httpContentType: openapiMetadata.httpContentType,
      sourceResponseSha256: openapiMetadata.sourceResponseSha256,
    },
    {
      resourceUrl: "https://www.tpex.org.tw/openapi/v1/t187ap05_R",
      fetchedAt: "2026-07-23T06:10:42.739Z",
      httpStatus: 200,
      httpContentType: "application/json",
      sourceResponseSha256: "sha256:7a4b973dabad31d3073cf73ad5218b35d33652ce738b346938fb3b2bc8cbc73d",
    },
  );

  const csvBytes = await fixtureBytes("csv-minimal.csv");
  const csvRows = parseCsv(csvBytes.toString("utf8"));
  verifyFixtureIntegrity(csvMetadata, csvBytes, csvRows.length);
  verifyFixtureContent(csvMetadata, csvRows, approvedAliases);

  const jsonBytes = await fixtureBytes("openapi-minimal.json");
  const jsonRows = JSON.parse(jsonBytes.toString("utf8"));
  verifyFixtureIntegrity(openapiMetadata, jsonBytes, jsonRows.length);
});

test("94025 official CSV and OpenAPI fixtures preserve the same three rows and 14 cells", async () => {
  const csvRows = parse94025Csv(await fixtureText("csv-minimal.csv"));
  const jsonRows = parse94025Json(JSON.parse(await fixtureText("openapi-minimal.json")));

  assert.equal(csvRows.length, 3);
  assert.deepEqual(csvRows, jsonRows);
  assert.deepEqual(
    compare94025ResourceSchemas(csvRows, jsonRows),
    { equivalent: true, missingInCsv: [], missingInJson: [] },
  );
  assert.equal(
    csvRows.find((row) => row.companyCode === "2245").monthOverMonthPercent,
    "-34.224560904501175",
  );
  assert.equal(
    csvRows.find((row) => row.companyCode === "4172").monthOverMonthPercent,
    "",
  );
  assert.deepEqual(
    csvRows.map((row) => row.noteText),
    ["-", "-", "主係普癌汰與顯影劑銷售消長所致。"],
  );
});

test("94025 maps all 14 exact shared aliases to unique internal sentinels", () => {
  const sentinelAliases = [
    ["sourcePublishedOn", "出表日期", "1150718"],
    ["yearMonth", "資料年月", "11506"],
    ["companyCode", "公司代號", "SENTINEL-03"],
    ["companyName", "公司名稱", "公司哨兵04"],
    ["industryName", "產業別", "產業哨兵05"],
    ["currentMonthRevenue", "營業收入-當月營收", "600006"],
    ["previousMonthRevenue", "營業收入-上月營收", "700007"],
    ["priorYearMonthRevenue", "營業收入-去年當月營收", "800008"],
    ["monthOverMonthPercent", "營業收入-上月比較增減(%)", "-9.009"],
    ["yearOverYearPercent", "營業收入-去年同月增減(%)", "10.010"],
    ["cumulativeRevenue", "累計營業收入-當月累計營收", "1100011"],
    ["priorYearCumulativeRevenue", "累計營業收入-去年累計營收", "1200012"],
    ["cumulativeYearOverYearPercent", "累計營業收入-前期比較增減(%)", "-13.013"],
    ["noteText", "備註", "備註哨兵14"],
  ];
  assert.equal(new Set(sentinelAliases.map(([field]) => field)).size, 14);
  assert.equal(new Set(sentinelAliases.map(([, , value]) => value)).size, 14);

  const expected = Object.fromEntries(
    sentinelAliases.map(([field, , value]) => [field, value]),
  );
  const csvText = [
    sentinelAliases.map(([, alias]) => alias).join(","),
    sentinelAliases.map(([, , value]) => JSON.stringify(value)).join(","),
  ].join("\n");
  const jsonValue = [
    Object.fromEntries(sentinelAliases.map(([, alias, value]) => [alias, value])),
  ];

  assert.deepEqual(parse94025Csv(csvText), [expected]);
  assert.deepEqual(parse94025Json(jsonValue), [expected]);
});

test("94025 rejects renamed aliases", async () => {
  const official = JSON.parse(await fixtureText("openapi-minimal.json"));
  const renamed = structuredClone(official);
  renamed[0]["公司簡稱"] = renamed[0]["公司名稱"];
  delete renamed[0]["公司名稱"];
  assert.throws(() => parse94025Json(renamed), /unknown key.*公司簡稱/);
});

test("94025 schema comparison detects synthetic semantic swaps", async () => {
  const official = JSON.parse(await fixtureText("openapi-minimal.json"));
  const parsed = parse94025Json(official);
  const swapped = structuredClone(official);
  [swapped[0]["公司名稱"], swapped[0]["產業別"]] = [
    swapped[0]["產業別"],
    swapped[0]["公司名稱"],
  ];
  assert.equal(
    compare94025ResourceSchemas(parsed, parse94025Json(swapped)).equivalent,
    false,
  );
});

test("94025 schema comparison reports fields missing from both resources against the whitelist", async () => {
  const official = parse94025Json(JSON.parse(await fixtureText("openapi-minimal.json")));
  const withoutCompanyName = (row) =>
    Object.fromEntries(Object.entries(row).filter(([field]) => field !== "companyName"));
  const csvRows = official.map(withoutCompanyName);
  const jsonRows = official.map(withoutCompanyName);

  assert.deepEqual(
    compare94025ResourceSchemas(csvRows, jsonRows),
    {
      equivalent: false,
      missingInCsv: ["companyName"],
      missingInJson: ["companyName"],
    },
  );
});

test("94025 schema comparison detects row-set mismatch by month-company identity", async () => {
  const rows = parse94025Json(JSON.parse(await fixtureText("openapi-minimal.json")));
  assert.equal(
    compare94025ResourceSchemas(rows, rows.slice(1)).equivalent,
    false,
  );
});

test("94025 schema comparison rejects a duplicate CSV identity even when row counts match", async () => {
  const rows = parse94025Json(JSON.parse(await fixtureText("openapi-minimal.json")));
  const csvRows = [rows[0], structuredClone(rows[0]), rows[2]];

  assert.equal(
    compare94025ResourceSchemas(csvRows, rows).equivalent,
    false,
  );
});

test("94025 strict parser requires every exact transport alias and retains 備註 only in raw rows", async () => {
  const official = JSON.parse(await fixtureText("openapi-minimal.json"));
  const missing = structuredClone(official);
  delete missing[0]["公司代號"];
  assert.throws(() => parse94025Json(missing), /missing required field.*公司代號/);

  const unknown = structuredClone(official);
  unknown[0]["其他欄位"] = "";
  assert.throws(() => parse94025Json(unknown), /unknown key.*其他欄位/);

  const [raw] = parse94025Json([official[2]]);
  assert.equal(raw.noteText, "主係普癌汰與顯影劑銷售消長所致。");
  const normalized = normalize94025Row(raw);
  assert.equal("noteText" in normalized, false);
});

test("94025 strict parser rejects prototype keys and inherited required aliases", async () => {
  const [official] = JSON.parse(await fixtureText("openapi-minimal.json"));
  for (const key of ["constructor", "toString", "__proto__"]) {
    const row = { ...official };
    Object.defineProperty(row, key, {
      value: "own prototype sentinel",
      enumerable: true,
      configurable: true,
    });
    assert.throws(() => parse94025Json([row]), new RegExp(`unknown key.*${key}`));
  }

  const inherited = Object.create({ 公司代號: official["公司代號"] });
  for (const [key, value] of Object.entries(official)) {
    if (key !== "公司代號") inherited[key] = value;
  }
  assert.throws(
    () => parse94025Json([inherited]),
    /missing required field.*公司代號/,
  );
});

test("94025 parser rejects non-string cells, empty datasets and duplicate month-company keys", async () => {
  const official = JSON.parse(await fixtureText("openapi-minimal.json"));
  assert.throws(
    () => parse94025Json([{ ...official[0], "營業收入-當月營收": 460654 }]),
    /營業收入-當月營收 must be a string/,
  );
  assert.throws(() => parse94025Json([]), /must contain at least one row/);
  assert.throws(() => parse94025Csv(approvedAliases.join(",")), /must contain at least one row/);
  assert.throws(
    () => parse94025Json([official[0], structuredClone(official[0])]),
    /duplicate companyCode for yearMonth/,
  );
});

test("94025 official ratios remain source values and revenue unit is explicit without recomputation", async () => {
  const rows = parse94025Csv(await fixtureText("csv-minimal.csv"));
  const negative = normalize94025Row(rows.find((row) => row.companyCode === "2245"));
  const blank = normalize94025Row(rows.find((row) => row.companyCode === "4172"));

  assert.equal(negative.sourcePublishedOn, "2026-07-17");
  assert.equal(negative.yearMonth, "2026-06");
  assert.equal(negative.revenueUnit, "仟元");
  assert.equal(negative.currentMonthRevenue, "27750");
  assert.equal(negative.monthOverMonthPercent, "-34.224560904501175");
  assert.equal(negative.yearOverYearPercent, "-5.261001672868799");
  assert.equal(negative.priorYearCumulativeRevenue, "201456");
  assert.equal(blank.monthOverMonthPercent, undefined);
});

test("94025 normalized contract preserves source-only fields and emits no market-data fields", () => {
  const value = normalize94025Row(synthetic94025Row());
  assert.equal(value.companyCode, "SYN1");
  assert.equal("companyId" in value, false);
  assert.equal(value.industryName, "合成測試產業");
  assert.equal(value.sourcePublishedOn, "2026-07-17");
  assert.equal(value.revenueUnit, "仟元");
  assert.equal(value.priorYearCumulativeRevenue, "500");
  assert.equal("fetchedAt" in value, false);
  assert.equal("sourceAttribution" in value, false);

  const banned = [
    ["pr", "ice"].join(""),
    ["qu", "ote"].join(""),
    ["vol", "ume"].join(""),
    ["mar", "ket"].join(""),
  ];
  for (const field of banned) assert.equal(field in value, false);
});

test("94025 optional decimals handle blanks, dashes, negative ratios, full-width minus and terminal percent", () => {
  for (const placeholder of ["", "   ", "-", "--", "－"]) {
    assert.equal(normalize94025Revenue(placeholder), undefined);
    assert.equal(normalize94025Percent(placeholder), undefined);
  }
  assert.equal(normalize94025Percent("-12.30%"), "-12.3");
  assert.equal(normalize94025Percent("－12.30%"), "-12.3");
  assert.equal(normalize94025Percent("+12.30"), "12.3");
  assert.equal(normalize94025Revenue("1,234.500"), "1234.5");
  assert.equal(normalize94025Percent("1,234.500%"), "1234.5");
  for (const zero of ["-0", "-0.00%", "+0"]) {
    assert.equal(normalize94025Percent(zero), "0");
  }
  for (const signedRevenue of ["-0", "+0", "－1"]) {
    assert.throws(() => normalize94025Revenue(signedRevenue), /non-negative/);
  }
});

test("94025 numeric normalization rejects negatives for revenue and malformed or embedded forms", () => {
  assert.throws(() => normalize94025Revenue("-1"), /non-negative/);
  for (const value of [
    "1,00",
    "12,34,567",
    "01",
    "1仟元",
    "1元",
    "(1)",
    "1-",
    "1 %",
    "—",
  ]) {
    assert.throws(() => normalize94025Revenue(value), /decimal|non-negative/);
  }
  for (const value of ["12%%", "%12", "(12)", "12 %", "12百分比", "1,00%"]) {
    assert.throws(() => normalize94025Percent(value), /decimal/);
  }
});

test("94025 required source fields reject empty, whitespace and placeholders", () => {
  for (const field of [
    "sourcePublishedOn",
    "yearMonth",
    "companyCode",
    "companyName",
    "industryName",
    "currentMonthRevenue",
  ]) {
    for (const placeholder of ["", "   ", "-", "--", "－"]) {
      assert.throws(
        () => normalize94025Row(synthetic94025Row({ [field]: placeholder })),
        new RegExp(field),
      );
    }
  }
});

test("94025 required company identity text rejects an em dash", () => {
  for (const field of ["companyCode", "companyName", "industryName"]) {
    assert.throws(
      () => normalize94025Row(synthetic94025Row({ [field]: "—" })),
      new RegExp(field),
    );
  }
});

test("94025 accepts ROC, compact Gregorian and ISO dates while enforcing valid months and days", () => {
  const roc = normalize94025Row(synthetic94025Row({
    sourcePublishedOn: "1150717",
    yearMonth: "11506",
  }));
  assert.equal(roc.sourcePublishedOn, "2026-07-17");
  assert.equal(roc.yearMonth, "2026-06");

  const compact = normalize94025Row(synthetic94025Row({
    sourcePublishedOn: "20260717",
    yearMonth: "202606",
  }));
  assert.equal(compact.sourcePublishedOn, "2026-07-17");
  assert.equal(compact.yearMonth, "2026-06");

  const iso = normalize94025Row(synthetic94025Row({
    sourcePublishedOn: "2026-07-17",
    yearMonth: "2026-06",
  }));
  assert.equal(iso.sourcePublishedOn, "2026-07-17");
  assert.equal(iso.yearMonth, "2026-06");

  for (const yearMonth of ["11500", "11513", "202600", "202613", "2026-6"]) {
    assert.throws(
      () => normalize94025Row(synthetic94025Row({ yearMonth })),
      /yearMonth.*valid/,
    );
  }
  for (const sourcePublishedOn of ["1150230", "20260230", "2026-02-30", "115/07/17"]) {
    assert.throws(
      () => normalize94025Row(synthetic94025Row({ sourcePublishedOn })),
      /sourcePublishedOn.*valid/,
    );
  }
});

test("94025 rejects a data month later than publication month but permits historical months", () => {
  assert.throws(
    () => normalize94025Row(synthetic94025Row({
      sourcePublishedOn: "1150717",
      yearMonth: "11508",
    })),
    /yearMonth.*sourcePublishedOn/,
  );
  assert.equal(
    normalize94025Row(synthetic94025Row({
      sourcePublishedOn: "1150717",
      yearMonth: "11412",
    })).yearMonth,
    "2025-12",
  );
});
test("94025 rejects cumulative revenue below current month revenue", () => {
  assert.throws(
    () => normalize94025Row(synthetic94025Row({
      currentMonthRevenue: "100.01",
      cumulativeRevenue: "100",
    })),
    /cumulativeRevenue.*currentMonthRevenue/,
  );
});

test("94025 January cumulative revenue must equal current month revenue when provided", () => {
  assert.throws(
    () => normalize94025Row(synthetic94025Row({
      yearMonth: "11501",
      currentMonthRevenue: "100",
      cumulativeRevenue: "101",
    })),
    /January.*cumulativeRevenue.*currentMonthRevenue/,
  );
  assert.equal(
    normalize94025Row(synthetic94025Row({
      yearMonth: "11501",
      currentMonthRevenue: "100.00",
      cumulativeRevenue: "100",
    })).cumulativeRevenue,
    "100",
  );
});

test("94025 source-row validation rejects missing, unknown and non-string internal fields", () => {
  const missing = synthetic94025Row();
  delete missing.companyName;
  assert.throws(() => normalize94025Row(missing), /missing required field.*companyName/);
  assert.throws(
    () => normalize94025Row({ ...synthetic94025Row(), unexpected: "" }),
    /unknown key.*unexpected/,
  );
  assert.throws(
    () => normalize94025Row({ ...synthetic94025Row(), companyCode: 1234 }),
    /companyCode must be a string/,
  );
});

test("94025 uniqueness uses yearMonth plus companyCode and permits the same code in another month", () => {
  const june = normalize94025Row(synthetic94025Row({ companyCode: "1234" }));
  const july = normalize94025Row(synthetic94025Row({
    companyCode: "1234",
    yearMonth: "11507",
    cumulativeRevenue: "700",
  }));
  assert.throws(
    () => assertUnique94025CompanyCodes([june, { ...june }]),
    /duplicate companyCode for yearMonth.*2026-06:1234/,
  );
  assert.doesNotThrow(() => assertUnique94025CompanyCodes([june, july]));
});

test("94025 evidence chooses CSV once and records OpenAPI as comparison-only without fallback", async () => {
  const evidence = await readFile(
    new URL("../../docs/source-verification/94025-evidence.md", import.meta.url),
    "utf8",
  );
  assert.match(evidence, /primaryResourceRole:\s*`csv`/);
  assert.match(evidence, /OpenAPI.*(?:比較|comparison)/s);
  assert.match(evidence, /不得.*fallback|不可.*fallback/);
  assert.match(evidence, /TWSE OAS.*(?:沒有|缺少).*t187ap05_R/s);
  assert.match(evidence, /TPEx Swagger.*schema.*證據/s);
});

test("94025 source module and tests have no network, fallback, fixture loader or market-data surface", async () => {
  const source = await readFile(
    new URL("../../lib/source-verification/source-94025.ts", import.meta.url),
    "utf8",
  );
  for (const fragment of [
    ["fe", "tch"].join(""),
    ["fall", "back"].join(""),
    ["read", "File"].join(""),
    ["fix", "tures"].join(""),
    "http://",
    "https://",
  ]) {
    assert.equal(source.includes(fragment), false);
  }
  for (const field of [
    ["pr", "ice"].join(""),
    ["qu", "ote"].join(""),
    ["vol", "ume"].join(""),
    ["mar", "ket"].join(""),
  ]) {
    assert.equal(source.includes(field), false);
  }

  const testSource = await readFile(new URL(import.meta.url), "utf8");
  const networkCall = ["fe", "tch("].join("");
  assert.equal(testSource.includes(networkCall), false);
});
