import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildBondSearchSuggestions, filterBondRecords } from "../static-showcase/assets/bond-list-page.js";
import {
  detailUrlForBond,
  noAdviceViolations,
  projectCbFactDashboard,
  renderBondDetail,
} from "../static-showcase/assets/bond-detail-page.js";

const unavailable = "目前無核准公開資料／待確認";

test("CB search suggestions match published bond and issuer identifiers without a fetch", () => {
  const records = [
    { bondCode: "11011", bondName: "甲公司一", issuerCode: "1101", issuerName: "甲公司" },
    { bondCode: "35221", bondName: "乙公司二", issuerCode: "3522", issuerName: "乙科技" },
    { bondCode: "11012", bondName: "甲公司二", issuerCode: "1101", issuerName: "甲公司" },
    { bondCode: "77111", bondName: "丙公司一", issuerCode: "3522", issuerName: "丙公司" },
  ];

  assert.deepEqual(
    buildBondSearchSuggestions(records, "1101").map((item) => [item.bondCode, item.exact]),
    [["11011", false], ["11012", false]],
  );
  assert.deepEqual(
    buildBondSearchSuggestions(records, "乙科").map((item) => item.bondCode),
    ["35221"],
  );
  assert.deepEqual(
    buildBondSearchSuggestions(records, "35221").map((item) => [item.bondCode, item.exact]),
    [["35221", true]],
  );
  assert.deepEqual(
    filterBondRecords(records, { query: "3522" }).map((item) => item.bondCode),
    ["35221", "77111"],
  );
  assert.deepEqual(buildBondSearchSuggestions(records, "").map((item) => item.bondCode), []);
});

test("detail URL keeps active list filters while selecting the exact published bond", () => {
  assert.equal(
    detailUrlForBond("/bonds.html?q=%E7%94%B2&event=rights90&remainingMax=25", "35221"),
    "/bonds.html?q=%E7%94%B2&event=rights90&remainingMax=25&bond=35221",
  );
});

test("fact dashboard keeps dates and evidence per field and never fabricates missing values", () => {
  const dashboard = projectCbFactDashboard({
    term: { maturityDate: "2028-07-29" },
    view: {
      currentConversionPrice: "35",
      conversionPriceEffectiveDate: "2026-08-01",
      stockClose: "38",
      stockPriceDate: "2026-08-12",
      conversionValue: "108.57",
      premiumRate: "5",
      valuationDate: "2026-08-12",
      remainingRatio: "80",
      outstandingDataDate: "2026-08-10",
    },
    events: [{ type: "maturity", date: "2028-07-29", sourceId: "11406", sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv" }],
  });

  assert.deepEqual(
    dashboard.map((item) => [item.key, item.value, item.dataDate, item.evidenceState]),
    [
      ["conversionPrice", unavailable, unavailable, "unavailable"],
      ["stockClose", unavailable, unavailable, "unavailable"],
      ["conversionValue", unavailable, unavailable, "unavailable"],
      ["premium", unavailable, unavailable, "unavailable"],
      ["remainingRatio", unavailable, unavailable, "unavailable"],
      ["nextEvent", "maturity 2028-07-29", "2028-07-29", "verified"],
      ["maturity", "2028-07-29", "2028-07-29", "verified"],
    ],
  );
  const html = renderBondDetail({ term: {}, view: { currentConversionPrice: "0" }, events: [] });
  const dashboardHtml = html.slice(html.indexOf('class="cb-fact-dashboard"'), html.indexOf("</section>", html.indexOf('class="cb-fact-dashboard"')));
  assert.match(dashboardHtml, /可轉債事實儀表板/);
  assert.doesNotMatch(dashboardHtml, /<dd>0<\/dd>/);

  const published = projectCbFactDashboard({
    view: {
      currentConversionPrice: "35", conversionPriceEffectiveDate: "2026-08-01",
      stockClose: "38", stockPriceDate: "2026-08-12",
      conversionValue: "108.57", premiumRate: "5", valuationDate: "2026-08-12",
      remainingRatio: "80", outstandingDataDate: "2026-08-10",
    },
    fieldStates: { price: "complete", valuation: "complete", outstanding: "complete" },
  });
  assert.deepEqual(
    published.slice(0, 5).map((item) => [item.value, item.evidenceState]),
    [["35", "verified"], ["38", "verified"], ["108.57", "verified"], ["5", "verified"], ["80", "verified"]],
  );
});

test("CB search markup is an ARIA combobox and the workbench copy has no prohibited directions", async () => {
  const [html, controller] = await Promise.all([
    readFile(new URL("../static-showcase/bonds.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/bonds-page.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /role="combobox"/);
  assert.match(html, /aria-controls="bond-search-suggestions"/);
  assert.match(html, /role="listbox"/);
  assert.match(controller, /Escape/);
  assert.match(controller, /ArrowDown/);
  assert.deepEqual(noAdviceViolations(html + controller), []);
});
