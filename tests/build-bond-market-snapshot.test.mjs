import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
import { buildBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { buildCbSupplementalSnapshot } from "../lib/market-data/bond-supplemental.ts";
import { parseCbInstitutionDaily } from "../lib/source-verification/source-cb-institution.ts";
import { parseCbRedemptionAnnouncements } from "../lib/source-verification/source-cb-redemption.ts";
import { parseCbUnderwritingHtml } from "../lib/source-verification/source-cb-underwriting.ts";
import {
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
  fetchCbIssuerResearchSources,
} from "../lib/source-verification/source-cb-issuer-research.ts";
import * as snapshotBuilder from "../scripts/build-bond-market-snapshot.mjs";
import {
  bondInputsFrom11406Rows as pureBondInputsFrom11406Rows,
  bondTermSummariesFrom11406Rows,
} from "../scripts/lib/bond-inputs-from-11406.mjs";

const {
  bondInputsFrom11406Rows,
  buildBondWorkbenchEvents,
  buildBondMarketSnapshot,
  buildWorkbenchSourceStates,
  summarizeWorkbenchSourceStates,
  verifyWorkbenchConsistency,
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

const normalized11406Rows = [{
  債券代碼: "35221",
  機構代碼: "3522",
  機構名稱: "御嵿",
  債券簡稱: "御嵿一",
  到期日期: "1170729",
  發行總額: "500000000",
  目前餘額: "400000000",
  資料日期: "1150730",
  賣回權日期: "1160830",
}];

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

function workbenchTerm(source = bond) {
  return {
    bondCode: source.bondCode,
    issuerCode: source.issuerCode,
    bondName: source.shortName,
    issuerName: source.issuerName,
    issueDate: null,
    listingDate: null,
    maturityDate: source.maturityDate,
    issueAmount: source.issueAmount,
    outstandingAmount: source.outstandingAmount,
    outstandingDataDate: source.outstandingDataDate,
    initialConversionPrice: null,
    conversionStartDate: null,
    conversionEndDate: null,
    putDates: source.putDates,
    putPrice: null,
    securedStatus: null,
    underwriter: null,
    trustee: null,
    unitFaceValueTwd: null,
  };
}

function workbenchView(source = bond) {
  return buildBondMarketViews({
    asOfDate: "2026-07-30",
    bonds: [source],
    cbQuotes: validCollectedMarketData.cbQuotes.map((quote) => ({
      ...quote,
      bondCode: source.bondCode,
    })),
    stockCloses: validCollectedMarketData.stockCloses.map((close) => ({
      ...close,
      companyCode: source.issuerCode,
    })),
    conversionPrices: validCollectedMarketData.conversionPrices.map((price) => ({
      ...price,
      bondCode: source.bondCode,
      issuerCode: source.issuerCode,
    })),
  })[0];
}

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
  await writeFile(
    join(outputDir, "11406.json"),
    `${JSON.stringify(normalized11406Rows)}\n`,
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

test("projects supported 11406 terms in English without requiring unavailable terms", () => {
  const row = {
    債券代碼: "35221",
    機構代碼: "3522",
    機構名稱: "御嵿",
    債券簡稱: "御嵿一",
    發行日期: "1121218",
    掛牌日期: "1121218",
    到期日期: "1170729",
    發行總額: "2000000",
    目前餘額: "1500000",
    資料日期: "1150730",
    發行時轉換價格: "40.0000",
    轉換期間起: "1130319",
    迄: "1170729",
    賣回權日期: "1150830",
    賣回權價格: "101.0000",
    有無擔保: "2",
    承銷機構: "兆豐證券",
    受託人: "彰化銀行",
  };
  const expected = {
    bondCode: "35221", issuerCode: "3522", issuerName: "御嵿",
    bondName: "御嵿一", issueDate: "2023-12-18", listingDate: "2023-12-18",
    maturityDate: "2028-07-29", issueAmount: "2000000", outstandingAmount: "1500000",
    outstandingDataDate: "2026-07-30", initialConversionPrice: "40", conversionStartDate: "2024-03-19",
    conversionEndDate: "2028-07-29", putDates: ["2026-08-30"], putPrice: "101",
    securedStatus: "2", underwriter: "兆豐證券", trustee: "彰化銀行",
    outstandingChangeDate: null, outstandingChangeReason: null, unitFaceValueTwd: null,
  };
  assert.deepEqual(bondTermSummariesFrom11406Rows([row]), [expected]);
  assert.deepEqual(bondInputsFrom11406Rows([row]), pureBondInputsFrom11406Rows([row]));
  assert.deepEqual(bondTermSummariesFrom11406Rows([{
    債券代碼: "35221", 機構代碼: "3522", 機構名稱: "御嵿", 債券簡稱: "御嵿一",
    到期日期: "1170729", 發行總額: "2000000", 目前餘額: "1500000", 賣回權日期: "",
  }])[0], {
    bondCode: "35221", issuerCode: "3522", issuerName: "御嵿",
    bondName: "御嵿一", issueDate: null, listingDate: null, maturityDate: "2028-07-29",
    issueAmount: "2000000", outstandingAmount: "1500000", outstandingDataDate: null,
    initialConversionPrice: null, conversionStartDate: null, conversionEndDate: null,
    putDates: [], putPrice: null, securedStatus: null, underwriter: null, trustee: null,
    outstandingChangeDate: null, outstandingChangeReason: null,
    unitFaceValueTwd: null,
  });
});

test("omits incomplete official outstanding-balance change fields without dropping the bond", () => {
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

  const [dateOnly] = bondTermSummariesFrom11406Rows([{
    ...base,
    最近餘額變動日: "1150801",
    最近餘額變動原因: "",
  }]);
  const [reasonOnly] = bondTermSummariesFrom11406Rows([{
    ...base,
    最近餘額變動日: "",
    最近餘額變動原因: "轉換執行",
  }]);

  assert.equal(dateOnly.bondCode, "35221");
  assert.equal(reasonOnly.bondCode, "35221");
  assert.equal(dateOnly.outstandingChangeDate, null);
  assert.equal(dateOnly.outstandingChangeReason, null);
  assert.equal(reasonOnly.outstandingChangeDate, null);
  assert.equal(reasonOnly.outstandingChangeReason, null);
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
        : name === "conversion-prices.json"
          ? `${JSON.stringify(validCollectedMarketData.conversionPrices)}\n`
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
      cbOpen: "102",
      cbHigh: "102",
      cbLow: "102",
      cbClose: "102",
      cbAverage: "102",
      cbChange: "0",
      cbTradingUnits: "1",
      cbTurnover: "102000",
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
  assert.equal(result.files.length, 8);
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

test("rejects malformed prior history before market collection", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "bond-market-history.json"),
    `${JSON.stringify([{ bondCode: "35221" }])}\n`,
  );
  let marketCalls = 0;

  await assert.rejects(
    () => withBlockedFetch(() => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => {
        marketCalls += 1;
        return validCollectedMarketData;
      },
      now: () => new Date("2026-07-30T12:30:00.000Z"),
    })),
    /history.*keys|history.*contract/i,
  );
  assert.equal(marketCalls, 0);
});

