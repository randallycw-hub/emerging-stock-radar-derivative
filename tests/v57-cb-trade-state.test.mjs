import assert from "node:assert/strict";
import test from "node:test";

import { buildCbWorkbenchV53 } from "../static-showcase/assets/cb-workbench-v53.js";
import { renderCbDetailV53 } from "../static-showcase/assets/cb-detail-v53.js";

function audited80426Model() {
  return buildCbWorkbenchV53({
    workbench: {
      dataDate: "2026-08-28",
      records: [{
        bondCode: "80426",
        term: {},
        view: {
          bondCode: "80426",
          cbPriceDate: "2026-08-11",
          cbClose: "196",
          cbTradeUnits: "1",
          stockPriceDate: "2026-08-11",
          stockClose: "100",
          currentConversionPrice: "59.4",
          conversionPriceEffectiveDate: "2026-01-01",
        },
        events: [],
      }],
    },
    cbMaster: [{ bondCode: "80426", stockCode: "8042", bondName: "金山電六", companyName: "金山電", market: "上櫃" }],
    companyMaster: [{ stockCode: "8042", industry: "電子" }],
    history: [
      { bondCode: "80426", date: "2026-08-11", cbTradingUnits: "1", cbTurnover: "196000" },
      { bondCode: "80426", date: "2026-08-28", cbTradingUnits: "0", cbTurnover: "0" },
    ],
  });
}

test("V5.7 uses the snapshot date instead of the last trade date for CB trade state", () => {
  const record = audited80426Model().records[0];

  assert.equal(record.quote.snapshotDataDate, "2026-08-28");
  assert.equal(record.quote.tradeState, "NO_TRADE_TODAY");
  assert.equal(record.quote.lastTradeDate, "2026-08-11");
  assert.equal(record.quote.lastPrice, 196);
  assert.equal(record.quote.lastVolume, 1);
  assert.equal(record.quote.volume, 0);
});

test("V5.7 CB detail keeps last trade facts when today has no trade", () => {
  const record = audited80426Model().records[0];
  const html = renderCbDetailV53(record);

  assert.match(html, /今日無成交/);
  assert.match(html, /最後成交日[\s\S]*2026\/08\/11/);
  assert.match(html, /最後成交價[\s\S]*196/);
  assert.match(html, /最後成交量[\s\S]*1 張/);
  assert.match(html, /近 20 交易日有成交<\/dt><dd>1 日/);
});
