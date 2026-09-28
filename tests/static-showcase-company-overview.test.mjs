import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";

import {
  buildCompanyOverview,
  formatCompanyNumber,
  formatCompanyPercent,
  parseCompanyCode,
  renderCompanyOverviewHtml,
} from "../static-showcase/assets/company-overview.js";

const root = new URL("../static-showcase/", import.meta.url);

function matchesSimpleSelector(selector, element) {
  const match = selector.trim().match(/^(?:([a-z][\w-]*|\*))?((?:\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]+))?\])*)$/i);
  if (!match || (match[1] && match[1] !== "*" && match[1].toLowerCase() !== element.tag)) return false;
  const suffix = match[2];
  const classes = [...suffix.matchAll(/\.([\w-]+)/g)].map((part) => part[1]);
  const attributes = [...suffix.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)];
  return classes.every((className) => element.classes.has(className))
    && attributes.every(([, name, doubleQuoted, singleQuoted, unquoted]) => {
      if (!element.attributes.has(name)) return false;
      const expected = doubleQuoted ?? singleQuoted ?? unquoted?.trim();
      return expected === undefined || element.attributes.get(name) === expected;
    });
}

function companyPanelDisplay(stylesheets, hidden) {
  const element = {
    tag: "section",
    classes: new Set(["company-overview-card"]),
    attributes: new Map([["data-company-panel", "bonds"], ...(hidden ? [["hidden", ""]] : [])]),
  };
  let winner = null;
  let order = 0;
  for (const stylesheet of stylesheets) {
    const root = postcss.parse(stylesheet);
    for (const rule of root.nodes.filter((node) => node.type === "rule")) {
      const matching = rule.selector.split(",").map((selector) => selector.trim())
        .filter((selector) => matchesSimpleSelector(selector, element));
      for (const declaration of rule.nodes.filter((node) => node.type === "decl" && node.prop === "display")) {
        for (const selector of matching) {
          const specificity = [0, (selector.match(/[.\[]/g) ?? []).length, /^[a-z]/i.test(selector) ? 1 : 0];
          const candidate = { value: declaration.value, important: declaration.important, specificity, order: order++ };
          const specificityDelta = winner
            ? candidate.specificity.findIndex((part, index) => part !== winner.specificity[index])
            : -1;
          const higherSpecificity = winner && specificityDelta >= 0
            ? candidate.specificity[specificityDelta] > winner.specificity[specificityDelta]
            : false;
          const sameSpecificity = winner && specificityDelta < 0;
          if (!winner
            || (candidate.important && !winner.important)
            || (candidate.important === winner.important
              && (higherSpecificity || (sameSpecificity && candidate.order > winner.order)))) {
            winner = candidate;
          }
        }
      }
    }
  }
  return winner?.value ?? (hidden ? "none" : "block");
}

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
    stock: null,
    ipo: { market: "上櫃", stage: "A", events: [{ label: "申請送件", date: "2026-08-01" }] },
    revenue: { yearMonth: "11507", currentMonthRevenue: "448516", monthOverMonthPercent: "-2.6", yearOverYearPercent: "12.1" },
    bonds: [{ bondCode: "12601", bondName: "富味鄉一", cbPriceLabel: "CB 收盤", cbClose: "101.5", cbPriceDate: "2026-08-24", stockClose: null, stockPriceDate: null, conversionPrice: null, conversionPriceDate: null, conversionValue: null, conversionValueDate: null, premiumRate: null, valuationDate: null, remainingRatio: null, outstandingDataDate: null, maturityDate: null }],
    events: [{ market: "IPO", label: "申請送件", date: "2026-08-01" }],
  });
  assert.equal(JSON.stringify(overview).includes("private"), false);
  assert.equal(JSON.stringify(overview).includes("missingReasons"), false);
});

test("company overview does not infer a company without its canonical public master record", () => {
  assert.equal(buildCompanyOverview({ code: "9999" }), null);
});

