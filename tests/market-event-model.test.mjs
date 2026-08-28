import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventMetrics,
  filterMarketEvents,
  groupMarketEventsByEntity,
  groupMarketEventsByDate,
  projectMarketEvents,
} from "../static-showcase/assets/market-event-model.js";

const input = {
  asOfDate: "2026-08-26",
  ipoSnapshot: {
    dataDate: "2026-08-26",
    sourceManifest: [{ sourceId: "twse-applications" }],
    records: [{
      companyCode: "1234",
      companyName: "測試公司",
      market: "上市",
      stage: "D",
      applicationDate: "2026-08-20",
      events: [
        { date: "2026-08-26", label: "競拍開始", kind: "auction", sourceRecordIds: ["TWSE:2026:1234"] },
        { date: "2026-08-28", label: "公開申購", kind: "subscription", sourceRecordIds: ["TWSE:2026:1234"] },
      ],
    }, {
      companyCode: "9999",
      companyName: "未核准公司",
      market: "上櫃",
      stage: "B",
      applicationDate: "2026-08-20",
      events: [{ date: "2026-08-27", label: "審議", sourceRecordIds: ["UNKNOWN:9999"] }],
    }],
  },
  bonds: [{
    bondCode: "11011",
    status: "active",
    term: { bondName: "台泥一永", issuerCode: "1101", issuerName: "台泥" },
    events: [
      { date: "2026-08-27", type: "put", title: "台泥一永賣回權日期", sourceId: "11406" },
      { date: "2026-09-30", type: "maturity", title: "台泥一永到期日", sourceId: "11406" },
    ],
  }, {
    bondCode: "00000",
    status: "archived",
    term: { bondName: "不應顯示", issuerCode: "0000", issuerName: "不應顯示" },
    events: [{ date: "2026-08-27", type: "put", title: "不應顯示", sourceId: "11406" }],
  }],
};

test("市場事件只投影已驗證、進行中公司與有效 CB 的公開事實", () => {
  const events = projectMarketEvents(input);

  assert.deepEqual(events.map((event) => [event.market, event.date, event.code, event.title]), [
    ["ipo", "2026-08-26", "1234", "競拍開始"],
    ["bonds", "2026-08-27", "11011", "台泥一永賣回權日期"],
    ["ipo", "2026-08-28", "1234", "公開申購"],
    ["bonds", "2026-09-30", "11011", "台泥一永到期日"],
  ]);
  assert.equal(JSON.stringify(events).match(/sourceId|sourceRecord|missingReason|diagnostics|assessment/u), null);
  assert.equal(events.every((event) => event.id && event.entityKey && event.href && event.detailHref), true);
});

test("市場事件可依日期和公司群組，並計算可解釋的未來指標", () => {
  const events = projectMarketEvents(input);
  assert.deepEqual(groupMarketEventsByDate(events).map((group) => [group.date, group.events.length]), [
    ["2026-08-26", 1], ["2026-08-27", 1], ["2026-08-28", 1], ["2026-09-30", 1],
  ]);
  assert.deepEqual(groupMarketEventsByEntity(events).map((group) => [group.entityKey, group.events.length]), [
    ["ipo:1234", 2], ["bond:11011", 2],
  ]);
  assert.deepEqual(buildEventMetrics(events, "2026-08-26"), {
    today: 1,
    tomorrow: 1,
    next7: 3,
    ipo: 2,
    bonds: 1,
  });
});

test("市場事件篩選同時支援市場、期間、狀態、類型與搜尋，且不改寫輸入", () => {
  const events = projectMarketEvents(input);
  const filtered = filterMarketEvents(events, {
    asOfDate: "2026-08-26",
    market: "ipo",
    period: "7",
    status: "upcoming",
    eventType: "subscription",
    query: "測試",
  });

  assert.deepEqual(filtered.map((event) => event.title), ["公開申購"]);
  assert.equal(events.length, 4);
  assert.deepEqual(filterMarketEvents(events, { asOfDate: "2026-08-26", period: "tomorrow" }).map((event) => event.code), ["11011"]);
});
