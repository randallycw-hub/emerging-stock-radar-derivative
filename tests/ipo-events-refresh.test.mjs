import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getIpoEventsResponse,
  refreshOfficialIpoSnapshot,
  shouldRefreshIpoSnapshot,
} from "../lib/ipo-events/refresh.ts";

const urls = [
  "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
  "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
  "https://www.twse.com.tw/announcement/auction?response=json&yy=2026",
  "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026",
];

const now = new Date("2026-08-01T14:30:00Z");
const previousDay = { schemaVersion: 1, dataDate: "2026-07-31", generatedAt: "2026-07-31T14:30:00Z", sourceManifest: [], records: [] };
const sameDay = { ...previousDay, dataDate: "2026-08-01" };
const futureDay = { ...previousDay, dataDate: "2026-08-02" };

test("refreshes only after the Taipei 22:30 cutoff unless no snapshot exists", () => {
  assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T14:29:59Z"), current: sameDay }), false);
  assert.equal(shouldRefreshIpoSnapshot({ now, current: previousDay }), true);
  assert.equal(shouldRefreshIpoSnapshot({ now, current: sameDay }), false);
  assert.equal(shouldRefreshIpoSnapshot({ now, current: futureDay }), false);
  assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T02:00:00Z"), current: null }), true);
});

test("downloads and validates all official IPO sources before producing a hashed snapshot", async () => {
  const requestedUrls = [];
  const fetchImpl = await createOfficialFetch((url) => requestedUrls.push(url));

  const snapshot = await refreshOfficialIpoSnapshot({ fetchImpl, now });

  assert.deepEqual(requestedUrls, urls);
  assert.equal(snapshot.dataDate, "2026-08-01");
  assert.equal(snapshot.generatedAt, "2026-08-01T22:30:00+08:00");
  assert.equal(snapshot.sourceManifest.length, 5);
  assert.match(snapshot.sourceManifest[0].sha256, /^sha256:[a-f0-9]{64}$/);
  assert.ok(snapshot.sourceManifest.every((source) => source.rowCount > 0));
});

test("static dashboard collection excludes completed listings before source evidence is merged", async () => {
  const fetchImpl = await createOfficialFetch(() => undefined);

  const snapshot = await refreshOfficialIpoSnapshot({
    fetchImpl,
    now,
    excludeCompleted: true,
  });

  assert.equal(snapshot.records.some((record) => record.companyCode === "6945"), false);
  assert.ok(snapshot.records.every((record) => record.listingDate === null || record.listingDate > snapshot.dataDate));
  assert.equal(snapshot.sourceManifest.length, 5);
});

test("rejects the complete candidate when any required source fails", async () => {
  const fetchImpl = await createOfficialFetch((url) => {
    if (url === urls[2]) return new Response("unavailable", { status: 503 });
    return undefined;
  });

  await assert.rejects(
    () => refreshOfficialIpoSnapshot({ fetchImpl, now }),
    /IPO_REQUIRED_SOURCE_FAILED:tpex-ipo-listings/,
  );
});

test("uses manual redirects and rejects redirect or mismatched final URLs", async () => {
  const redirectModes = [];
  const redirectingFetch = await createOfficialFetch((url, init) => {
    redirectModes.push(init?.redirect);
    if (url === urls[0]) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://third-party.test/11586.csv" },
      });
    }
    return undefined;
  });
  await assert.rejects(
    () => refreshOfficialIpoSnapshot({ fetchImpl: redirectingFetch, now }),
    /IPO_REQUIRED_SOURCE_FAILED:twse-applications/,
  );
  assert.deepEqual([...new Set(redirectModes)], ["manual"]);

  const csv = await readFile(new URL("./fixtures/source-verification/11586/csv-minimal.csv", import.meta.url), "utf8");
  const finalUrlFetch = await createOfficialFetch((url) => {
    if (url !== urls[0]) return undefined;
    return responseWithUrl(csv, {
      contentType: "text/csv; charset=utf-8",
      url: "https://third-party.test/11586.csv",
    });
  });
  await assert.rejects(
    () => refreshOfficialIpoSnapshot({ fetchImpl: finalUrlFetch, now }),
    /IPO_REQUIRED_SOURCE_FAILED:twse-applications/,
  );
});

