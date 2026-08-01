import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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

test("refreshes only after the Taipei 22:30 cutoff unless no snapshot exists", () => {
  assert.equal(shouldRefreshIpoSnapshot({ now: new Date("2026-08-01T14:29:59Z"), current: sameDay }), false);
  assert.equal(shouldRefreshIpoSnapshot({ now, current: previousDay }), true);
  assert.equal(shouldRefreshIpoSnapshot({ now, current: sameDay }), false);
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