test("V5.3 company page groups every active CB from the V5.3 canonical projection", () => {
  const overview = buildCompanyOverview({
    code: "1260",
    companyMaster: [{ stockCode: "1260", companyName: "富味鄉", market: "興櫃", industry: "食品", dataDate: "2026-08-28" }],
    workbench: [
      { status: "active", stockCode: "1260", cbCode: "12601", cbName: "富味鄉一", quote: { cbClose: 101.5, dataDate: "2026-08-28", premiumRate: 3.2 }, events: [{ label: "賣回", date: "2027-01-01" }] },
      { status: "active", stockCode: "1260", cbCode: "12602", cbName: "富味鄉二", quote: { cbClose: 99, dataDate: "2026-08-28", premiumRate: null }, events: [] },
    ],
  });

  assert.deepEqual(overview.bonds, [
    { bondCode: "12601", bondName: "富味鄉一", cbPriceLabel: "CB 收盤", cbClose: "101.5", cbPriceDate: "2026-08-28", stockClose: null, stockPriceDate: null, conversionPrice: null, conversionPriceDate: null, conversionValue: null, conversionValueDate: null, premiumRate: "3.2", valuationDate: null, remainingRatio: null, outstandingDataDate: null, maturityDate: null },
    { bondCode: "12602", bondName: "富味鄉二", cbPriceLabel: "CB 收盤", cbClose: "99", cbPriceDate: "2026-08-28", stockClose: null, stockPriceDate: null, conversionPrice: null, conversionPriceDate: null, conversionValue: null, conversionValueDate: null, premiumRate: null, valuationDate: null, remainingRatio: null, outstandingDataDate: null, maturityDate: null },
  ]);
  assert.deepEqual(overview.events, [{ market: "CB", label: "賣回", date: "2027-01-01" }]);
});

test("company CB cards retain dated market facts and link only verified event sources", () => {
  const officialUrl = "https://mops.twse.com.tw/mops/web/t05st01";
  const overview = buildCompanyOverview({
    code: "2303",
    companyMaster: [{ stockCode: "2303", companyName: "聯電", market: "上市", industry: "半導體業", dataDate: "2026-09-25" }],
    workbench: [{
      status: "active", stockCode: "2303", cbCode: "23031", cbName: "聯電一",
      quote: {
        cbClose: 108, dataDate: "2026-09-25", stockClose: 56, stockPriceDate: "2026-09-25",
        conversionPrice: 50, conversionPriceEffectiveDate: "2026-09-20",
        stockConversionValue: 112, stockConversionValueDate: "2026-09-25",
        premiumRate: -3.57, valuationDate: "2026-09-25",
      },
      terms: { remainingRatio: 65, outstandingDataDate: "2026-08-31", maturityDate: "2029-09-30" },
      events: [
        { label: "賣回起日", date: "2027-04-15", sourceUrl: officialUrl },
        { label: "外站事件", date: "2027-05-01", sourceUrl: "https://evil.example/event" },
      ],
      sourceId: "internal-source-id", missingReasons: ["internal-detail"],
    }],
  });

  assert.deepEqual(overview.bonds[0], {
    bondCode: "23031", bondName: "聯電一", cbPriceLabel: "CB 收盤", cbClose: "108", cbPriceDate: "2026-09-25",
    stockClose: "56", stockPriceDate: "2026-09-25", conversionPrice: "50", conversionPriceDate: "2026-09-20",
    conversionValue: "112", conversionValueDate: "2026-09-25", premiumRate: "-3.57", valuationDate: "2026-09-25",
    remainingRatio: "65", outstandingDataDate: "2026-08-31", maturityDate: "2029-09-30",
  });
  assert.deepEqual(overview.events, [
    { market: "CB", label: "賣回起日", date: "2027-04-15", sourceUrl: officialUrl },
    { market: "CB", label: "外站事件", date: "2027-05-01" },
  ]);

  const html = renderCompanyOverviewHtml(overview, "bonds");
  assert.match(html, /href="\.\/bonds\.html\?bond=23031"/);
  assert.match(html, /CB 收盤/);
  assert.match(html, /轉換價值/);
  assert.match(html, /2026\/09\/20/);
  assert.match(html, /剩餘比率/);
  assert.match(html, /2026\/08\/31/);
  assert.match(html, /href="https:\/\/mops\.twse\.com\.tw\/mops\/web\/t05st01"[^>]*>官方公告<\/a>/);
  assert.doesNotMatch(html, /evil\.example|internal-source-id|internal-detail/);
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

test("inactive company tab panels stay hidden while the active panel remains visible", async () => {
  const stylesheets = await Promise.all(["assets/app.css", "assets/workspace.css"]
    .map((path) => readFile(new URL(path, root), "utf8")));

  assert.equal(companyPanelDisplay(stylesheets, true), "none");
  assert.equal(companyPanelDisplay(stylesheets, false), "flex");
});
