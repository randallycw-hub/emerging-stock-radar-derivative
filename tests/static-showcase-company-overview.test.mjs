import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCompanyOverview,
  formatCompanyNumber,
  formatCompanyPercent,
  parseCompanyCode,
} from "../static-showcase/assets/company-overview.js";

const root = new URL("../static-showcase/", import.meta.url);

test("company overview accepts only an exact four-digit public company code", () => {
  assert.equal(parseCompanyCode(" 1260 "), "1260");
  assert.equal(parseCompanyCode("126"), null);
  assert.equal(parseCompanyCode("1260A"), null);
});

test("company overview renders missing public values as dashes, not zero", () => {
  assert.equal(formatCompanyNumber(null), "—");
  assert.equal(formatCompanyNumber(undefined), "—");
  assert.equal(formatCompanyPercent(null), "—");
  assert.equal(formatCompanyPercent("4.13"), "4.13%");
});

test("company overview combines public modules by exact code without exposing diagnostics", () => {
  const overview = buildCompanyOverview({
    code: "1260",
    companyMaster: [{ stockCode: "1260", companyName: "富味鄉", market: "興櫃", industry: "食品", dataDate: "2026-08-28" }],
    emerging: [{ companyCode: "1260", companyName: "富味鄉", industryName: "食品", dailyAveragePrice: "30.57", transactionVolume: "37137", privateNote: "do-not-leak" }],
    ipo: [{ companyCode: "1260", companyName: "富味鄉", stage: "A", market: "上櫃", events: [{ label: "申請送件", date: "2026-08-01", sourceRecordIds: ["private"] }] }],
    revenue: [{ "公司代號": "1260", "公司名稱": "富味鄉", "資料年月": "11507", "營業收入-當月營收": "448516", "營業收入-上月比較增減(%)": "-2.6", "營業收入-去年同月增減(%)": "12.1", "備註": "internal" }],
    workbench: [{ status: "active", term: { issuerCode: "1260", bondCode: "12601", bondName: "富味鄉一", issuerName: "富味鄉" }, view: { bondCode: "12601", cbClose: "101.5", cbPriceDate: "2026-08-24", premiumRate: null, missingReasons: ["internal"] } }],
  });

  assert.deepEqual(overview, {
    code: "1260",
    name: "富味鄉",
    market: "興櫃",
    industry: "食品",
    dataDate: "2026-08-28",
    emerging: { tradingDate: null, dailyAveragePrice: "30.57", transactionVolume: "37137" },
    ipo: { market: "上櫃", stage: "A", events: [{ label: "申請送件", date: "2026-08-01" }] },
    revenue: { yearMonth: "11507", currentMonthRevenue: "448516", monthOverMonthPercent: "-2.6", yearOverYearPercent: "12.1" },
    bonds: [{ bondCode: "12601", bondName: "富味鄉一", cbClose: "101.5", cbPriceDate: "2026-08-24", premiumRate: null }],
    events: [{ market: "IPO", label: "申請送件", date: "2026-08-01" }],
  });
  assert.equal(JSON.stringify(overview).includes("private"), false);
  assert.equal(JSON.stringify(overview).includes("missingReasons"), false);
});

test("company overview does not infer a company without its canonical public master record", () => {
  assert.equal(buildCompanyOverview({ code: "9999" }), null);
});

test("company page uses the public overview module and never contains diagnostic labels", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("company.html", root), "utf8"),
    readFile(new URL("assets/company-overview.js", root), "utf8"),
  ]);
  assert.match(html, /assets\/company-overview\.js/);
  assert.match(html, /id="company-overview-root"/);
  assert.match(js, /companyCode/);
  assert.doesNotMatch(html + js, /sourceId|sourceRecordIds|missingReasons|待確認|目前無核准公開資料/);
});
