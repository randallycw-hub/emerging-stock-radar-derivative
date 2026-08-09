import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCbIssuerResearchSnapshot,
  parseCbIssuerResearchRecords,
  parseCbIssuerResearchSnapshot,
} from "../lib/market-data/cb-issuer-research.ts";

const headers = [
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

function revenueRow(overrides = {}) {
  return {
    sourcePublishedOn: "1150717",
    revenueMonth: "11506",
    issuerCode: "1101",
    issuerName: "台泥",
    industryName: "水泥工業",
    currentMonthRevenue: "13382706",
    previousMonthRevenue: "12612013",
    priorYearMonthRevenue: "10107877",
    monthOverMonthPercent: "6.110785011084273",
    yearOverYearPercent: "32.39878166305348",
    cumulativeRevenue: "71467332",
    priorYearCumulativeRevenue: "70380916",
    cumulativeYearOverYearPercent: "1.5436229900730476",
    noteText: "raw note must not escape",
    ...overrides,
  };
}

function revenueCsv(rows) {
  return [
    headers.join(","),
    ...rows.map((row) => [
      row.sourcePublishedOn,
      row.revenueMonth,
      row.issuerCode,
      row.issuerName,
      row.industryName,
      row.currentMonthRevenue,
      row.previousMonthRevenue,
      row.priorYearMonthRevenue,
      row.monthOverMonthPercent,
      row.yearOverYearPercent,
      row.cumulativeRevenue,
      row.priorYearCumulativeRevenue,
      row.cumulativeYearOverYearPercent,
      row.noteText,
    ].join(",")),
    "",
  ].join("\n");
}

function fulfilled(rows) {
  return { status: "fulfilled", value: revenueCsv(rows) };
}

const generatedAt = "2026-07-18T03:04:05.000Z";

function researchRecord(overrides = {}) {
  return {
    issuerCode: "1101",
    issuerName: "台泥",
    market: "listed",
    industryName: "水泥工業",
    revenueMonth: "2026-06",
    sourcePublishedOn: "2026-07-17",
    revenueUnit: "仟元",
    currentMonthRevenue: "13382706",
    monthOverMonthPercent: "6.110785011084273",
    yearOverYearPercent: "32.39878166305348",
    cumulativeRevenue: "71467332",
    cumulativeYearOverYearPercent: "1.5436229900730476",
    ...overrides,
  };
}

function previousSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    records: [
      researchRecord(),
      researchRecord({
        issuerCode: "1240",
        issuerName: "茂生農經",
        market: "otc",
        industryName: "農業科技",
      }),
    ],
    sources: {
      listed: { status: "current", dataDate: "2026-07-17", fetchedAt: generatedAt },
      otc: { status: "current", dataDate: "2026-07-17", fetchedAt: generatedAt },
    },
    diagnostics: [{ issuerCode: "3333", reason: "MISSING_REVENUE" }],
    ...overrides,
  };
}

test("record-list parser is the strict frozen defensive boundary reused by consumers", () => {
  const input = [researchRecord()];
  const records = parseCbIssuerResearchRecords(input);

  input[0].industryName = "mutated input";
  assert.notEqual(records[0].industryName, "mutated input");
  assert.equal(Object.isFrozen(records), true);
  assert.equal(Object.isFrozen(records[0]), true);
  assert.throws(
    () => parseCbIssuerResearchRecords([{
      ...researchRecord(),
      currentMonthRevenue: "01",
    }]),
    /currentMonthRevenue/,
  );
  assert.throws(
    () => parseCbIssuerResearchRecords([{
      ...researchRecord(),
      noteText: "raw note must not escape",
    }]),
    /keys.*exact schema/,
  );
});

