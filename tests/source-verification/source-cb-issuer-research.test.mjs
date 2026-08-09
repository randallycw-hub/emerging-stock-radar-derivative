import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseCsv } from "../../lib/source-verification/csv.ts";
import { listApprovedResources } from "../../lib/pipeline/source-registry.ts";
import {
  normalize94025Row,
  parseMonthlyRevenueCsv,
} from "../../lib/source-verification/source-94025.ts";
import {
  assertCbIssuerResearchSourceRequest,
  CB_ISSUER_RESEARCH_SOURCE_POLICIES,
  fetchCbIssuerResearchSources,
} from "../../lib/source-verification/source-cb-issuer-research.ts";

const fixtureDirectory = new URL(
  "../fixtures/source-verification/cb-issuer-research/",
  import.meta.url,
);
const reviewedHeaders = [
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

async function fixture(name) {
  return readFile(new URL(name, fixtureDirectory), "utf8");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function withoutCompanyCodeColumn(text) {
  return text
    .split(/\r?\n/)
    .map((line, index) => index === 0
      ? line.replace("公司代號,", "")
      : line.replace(/,"(?:1101|1102)",/, ","))
    .join("\n");
}

test("reviewed listed and OTC fixtures retain exact evidence and computed integrity", async () => {
  const metadata = JSON.parse(await fixture("metadata.json"));
  assert.equal(metadata.verificationStatus, "VERIFIED_FOR_IMPLEMENTATION");
  assert.equal(metadata.controllerEvidenceRecordedBefore, "2026-08-09T09:56:01.6338243Z");
  assert.deepEqual(metadata.licenseEvidence, {
    name: "政府資料開放授權條款-第1版",
    version: "OGL 1.0",
    freeUse: true,
  });
  assert.equal(JSON.stringify(metadata).includes("APPROVED_FOR_PRODUCTION"), false);

  const expected = {
    listed: {
      sourceId: "data-gov-18420-listed-monthly-revenue",
      market: "listed",
      metadataPageUrl: "https://data.gov.tw/dataset/18420",
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      httpStatus: 200,
      httpContentType: "text/csv",
      sourceResponseBytes: 203061,
      sourceResponseSha256: "sha256:3a344cdfa953daf6c13171dd433e6e756a948e2a25bd7fd2426eef6739aa4915",
      sourceRowCount: 1082,
      fixtureSha256: "7e0bb95bc7d830ea563dfb71a2b9cd77a0d78fa179e26d9c832a9ad72a781f19",
      selectedRowIdentities: [
        { sourcePublishedOn: "1150717", yearMonth: "11506", companyCode: "1101" },
        { sourcePublishedOn: "1150717", yearMonth: "11506", companyCode: "1102" },
      ],
    },
    otc: {
      sourceId: "data-gov-56510-otc-monthly-revenue",
      market: "otc",
      metadataPageUrl: "https://data.gov.tw/dataset/56510",
      requestedUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
      finalUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
      httpStatus: 200,
      httpContentType: "text/csv",
      sourceResponseBytes: 164863,
      sourceResponseSha256: "sha256:4d6f3c6c4691efe6472850c7a1773500ce77447210d96dcec9295439d08a1801",
      sourceRowCount: 891,
      fixtureSha256: "d72711731a25a54508dd09ca51310ad9048ff1a3d66cf3a8b5bc6625e2895d80",
      selectedRowIdentities: [
        { sourcePublishedOn: "1150717", yearMonth: "11506", companyCode: "1240" },
        { sourcePublishedOn: "1150717", yearMonth: "11506", companyCode: "1259" },
      ],
    },
  };

  for (const market of ["listed", "otc"]) {
    const resource = metadata.resources[market];
    const bytes = await fixtureBytes(resource.fixtureFile);
    const text = bytes.toString("utf8");
    const rows = parseCsv(text);
    const wanted = expected[market];

    assert.deepEqual(reviewedHeaders, text.split(/\r?\n/, 1)[0].split(","));
    assert.equal(resource.sourceId, wanted.sourceId);
    assert.equal(resource.market, wanted.market);
    assert.equal(resource.method, "GET");
    assert.equal(resource.metadataPageUrl, wanted.metadataPageUrl);
    assert.equal(resource.requestedUrl, wanted.requestedUrl);
    assert.equal(resource.finalUrl, wanted.finalUrl);
    assert.equal(resource.httpStatus, wanted.httpStatus);
    assert.equal(resource.httpContentType, wanted.httpContentType);
    assert.equal(resource.sourceResponseBytes, wanted.sourceResponseBytes);
    assert.equal(resource.sourceResponseSha256, wanted.sourceResponseSha256);
    assert.equal(resource.sourceRowCount, wanted.sourceRowCount);
    assert.equal(resource.fixtureRowCount, 2);
    assert.equal(resource.fixtureSha256, `sha256:${wanted.fixtureSha256}`);
    assert.equal(sha256(bytes), wanted.fixtureSha256);
    assert.deepEqual(
      resource.selectedRowIdentities,
      wanted.selectedRowIdentities,
    );
    assert.deepEqual(
      rows.map((row) => ({
        sourcePublishedOn: row["出表日期"],
        yearMonth: row["資料年月"],
        companyCode: row["公司代號"],
      })),
      wanted.selectedRowIdentities,
    );
  }
});

test("listed and OTC policies are frozen to only the two reviewed CSV resources", () => {
  assert.deepEqual(CB_ISSUER_RESEARCH_SOURCE_POLICIES, {
    listed: {
      sourceId: "data-gov-18420-listed-monthly-revenue",
      url: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      market: "listed",
    },
    otc: {
      sourceId: "data-gov-56510-otc-monthly-revenue",
      url: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
      market: "otc",
    },
  });
  assert.equal(Object.isFrozen(CB_ISSUER_RESEARCH_SOURCE_POLICIES), true);
  assert.equal(Object.isFrozen(CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed), true);
  assert.equal(Object.isFrozen(CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc), true);
});

test("central registry quarantines both resources at implementation-only status", () => {
  const resources = listApprovedResources();
  const expected = [
    {
      sourceId: "data-gov-18420-listed-monthly-revenue",
      resourceId: "data-gov-18420-listed-monthly-revenue-csv",
      exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
      protocol: "https:",
      hostname: "mopsfin.twse.com.tw",
      pathname: "/opendata/t187ap05_L.csv",
      allowedContentTypes: ["text/csv"],
      maxResponseBytes: 2_000_000,
      timeoutMs: 30_000,
      approvalStatus: "VERIFIED_FOR_IMPLEMENTATION",
      usageRole: "primary_csv",
    },
    {
      sourceId: "data-gov-56510-otc-monthly-revenue",
      resourceId: "data-gov-56510-otc-monthly-revenue-csv",
      exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
      protocol: "https:",
      hostname: "mopsfin.twse.com.tw",
      pathname: "/opendata/t187ap05_O.csv",
      allowedContentTypes: ["text/csv"],
      maxResponseBytes: 2_000_000,
      timeoutMs: 30_000,
      approvalStatus: "VERIFIED_FOR_IMPLEMENTATION",
      usageRole: "primary_csv",
    },
  ];

  const registered = expected.map(({ sourceId }) =>
    resources.find((resource) => resource.sourceId === sourceId));
  assert.equal(registered.every((resource) => resource !== undefined), true);
  assert.deepEqual(
    registered.map((resource) => ({
      sourceId: resource.sourceId,
      resourceId: resource.resourceId,
      exactUrl: resource.exactUrl,
      protocol: resource.protocol,
      hostname: resource.hostname,
      pathname: resource.pathname,
      allowedContentTypes: resource.allowedContentTypes,
      maxResponseBytes: resource.maxResponseBytes,
      timeoutMs: resource.timeoutMs,
      approvalStatus: resource.approvalStatus,
      usageRole: resource.usageRole,
    })),
    expected,
  );
  for (const resource of registered) {
    assert.notEqual(resource.approvalStatus, "APPROVED_FOR_PRODUCTION");
  }
});

test("source request validator accepts exact GET requests and rejects every URL boundary mutation", () => {
  for (const policy of Object.values(CB_ISSUER_RESEARCH_SOURCE_POLICIES)) {
    assert.equal(
      assertCbIssuerResearchSourceRequest({
        method: "GET",
        url: policy.url,
        redirected: false,
      }),
      policy,
    );
  }

  const listedUrl = CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url;
  const rejected = [
    { method: "POST", url: listedUrl, redirected: false },
    { method: "get", url: listedUrl, redirected: false },
    { method: "GET", url: listedUrl, redirected: true },
    { method: "GET", url: `${listedUrl}?month=11506`, redirected: false },
    { method: "GET", url: `${listedUrl}#review`, redirected: false },
    { method: "GET", url: listedUrl.replace("https://", "https://reviewer@"), redirected: false },
    { method: "GET", url: listedUrl.replace("https://", "http://"), redirected: false },
    { method: "GET", url: listedUrl.replace("mopsfin.twse.com.tw", "mopsfin.twse.com.tw.example"), redirected: false },
    { method: "GET", url: listedUrl.replace("t187ap05_L.csv", "t187ap05_R.csv"), redirected: false },
    { method: "GET", url: `${listedUrl}/`, redirected: false },
  ];
  for (const input of rejected) {
    assert.throws(
      () => assertCbIssuerResearchSourceRequest(input),
      /CB issuer research source request/,
    );
  }
});

test("shared parser preserves reviewed rows, source ratios, BOM handling and raw-only notes", async () => {
  const listed = await fixture("listed-minimal.csv");
  const otc = await fixture("otc-minimal.csv");
  const listedRows = parseMonthlyRevenueCsv(listed, "listed monthly revenue CSV");
  const otcRows = parseMonthlyRevenueCsv(otc, "OTC monthly revenue CSV");

  assert.deepEqual(listedRows.map((row) => row.companyCode), ["1101", "1102"]);
  assert.deepEqual(otcRows.map((row) => row.companyCode), ["1240", "1259"]);
  assert.deepEqual(
    parseMonthlyRevenueCsv(`\uFEFF${listed}`, "BOM listed monthly revenue CSV"),
    listedRows,
  );
  assert.deepEqual(listedRows[0], {
    sourcePublishedOn: "1150717",
    yearMonth: "11506",
    companyCode: "1101",
    companyName: "台泥",
    industryName: "水泥工業",
    currentMonthRevenue: "13382706",
    previousMonthRevenue: "12612013",
    priorYearMonthRevenue: "10107877",
    monthOverMonthPercent: "6.110785011084273",
    yearOverYearPercent: "32.39878166305348",
    cumulativeRevenue: "71467332",
    priorYearCumulativeRevenue: "70380916",
    cumulativeYearOverYearPercent: "1.5436229900730476",
    noteText: "-",
  });
  const normalized = normalize94025Row(listedRows[0]);
  assert.equal(normalized.revenueUnit, "仟元");
  assert.equal(normalized.monthOverMonthPercent, "6.110785011084273");
  assert.equal(normalized.yearOverYearPercent, "32.39878166305348");
  assert.equal("noteText" in normalized, false);
});

test("shared parser fails closed on header drift, duplicate identities, invalid values, HTML and empty data", async () => {
  const listed = await fixture("listed-minimal.csv");
  const lines = listed.trimEnd().split(/\r?\n/);

  assert.throws(
    () => parseMonthlyRevenueCsv(
      listed.replace("公司代號", "公司簡稱"),
      "unknown-header listed CSV",
    ),
    /unknown key.*公司簡稱/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      withoutCompanyCodeColumn(listed),
      "missing-header listed CSV",
    ),
    /missing required field.*公司代號/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      `${listed.trimEnd()}\n${lines[1]}\n`,
      "duplicate listed CSV",
    ),
    /duplicate companyCode for yearMonth/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      listed.replaceAll("1150717", "1150230"),
      "invalid-date listed CSV",
    ),
    /sourcePublishedOn.*valid/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      listed.replace("13382706", "13x"),
      "invalid-decimal listed CSV",
    ),
    /currentMonthRevenue.*decimal/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      "<!doctype html>\n<html><body>error</body></html>",
      "HTML response",
    ),
    /HTML response/,
  );
  assert.throws(
    () => parseMonthlyRevenueCsv(
      `${reviewedHeaders.join(",")}\n`,
      "empty listed CSV",
    ),
    /empty listed CSV.*at least one row/,
  );
});

