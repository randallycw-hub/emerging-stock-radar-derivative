import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessCbIssuerResearchSource,
  deriveActiveCbIssuerIdentities,
  loadActiveCbIssuerContext,
  runCbIssuerResearchSmoke,
} from "../scripts/live-source-smoke/cb-issuer-research.mjs";

const listedFixtureUrl = new URL(
  "./fixtures/source-verification/cb-issuer-research/listed-minimal.csv",
  import.meta.url,
);

const otcFixtureUrl = new URL(
  "./fixtures/source-verification/cb-issuer-research/otc-minimal.csv",
  import.meta.url,
);

test("module import has no CLI fetch, output, or exit-code side effects", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  const fetchCalls = [];
  const logs = [];
  let observedExitCode;
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error(`unexpected import fetch: ${String(url)}`);
  };
  console.log = (...values) => logs.push(values);
  try {
    await import("../scripts/live-source-smoke/cb-issuer-research.mjs?import-only");
    observedExitCode = process.exitCode;
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(logs, []);
  assert.equal(observedExitCode, originalExitCode);
});

function active11406Row(overrides = {}) {
  return {
    債券代碼: "11011",
    機構代碼: "1101",
    機構名稱: "台泥",
    債券簡稱: "台泥一",
    到期日期: "1180717",
    發行總額: "1000000",
    目前餘額: "900000",
    賣回權日期: "",
    ...overrides,
  };
}

test("derives the active issuer denominator through the verified 11406 bond rules", () => {
  assert.deepEqual(deriveActiveCbIssuerIdentities([
    active11406Row(),
    active11406Row({ 債券代碼: "11012", 債券簡稱: "台泥二" }),
    active11406Row({
      債券代碼: "",
      機構代碼: "9999",
      機構名稱: "私募公司",
      債券簡稱: "私募一",
      募集方式: "8",
      上市櫃否: "5",
    }),
  ]), [{ issuerCode: "1101", issuerNames: ["台泥"] }]);
});

test("keeps every official 11406 name alias under one exact issuer code", () => {
  assert.deepEqual(deriveActiveCbIssuerIdentities([
    active11406Row(),
    active11406Row({ 債券代碼: "11012", 機構名稱: "台泥-創" }),
  ]), [{ issuerCode: "1101", issuerNames: ["台泥", "台泥-創"] }]);
});

test("loads the controller-authorized production 11406 context with 310 unique issuer codes", async () => {
  const context = await loadActiveCbIssuerContext();
  assert.equal(context.generation, "generations/d9560508d9dceb87");
  assert.equal(context.activeBondCount, 385);
  assert.equal(context.activeIssuers.length, 310);
  assert.deepEqual(
    context.activeIssuers.find(({ issuerCode }) => issuerCode === "6873"),
    { issuerCode: "6873", issuerNames: ["泓德能源", "泓德能源-創"] },
  );
});

test("summarizes a reviewed response with exact issuer matches and no raw rows", async () => {
  const body = new Uint8Array(await readFile(listedFixtureUrl));
  const result = assessCbIssuerResearchSource({
    market: "listed",
    retrievedAt: "2026-08-09T10:00:00.000Z",
    response: {
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      status: 200,
      contentType: "text/csv; charset=utf-8",
      body,
    },
    activeIssuers: [
      { issuerCode: "1101", issuerNames: ["水泥公司", "台泥"] },
      { issuerCode: "1102", issuerNames: ["亞泥"] },
      { issuerCode: "9999", issuerNames: ["無資料公司"] },
    ],
  });

  assert.deepEqual(result, {
    sourceId: "data-gov-18420-listed-monthly-revenue",
    resourceId: "data-gov-18420-listed-monthly-revenue-csv",
    market: "listed",
    requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    status: 200,
    contentType: "text/csv; charset=utf-8",
    bytes: 678,
    sha256: "7e0bb95bc7d830ea563dfb71a2b9cd77a0d78fa179e26d9c832a9ad72a781f19",
    rowCount: 2,
    newestRevenueMonth: "2026-06",
    newestSourcePublishedOn: "2026-07-17",
    activeCbIssuerCount: 3,
    matchedIssuerCount: 2,
    missingIssuerCount: 1,
    nameConflictCount: 0,
    duplicateIdentityCount: 0,
    warnings: [],
    outcome: "PASS",
    failure: null,
  });
  assert.equal(JSON.stringify(result).includes("台泥"), false);
  assert.equal(JSON.stringify(result).includes("備註"), false);
});