test("projects only deduplicated exact current issuers with newest rows and stable public values", () => {
  const snapshot = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers: [
      { issuerCode: "1240", issuerName: "茂生農經" },
      { issuerCode: "1101", issuerName: "台泥" },
      { issuerCode: "1101", issuerName: "台泥" },
    ],
    listed: fulfilled([
      revenueRow({
        sourcePublishedOn: "1150718",
        revenueMonth: "11505",
        currentMonthRevenue: "12000000",
        cumulativeRevenue: "58000000",
        monthOverMonthPercent: "1.25",
      }),
      revenueRow(),
      revenueRow({
        sourcePublishedOn: "1150719",
        issuerCode: "9999",
        issuerName: "非投影公司",
        industryName: "其他",
      }),
    ]),
    otc: fulfilled([
      revenueRow({
        issuerCode: "1240",
        issuerName: "茂生農經",
        industryName: "農業科技",
        monthOverMonthPercent: "--",
        yearOverYearPercent: "-",
        cumulativeRevenue: "--",
        priorYearCumulativeRevenue: "--",
        cumulativeYearOverYearPercent: "--",
      }),
      revenueRow({ issuerCode: "7777", issuerName: "未投影上櫃公司" }),
    ]),
  });

  assert.deepEqual(snapshot.records.map(({ issuerCode }) => issuerCode), ["1101", "1240"]);
  assert.deepEqual(snapshot.records[0], {
    issuerCode: "1101",
    issuerName: "台泥",
    market: "listed",
    industryName: "水泥工業",
    revenueMonth: "2026-05",
    sourcePublishedOn: "2026-07-18",
    revenueUnit: "仟元",
    currentMonthRevenue: "12000000",
    monthOverMonthPercent: "1.25",
    yearOverYearPercent: "32.39878166305348",
    cumulativeRevenue: "58000000",
    cumulativeYearOverYearPercent: "1.5436229900730476",
  });
  assert.deepEqual(snapshot.records[1], {
    issuerCode: "1240",
    issuerName: "茂生農經",
    market: "otc",
    industryName: "農業科技",
    revenueMonth: "2026-06",
    sourcePublishedOn: "2026-07-17",
    revenueUnit: "仟元",
    currentMonthRevenue: "13382706",
    monthOverMonthPercent: null,
    yearOverYearPercent: null,
    cumulativeRevenue: null,
    cumulativeYearOverYearPercent: null,
  });
  assert.equal(JSON.stringify(snapshot).includes("raw note"), false);
  assert.deepEqual(snapshot.sources, {
    listed: {
      status: "current",
      dataDate: "2026-07-19",
      fetchedAt: generatedAt,
    },
    otc: {
      status: "current",
      dataDate: "2026-07-17",
      fetchedAt: generatedAt,
    },
  });
  assert.deepEqual(snapshot.diagnostics, []);
});

test("uses only NFC and whitespace name agreement and stably diagnoses every excluded issuer", () => {
  const snapshot = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers: [
      { issuerCode: "3333", issuerName: "缺資料" },
      { issuerCode: "6666", issuerName: "Å 公司" },
      { issuerCode: "2222", issuerName: "台泥" },
      { issuerCode: "1111", issuerName: "跨市場" },
    ],
    listed: fulfilled([
      revenueRow({ issuerCode: "1111", issuerName: "跨市場" }),
      revenueRow({ issuerCode: "2222", issuerName: "台泥股份有限公司" }),
      revenueRow({ issuerCode: "6666", issuerName: "Å　 公司" }),
    ]),
    otc: fulfilled([
      revenueRow({ issuerCode: "1111", issuerName: "跨市場" }),
      revenueRow({ issuerCode: "8888", issuerName: "其他公司" }),
    ]),
  });

  assert.deepEqual(snapshot.records.map(({ issuerCode, issuerName }) => ({ issuerCode, issuerName })), [
    { issuerCode: "6666", issuerName: "Å 公司" },
  ]);
  assert.deepEqual(snapshot.diagnostics, [
    { issuerCode: "1111", reason: "CROSS_MARKET_CONFLICT" },
    { issuerCode: "2222", reason: "NAME_CONFLICT" },
    { issuerCode: "3333", reason: "MISSING_REVENUE" },
  ]);
});

test("falls back only within the failed market and makes unavailable explicit without aliases", () => {
  const previous = previousSnapshot();
  const next = buildCbIssuerResearchSnapshot({
    generatedAt: "2026-07-19T03:04:05.000Z",
    issuers: [
      { issuerCode: "1240", issuerName: "茂生農經" },
      { issuerCode: "1101", issuerName: "台泥" },
      { issuerCode: "7777", issuerName: "沒有營收" },
    ],
    listed: { status: "rejected", reason: new Error("listed unavailable") },
    otc: fulfilled([
      revenueRow({
        sourcePublishedOn: "1150719",
        issuerCode: "1240",
        issuerName: "茂生農經",
        industryName: "農業科技",
      }),
      revenueRow({ issuerCode: "8888", issuerName: "非投影公司" }),
    ]),
    previous,
  });

  assert.deepEqual(next.records.map(({ issuerCode, market }) => ({ issuerCode, market })), [
    { issuerCode: "1101", market: "listed" },
    { issuerCode: "1240", market: "otc" },
  ]);
  assert.deepEqual(next.sources, {
    listed: { status: "stale", dataDate: "2026-07-17", fetchedAt: generatedAt },
    otc: {
      status: "current",
      dataDate: "2026-07-19",
      fetchedAt: "2026-07-19T03:04:05.000Z",
    },
  });
  assert.deepEqual(next.diagnostics, [
    { issuerCode: "7777", reason: "MISSING_REVENUE" },
  ]);
  assert.equal(Object.isFrozen(next), true);
  assert.equal(Object.isFrozen(next.records), true);
  assert.equal(Object.isFrozen(next.records[0]), true);
  previous.records[0].industryName = "mutated previous";
  previous.sources.listed.dataDate = "2020-01-01";
  assert.equal(next.records[0].industryName, "水泥工業");
  assert.equal(next.sources.listed.dataDate, "2026-07-17");

  const unavailable = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers: [{ issuerCode: "7777", issuerName: "沒有營收" }],
    listed: { status: "rejected", reason: new Error("listed unavailable") },
    otc: { status: "rejected", reason: new Error("OTC unavailable") },
  });
  assert.deepEqual(unavailable.records, []);
  assert.deepEqual(unavailable.sources, {
    listed: { status: "unavailable", dataDate: null, fetchedAt: null },
    otc: { status: "unavailable", dataDate: null, fetchedAt: null },
  });
  assert.deepEqual(unavailable.diagnostics, [
    { issuerCode: "7777", reason: "MISSING_REVENUE" },
  ]);
});