test("validates the entire prior workbench before any fetch or market collection", async () => {
  const outputDir = await makePublishedDirectory();
  await writeFile(
    join(outputDir, "bond-workbench.json"),
    `${JSON.stringify({ schemaVersion: 2 })}\n`,
  );
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let marketCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network must not run before prior workbench validation");
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
      /workbench|schemaVersion/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
  assert.equal(marketCalls, 0);
});

test("publishes a verified workbench manifest entry and archives prior-only bond codes", async () => {
  const outputDir = await makePublishedDirectory();
  const removedBond = {
    ...bond,
    bondCode: "99999",
    issuerCode: "9999",
    issuerName: "舊公司",
    shortName: "舊債一",
  };
  const previous = buildBondWorkbenchSnapshot({
    generatedAt: "2026-07-29T12:30:00.000Z",
    dataDate: "2026-07-29",
    asOfDate: "2026-07-29",
    currentTerms: [workbenchTerm(bond), workbenchTerm(removedBond)],
    currentViews: [workbenchView(bond), workbenchView(removedBond)],
    currentEvents: [],
  });
  await writeFile(
    join(outputDir, "bond-workbench.json"),
    `${JSON.stringify(previous, null, 2)}\n`,
  );

  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  }));

  assert.ok(result.files.includes("bond-workbench.json"));
  const storedText = await readFile(join(outputDir, "bond-workbench.json"), "utf8");
  const stored = JSON.parse(storedText);
  assert.equal(stored.schemaVersion, 1);
  assert.deepEqual(stored.records.map((record) => record.bondCode), ["35221", "99999"]);
  assert.deepEqual(
    stored.records.map((record) => [record.bondCode, record.status, record.archiveReason]),
    [["35221", "active", null], ["99999", "archived", "removed_from_official_roster"]],
  );
  const entry = result.manifest.market.files.find(
    (file) => file.name === "bond-workbench.json",
  );
  assert.equal(entry.rawBytes, Buffer.byteLength(storedText));
  assert.equal(entry.recordCount, 2);
  assert.equal(entry.schemaVersion, 1);
  assert.match(entry.sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(entry.sourceStateSummary.lifecycle, { active: 1, archived: 1 });
  assert.deepEqual(entry.sourceStateSummary, result.manifest.market.workbenchSourceStateSummary);
  const normalizedText = await readFile(join(outputDir, "11406.json"), "utf8");
  assert.deepEqual(result.manifest.market.normalizedInputs, [{
    name: "11406.json",
    sha256: `sha256:${createHash("sha256").update(normalizedText, "utf8").digest("hex")}`,
    rawBytes: Buffer.byteLength(normalizedText, "utf8"),
    recordCount: normalized11406Rows.length,
  }]);
  assert.equal(result.workbench.records.length, 2);
  assert.deepEqual(
    result.workbench.records[0].events.map(({ type, date, sourceId }) => [
      type,
      date,
      sourceId,
    ]),
    [
      ["put", "2027-08-30", "11406"],
      ["maturity", "2028-07-29", "11406"],
    ],
  );
});

