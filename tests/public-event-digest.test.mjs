import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicEventDigest } from "../static-showcase/assets/public-event-digest.js";

test("event digest only counts valid published events", () => {
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
    ["ipo-recent", 1, "2026-08-25", "./ipo.html?stage=active&sort=eventDate&direction=asc", "ready"],
    ["bond-rights-90", 1, "2026-09-01", "./bonds.html?event=rights90", "ready"],
    ["bond-maturity-365", 2, "2026-10-01", "./bonds.html?event=maturity365", "ready"],
    ["bond-pending", 1, null, "./bonds.html?quality=pending", "ready"],
  ]);
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
    count: 1,
    nearestDate: "2026-08-20",
    href: "./ipo.html?stage=active&sort=eventDate&direction=asc",
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
