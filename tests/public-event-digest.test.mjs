import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicEventDigest } from "../static-showcase/assets/public-event-digest.js";

test("event digest only counts valid published events", () => {
  const digest = buildPublicEventDigest({
    asOfDate: "2026-08-24",
    bonds: [
      { bondCode: "1101A", nextEventDate: "2026-09-01", maturityDate: "2027-08-01", dataQuality: "complete" },
      { bondCode: "1101B", nextEventDate: "bad-date", maturityDate: "2026-10-01", dataQuality: "partial" },
    ],
    ipoRecords: [{ companyCode: "1234", events: [{ date: "2026-08-25", label: "掛牌", sourceRecordIds: ["TWSE:1234:1150825"] }] }],
  });
  assert.deepEqual(digest.map((item) => [item.id, item.count, item.nearestDate, item.href, item.state]), [
    ["ipo-recent", 1, "2026-08-25", "./ipo.html?sort=eventDate&direction=asc", "ready"],
    ["bond-rights-90", 1, "2026-09-01", "./bonds.html?event=rights90", "ready"],
    ["bond-maturity-365", 2, "2026-10-01", "./bonds.html?event=maturity365", "ready"],
    ["bond-pending", 1, null, "./bonds.html?quality=pending", "ready"],
  ]);
});

test("missing CB inputs are unavailable instead of a fake count", () => {
  const digest = buildPublicEventDigest({ asOfDate: "2026-08-24", bonds: null, ipoRecords: [] });
  assert.equal(digest.find((item) => item.id === "bond-rights-90").state, "unavailable");
});
