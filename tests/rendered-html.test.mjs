import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const file = path => readFile(new URL(path, root), "utf8");

test("renders the agreed no-quote product baseline", async () => {
  const [dashboard, layout, manifest, readme, marketPage, radarPage, ipoPage] = await Promise.all([
    file("app/Dashboard.tsx"),
    file("app/layout.tsx"),
    file("app/manifest.ts"),
    file("README.md"),
    file("app/market/page.tsx"),
    file("app/radar/page.tsx"),
    file("app/ipo/page.tsx"),
  ]);

  for (const source of [dashboard, layout, manifest, readme]) {
    assert.match(source, /興債觀測網/);
    assert.match(source, /興櫃公司、可轉債與上市櫃進度資訊/);
  }
  assert.match(dashboard, /官方資料來源建置中，目前不提供即時或延遲行情。/);
  assert.match(dashboard, /\/api\/tracker/);
  assert.match(dashboard, /\/api\/company/);
  assert.doesNotMatch(dashboard, /\/api\/market/);
  assert.match(dashboard, /搜尋公司/);
  assert.match(dashboard, /進度階段/);
  assert.match(dashboard, /資料來源：臺灣證券交易所、證券櫃檯買賣中心及公開資訊觀測站/);
  assert.match(marketPage, /資料來源建置狀態/);
  assert.match(radarPage, /上市櫃公開進度/);
  assert.match(ipoPage, /IPO 公開時程/);
});

test("keeps only the agreed public read-only APIs", async () => {
  for (const route of ["tracker", "company"]) {
    const source = await file(`app/api/${route}/route.ts`);
    assert.match(source, /publicApiHeaders/);
    assert.match(source, /export const OPTIONS = publicApiOptions/);
    assert.match(source, /export async function GET/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }
});

test("uses official announcement data without market quote enrichment", async () => {
  const [tracker, company, applicants, companyBasics] = await Promise.all([
    file("lib/tracker.mjs"),
    file("lib/company.ts"),
    file("lib/tpex-applicant-snapshot.json"),
    file("lib/company-basic-snapshot.json"),
  ]);
  assert.match(tracker, /twse\.com\.tw\/rwd\/zh\/company\/applylisting/);
  assert.match(tracker, /tpex\.org\.tw\/openapi\/v1\/tpex_esb_applicant_companies/);
  assert.match(tracker, /announcement\/auction/);
  assert.match(tracker, /announcement\/publicForm/);
  assert.match(tracker, /TPExListingScreeningCommitteeDate/);
  assert.doesNotMatch(tracker, /currentPrice|lastWeekClose|weeklyChange|chartUrl/);
  assert.match(company, /mopsfin_t187ap03_R/);
  assert.ok(JSON.parse(applicants).length >= 800);
  assert.equal(JSON.parse(companyBasics).length, 355);
});

test("legal pages state the permanent product boundaries", async () => {
  const pages = await Promise.all([
    file("app/about/page.tsx"),
    file("app/methodology/page.tsx"),
    file("app/disclaimer/page.tsx"),
    file("app/privacy/page.tsx"),
    file("app/LegalPage.tsx"),
  ]);
  const source = pages.join("\n");
  assert.match(source, /不提供買賣建議、目標價或獲利保證/);
  assert.match(source, /第一版不做會員、付款、推播或正式廣告/);
  assert.match(source, /來源及更新時間/);
  assert.match(source, /興債觀測網/);
});
