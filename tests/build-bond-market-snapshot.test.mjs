import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildBondMarketViews } from "../lib/market-data/bond-market-view.ts";
import { buildCbSupplementalSnapshot } from "../lib/market-data/bond-supplemental.ts";
import { parseCbInstitutionDaily } from "../lib/source-verification/source-cb-institution.ts";
import { parseCbRedemptionAnnouncements } from "../lib/source-verification/source-cb-redemption.ts";
import { parseCbUnderwritingHtml } from "../lib/source-verification/source-cb-underwriting.ts";
import {
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
  fetchCbIssuerResearchSources,
} from "../lib/source-verification/source-cb-issuer-research.ts";
import * as snapshotBuilder from "../scripts/build-bond-market-snapshot.mjs";

const {
  bondInputsFrom11406Rows,
  buildBondMarketSnapshot,
} = snapshotBuilder;

const bond = {
  bondCode: "35221",
  issuerCode: "3522",
  issuerName: "御嵿",
  shortName: "御嵿一",
  maturityDate: "2028-07-29",
  issueAmount: "500000000",
  outstandingAmount: "400000000",
  outstandingDataDate: "2026-07-30",
  putDates: ["2027-08-30"],
};

const previousIssuerResearch = {
  schemaVersion: 1,
  generatedAt: "2026-07-29T12:30:00.000Z",
  records: [{
    issuerCode: "3522",
    issuerName: "御嵿",
    market: "listed",
    industryName: "觀光餐旅",
    revenueMonth: "2026-06",
    sourcePublishedOn: "2026-07-17",
    revenueUnit: "仟元",
    currentMonthRevenue: "100",
    monthOverMonthPercent: "1",
    yearOverYearPercent: "2",
    cumulativeRevenue: "600",
    cumulativeYearOverYearPercent: "3",
  }],
  sources: {
    listed: {
      status: "current",
      dataDate: "2026-07-17",
      fetchedAt: "2026-07-29T12:30:00.000Z",
    },
    otc: { status: "unavailable", dataDate: null, fetchedAt: null },
  },
  diagnostics: [],
};
const validCollectedMarketData = {
  requestedDate: "2026-07-30",
  cbQuotes: [{
    bondCode: "35221",
    tradingDate: "2026-07-29",
    tradingMode: "equivalent",
    close: "103.5",
    change: "1.5",
    open: "103.5",
    high: "103.5",
    low: "103.5",
    tradeCount: "2",
    tradingUnits: "10",
    turnover: "1035000",
    average: "103.5",
  }],
  stockCloses: [{
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "38.25",
    change: "0",
    volume: "1000",
    turnover: "38250",
  }],
  conversionPrices: [{
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "40",
    currentConversionPrice: "35.1",
    effectiveDate: "2025-11-09",
    officialDetailUrl:
      "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
  }],
  sourceUrls: [
    "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    "https://www.tpex.org.tw/www/zh-tw/bond/convSearch",
  ],
};

async function makePublishedDirectory() {
  const root = await mkdtemp(join(tmpdir(), "cb-market-test-"));
  const outputDir = join(root, "data");
  await mkdir(outputDir);
  await writeFile(
    join(outputDir, "manifest.json"),
    `${JSON.stringify({
      kind: "official-source-snapshot",
      generatedAt: "2026-07-29",
      datasets: [],
    })}\n`,
  );
  return outputDir;
}

async function offlineIssuerResearchSourceResults() {
  const listed = await readFile(new URL(
    "./fixtures/source-verification/cb-issuer-research/listed-minimal.csv",
    import.meta.url,
  ), "utf8");
  return {
    listed: {
      status: "fulfilled",
      value: listed.replace('"1101","台泥"', '"3522","御嵿"'),
    },
    otc: { status: "rejected", reason: new Error("offline OTC unavailable") },
  };
}

async function withBlockedFetch(run) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    throw new Error(`unexpected network request: ${String(url)}`);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    assert.equal(calls, 0);
  }
}

