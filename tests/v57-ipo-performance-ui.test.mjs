import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectIpoPostListingPerformance } from "../static-showcase/assets/ipo-page.js";

test("V5.7 IPO post-listing performance uses only the actual released offer price", () => {
  const verified = projectIpoPostListingPerformance({
    companyCode: "1234", companyName: "上市甲", market: "上市", listingDate: "2026-08-01", finalUnderwritingPrice: 20,
    performance: { latestTradeDate: "2026-08-28", latestPrice: 30, periods: { "5D": 0.1, "20D": null, "1M": null, sinceListing: 0.5 } },
  }, "2026-08-28");
  const minimumOnly = projectIpoPostListingPerformance({
    companyCode: "5678", companyName: "上市乙", market: "上櫃", listingDate: "2026-08-01", finalUnderwritingPrice: 0,
    auction: { minimumBidPrice: 18 }, performance: { latestTradeDate: "2026-08-28", latestPrice: 30, periods: { sinceListing: 0.66 } },
  }, "2026-08-28");

  assert.equal(verified.offerPrice, 20);
  assert.equal(verified.periods.sinceListing, 0.5);
  assert.equal(minimumOnly.offerPrice, null);
  assert.equal(minimumOnly.periods.sinceListing, null);
});

test("V5.7 IPO page has a sortable post-listing research view", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../static-showcase/ipo.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/ipo-page.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["掛牌後表現", "實際承銷價", "最新價", "5D", "20D", "1M", "掛牌以來", "尚無掛牌後交易資料"]) {
    assert.match(html + script, new RegExp(label));
  }
  assert.match(html, /data-ipo-view="performance"/);
  assert.match(script, /renderIpoPerformance/);
  assert.match(script, /data-ipo-performance-sort/);
});
