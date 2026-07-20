import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const file = (path) => readFile(new URL(path, root), "utf8");

test("exposes the agreed public read-only views", async () => {
  const [dashboard, layout, marketRoute, trackerRoute, companyRoute, yahooRoute, privacy, disclaimer, methodology, about, marketPage, radarPage, ipoPage, sitemap, robots] = await Promise.all([
    file("app/Dashboard.tsx"),
    file("app/layout.tsx"),
    file("app/api/market/route.ts"),
    file("app/api/tracker/route.ts"),
    file("app/api/company/route.ts"),
    file("app/api/yahoo/route.ts"),
    file("app/privacy/page.tsx"),
    file("app/disclaimer/page.tsx"),
    file("app/methodology/page.tsx"),
    file("app/about/page.tsx"),
    file("app/market/page.tsx"),
    file("app/radar/page.tsx"),
    file("app/ipo/page.tsx"),
    file("app/sitemap.ts"),
    file("app/robots.ts"),
  ]);

  for (const label of ["興櫃市場", "進度雷達", "IPO 時程", "公司輪廓", "近期新聞", "技術線圖"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /前 50 筆/);
  assert.doesNotMatch(dashboard, /TOP 50/);
  assert.doesNotMatch(dashboard, /TOP 100/);
  assert.match(dashboard, /aria-sort/);
  assert.match(dashboard, /compareMarketRows/);
  assert.match(dashboard, /漲跌狀態/);
  assert.match(dashboard, /<h2>興櫃盤面<\/h2>/);
  assert.doesNotMatch(dashboard, /今日興櫃盤面/);
  for (const label of ["成交價", "漲跌", "幅度", "漲幅排行", "跌幅排行", "成交量排行"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /dailyChangePercent/);
  assert.match(dashboard, /近期事件/);
  assert.match(dashboard, /未來關鍵事件/);
  assert.match(dashboard, /searchParams\.set\("company"/);
  assert.match(dashboard, /IPO時程表/);
  assert.match(dashboard, /ipo-stage-board/);
  assert.match(dashboard, /競拍／買賣日/);
  assert.match(dashboard, /暫定承銷價/);
  assert.match(dashboard, /實際承銷價/);
  assert.match(dashboard, /定價狀態/);
  assert.match(dashboard, /同意契約/);
  assert.match(dashboard, /低量異動/);
  assert.match(dashboard, /興櫃市場雷達/);
  assert.match(dashboard, /重要資訊請以原始公告為準/);
  assert.match(dashboard, /不構成投資建議/);
  assert.match(dashboard, /其他公開或第三方行情資訊/);
  assert.match(dashboard, /visibilitychange/);
  assert.doesNotMatch(dashboard, /Yahoo 即時報價|Yahoo 報價更新中|Yahoo 更新|Yahoo 報價 \$\{|Yahoo 股市 · TWSE|Yahoo 技術線圖|正在取得 Yahoo/);
  assert.match(dashboard, /15 \* 60 \* 1000/);
  assert.match(dashboard, /隱私權政策/);
  assert.match(dashboard, /免責聲明/);
  assert.match(dashboard, /重要聲明/);
  assert.doesNotMatch(dashboard, /網站定位與資訊說明/);
  assert.match(dashboard, /防詐騙提醒/);
  assert.match(dashboard, /不經營 LINE、Telegram、Discord 等投資群組/);
  assert.match(dashboard, /並撥 165 查證/);
  assert.match(dashboard, /\/disclaimer#fraud-alert-title/);
  assert.match(dashboard, /profileCache/);
  assert.match(dashboard, /summary=1/);
  assert.match(dashboard, /補充資料讀取中/);
  assert.doesNotMatch(dashboard, /策略雷達|策略訊號|可佈局|續抱|高警戒|準備出場|定價／出場/);
  assert.match(companyRoute, /\.TWO\/technical-analysis/);
  assert.match(companyRoute, /summaryOnly/);
  assert.match(companyRoute, /Promise\.all/);
  assert.match(companyRoute, /MAIN_BUSINESS4/);
  assert.match(companyRoute, /tw\.stock\.yahoo\.com\/rss\?s=\$\{code\}/);
  assert.doesNotMatch(companyRoute, /newsSearchUrl|googleNewsSearchUrl/);
  assert.match(companyRoute, /slice\(0, 5\)/);
  assert.match(companyRoute, /application\/rss\+xml/);
  assert.match(companyRoute, /<item>/);
  assert.match(companyRoute, /fetchYahooNews\(code\)/);
  assert.match(companyRoute, /source: "公開新聞"/);
  assert.match(companyRoute, /AbortSignal\.timeout\(6000\)/);
  assert.match(dashboard, /標題連結至原始報導/);
  assert.doesNotMatch(dashboard, /分享此公司|shareHref/);
  assert.match(dashboard, /refresh=\$\{Date\.now\(\)\}/);
  assert.match(dashboard, /dsp\.tpex\.org\.tw\/storage\/company_basic\/company_basic\.php/);
  assert.match(dashboard, /MAIN_BUSINESS1/);
  assert.doesNotMatch(dashboard, /母公司／集團|parentGroup|未查得可驗證的母公司或集團關係/);
  assert.doesNotMatch(companyRoute, /parentGroup|normalizeParentGroup/);
  assert.doesNotMatch(methodology, /母公司或集團關係/);
  assert.doesNotMatch(dashboard, /TPEx 均價/);
  assert.doesNotMatch(dashboard, /查看 Google News|最近 7 天新聞/);
  assert.doesNotMatch(privacy, /Google News/);
  assert.doesNotMatch(privacy, /AdSense|廣告|商業合作/);
  assert.match(disclaimer, /興櫃市場風險/);
  assert.match(disclaimer, /不提供個別化投資服務/);
  assert.match(disclaimer, /排序與標籤不是推薦/);
  assert.match(disclaimer, /防詐騙提醒/);
  assert.match(disclaimer, /LINE、Telegram、Discord/);
  assert.match(disclaimer, /165 反詐騙諮詢專線/);
  assert.match(disclaimer, /不收受或代管資金/);
  assert.match(disclaimer, /自動化程序整理/);
  assert.match(disclaimer, /其他公開或第三方行情資訊/);
  assert.doesNotMatch(disclaimer, /Yahoo 股市|Yahoo、Google/);
  assert.doesNotMatch(disclaimer, /AI 自動產生/);
  assert.doesNotMatch(disclaimer, /AdSense|廣告|商業合作|贊助/);
  assert.match(disclaimer, /本聲明不排除依法不得預先免除的責任/);
  assert.match(methodology, /上週比較基準/);
  assert.match(methodology, /成交量至少 10,000 股/);
  assert.match(methodology, /不代表公司評價、報酬預測或操作方向/);
  assert.match(layout, /og\.png/);
  assert.match(layout, /興櫃雷達｜獨立衍生版/);
  assert.match(`${layout}${sitemap}${robots}`, /process\.env\.SITE_URL/);
  assert.doesNotMatch(`${layout}${sitemap}${robots}`, /emergingradar\.tw|chiayu333|chatgpt\.site/);
  assert.match(about, /獨立維護之公開資料整理網站/);
  assert.match(about, /資料範圍/);
  assert.match(about, /網站定位/);
  assert.match(about, /編排原則/);
  assert.match(about, /更新與勘誤/);
  assert.doesNotMatch(about, /AdSense|廣告|商業合作/);
  assert.match(marketPage, /initialTab="market"/);
  assert.match(radarPage, /initialTab="radar"/);
  assert.match(radarPage, /不代表投資建議/);
  assert.match(ipoPage, /initialTab="ipo"/);
  assert.doesNotMatch(`${dashboard}${about}${disclaimer}${methodology}${privacy}`, /brand-mark/);
  assert.doesNotMatch(dashboard, /nav-index/);

  for (const route of [marketRoute, trackerRoute, companyRoute, yahooRoute]) {
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  }
});

test("uses Yahoo current prices and the last completed weekly close", async () => {
  const [dashboard, yahoo, yahooRoute, tracker] = await Promise.all([
    file("app/Dashboard.tsx"), file("lib/yahoo.ts"), file("app/api/yahoo/route.ts"), file("lib/tracker.mjs")
  ]);
  assert.match(yahoo, /regularMarketPrice/);
  assert.match(yahoo, /regularMarketTime/);
  assert.match(yahoo, /StockServices\.stockList/);
  assert.match(yahoo, /finance\/spark/);
  assert.match(yahoo, /fetchYahooLiveQuotes/);
  assert.match(yahoo, /fetchYahooHistoricalQuotes/);
  assert.match(yahoo, /Promise\.all/);
  assert.match(dashboard, /index \+= 20/);
  assert.match(yahooRoute, /slice\(0, 20\)/);
  assert.match(yahoo, /regularMarketPreviousClose/);
  assert.match(yahoo, /marketStatus/);
  assert.match(yahoo, /symbols\.join\(","\)/);
  assert.match(yahoo, /mergeYahooLiveQuote\(fallback, resolvedLiveQuote\)/);
  assert.match(yahoo, /lastCompletedFriday/);
  assert.match(yahoo, /lastWeekCloseDate/);
  assert.match(yahoo, /previousClose/);
  assert.match(yahoo, /dailyChangePercent/);
  assert.match(yahoo, /session\.volume === null \|\| session\.volume > 0/);
  assert.match(yahoo, /redirect: "manual"/);
  assert.doesNotMatch(yahoo, /redirect: "error"/);
  assert.match(yahooRoute, /suffixes: \["TWO"\]/);
  assert.doesNotMatch(yahoo, /Yahoo 無可用報價|Yahoo 歷史資料|Yahoo 即時報價 HTTP|Yahoo 批次歷史資料|Yahoo 回傳/);
  assert.match(dashboard, /成交價/);
  assert.match(dashboard, /上週收盤/);
  assert.match(dashboard, /latest - lastWeekClose/);
  assert.match(dashboard, /無基準/);
  assert.match(dashboard, /RadarSortHeader/);
  assert.match(dashboard, /compareRadarRows/);
  assert.match(dashboard, /主要事件／距離/);
  assert.match(dashboard, /quoteVolume >= 10_000/);
  assert.match(dashboard, /quote\?\.priceDate === row\.listedDate/);
  assert.match(dashboard, /首日交易無前收者不納入幅度排行/);
  assert.match(dashboard, /首日交易沒有前一交易日收盤/);
  assert.match(dashboard, /label="成交價" sortKey="latest"/);
  assert.match(dashboard, /label="幅度" sortKey="dailyChangePercent"/);
  assert.match(dashboard, /label="週漲跌幅" sortKey="change"/);
  assert.doesNotMatch(tracker, /official\?\.latest/);
});

test("uses official TPEx intraday data and the agreed liquidity rule", async () => {
  const [market, snapshot, quotes, companyBasics] = await Promise.all([
    file("lib/market.ts"),
    file("lib/market-snapshot.ts"),
    file("lib/quote-snapshot.ts"),
    file("lib/company-basic-snapshot.json")
  ]);
  assert.match(market, /tpex\.org\.tw\/openapi\/v1\/tpex_esb_latest_statistics/);
  assert.match(market, /tpex\.org\.tw\/www\/zh-tw\/emerging\/latest/);
  assert.match(market, /mopsfin_t187ap03_R/);
  assert.match(market, /volume >= 10_000/);
  assert.match(market, /turnover >= 500_000/);
  assert.match(market, /average - previousAverage/);
  assert.match(market, /55_000/);
  assert.match(market, /COMPANY_BASIC_SNAPSHOT/);
  assert.match(market, /presentCodes/);
  assert.match(market, /basicMap\.has\(row\.code\)/);
  assert.match(market, /QUOTE_CSV_URL/);
  assert.match(market, /QUOTE_SNAPSHOT/);
  assert.equal((snapshot.match(/^  "\d{4}":/gm) || []).length, 355);
  assert.equal((quotes.match(/^  "\d{4}":/gm) || []).length, 355);
  const companyRows = JSON.parse(companyBasics);
  assert.equal(companyRows.length, 355);
  assert.equal(companyRows.find((row) => row.SecuritiesCompanyCode === "7930")?.DateOfListing, "20260716");
  assert.equal(companyRows.find((row) => row.SecuritiesCompanyCode === "6810")?.WebAddress, "https://www.bpmbiotech.com/");
});

test("keeps IPO and event data available when TPEx redirects cloud requests", async () => {
  const [tracker, applicants] = await Promise.all([
    file("lib/tracker.mjs"),
    file("lib/tpex-applicant-snapshot.json")
  ]);
  assert.match(tracker, /tpex_esb_applicant_companies/);
  assert.match(tracker, /otcApplicantSnapshot/);
  assert.match(tracker, /TPExListingScreeningCommitteeDate/);
  assert.match(tracker, /TPExSanctionedDate/);
  assert.match(tracker, /TPExApprovedTradingDate/);
  assert.match(tracker, /announcement\/publicForm/);
  assert.match(tracker, /buildPublicOfferingMap/);
  assert.match(tracker, /暫定價／待定價/);
  assert.doesNotMatch(tracker, /'可佈局'|'續抱'|'高警戒'|'準備出場'|'出場'/);
  assert.ok(JSON.parse(applicants).length >= 800);
});