test("builds deterministic workbench redemption and delisting events from verified supplemental input", () => {
  const terms = [workbenchTerm()];
  const supplemental = buildCbSupplementalSnapshot({
    generatedAt: "2026-08-09T12:30:00.000Z",
    redemptions: [{
      issuerCode: "3522",
      issuerName: "御嵿",
      bondCode: "35221",
      bondName: "御嵿一",
      announcementDate: "2026-08-04",
      delistingDate: "2026-09-21",
      subject: "公告御嵿股份有限公司國內第一次無擔保轉換公司債(簡稱：御嵿一，代碼：35221)發行公司行使債券贖回權暨訂於115年09月21日終止櫃檯買賣等相關事宜。",
      detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3522&date1=20260804&seq_no=1&pub_class=0&firstin=1",
    }],
    redemptionYear: 2026,
  });

  assert.deepEqual(
    buildBondWorkbenchEvents({ terms, supplemental }).map(
      ({ type, date, title, sourceId, sourceUrl }) => ({
        type,
        date,
        title,
        sourceId,
        sourceUrl,
      }),
    ),
    [
      {
        type: "redemption",
        date: "2026-08-04",
        title: "御嵿一贖回公告",
        sourceId: "tpex-cb-redemption-announcements",
        sourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
      },
      {
        type: "delisting",
        date: "2026-09-21",
        title: "御嵿一終止櫃檯買賣",
        sourceId: "tpex-cb-redemption-announcements",
        sourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
      },
      {
        type: "put",
        date: "2027-08-30",
        title: "御嵿一賣回權日期",
        sourceId: "11406",
        sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
      },
      {
        type: "maturity",
        date: "2028-07-29",
        title: "御嵿一到期日",
        sourceId: "11406",
        sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
      },
    ],
  );
});