test("rejects CSV and JSON responses with an unapproved Content-Type", async () => {
  const csv = await readFile(new URL("./fixtures/source-verification/11586/csv-minimal.csv", import.meta.url), "utf8");
  const wrongCsvType = await createOfficialFetch((url) => url === urls[0]
    ? responseWithUrl(csv, { contentType: "text/html", url })
    : undefined);
  await assert.rejects(
    () => refreshOfficialIpoSnapshot({ fetchImpl: wrongCsvType, now }),
    /IPO_REQUIRED_SOURCE_FAILED:twse-applications/,
  );

  const applicants = await fixture("tpex-applicants.json");
  const wrongJsonType = await createOfficialFetch((url) => url === urls[1]
    ? responseWithUrl(JSON.stringify(applicants), { contentType: "text/csv", url })
    : undefined);
  await assert.rejects(
    () => refreshOfficialIpoSnapshot({ fetchImpl: wrongJsonType, now }),
    /IPO_REQUIRED_SOURCE_FAILED:tpex-applications/,
  );
});

test("publishes a snapshot from five live-like sources instead of returning source_unavailable", async () => {
  const fetchImpl = await createLiveContractFetch();
  let published = null;
  const repository = {
    readCurrent: async () => null,
    publish: async (snapshot) => { published = snapshot; },
    tryAcquireRefreshLease: async () => true,
    completeRefreshAttempt: async () => {},
  };

  const response = await getIpoEventsResponse({ repository, fetchImpl, now, refreshRequested: true });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.notEqual(payload.status, "source_unavailable");
  assert.ok(payload.records.length > 0);
  assert.equal(published.records.find((record) => record.companyCode === "1623").applicationDate, "2025-09-30");
});

test("concurrent explicit refresh requests share one in-isolate source fetch and publication", async () => {
  const requested = [];
  const upstream = await createOfficialFetch(() => undefined);
  const started = deferred();
  const release = deferred();
  let leaseCalls = 0;
  let publishCalls = 0;
  const fetchImpl = async (input, init) => {
    requested.push(String(input));
    if (requested.length === 1) {
      started.resolve();
      await release.promise;
    }
    return upstream(input, init);
  };
  const repository = {
    readCurrent: async () => null,
    publish: async () => { publishCalls += 1; },
    tryAcquireRefreshLease: async () => { leaseCalls += 1; return true; },
    completeRefreshAttempt: async () => {},
  };

  const first = getIpoEventsResponse({ repository, fetchImpl, now, refreshRequested: true });
  await started.promise;
  const second = getIpoEventsResponse({ repository, fetchImpl, now, refreshRequested: true });
  release.resolve();
  const responses = await Promise.all([first, second]);

  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(requested.length, 5);
  assert.equal(leaseCalls, 1);
  assert.equal(publishCalls, 1);
});

test("a failed explicit refresh enters cooldown instead of refetching without a snapshot", async () => {
  let fetchCalls = 0;
  let leaseCalls = 0;
  let attempted = false;
  let completionCalls = 0;
  const repository = {
    readCurrent: async () => null,
    publish: async () => { throw new Error("must not publish"); },
    tryAcquireRefreshLease: async () => {
      leaseCalls += 1;
      if (attempted) return false;
      attempted = true;
      return true;
    },
    completeRefreshAttempt: async () => { completionCalls += 1; },
  };
  const fetchImpl = async () => {
    fetchCalls += 1;
    return new Response("unavailable", { status: 503 });
  };

  const first = await getIpoEventsResponse({ repository, fetchImpl, now, refreshRequested: true });
  const second = await getIpoEventsResponse({ repository, fetchImpl, now, refreshRequested: true });

  assert.equal(first.status, 503);
  assert.equal(second.status, 503);
  assert.equal((await second.json()).retryable, true);
  assert.equal(fetchCalls, 3);
  assert.equal(leaseCalls, 2);
  assert.equal(completionCalls, 1);
});

test("an explicit refresh replaces a corrupt current snapshot instead of comparing its invalid date", async () => {
  const fetchImpl = await createOfficialFetch(() => undefined);
  let published = null;
  const repository = {
    readCurrent: async () => { throw new Error("IPO_SNAPSHOT_READ_FAILED"); },
    publish: async (snapshot) => { published = snapshot; },
    tryAcquireRefreshLease: async () => true,
    completeRefreshAttempt: async () => {},
  };

  const response = await getIpoEventsResponse({
    repository,
    fetchImpl,
    now,
    refreshRequested: true,
  });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).dataDate, "2026-08-01");
  assert.equal(published.dataDate, "2026-08-01");
});

