import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyV55CbEventStatus,
  projectCbRightsEvents,
} from "../static-showcase/assets/v55-canonical-data.js";

const rightsEvent = Object.freeze({
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

test("projects a real CB redemption into a public event without inventing a value", () => {
  const [event] = projectCbRightsEvents({
    rightsEvents: { events: [{ ...rightsEvent, redemptionPrice: null }] },
    records: [{ cbCode: "31672", stockCode: "3167", companyName: "大量", cbName: "大量二" }],
    dataDate: "2026-08-30",
  });

  assert.deepEqual(
    {
      eventId: event.eventId,
      eventType: event.eventType,
      cbCode: event.cbCode,
      status: event.status,
      deadlineDate: event.deadlineDate,
      lastTradingDate: event.lastTradingDate,
      price: event.price,
    },
    {
      eventId: rightsEvent.eventId,
      eventType: "early_redemption",
      cbCode: "31672",
      status: "upcoming",
      deadlineDate: "2026-09-30",
      lastTradingDate: "2026-10-01",
      price: null,
    },
  );
  assert.match(event.title, /提前贖回/u);
  assert.equal(event.sourceUrl, rightsEvent.sourceUrl);
  assert.equal(Object.hasOwn(event, "rawSourceId"), false);
  assert.equal(Object.hasOwn(event, "rawTextHash"), false);
});

test("marks the next official deadline without treating an absent field as zero", () => {
  assert.equal(classifyV55CbEventStatus(rightsEvent, "2026-09-29"), "deadline_soon");
  assert.equal(classifyV55CbEventStatus(rightsEvent, "2026-10-03"), "completed");
});