function sourceResponse(body, url, options = {}) {
  const response = new Response(body, {
    status: options.status ?? 200,
    headers: {
      "content-type": options.contentType ?? "text/csv; charset=utf-8",
    },
  });
  Object.defineProperties(response, {
    redirected: { value: options.redirected ?? false },
    url: { value: options.finalUrl ?? url },
  });
  return response;
}

test("fetches exactly both reviewed CSV sources concurrently with bounded GET requests", async () => {
  const [listedBody, otcBody] = await Promise.all([
    fixture("listed-minimal.csv"),
    fixture("otc-minimal.csv"),
  ]);
  const bodies = new Map([
    [CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url, `\uFEFF${listedBody}`],
    [CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url, otcBody],
  ]);
  const calls = [];
  let inFlight = 0;
  let maximumInFlight = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight -= 1;
    return sourceResponse(bodies.get(url), url);
  };

  const result = await fetchCbIssuerResearchSources({ fetchImpl });

  assert.deepEqual(calls, Object.values(CB_ISSUER_RESEARCH_SOURCE_POLICIES).map((policy) => ({
    url: policy.url,
    init: { method: "GET", redirect: "manual" },
  })));
  assert.equal(maximumInFlight, 2);
  assert.deepEqual(result, {
    listed: { status: "fulfilled", value: listedBody },
    otc: { status: "fulfilled", value: otcBody },
  });
});

