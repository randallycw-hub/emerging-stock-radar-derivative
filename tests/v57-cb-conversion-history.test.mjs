import assert from "node:assert/strict";
import test from "node:test";

import { buildCbWorkbenchV53 } from "../static-showcase/assets/cb-workbench-v53.js";
import { renderCbDetailV53 } from "../static-showcase/assets/cb-detail-v53.js";
import { buildLightweightEventMarkers } from "../static-showcase/assets/lightweight-charts-adapter.js";
import { renderMarketOverview } from "../static-showcase/assets/cb-workbench-ui.js";

const MOPS_URL = "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=90001&issuer_stock_code=9000";

function modelWithConversionHistory() {
  return buildCbWorkbenchV53({
    workbench: {
      dataDate: "2026-08-28",
      records: [{
        bondCode: "90001",
        status: "active",
        term: { bondCode: "90001", issuerCode: "9000" },
        view: {
          bondCode: "90001", cbPriceDate: "2026-08-28", cbClose: "110", cbTradeUnits: "20",
          stockPriceDate: "2026-08-28", stockClose: "95", currentConversionPrice: "90",
          conversionPriceEffectiveDate: "2026-08-01",
        },
        events: [],
      }],
    },
    cbMaster: [{ bondCode: "90001", stockCode: "9000", bondName: "測試一", companyName: "測試公司", market: "上市" }],
    companyMaster: [{ stockCode: "9000", industry: "測試業" }],
    conversionPrices: [
      { bondCode: "90001", issuerCode: "9000", initialConversionPrice: "100", currentConversionPrice: "95", effectiveDate: "2026-07-01", officialDetailUrl: MOPS_URL },
      { bondCode: "90001", issuerCode: "9000", initialConversionPrice: "100", currentConversionPrice: "90", effectiveDate: "2026-08-01", officialDetailUrl: MOPS_URL },
    ],
  });
}

test("V5.7 CB conversion-price history derives old and new prices only from official versions", () => {
  const history = modelWithConversionHistory().records[0].conversionPriceHistory;

  assert.deepEqual(history.map(({ effectiveDate, previousConversionPrice, currentConversionPrice, sourceUrl }) => ({ effectiveDate, previousConversionPrice, currentConversionPrice, sourceUrl })), [
    { effectiveDate: "2026-07-01", previousConversionPrice: 100, currentConversionPrice: 95, sourceUrl: MOPS_URL },
    { effectiveDate: "2026-08-01", previousConversionPrice: 95, currentConversionPrice: 90, sourceUrl: MOPS_URL },
  ]);
});

test("V5.7 CB detail presents conversion history with official source links and no internal metadata", () => {
  const html = renderCbDetailV53(modelWithConversionHistory().records[0]);

  for (const label of ["轉換價歷程", "生效日", "原轉換價", "新轉換價", "變動類型", "官方公告"]) assert.match(html, new RegExp(label));
  assert.match(html, /100 元/);
  assert.match(html, /95 元/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整度|MISSING_/);
});

test("V5.7 K-line retains one marker for one canonical event identity", () => {
  const markers = buildLightweightEventMarkers([
    { eventId: "mops-conversion:90001:2026-08-01", eventType: "conversion_price_adjustment", effectiveDate: "2026-08-01", title: "轉換價調整" },
    { eventId: "mops-conversion:90001:2026-08-01", eventType: "conversion_price_adjustment", effectiveDate: "2026-08-01", title: "重複來源資料" },
  ]);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].time, "2026-08-01");
});

test("V5.7 heatmap limits always-visible labels to the Top N bubbles", () => {
  const records = Array.from({ length: 12 }, (_, index) => ({
    cbCode: `9${String(index).padStart(4, "0")}`,
    cbName: `測試${index}`,
    stockCode: `8${String(index).padStart(3, "0")}`,
    companyName: `公司${index}`,
    status: "active",
    quote: { premiumRate: index, conversionValue: 100 + index, volume: index + 1 },
  }));
  const html = renderMarketOverview({ dataDate: "2026-08-28", records, summary: {}, events: [], issuance: [] });

  assert.equal((html.match(/data-heatmap-label/g) ?? []).length, 8);
  assert.match(html, /aria-label=/);
});