test("a bonds override cannot claim normalized 11406 integrity provenance", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [{ ...bond, issueAmount: "499000000" }],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  }));

  assert.equal(
    Object.prototype.hasOwnProperty.call(result.manifest.market, "normalizedInputs"),
    false,
  );
});

test("workbench cross-file verification uses exact bond codes, history and source states", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  }));
  const history = JSON.parse(await readFile(
    join(outputDir, "bond-market-history.json"),
    "utf8",
  ));
  const entry = result.manifest.market.files.find(
    (file) => file.name === "bond-workbench.json",
  );
  const valid = {
    workbench: result.workbench,
    terms: result.workbench.records.map((record) => record.term),
    views: result.views,
    history,
    supplemental: result.supplemental,
    issuerResearch: result.issuerResearch,
    requestedDate: result.manifest.market.requestedDate,
    dataDate: result.manifest.market.dataDate,
    sourceStateSummary: entry.sourceStateSummary,
  };
  assert.doesNotThrow(() => verifyWorkbenchConsistency(valid));
  const publishedLegacyWorkbench = structuredClone(result.workbench);
  delete publishedLegacyWorkbench.records[0].view.marketStatus;
  const publishedLegacyViews = structuredClone(result.views);
  delete publishedLegacyViews[0].marketStatus;
  assert.doesNotThrow(() => verifyWorkbenchConsistency({
    ...valid,
    workbench: publishedLegacyWorkbench,
    views: publishedLegacyViews,
  }));
  const missingLoadedEvents = structuredClone(result.workbench);
  missingLoadedEvents.records[0].events = [];
  missingLoadedEvents.records[0].fieldStates.events = "missing";
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: missingLoadedEvents,
      sourceStateSummary: summarizeWorkbenchSourceStates(missingLoadedEvents),
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      views: [{ ...valid.views[0], bondCode: "99999" }],
    }),
    /WORKBENCH_CURRENT_BOND_CODES|WORKBENCH_CURRENT_MISMATCH/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      terms: [{ ...valid.terms[0], issuerCode: "9999" }],
    }),
    /WORKBENCH_CURRENT_MISMATCH/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      history: [{ ...history[0], bondCode: "99999" }],
    }),
    /WORKBENCH_HISTORY_BOND_CODE/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      sourceStateSummary: {
        ...entry.sourceStateSummary,
        lifecycle: { active: 0, archived: 1 },
      },
    }),
    /WORKBENCH_SOURCE_STATE/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: { ...result.workbench, schemaVersion: 2 },
    }),
    /schemaVersion/,
  );
  const forgedAssessment = structuredClone(result.workbench);
  forgedAssessment.records[0].assessment.dimensions.find(
    (dimension) => dimension.code === "liquidity",
  ).state = "risk";
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: forgedAssessment,
    }),
    /WORKBENCH_HISTORY_ASSESSMENT/,
  );
  assert.doesNotThrow(() => verifyWorkbenchConsistency({
    ...valid,
    workbench: forgedAssessment,
    allowHistoricalAssessments: true,
  }));
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: forgedAssessment,
      allowHistoricalAssessments: true,
      sourceStateSummary: {
        ...entry.sourceStateSummary,
        lifecycle: { active: 0, archived: 1 },
      },
    }),
    /WORKBENCH_SOURCE_STATE/,
  );
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: missingLoadedEvents,
      sourceStateSummary: summarizeWorkbenchSourceStates(missingLoadedEvents),
      allowHistoricalAssessments: true,
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );

  const institutionFixture = JSON.parse(await readFile(new URL(
    "./fixtures/source-verification/cb-institution/daily-minimal.json",
    import.meta.url,
  ), "utf8"));
  institutionFixture.date = "20260729";
  institutionFixture.tables[0].date = "115/07/29";
  institutionFixture.tables[0].data = [[
    "35221", "御嵿一", "0", "0", "0", "0", "0", "0", "10", "0", "10", "10",
  ]];
  institutionFixture.tables[0].totalCount = 1;
  const priorSupplemental = buildCbSupplementalSnapshot({
    generatedAt: "2026-07-29T12:30:00.000Z",
    institution: parseCbInstitutionDaily(institutionFixture),
    redemptions: [],
    redemptionYear: 2026,
  });
  const staleSupplemental = buildCbSupplementalSnapshot({
    generatedAt: "2026-07-31T12:30:00.000Z",
    previous: priorSupplemental,
  });
  const staleIssuerResearch = structuredClone(result.issuerResearch);
  staleIssuerResearch.generatedAt = "2026-07-31T12:30:00.000Z";
  const issuerMarket = staleIssuerResearch.records[0].market;
  staleIssuerResearch.sources[issuerMarket].status = "stale";
  const staleViews = buildBondMarketViews({
    asOfDate: valid.requestedDate,
    bonds: [bond],
    cbQuotes: validCollectedMarketData.cbQuotes,
    stockCloses: validCollectedMarketData.stockCloses,
    conversionPrices: validCollectedMarketData.conversionPrices,
    supplemental: staleSupplemental,
    issuerResearch: staleIssuerResearch.records,
  });
  const staleTerms = valid.terms.map((term) => ({
    ...term,
    unitFaceValueTwd: staleSupplemental.unitFaceValueTwd,
  }));
  const currentSourceStates = buildWorkbenchSourceStates({
    views: staleViews,
    supplemental: staleSupplemental,
    issuerResearch: staleIssuerResearch,
  });
  const staleWorkbench = buildBondWorkbenchSnapshot({
    generatedAt: result.workbench.generatedAt,
    dataDate: valid.dataDate,
    asOfDate: valid.requestedDate,
    currentTerms: staleTerms,
    currentViews: staleViews,
    currentEvents: buildBondWorkbenchEvents({
      terms: staleTerms,
      supplemental: staleSupplemental,
    }),
    currentSourceStates,
    currentAssessments: result.workbench.records
      .filter((record) => record.status === "active")
      .map((record) => ({ bondCode: record.bondCode, assessment: record.assessment })),
  });
  assert.equal(staleWorkbench.records[0].fieldStates.company, "stale");
  assert.equal(staleWorkbench.records[0].fieldStates.events, "stale");
  assert.doesNotThrow(() => verifyWorkbenchConsistency({
    ...valid,
    workbench: staleWorkbench,
    terms: staleTerms,
    views: staleViews,
    supplemental: staleSupplemental,
    issuerResearch: staleIssuerResearch,
    sourceStateSummary: summarizeWorkbenchSourceStates(staleWorkbench),
  }));
  const falselyCompleteSources = structuredClone(staleWorkbench);
  falselyCompleteSources.records[0].fieldStates.company = "complete";
  falselyCompleteSources.records[0].fieldStates.events = "complete";
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...valid,
      workbench: falselyCompleteSources,
      terms: staleTerms,
      views: staleViews,
      supplemental: staleSupplemental,
      issuerResearch: staleIssuerResearch,
      sourceStateSummary: summarizeWorkbenchSourceStates(falselyCompleteSources),
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );
});