test("counts a source-name conflict when no exact-code official alias matches", async () => {
  const body = new Uint8Array(await readFile(listedFixtureUrl));
  const result = assessCbIssuerResearchSource({
    market: "listed",
    retrievedAt: "2026-08-09T10:00:00.000Z",
    response: {
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      status: 200,
      contentType: "text/csv",
      body,
    },
    activeIssuers: [{ issuerCode: "1101", issuerNames: ["不相符公司"] }],
  });

  assert.equal(result.matchedIssuerCount, 0);
  assert.equal(result.missingIssuerCount, 0);
  assert.equal(result.nameConflictCount, 1);
  assert.equal(result.outcome, "PASS");
});

test("fails a source whose published period is later than retrieval time", async () => {
  const body = new Uint8Array(await readFile(listedFixtureUrl));
  const result = assessCbIssuerResearchSource({
    market: "listed",
    retrievedAt: "2026-06-30T23:59:59.000Z",
    response: {
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      status: 200,
      contentType: "text/csv",
      body,
    },
    activeIssuers: [{ issuerCode: "1101", issuerNames: ["台泥"] }],
  });

  assert.equal(result.outcome, "FAIL");
  assert.equal(result.failure, "SOURCE_PERIOD_AFTER_RETRIEVAL");
  assert.deepEqual(result.warnings, ["SOURCE_PERIOD_AFTER_RETRIEVAL"]);
  assert.equal(result.rowCount, 2);
});

test("fails closed on a final URL or media-type contract violation", async () => {
  const body = new Uint8Array(await readFile(listedFixtureUrl));
  const common = {
    market: "listed",
    retrievedAt: "2026-08-09T10:00:00.000Z",
    activeIssuers: [{ issuerCode: "1101", issuerNames: ["fixture alias"] }],
  };

  assert.equal(assessCbIssuerResearchSource({
    ...common,
    response: {
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://example.invalid/redirect.csv",
      status: 200,
      contentType: "text/csv",
      body,
    },
  }).failure, "FINAL_URL_MISMATCH");
  assert.equal(assessCbIssuerResearchSource({
    ...common,
    response: {
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      status: 200,
      contentType: "text/plain",
      body,
    },
  }).failure, "CONTENT_TYPE_NOT_ALLOWED");
});

test("fetches exactly both reviewed resources once, concurrently, and isolates one failure", async () => {
  const otcBody = new Uint8Array(await readFile(otcFixtureUrl));
  const calls = [];
  let inFlight = 0;
  let maximumInFlight = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    if (url.endsWith("t187ap05_L.csv")) {
      return responseLike({ url, status: 503, body: new Uint8Array() });
    }
    return responseLike({ url, status: 200, body: otcBody });
  };
  const result = await runCbIssuerResearchSmoke({
    fetchImpl,
    now: () => "2026-08-09T10:00:00.000Z",
    loadContext: async () => ({
      generation: "generations/test",
      activeBondCount: 2,
      activeIssuers: [
        { issuerCode: "1240", issuerNames: ["fixture alias"] },
        { issuerCode: "1259", issuerNames: ["fixture alias"] },
      ],
    }),
  });
  assert.equal(maximumInFlight, 2);
  assert.deepEqual(calls.map(({ url }) => url), [
    "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
  ]);
  assert.deepEqual(calls.map(({ options }) => options), [
    { method: "GET", redirect: "manual" },
    { method: "GET", redirect: "manual" },
  ]);
  assert.equal(result.sources[0].outcome, "FAIL");
  assert.equal(result.sources[0].failure, "HTTP_STATUS_NOT_200");
  assert.equal(result.sources[1].outcome, "PASS");
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes("fixture alias"), false);
});

function responseLike({ url, status, body }) {
  return {
    url,
    status,
    redirected: false,
    headers: new Headers({ "content-type": "text/csv; charset=utf-8" }),
    body: new Response(body).body,
  };
}
