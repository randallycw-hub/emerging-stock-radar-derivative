import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapV57EmergingResearchRows } from "../static-showcase/assets/v56-page-data.js";
import { parseV57EmergingState } from "../static-showcase/assets/emerging-research-state.js";

test("V5.7 emerging research state restores price and liquidity sort choices from the URL", () => {
  assert.deepEqual(
    parseV57EmergingState("?view=volume&sort=volumeRatio&directionSort=desc"),
    { view: "volume", sortKey: "volumeRatio", sortDirection: "desc" },
  );
  assert.deepEqual(
    parseV57EmergingState("?view=price&sort=unknown&directionSort=down"),
    { view: "price", sortKey: "todayPrice", sortDirection: "desc" },
  );
});

test("V5.7 emerging research mapper preserves no-trade status and null insufficient performance", () => {
  const [row] = mapV57EmergingResearchRows({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    emerging: { records: [{ stockCode: "7777", companyName: "興櫃甲", tradingDate: "2026-08-28", dailyAveragePrice: 50, dailyVolume: 0, transactionAmount: 0 }] },
    performance: { records: [{
      entityType: "emerging", stockCode: "7777", tradeState: "NO_TRADE_TODAY", latestTradeDate: "2026-08-27", latestPrice: 49,
      periods: { "1W": null, "1M": null, "3M": null, "6M": null, YTD: null },
      liquidity: { average5Volume: null, average20Volume: null, volumeRatio: null, average20Amount: null, amountChange: null },
    }] },
  });

  assert.equal(row.tradeState, "NO_TRADE_TODAY");
  assert.equal(row.todayPrice, null);
  assert.equal(row.periods["1W"], null);
  assert.equal(row.liquidity.volumeRatio, null);
});

test("V5.7 emerging page has separate performance and liquidity research columns", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../static-showcase/emerging.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/emerging-page.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["今日", "1W", "1M", "3M", "6M", "YTD", "5D 均量", "20D 均量", "量比", "20D 平均成交額", "成交額異動"]) {
    assert.match(html + script, new RegExp(label));
  }
  assert.match(script, /marketSchemaFor/);
  assert.match(script, /formatEmergingToday/);
});