test("rejects only the invalid market response without retries or alternate URLs", async (context) => {
  const listedBody = await fixture("listed-minimal.csv");
  const otcBody = await fixture("otc-minimal.csv");
  const otcUrl = CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url;
  const invalidResponses = [
    ["HTTP status", () => sourceResponse(otcBody, otcUrl, { status: 503 })],
    ["redirect", () => sourceResponse(otcBody, otcUrl, {
      redirected: true,
      finalUrl: `${otcUrl}?redirected=true`,
    })],
    ["final URL", () => sourceResponse(otcBody, otcUrl, {
      finalUrl: CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url,
    })],
    ["Content-Type", () => sourceResponse(otcBody, otcUrl, {
      contentType: "application/json",
    })],
    ["response bytes", () => sourceResponse(new Uint8Array(2_000_001), otcUrl)],
    ["UTF-8", () => sourceResponse(new Uint8Array([0xc3, 0x28]), otcUrl)],
    ["strict CSV schema", () => sourceResponse("companyCode,name\n1240,test\n", otcUrl)],
  ];

  for (const [name, invalidResponse] of invalidResponses) {
    await context.test(name, async () => {
      const calls = [];
      const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (url === CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url) {
          return sourceResponse(listedBody, url);
        }
        return invalidResponse();
      };

      const result = await fetchCbIssuerResearchSources({ fetchImpl });

      assert.equal(result.listed.status, "fulfilled");
      assert.equal(result.otc.status, "rejected");
      assert.deepEqual(calls.map(({ url }) => url), [
        CB_ISSUER_RESEARCH_SOURCE_POLICIES.listed.url,
        CB_ISSUER_RESEARCH_SOURCE_POLICIES.otc.url,
      ]);
    });
  }
});
