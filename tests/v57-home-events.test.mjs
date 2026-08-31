import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildV57HomeSections } from "../static-showcase/assets/home-page.js";
import { filterMarketEvents, projectMarketEvents } from "../static-showcase/assets/market-event-model.js";

const officialUrl = "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=90001";

test("V5.7 homepage separates snapshot changes from the next seven days without repeating canonical events", () => {
  const sections = buildV57HomeSections({
    schemaVersion: 3,
    dataDate: "2026-08-28",
    cbMaster: [{ cbCode: "90001", cbName: "測試一" }],
    ipoPipeline: [{ stockCode: "7001", companyName: "測試 IPO", reviewDate: "2026-09-02" }],
    emerging: [{ stockCode: "7777", companyName: "測試興櫃" }],
    dailyChanges: [
      { entityType: "cb", entityId: "90001", changeType: "conversion_price_changed", effectiveDate: "2026-08-28" },
      { entityType: "ipo", entityId: "7001", changeType: "new_ipo_event", effectiveDate: "2026-08-28" },
    ],
    cbEvents: [
      { eventId: "mops-conversion:90001:2026-09-01", cbCode: "90001", eventType: "conversion_price_adjustment", effectiveDate: "2026-09-01", title: "轉換價調整", status: "upcoming" },
      { eventId: "mops-conversion:90001:2026-09-01", cbCode: "90001", eventType: "conversion_price_adjustment", effectiveDate: "2026-09-01", title: "重複事件", status: "upcoming" },
    ],
  });

  assert.equal(sections.todayChanges.length, 2);
  assert.deepEqual(sections.nextEvents.map((event) => [event.date, event.code, event.label]), [
    ["2026-09-01", "90001", "轉換價調整"],
    ["2026-09-02", "7001", "審議"],
  ]);
});

test("V5.7 market event projection deduplicates canonical events and defaults cleanly to a seven-day filter", () => {
  const events = projectMarketEvents({
    asOfDate: "2026-08-28",
    canonicalEvents: {
      records: [
        { eventId: "mops-conversion:90001:2026-09-01", marketScope: "cb", cbCode: "90001", stockCode: "9000", companyName: "測試公司", instrumentName: "測試一", eventType: "cb_conversion_price_change", effectiveDate: "2026-09-01", sourceUrl: officialUrl, title: "轉換價調整" },
        { eventId: "mops-conversion:90001:2026-09-01", marketScope: "cb", cbCode: "90001", stockCode: "9000", companyName: "測試公司", instrumentName: "測試一", eventType: "cb_conversion_price_change", effectiveDate: "2026-09-01", sourceUrl: officialUrl, title: "重複資料" },
        { eventId: "ipo:7001:listing", marketScope: "ipo", stockCode: "7001", companyName: "測試 IPO", eventType: "ipo_listing", effectiveDate: "2026-09-08", sourceUrl: "https://www.twse.com.tw/zh/announcement/auction.html", title: "掛牌" },
      ],
    },
  });

  assert.equal(events.length, 2);
  assert.deepEqual(filterMarketEvents(events, { asOfDate: "2026-08-28", period: "7" }).map((event) => event.id), ["mops-conversion:90001:2026-09-01"]);
});

test("V5.7 public pages expose a compact seven-day event desk and no duplicate CB-rights module", async () => {
  const root = new URL("../static-showcase/", import.meta.url);
  const [home, events, script] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("events.html", root), "utf8"),
    readFile(new URL("assets/market-events-page.js", root), "utf8"),
  ]);

  for (const label of ["今天有哪些變化", "接下來 7 天"]) assert.match(home, new RegExp(label));
  assert.doesNotMatch(home, /可轉債關鍵事件/);
  assert.match(events, /value="7" selected/);
  assert.match(events, /id="market-event-pagination"/);
  assert.match(script, /PAGE_SIZE = 25/);
});