test("persists full-source period identity through empty current and stale snapshots", () => {
  const emptyCurrent = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers: [],
    listed: fulfilled([
      revenueRow({ sourcePublishedOn: "1150719", issuerCode: "9998", issuerName: "非投影上市" }),
    ]),
    otc: fulfilled([
      revenueRow({ sourcePublishedOn: "1150720", issuerCode: "9999", issuerName: "非投影上櫃" }),
    ]),
  });
  assert.deepEqual(emptyCurrent.records, []);
  assert.deepEqual(emptyCurrent.sources, {
    listed: { status: "current", dataDate: "2026-07-19", fetchedAt: generatedAt },
    otc: { status: "current", dataDate: "2026-07-20", fetchedAt: generatedAt },
  });

  const staleEmpty = buildCbIssuerResearchSnapshot({
    generatedAt: "2026-07-21T03:04:05.000Z",
    issuers: [],
    listed: { status: "rejected", reason: new Error("listed unavailable") },
    otc: { status: "rejected", reason: new Error("OTC unavailable") },
    previous: emptyCurrent,
  });
  assert.deepEqual(staleEmpty.records, []);
  assert.deepEqual(staleEmpty.sources, {
    listed: { status: "stale", dataDate: "2026-07-19", fetchedAt: generatedAt },
    otc: { status: "stale", dataDate: "2026-07-20", fetchedAt: generatedAt },
  });
  assert.throws(
    () => buildCbIssuerResearchSnapshot({
      generatedAt: "2026-07-22T03:04:05.000Z",
      issuers: [],
      listed: fulfilled([
        revenueRow({ sourcePublishedOn: "1150718", issuerCode: "9998", issuerName: "較舊上市" }),
      ]),
      otc: fulfilled([
        revenueRow({ sourcePublishedOn: "1150719", issuerCode: "9999", issuerName: "較舊上櫃" }),
      ]),
      previous: staleEmpty,
    }),
    /dataDate.*backward/,
  );
});

test("requires generatedAt to advance beyond a completely validated previous snapshot", () => {
  for (const nextGeneratedAt of [generatedAt, "2026-07-17T03:04:05.000Z"]) {
    assert.throws(
      () => buildCbIssuerResearchSnapshot({
        generatedAt: nextGeneratedAt,
        issuers: [],
        listed: { status: "rejected", reason: new Error("listed unavailable") },
        otc: { status: "rejected", reason: new Error("OTC unavailable") },
        previous: previousSnapshot(),
      }),
      /generatedAt.*advance/,
    );
  }

  const invalidPrevious = previousSnapshot({ schemaVersion: 2 });
  assert.throws(
    () => buildCbIssuerResearchSnapshot({
      generatedAt: "2026-07-19T03:04:05.000Z",
      issuers: [],
      listed: { status: "fulfilled", value: "not a CSV" },
      otc: { status: "fulfilled", value: "also not a CSV" },
      previous: invalidPrevious,
    }),
    /schemaVersion/,
  );
});