async function withOfflineProductionFetch(run, { failUnderwriting = false } = {}) {
  const [listed, otc, institution, redemption, underwriting] = await Promise.all([
    readFile(new URL(
      "./fixtures/source-verification/cb-issuer-research/listed-minimal.csv",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-issuer-research/otc-minimal.csv",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-institution/daily-minimal.json",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-redemption/year-minimal.json",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-underwriting/current-year-minimal.html",
      import.meta.url,
    ), "utf8"),
  ]);
  const issuerBodies = new Map([
    [
      CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url,
      listed.replace(/"1101","[^"]+"/, `"3522","${bond.issuerName}"`),
    ],
    [CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url, otc],
  ]);
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    calls.push(target);
    if (issuerBodies.has(target)) {
      const response = new Response(issuerBodies.get(target), {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8" },
      });
      Object.defineProperties(response, {
        redirected: { value: false },
        url: { value: target },
      });
      return response;
    }
    if (target.endsWith("/newCb3itrade")) {
      return new Response(institution, {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }
    if (target.endsWith("/redeem")) {
      return new Response(redemption, {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }
    if (target === "https://web.twsa.org.tw/edoc2/default.aspx") {
      if (failUnderwriting) return new Response("unavailable", { status: 503 });
      return new Response(underwriting, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected network request: ${target}:${init.method ?? "GET"}`);
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    assert.deepEqual(calls, [
      ...Object.values(CB_ISSUER_RESEARCH_SOURCE_POLICIES).map((policy) => policy.url),
      "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
      "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
      ...Array(failUnderwriting ? 3 : 1)
        .fill("https://web.twsa.org.tw/edoc2/default.aspx"),
    ]);
  }
}

async function previousSupplementalFromFixtures() {
  const [institution, redemption, underwriting] = await Promise.all([
    readFile(new URL(
      "./fixtures/source-verification/cb-institution/daily-minimal.json",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-redemption/year-minimal.json",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-underwriting/current-year-minimal.html",
      import.meta.url,
    ), "utf8"),
  ]);
  return buildCbSupplementalSnapshot({
    generatedAt: "2026-08-08T12:30:00.000Z",
    institution: parseCbInstitutionDaily(JSON.parse(institution)),
    redemptions: parseCbRedemptionAnnouncements(JSON.parse(redemption)),
    redemptionYear: 2026,
    underwriting: parseCbUnderwritingHtml(underwriting),
  });
}

test("maps official 11406 dates, put dates and amount units exactly", () => {
  assert.deepEqual(bondInputsFrom11406Rows([{
    債券代碼: "35221",
    機構代碼: "3522",
    機構名稱: "御嵿",
    債券簡稱: "御嵿一",
    到期日期: "1170729",
    發行總額: "2仟元",
    目前餘額: "1,500元",
    資料日期: "1150730",
    賣回權日期: "115/08/30、1160830",
  }]), [{
    bondCode: "35221",
    issuerCode: "3522",
    issuerName: "御嵿",
    shortName: "御嵿一",
    maturityDate: "2028-07-29",
    issueAmount: "2000",
    outstandingAmount: "1500",
    outstandingDataDate: "2026-07-30",
    putDates: ["2026-08-30", "2027-08-30"],
  }]);
});

test("maps the English 11406 DataDate alias without blocking identity-only rows", () => {
  const base = {
    債券代碼: "35221",
    機構代碼: "3522",
    機構名稱: "御嵿",
    債券簡稱: "御嵿一",
    到期日期: "1170729",
    發行總額: "2000000",
    目前餘額: "1500000",
    賣回權日期: "",
  };
  assert.equal(
    bondInputsFrom11406Rows([{ ...base, DataDate: "20260730" }])[0]
      .outstandingDataDate,
    "2026-07-30",
  );
  assert.equal(
    bondInputsFrom11406Rows([base])[0].outstandingDataDate,
    null,
  );
  assert.throws(
    () => bondInputsFrom11406Rows([{
      ...base,
      資料日期: "20260730",
      DataDate: "20260731",
    }]),
    /data date|資料日期|DataDate/i,
  );
});

test("production issuer research consumes both approved exact resources", async () => {
  const { settleProductionCbIssuerResearchSources } = await import(
    "../scripts/build-bond-market-snapshot.mjs"
  );
  const [listedBody, otcBody] = await Promise.all([
    readFile(new URL(
      "./fixtures/source-verification/cb-issuer-research/listed-minimal.csv",
      import.meta.url,
    ), "utf8"),
    readFile(new URL(
      "./fixtures/source-verification/cb-issuer-research/otc-minimal.csv",
      import.meta.url,
    ), "utf8"),
  ]);
  const bodies = new Map([
    [CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url, listedBody],
    [CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url, otcBody],
  ]);
  const calls = [];
  const result = await settleProductionCbIssuerResearchSources({
    fetchSourcesImpl: () => fetchCbIssuerResearchSources({
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        const response = new Response(bodies.get(url), {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8" },
        });
        Object.defineProperties(response, {
          redirected: { value: false },
          url: { value: url },
        });
        return response;
      },
    }),
  });

  assert.deepEqual(calls, Object.values(CB_ISSUER_RESEARCH_SOURCE_POLICIES).map((policy) => ({
    url: policy.url,
    init: { method: "GET", redirect: "manual" },
  })));
  assert.deepEqual(result, {
    listed: { status: "fulfilled", value: listedBody },
    otc: { status: "fulfilled", value: otcBody },
  });
});

test("pure issuer-research candidate helper validates settled CSVs without publishing", async () => {
  const candidate = snapshotBuilder.buildCbIssuerResearchCandidate({
    generatedAt: "2026-08-09T12:30:00.000Z",
    issuers: [{ issuerCode: "3522", issuerName: "御嵿" }],
    sourceResults: await offlineIssuerResearchSourceResults(),
  });

  const researchText = candidate.artifact.text;
  const research = JSON.parse(researchText);
  assert.equal(research.records.length, 1);
  assert.equal(research.records[0].issuerCode, "3522");
  assert.equal(research.sources.listed.status, "current");
  assert.equal(research.sources.otc.status, "unavailable");
  assert.equal(researchText.includes("備註"), false);
  assert.equal(researchText.includes("offline OTC unavailable"), false);
  assert.equal(researchText.includes("t187ap05_L.csv"), false);
  assert.deepEqual(candidate.snapshot, research);
  assert.equal(candidate.viewRecords, candidate.snapshot.records);
  assert.equal(candidate.artifact.name, "cb-issuer-research.json");
  assert.match(candidate.artifact.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(candidate.artifact.recordCount, 1);

  const views = buildBondMarketViews({
    asOfDate: "2026-08-09",
    bonds: [bond, { ...bond, bondCode: "35222", shortName: "御嵿二" }],
    cbQuotes: [],
    stockCloses: [],
    conversionPrices: [],
    issuerResearch: candidate.viewRecords,
  });
  assert.deepEqual(views.map((view) => view.issuerResearch?.industryName), [
    "水泥工業",
    "水泥工業",
  ]);
  assert.notStrictEqual(views[0].issuerResearch, views[1].issuerResearch);
});

test("supplemental cross-file verification keeps ratio independent of face-value availability", () => {
  const supplemental = {
    schemaVersion: 1,
    generatedAt: "2026-08-09T12:30:00.000Z",
    unitFaceValueTwd: null,
    institutionHistory: {},
    redemptions: [],
    underwritingCases: [],
    sources: {
      institution: { state: "unavailable", dataDate: null, periodYear: null },
      redemption: { state: "unavailable", dataDate: null, periodYear: null },
      underwriting: { state: "unavailable", dataDate: null, periodYear: null },
    },
  };
  const views = buildBondMarketViews({
    asOfDate: "2026-07-30",
    bonds: [bond],
    cbQuotes: [],
    stockCloses: [],
    conversionPrices: [],
    supplemental,
  });

  assert.equal(views[0].remainingUnits, null);
  assert.equal(views[0].remainingRatio, "80");
  assert.doesNotThrow(() => snapshotBuilder.verifySupplementalViewConsistency(
    supplemental,
    views,
    "2026-07-30",
    [bond],
  ));
});

test("supplemental cross-file verification rejects corrupted derived metrics and quality", async (t) => {
  const supplemental = {
    schemaVersion: 1,
    generatedAt: "2026-08-09T12:30:00.000Z",
    unitFaceValueTwd: "100000",
    institutionHistory: {},
    redemptions: [],
    underwritingCases: [],
    sources: {
      institution: { state: "fresh", dataDate: "2026-07-30", periodYear: 2026 },
      redemption: { state: "unavailable", dataDate: null, periodYear: null },
      underwriting: { state: "unavailable", dataDate: null, periodYear: null },
    },
  };
  const views = buildBondMarketViews({
    asOfDate: "2026-07-30",
    bonds: [bond],
    cbQuotes: [{
      ...validCollectedMarketData.cbQuotes[0],
      tradingDate: "2026-07-30",
    }],
    stockCloses: [],
    conversionPrices: [],
    supplemental,
  });
  assert.deepEqual(
    [views[0].remainingUnits, views[0].remainingRatio, views[0].dailyTurnoverRate],
    ["4000", "80", "0.25"],
  );

  for (const [name, issuanceEvidence] of [
    ["missing issuance evidence", []],
    ["duplicate issuance evidence", [bond, bond]],
    ["invalid issuance evidence", [{ ...bond, issueAmount: 1 }]],
  ]) {
    await t.test(name, () => {
      assert.throws(
        () => snapshotBuilder.verifySupplementalViewConsistency(
          supplemental,
          views,
          "2026-07-30",
          issuanceEvidence,
        ),
        /SUPPLEMENTAL_ISSUANCE_EVIDENCE/,
      );
    });
  }

  for (const [name, patch] of [
    ["remaining units", { remainingUnits: "3999" }],
    ["remaining ratio", { remainingRatio: "79.99" }],
    ["daily turnover rate", { dailyTurnoverRate: "0.26" }],
    ["extra derived reason", {
      missingReasons: [...views[0].missingReasons, "ZERO_REMAINING_UNITS"],
    }],
    ["false date mismatch quality", { dataQuality: "date_mismatch" }],
  ]) {
    await t.test(name, () => {
      const corrupted = [{ ...views[0], ...patch }];
      assert.throws(
        () => snapshotBuilder.verifySupplementalViewConsistency(
          supplemental,
          corrupted,
          "2026-07-30",
          [bond],
        ),
        /SUPPLEMENTAL_VIEW_MISMATCH/,
      );
    });
  }

  await t.test("missing required derived reason", () => {
    const noFace = {
      ...supplemental,
      unitFaceValueTwd: null,
      sources: {
        ...supplemental.sources,
        institution: { state: "unavailable", dataDate: null, periodYear: null },
      },
    };
    const [noFaceView] = buildBondMarketViews({
      asOfDate: "2026-07-30",
      bonds: [bond],
      cbQuotes: [{
        ...validCollectedMarketData.cbQuotes[0],
        tradingDate: "2026-07-30",
      }],
      stockCloses: [],
      conversionPrices: [],
      supplemental: noFace,
    });
    assert.throws(
      () => snapshotBuilder.verifySupplementalViewConsistency(
        noFace,
        [{
          ...noFaceView,
          missingReasons: noFaceView.missingReasons.filter(
            (reason) => reason !== "NO_VERIFIED_FACE_VALUE",
          ),
        }],
        "2026-07-30",
        [bond],
      ),
      /SUPPLEMENTAL_VIEW_MISMATCH/,
    );
  });

  await t.test("balance date mismatch must use date mismatch quality", () => {
    const [mismatchedView] = buildBondMarketViews({
      asOfDate: "2026-07-30",
      bonds: [bond],
      cbQuotes: [validCollectedMarketData.cbQuotes[0]],
      stockCloses: [],
      conversionPrices: [],
      supplemental,
    });
    assert.throws(
      () => snapshotBuilder.verifySupplementalViewConsistency(
        supplemental,
        [{ ...mismatchedView, dataQuality: "partial" }],
        "2026-07-30",
        [bond],
      ),
      /SUPPLEMENTAL_VIEW_MISMATCH/,
    );
  });
});

test("removed offline source option cannot publish current research while unapproved", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "cb-issuer-research.json"),
    `${JSON.stringify(previousIssuerResearch)}\n`,
  );
  const before = await readFile(join(outputDir, "cb-issuer-research.json"), "utf8");
  let marketCalls = 0;

  await assert.rejects(
    withBlockedFetch(() => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => {
        marketCalls += 1;
        return validCollectedMarketData;
      },
      offlineIssuerResearchSourceResults: {},
      now: () => new Date("2026-08-09T12:30:00.000Z"),
    })),
    /offlineIssuerResearchSourceResults.*not supported/i,
  );
  assert.equal(marketCalls, 0);
  assert.equal(await readFile(join(outputDir, "cb-issuer-research.json"), "utf8"), before);
});

test("validates the entire prior issuer snapshot before market collection or stale reuse", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "cb-issuer-research.json"),
    `${JSON.stringify({ ...previousIssuerResearch, schemaVersion: 2 })}\n`,
  );
  let marketCalls = 0;

  await assert.rejects(
    withBlockedFetch(() => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => {
        marketCalls += 1;
        return validCollectedMarketData;
      },
      now: () => new Date("2026-08-09T12:30:00.000Z"),
    })),
    /schemaVersion/i,
  );
  assert.equal(marketCalls, 0);
});

test("validates the entire prior supplemental snapshot before any fetch or market collection", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "bond-supplemental.json"),
    `${JSON.stringify({ schemaVersion: 2 })}\n`,
  );
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let marketCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network must not run before prior supplemental validation");
  };
  try {
    await assert.rejects(
      () => buildBondMarketSnapshot({
        outputDir,
        bonds: [bond],
        collectImpl: async () => {
          marketCalls += 1;
          return validCollectedMarketData;
        },
        now: () => new Date("2026-08-09T12:30:00.000Z"),
      }),
      /supplemental|schemaVersion/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
  assert.equal(marketCalls, 0);
});

test("production default consumes approved sources through exact offline responses", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-08-09T12:30:00.000Z"),
  }));

  assert.deepEqual(result.issuerResearch.sources, {
    listed: {
      status: "current",
      dataDate: "2026-07-17",
      fetchedAt: "2026-08-09T12:30:00.000Z",
    },
    otc: {
      status: "current",
      dataDate: "2026-07-17",
      fetchedAt: "2026-08-09T12:30:00.000Z",
    },
  });
  assert.equal(result.issuerResearch.records.length, 1);
  assert.equal(result.issuerResearch.records[0].issuerCode, "3522");
  assert.notEqual(result.views[0].issuerResearch, null);
});

test("publishes a validated CB supplemental artifact and enriches the same candidate views", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => ({
      ...validCollectedMarketData,
      requestedDate: "2026-08-07",
    }),
    asOfDate: "2026-08-07",
    now: () => new Date("2026-08-09T12:30:00.000Z"),
  }));

  assert.ok(result.files.includes("bond-supplemental.json"));
  const stored = JSON.parse(
    await readFile(join(outputDir, "bond-supplemental.json"), "utf8"),
  );
  assert.deepEqual(stored, result.supplemental);
  assert.equal(stored.schemaVersion, 1);
  assert.deepEqual(
    Object.values(stored.sources).map((source) => source.state),
    ["fresh", "fresh", "fresh"],
  );
  assert.equal(result.views[0].remainingUnits, "4000");
  assert.deepEqual(result.manifest.market.supplementalSources, stored.sources);
  const entry = result.manifest.market.files.find(
    (file) => file.name === "bond-supplemental.json",
  );
  assert.equal(entry.recordCount, 6);
  assert.match(entry.sha256, /^sha256:[0-9a-f]{64}$/);
});

test("reuses only the validated previous supplemental section whose source is unavailable", async () => {
  const outputDir = await makePublishedDirectory();
  const previous = await previousSupplementalFromFixtures();
  await writeFile(
    join(outputDir, "bond-supplemental.json"),
    `${JSON.stringify(previous, null, 2)}\n`,
  );

  const result = await withOfflineProductionFetch(
    () => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => ({
        ...validCollectedMarketData,
        requestedDate: "2026-08-07",
      }),
      asOfDate: "2026-08-07",
      now: () => new Date("2026-08-09T12:30:00.000Z"),
    }),
    { failUnderwriting: true },
  );

  assert.equal(result.supplemental.sources.institution.state, "fresh");
  assert.equal(result.supplemental.sources.redemption.state, "fresh");
  assert.equal(result.supplemental.sources.underwriting.state, "stale");
  assert.deepEqual(
    result.supplemental.underwritingCases,
    previous.underwritingCases,
  );
  assert.notStrictEqual(
    result.supplemental.underwritingCases,
    previous.underwritingCases,
  );
});

test("excludes only explicitly private unlisted 11406 bonds without hiding malformed public codes", () => {
  assert.deepEqual(bondInputsFrom11406Rows([
    {
      債券代碼: "YI31AA",
      機構代碼: "2911",
      債券簡稱: "麗嬰房私債一",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "0",
      上市櫃否: "5",
      募集方式: "8",
    },
    {
      債券代碼: "YB66AC",
      機構代碼: "6165",
      債券簡稱: "浪凡私債三",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "5",
      募集方式: "8",
    },
  ]), []);

  assert.throws(
    () => bondInputsFrom11406Rows([{
      債券代碼: "BAD-CODE",
      機構代碼: "2911",
      債券簡稱: "錯誤公開債券",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "1",
      募集方式: "1",
    }]),
    /invalid bond code/,
  );
  assert.throws(
    () => bondInputsFrom11406Rows([{
      債券代碼: "",
      機構代碼: "2911",
      債券簡稱: "缺少代碼的公開債券",
      到期日期: "20281206",
      發行總額: "300000000",
      目前餘額: "300000000",
      賣回權日期: "",
      掛牌地點: "1",
      上市櫃否: "1",
      募集方式: "1",
    }]),
    /missing bond code/,
  );
});

test("a failed candidate leaves every published market file unchanged", async () => {
  const outputDir = await makePublishedDirectory();
  const names = [
    "cb-quotes.json",
    "stock-closes.json",
    "conversion-prices.json",
    "cb-issuer-research.json",
    "bond-market-view.json",
  ];
  for (const name of names) {
    await writeFile(
      join(outputDir, name),
      name === "cb-issuer-research.json"
        ? `${JSON.stringify(previousIssuerResearch)}\n`
        : `{"previous":"${name}"}\n`,
    );
  }
  const before = Object.fromEntries(await Promise.all(
    ["manifest.json", ...names].map(async (name) => [
      name,
      await readFile(join(outputDir, name), "utf8"),
    ]),
  ));

  await assert.rejects(
    () => withOfflineProductionFetch(() => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => ({
        ...validCollectedMarketData,
        cbQuotes: [],
      }),
      now: () => new Date("2026-07-30T12:30:00.000Z"),
    })),
    /VALIDATION_FAILED/,
  );

  for (const [name, text] of Object.entries(before)) {
    assert.equal(await readFile(join(outputDir, name), "utf8"), text);
  }
});

test("a valid candidate publishes verified files and appends exact-date history", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "bond-market-history.json"),
    `${JSON.stringify([{
      bondCode: "35221",
      date: "2026-07-28",
      cbClose: "102",
      stockClose: "37",
      effectiveConversionPrice: "35.1",
      conversionValue: "105.41",
      premiumRate: "-3.24",
    }])}\n`,
  );
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  }));

  assert.equal(result.status, "published");
  assert.equal(result.files.length, 7);
  assert.equal(result.manifest.market.generatedAt, "2026-07-30T12:30:00.000Z");
  assert.equal(result.manifest.market.status, "verified");
  assert.equal(result.manifest.market.requestedDate, "2026-07-30");
  assert.equal(result.manifest.market.latestCbPriceDate, "2026-07-29");
  assert.equal(result.manifest.market.latestStockPriceDate, "2026-07-29");
  assert.equal(result.manifest.market.dataDate, "2026-07-29");
  assert.equal(result.report.validation, "passed");

  for (const file of result.manifest.market.files) {
    const text = await readFile(join(outputDir, file.name), "utf8");
    assert.deepEqual(JSON.parse(text), file.name === "bond-market-view.json"
      ? result.views
      : JSON.parse(text));
    assert.match(file.sha256, /^sha256:[0-9a-f]{64}$/);
  }
  const storedManifest = JSON.parse(
    await readFile(join(outputDir, "manifest.json"), "utf8"),
  );
  assert.equal(
    storedManifest.market.generatedAt,
    result.manifest.market.generatedAt,
  );
  const history = JSON.parse(
    await readFile(join(outputDir, "bond-market-history.json"), "utf8"),
  );
  assert.deepEqual(
    history.map((point) => point.date),
    ["2026-07-28", "2026-07-29"],
  );
});