test("workbench verification recomputes lifecycle and every record field state", async () => {
  const outputDir = await makePublishedDirectory();
  const result = await withOfflineProductionFetch(() => buildBondMarketSnapshot({
    outputDir,
    bonds: [bond],
    collectImpl: async () => validCollectedMarketData,
    now: () => new Date("2026-07-30T12:30:00.000Z"),
  }));
  const history = JSON.parse(await readFile(
    join(outputDir, "bond-market-history.json"),
    "utf8",
  ));
  const currentTerms = result.workbench.records.map((record) => record.term);
  const common = {
    terms: currentTerms,
    views: result.views,
    history,
    supplemental: result.supplemental,
    issuerResearch: result.issuerResearch,
    requestedDate: result.manifest.market.requestedDate,
    dataDate: result.manifest.market.dataDate,
  };

  const falselyArchived = structuredClone(result.workbench);
  falselyArchived.records[0].status = "archived";
  falselyArchived.records[0].archiveReason = "removed_from_official_roster";
  falselyArchived.records[0].archivedAt = common.requestedDate;
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...common,
      workbench: falselyArchived,
      sourceStateSummary: summarizeWorkbenchSourceStates(falselyArchived),
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );

  const noPriceView = {
    ...result.views[0],
    cbClose: null,
    cbPriceDate: null,
    cbTradeUnits: "0",
    staleCbPrice: false,
  };
  const noPrice = buildBondWorkbenchSnapshot({
    generatedAt: result.workbench.generatedAt,
    dataDate: common.dataDate,
    asOfDate: common.requestedDate,
    currentTerms,
    currentViews: [noPriceView],
    currentEvents: [],
  });
  const falselyCompletePrice = structuredClone(noPrice);
  falselyCompletePrice.records[0].fieldStates.price = "complete";
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...common,
      workbench: falselyCompletePrice,
      views: [noPriceView],
      history: [],
      sourceStateSummary: summarizeWorkbenchSourceStates(falselyCompletePrice),
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );

  const secondTerm = { ...currentTerms[0], bondCode: "99999" };
  const secondView = { ...noPriceView, bondCode: "99999" };
  const twoBonds = buildBondWorkbenchSnapshot({
    generatedAt: result.workbench.generatedAt,
    dataDate: common.dataDate,
    asOfDate: common.requestedDate,
    currentTerms: [currentTerms[0], secondTerm],
    currentViews: [result.views[0], secondView],
    currentEvents: [],
  });
  const swappedStates = structuredClone(twoBonds);
  [swappedStates.records[0].fieldStates, swappedStates.records[1].fieldStates] = [
    swappedStates.records[1].fieldStates,
    swappedStates.records[0].fieldStates,
  ];
  assert.throws(
    () => verifyWorkbenchConsistency({
      ...common,
      workbench: swappedStates,
      terms: [currentTerms[0], secondTerm],
      views: [result.views[0], secondView],
      history: [],
      sourceStateSummary: summarizeWorkbenchSourceStates(swappedStates),
    }),
    /WORKBENCH_CANDIDATE_MISMATCH/,
  );
});

test("rejects a conflicting same-day history refresh without overwriting it", async () => {
  const outputDir = await makePublishedDirectory();
  const previous = [{
    bondCode: "35221",
    date: "2026-07-29",
    cbOpen: "103.5",
    cbHigh: "103.5",
    cbLow: "103.5",
    cbClose: "103.5",
    cbAverage: "103.5",
    cbChange: "0",
    cbTradingUnits: "10",
    cbTurnover: "1035000",
    stockClose: "38.25",
    effectiveConversionPrice: "35.1",
    conversionValue: "108.97",
    premiumRate: "-5.02",
  }];
  await writeFile(
    join(outputDir, "bond-market-history.json"),
    `${JSON.stringify(previous, null, 2)}\n`,
  );
  const before = await readFile(join(outputDir, "bond-market-history.json"), "utf8");

  await assert.rejects(
    () => withOfflineProductionFetch(() => buildBondMarketSnapshot({
      outputDir,
      bonds: [bond],
      collectImpl: async () => validCollectedMarketData,
      now: () => new Date("2026-07-30T12:30:00.000Z"),
    })),
    /history conflict|correction evidence/i,
  );
  assert.equal(await readFile(join(outputDir, "bond-market-history.json"), "utf8"), before);
});
