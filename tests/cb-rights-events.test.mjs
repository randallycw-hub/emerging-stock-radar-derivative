import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCbRightsEventSnapshot,
  classifyCbRightsEventStatus,
} from "../lib/market-data/cb-rights-events.ts";

const event = Object.freeze({
  eventId: "mops-redemption:31672:2026-08-13:1",
  eventType: "early_redemption",
  issuerCode: "3167",
  issuerName: "大量",
  bondCode: "31672",
  bondName: "大量二",
  announcementDate: "2026-08-13",
  acceptStartDate: "2026-09-01",
  acceptEndDate: "2026-09-30",
  brokerAcceptStartDate: "2026-08-31",
  brokerAcceptEndDate: "2026-09-29",
  lastConversionDate: "2026-10-02",
  recordDate: "2026-09-30",
  lastTradingDate: "2026-10-01",
  redemptionPrice: "100000",
  redemptionPricePercent: "100",
  reason: "依發行及轉換辦法第十八條規定辦理。",
  sourceUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3167&date1=20260813&seq_no=1&pub_class=0&firstin=1",
  rawSourceId: "mops-redemption:31672:2026-08-13:1",
  rawTextHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  fetchedAt: "2026-08-30T00:00:00.000Z",
});

test("classifies official redemption event states without inferring missing dates", () => {
  assert.equal(classifyCbRightsEventStatus(event, "2026-08-30"), "upcoming");
  assert.equal(classifyCbRightsEventStatus(event, "2026-09-02"), "active");
  assert.equal(classifyCbRightsEventStatus(event, "2026-09-29"), "deadline_soon");
  assert.equal(classifyCbRightsEventStatus(event, "2026-10-01"), "deadline_soon");
  assert.equal(classifyCbRightsEventStatus(event, "2026-10-03"), "completed");
});

test("retains last-known-good rights events when the next detail source is unavailable", () => {
  const previous = buildCbRightsEventSnapshot({
    generatedAt: "2026-08-30T00:00:00.000Z",
    dataDate: "2026-08-30",
    current: [event],
  });
  const snapshot = buildCbRightsEventSnapshot({
    generatedAt: "2026-08-31T00:00:00.000Z",
    dataDate: "2026-08-31",
    previous,
  });

  assert.equal(snapshot.source.state, "stale");
  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].eventId, event.eventId);
});

test("never treats an unknown official price as zero", () => {
  const snapshot = buildCbRightsEventSnapshot({
    generatedAt: "2026-08-30T00:00:00.000Z",
    dataDate: "2026-08-30",
    current: [{ ...event, redemptionPrice: null, redemptionPricePercent: null }],
  });

  assert.equal(snapshot.events[0].redemptionPrice, null);
  assert.equal(snapshot.events[0].redemptionPricePercent, null);
});

test("accepts the six-digit CB codes used by official redemption notices", () => {
  const snapshot = buildCbRightsEventSnapshot({
    generatedAt: "2026-08-30T00:00:00.000Z",
    dataDate: "2026-08-30",
    current: [{
      ...event,
      eventId: "mops-redemption:629010:2026-08-13:1",
      bondCode: "629010",
      bondName: "台半十",
      rawSourceId: "mops-redemption:629010:2026-08-13:1",
    }],
  });
  assert.equal(snapshot.events[0].bondCode, "629010");
});
