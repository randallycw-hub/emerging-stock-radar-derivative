import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIpoLifecycle, projectOffering } from "../lib/ipo-events/lifecycle.ts";

function record(overrides = {}) {
  return {
    companyCode: "1234",
    market: "上市",
    stage: "C",
    exceptionStatus: null,
    applicationDate: "2026-07-01",
    underwriter: "承銷商",
    events: [
      { companyCode: "1234", market: "上市", kind: "application_submitted", date: "2026-07-01", label: "申請送件", sourceRecordIds: ["TWSE:1234:1"] },
      { companyCode: "1234", market: "上市", kind: "contract_approved", date: "2026-08-01", label: "契約核准", sourceRecordIds: ["TWSE:1234:1"] },
      { companyCode: "1234", market: "上市", kind: "contract_approved", date: "2026-08-01", label: "契約核准", sourceRecordIds: ["TWSE:1234:2"] },
    ],
    auction: {
      bidStartDate: "2026-08-10", bidEndDate: "2026-08-12", auctionOpenDate: "2026-08-14",
    },
    publicOffering: {
      subscriptionStartDate: "2026-08-20", subscriptionEndDate: "2026-08-22", drawDate: "2026-08-25",
      listingDate: "2026-08-30", provisionalUnderwritingPrice: "48", finalUnderwritingPrice: "50",
    },
    listingDate: "2026-08-30",
    finalUnderwritingPrice: "50",
    ...overrides,
  };
}

test("normalizes an active lifecycle with canonical same-event dedupe", () => {
  const result = normalizeIpoLifecycle(record(), "2026-08-05");
  assert.equal(result.currentStage, "C");
  assert.equal(result.active, true);
  assert.equal(result.daysInStage, 4);
  assert.deepEqual(result.events.map((event) => [event.kind, event.date]), [
    ["application_submitted", "2026-07-01"],
    ["contract_approved", "2026-08-01"],
  ]);
});

test("excludes withdrawn and cancelled IPO records from active lifecycle surfaces", () => {
  assert.equal(normalizeIpoLifecycle(record({ stage: "withdrawn", exceptionStatus: "withdrawn" }), "2026-08-05").active, false);
  assert.equal(normalizeIpoLifecycle(record({ stage: "D", exceptionStatus: "cancelled" }), "2026-08-05").active, false);
});

test("projects official auction and subscription dates into one offering record", () => {
  assert.deepEqual(projectOffering(record()), {
    bidStartDate: "2026-08-10",
    bidEndDate: "2026-08-12",
    auctionOpenDate: "2026-08-14",
    subscriptionStartDate: "2026-08-20",
    subscriptionEndDate: "2026-08-22",
    drawDate: "2026-08-25",
    listingDate: "2026-08-30",
    underwriter: "承銷商",
    underwritingPrice: "50",
  });
});
