import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPublicEventDigest,
  buildCrossMarketEventEntries,
  dedupeBondEvents,
  projectPublicBondEvents,
} from "../static-showcase/assets/public-event-digest.js";
import { filterPublicBondEvents } from "../static-showcase/assets/bond-events-page.js";

test("bond events dedupe by published bond, date, type and official reference", () => {
  const events = [
    { bondCode: "35221", type: "put", date: "2026-09-01", title: "賣回", sourceUrl: "https://www.tpex.org.tw/a", sourceId: "11406" },
    { bondCode: "35221", type: "put", date: "2026-09-01", title: "賣回", sourceUrl: "https://www.tpex.org.tw/a", sourceId: "11406" },
    { bondCode: "35221", type: "maturity", date: "2028-07-29", title: "到期", sourceUrl: "https://www.tpex.org.tw/a", sourceId: "11406" },
  ];
  assert.equal(dedupeBondEvents(events).length, 2);
  assert.deepEqual(projectPublicBondEvents(events, "2026-08-25"), [
    { bondCode: "35221", type: "put", date: "2026-09-01", title: "賣回" },
    { bondCode: "35221", type: "maturity", date: "2028-07-29", title: "到期" },
  ]);
});

test("public bond events can be limited to the next 30 calendar days", () => {
  const rows = filterPublicBondEvents([
    { bondCode: "35221", type: "put", date: "2026-08-25", title: "賣回", sourceId: "11406" },
    { bondCode: "35221", type: "put", date: "2026-09-24", title: "賣回", sourceId: "11406" },
    { bondCode: "35221", type: "maturity", date: "2026-09-25", title: "到期", sourceId: "11406" },
  ], { asOfDate: "2026-08-25", days: 30 });

  assert.deepEqual(rows, [
    { bondCode: "35221", type: "put", date: "2026-08-25", title: "賣回" },
    { bondCode: "35221", type: "put", date: "2026-09-24", title: "賣回" },
  ]);
  assert.equal(JSON.stringify(rows).includes("sourceId"), false);
});

test("event digest only publishes verified investor-facing events", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    ipoDataDate: "2026-08-25",
    bonds: [
      { bondCode: "1101A", nextEventDate: "2026-09-01", maturityDate: "2027-08-01", dataQuality: "complete" },
      { bondCode: "1101B", nextEventDate: "bad-date", maturityDate: "2026-10-01", dataQuality: "partial" },
    ],
    ipoSourceManifest: [{ sourceId: "twse-applications" }],
    ipoRecords: [{ companyCode: "1234", stage: "D", events: [{ date: "2026-08-25", label: "掛牌", sourceRecordIds: ["TWSE:2026:1234"] }] }],
  });
  assert.deepEqual(digest.map((item) => [item.id, item.count, item.nearestDate, item.href, item.state]), [
    ["ipo-recent", 1, "2026-08-25", "./ipo.html?stage=market&sort=eventDate&direction=asc", "ready"],
    ["bond-rights-90", 1, "2026-09-01", "./bonds.html?event=rights90", "ready"],
    ["bond-maturity-365", 2, "2026-10-01", "./bonds.html?event=maturity365", "ready"],
  ]);
});

test("event digest never exposes internal completeness counts", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    bonds: [{ bondCode: "1101A", dataQuality: "partial" }],
  });
  assert.equal(digest.some((entry) => entry.id === "bond-pending"), false);
});

test("IPO digest prioritizes contract and trading events", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    ipoDataDate: "2026-08-24",
    ipoSourceManifest: [{ sourceId: "twse-applications" }],
    ipoRecords: [
      { companyCode: "1001", stage: "A", events: [{ date: "2026-08-25", label: "送件", sourceRecordIds: ["TWSE:1001:20260825"] }] },
      { companyCode: "1002", stage: "D", events: [{ date: "2026-08-26", label: "競拍", sourceRecordIds: ["TWSE:1002:20260826"] }] },
    ],
  });
  assert.equal(digest.find((item) => item.id === "ipo-recent").count, 1);
});

test("IPO digest uses its own snapshot date and excludes terminal, stale, and unapproved evidence", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-07-31",
    ipoDataDate: "2026-08-24",
    ipoSourceManifest: [{ sourceId: "twse-applications" }],
    ipoRecords: [
      { companyCode: "1001", stage: "A", events: [{ date: "2026-08-20", label: "送件", sourceRecordIds: ["TWSE:2026:1001"] }] },
      { companyCode: "1002", stage: "listed", events: [{ date: "2026-08-21", label: "掛牌", sourceRecordIds: ["TWSE:2026:1002"] }] },
      { companyCode: "1003", stage: "A", events: [{ date: "2025-08-23", label: "送件", sourceRecordIds: ["TWSE:2025:1003"] }] },
      { companyCode: "1004", stage: "B", events: [{ date: "2026-08-22", label: "審議", sourceRecordIds: ["UNAPPROVED:1004"] }] },
    ],
  });

  assert.deepEqual(digest.find((item) => item.id === "ipo-recent"), {
    id: "ipo-recent",
    label: "近期 IPO 事件",
    count: 0,
    nearestDate: null,
    href: "./ipo.html?stage=market&sort=eventDate&direction=asc",
    state: "ready",
  });
});

test("IPO digest excludes an evidenced near-date record with an unknown stage", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    ipoDataDate: "2026-08-24",
    ipoSourceManifest: [{ sourceId: "twse-applications" }],
    ipoRecords: [{
      companyCode: "1005",
      stage: "future-stage",
      applicationDate: "2026-08-20",
      events: [{ date: "2026-08-20", label: "送件", sourceRecordIds: ["TWSE:1005:2026-08-20"] }],
    }],
  });

  assert.equal(digest.find((item) => item.id === "ipo-recent").count, 0);
});

test("IPO digest is unavailable without a valid IPO snapshot date", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    ipoRecords: [],
    ipoSourceManifest: [],
  });
  assert.equal(digest.find((item) => item.id === "ipo-recent").state, "unavailable");
});

test("missing CB inputs are unavailable instead of a fake count", () => {
  const digest = buildPublicEventDigest({ asOfDate: "2026-08-24", bonds: null, ipoRecords: [] });
  assert.equal(digest.find((item) => item.id === "bond-rights-90").state, "unavailable");
});

test("cross-market events are filtered by market without internal source metadata", () => {
  const events = buildCrossMarketEventEntries({
    asOfDate: "2026-08-24",
    emergingEvents: [{ date: "2026-08-25", title: "新登錄", companyCode: "1260", sourceId: "internal" }],
    ipoDataDate: "2026-08-24",
    ipoSourceManifest: [{ sourceId: "twse-applications" }],
    ipoRecords: [{ companyCode: "1234", stage: "D", events: [{ date: "2026-08-26", label: "競拍", sourceRecordIds: ["TWSE:2026:1234"] }] }],
    bonds: [{ bondCode: "11011", events: [{ date: "2026-08-27", type: "put", title: "賣回", sourceId: "11406" }] }],
  });

  assert.deepEqual(events.map((event) => [event.market, event.date, event.title]), [
    ["emerging", "2026-08-25", "新登錄"],
    ["ipo", "2026-08-26", "競拍"],
    ["bonds", "2026-08-27", "賣回"],
  ]);
  assert.deepEqual(events.filter((event) => event.market === "ipo").map((event) => event.title), ["競拍"]);
  assert.equal(JSON.stringify(events).includes("sourceId"), false);
});