async function createOfficialFetch(onRequest) {
  const [csv, applicants, listings, auctions, publicOfferings] = await Promise.all([
    readFile(new URL("./fixtures/source-verification/11586/csv-minimal.csv", import.meta.url), "utf8"),
    fixture("tpex-applicants.json"),
    fixture("tpex-ipo-no-limit.json"),
    fixture("twse-auction.json"),
    fixture("twse-public-form.json"),
  ]);
  const applicantsWithoutOverlap = structuredClone(applicants);
  applicantsWithoutOverlap[0].SecuritiesCompanyCode = "7001";
  applicantsWithoutOverlap[0].CompanyName = "上市申請測試";
  applicantsWithoutOverlap.push({
    ...applicants[0],
    Date: "20251223",
    SecuritiesCompanyCode: "6945",
    CompanyName: "圓祥生技",
    TPExListingScreeningCommitteeDate: "20260204",
    TPExSanctionedDate: "20260226",
    TPExApprovedTradingDate: "20260305",
    ListingDate: "20260605",
    LeadUnderwriter: "元大",
  });
  const bodies = new Map([
    [urls[0], csv],
    [urls[1], JSON.stringify(applicantsWithoutOverlap)],
    [urls[2], JSON.stringify(listings)],
    [urls[3], JSON.stringify(auctions)],
    [urls[4], JSON.stringify(publicOfferings)],
  ]);
  return async (input, init) => {
    const url = String(input);
    const result = onRequest(url, init);
    if (result instanceof Response) return result;
    return responseWithUrl(bodies.get(url), {
      contentType: url === urls[0] ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      url,
    });
  };
}

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`./fixtures/source-verification/ipo/${name}`, import.meta.url), "utf8"));
}

async function createLiveContractFetch() {
  const [baseCsv, applicants, listings, auctionFixture, publicFormFixture] = await Promise.all([
    readFile(new URL("./fixtures/source-verification/11586/csv-minimal.csv", import.meta.url), "utf8"),
    fixture("tpex-applicants.json"),
    fixture("tpex-ipo-no-limit.json"),
    fixture("twse-auction.json"),
    fixture("twse-public-form.json"),
  ]);
  const liveRows = [
    ["TWSE:6280:0931230", "6280", "歷史異常一", "0931230", "", "", "0930907", "0930921", "0931001", "0931228", "", "", ""],
    ["TWSE:2453:0890831", "2453", "歷史異常二", "0890831", "", "", "0890929", "0891017", "0890115", "0900522", "", "", ""],
    ["TWSE:1623:1131224", "1623", "測試再申請公司", "1131224", "", "", "1140110", "1140120", "1140130", "", "", "", "已撤銷申請"],
    ["TWSE:1623:1140930", "1623", "測試再申請公司", "1140930", "", "", "", "", "", "", "", "", ""],
  ].map((row) => row.join(",")).join("\n");
  const csv = `${baseCsv.trimEnd()}\n${liveRows}\n`;
  const applicantsWithoutOverlap = structuredClone(applicants);
  applicantsWithoutOverlap[0].SecuritiesCompanyCode = "7001";
  applicantsWithoutOverlap[0].CompanyName = "上市申請測試";
  applicantsWithoutOverlap.push({
    ...applicants[0],
    Date: "20251223",
    SecuritiesCompanyCode: "6945",
    CompanyName: "圓祥生技",
    TPExListingScreeningCommitteeDate: "20260204",
    TPExSanctionedDate: "20260226",
    TPExApprovedTradingDate: "20260305",
    ListingDate: "20260605",
    LeadUnderwriter: "元大",
  });
  const auction = { ...auctionFixture, notes: ["公告說明"], total: auctionFixture.data.length };
  const publicForm = { ...publicFormFixture, notes: [], total: publicFormFixture.data.length };
  const bodies = new Map([
    [urls[0], csv],
    [urls[1], JSON.stringify(applicantsWithoutOverlap)],
    [urls[2], JSON.stringify(listings)],
    [urls[3], JSON.stringify(auction)],
    [urls[4], JSON.stringify(publicForm)],
  ]);
  return async (input) => {
    const url = String(input);
    return responseWithUrl(bodies.get(url), {
      contentType: url === urls[0] ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      url,
    });
  };
}

function responseWithUrl(body, { contentType, url, status = 200 }) {
  const response = new Response(body, { status, headers: { "content-type": contentType } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