test("keeps issuer codes opaque while rejecting empty identities and conflicting duplicates", () => {
  const source = fulfilled([revenueRow()]);
  const opaque = buildCbIssuerResearchSnapshot({
    generatedAt,
    issuers: [{ issuerCode: "00009815", issuerName: "未編債券發行人" }],
    listed: source,
    otc: fulfilled([revenueRow({ issuerCode: "9999", issuerName: "其他公司" })]),
  });
  assert.deepEqual(opaque.diagnostics, [
    { issuerCode: "00009815", reason: "MISSING_REVENUE" },
  ]);

  for (const issuers of [
    [{ issuerCode: "", issuerName: "台泥" }],
    [{ issuerCode: "1101", issuerName: "" }],
    [
      { issuerCode: "1101", issuerName: "台泥" },
      { issuerCode: "1101", issuerName: "另一家公司" },
    ],
  ]) {
    assert.throws(
      () => buildCbIssuerResearchSnapshot({
        generatedAt,
        issuers,
        listed: source,
        otc: fulfilled([revenueRow({ issuerCode: "9999", issuerName: "其他公司" })]),
      }),
      /issuer/,
    );
  }
});

test("parser requires records and diagnostics to be exact dense array containers", async (context) => {
  const cases = [
    ["records non-enumerable key", (value) => {
      Object.defineProperty(value.records, "hidden", { value: true });
    }],
    ["records symbol key", (value) => {
      value.records[Symbol("hidden")] = true;
    }],
    ["records sparse hole", (value) => {
      delete value.records[0];
    }],
    ["diagnostics non-enumerable key", (value) => {
      Object.defineProperty(value.diagnostics, "hidden", { value: true });
    }],
    ["diagnostics symbol key", (value) => {
      value.diagnostics[Symbol("hidden")] = true;
    }],
    ["diagnostics sparse hole", (value) => {
      delete value.diagnostics[0];
    }],
  ];

  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const value = previousSnapshot();
      mutate(value);
      assert.throws(
        () => parseCbIssuerResearchSnapshot(value),
        /must be an exact dense array/,
      );
    });
  }
});

test("parser rejects every malformed envelope boundary", async (context) => {
  const cases = [
    ["snapshot keys", (value) => { value.extra = true; }],
    ["non-enumerable snapshot key", (value) => {
      Object.defineProperty(value, "hidden", { value: true });
    }],
    ["symbol snapshot key", (value) => { value[Symbol("hidden")] = true; }],
    ["schema version", (value) => { value.schemaVersion = 2; }],
    ["generated timestamp", (value) => { value.generatedAt = "2026-07-18"; }],
    ["record keys", (value) => { value.records[0].noteText = "private"; }],
    ["record date", (value) => { value.records[0].sourcePublishedOn = "2026-02-30"; }],
    ["record month", (value) => { value.records[0].revenueMonth = "2026-13"; }],
    ["record decimal", (value) => { value.records[0].currentMonthRevenue = "01"; }],
    ["duplicate record code", (value) => { value.records.push({ ...value.records[0] }); }],
    ["source keys", (value) => { value.sources.listed.extra = true; }],
    ["unavailable source state", (value) => {
      value.sources.listed.status = "unavailable";
    }],
    ["source data date", (value) => { value.sources.listed.dataDate = "2026-07-16"; }],
    ["current fetched timestamp", (value) => {
      value.sources.listed.fetchedAt = "2026-07-17T03:04:05.000Z";
    }],
    ["future stale fetched timestamp", (value) => {
      value.sources.listed.status = "stale";
      value.sources.listed.fetchedAt = "2026-07-19T03:04:05.000Z";
    }],
    ["diagnostic keys", (value) => { value.diagnostics[0].extra = true; }],
    ["diagnostic overlap", (value) => { value.diagnostics[0].issuerCode = "1101"; }],
    ["duplicate diagnostic code", (value) => {
      value.diagnostics.push({ ...value.diagnostics[0] });
    }],
  ];

  for (const [name, mutate] of cases) {
    await context.test(name, () => {
      const value = previousSnapshot();
      mutate(value);
      assert.throws(() => parseCbIssuerResearchSnapshot(value), TypeError);
    });
  }
});

test("parser returns a deeply frozen defensive copy with no mutable input aliases", () => {
  const input = previousSnapshot();
  const parsed = parseCbIssuerResearchSnapshot(input);

  input.records[0].industryName = "mutated input";
  input.sources.listed.dataDate = "2020-01-01";
  input.diagnostics[0].reason = "NAME_CONFLICT";
  assert.equal(parsed.records[0].industryName, "水泥工業");
  assert.equal(parsed.sources.listed.dataDate, "2026-07-17");
  assert.equal(parsed.diagnostics[0].reason, "MISSING_REVENUE");
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.records), true);
  assert.equal(Object.isFrozen(parsed.records[0]), true);
  assert.equal(Object.isFrozen(parsed.sources.listed), true);
  assert.equal(Object.isFrozen(parsed.diagnostics[0]), true);
  assert.throws(() => { parsed.records[0].industryName = "cannot mutate"; }, TypeError);
});
