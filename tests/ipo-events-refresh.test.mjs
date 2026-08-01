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

test("publishes a snapshot from five live-like sources instead of returning source_unavailable", async () => {
  const fetchImpl = await createLiveContractFetch();
  let published = null;
  const repository = {
    readCurrent: async () => null,
    publish: async (snapshot) => { published = snapshot; },
  };

  const response = await getIpoEventsResponse({ repository, fetchImpl, now });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.notEqual(payload.status, "source_unavailable");
  assert.ok(payload.records.length > 0);
  assert.equal(published.records.find((record) => record.companyCode === "1623").applicationDate, "2025-09-30");
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
  return async (input) => {
    const url = String(input);
    const result = onRequest(url);
    if (result instanceof Response) return result;
    return new Response(bodies.get(url), { status: 200 });
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
  return async (input) => new Response(bodies.get(String(input)), { status: 200 });
}
