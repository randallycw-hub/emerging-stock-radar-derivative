import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("IPO 雷達投影所有已核對的階段日期與階段經過日數", async () => {
  const { projectIpoRadarRecord } = await import("../static-showcase/assets/ipo-radar-page.js");
  const row = projectIpoRadarRecord({
    companyCode: "1234", companyName: "測試公司", market: "上市", stage: "D", exceptionStatus: null,
    applicationDate: "2026-08-01", reviewDate: "2026-08-05", boardDate: "2026-08-10", contractDate: "2026-08-15", listingDate: "2026-09-10",
    auction: { bidStartDate: "2026-08-20", sourceRecordId: "TWSE:auction:1234:2026-08-20" },
    publicOffering: { subscriptionStartDate: "2026-08-25", sourceRecordId: "TWSE:public-offering:1234:2026-08-25" },
    events: [{ date: "2026-08-20", kind: "auction_bid_start", label: "競拍投標開始", sourceRecordIds: ["TWSE:auction:1234:2026-08-20"] }],
  }, { dataDate: "2026-08-24", sourceManifest: [{ sourceId: "twse-applications" }, { sourceId: "twse-auctions" }, { sourceId: "twse-public-offerings" }] });

  assert.deepEqual(
    {
      applicationDate: row.applicationDate,
      reviewDate: row.reviewDate,
      boardDate: row.boardDate,
      contractDate: row.contractDate,
      auctionBidStartDate: row.auctionBidStartDate,
      subscriptionStartDate: row.subscriptionStartDate,
      listingDate: row.listingDate,
      daysInStage: row.daysInStage,
    },
    {
      applicationDate: "2026-08-01",
      reviewDate: "2026-08-05",
      boardDate: "2026-08-10",
      contractDate: "2026-08-15",
      auctionBidStartDate: "2026-08-20",
      subscriptionStartDate: "2026-08-25",
      listingDate: "2026-09-10",
      daysInStage: 4,
    },
  );
});

test("IPO 雷達排除撤件與取消案件，且公開表格標示各階段欄位", async () => {
  const [module, html] = await Promise.all([
    import("../static-showcase/assets/ipo-radar-page.js"),
    readFile(new URL("../static-showcase/ipo-radar.html", import.meta.url), "utf8"),
  ]);
  assert.equal(module.isIpoRadarExcluded({ stage: "withdrawn", exceptionStatus: "withdrawn" }), true);
  assert.equal(module.isIpoRadarExcluded({ stage: "cancelled", exceptionStatus: "cancelled" }), true);
  assert.equal(module.isIpoRadarExcluded({ stage: "D", exceptionStatus: null }), false);
  for (const label of ["送件日", "審議日", "董事會日", "契約日", "競拍日", "申購日", "掛牌日", "階段經過"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /來源 ID|缺漏原因|目前無核准公開資料／待確認/);
});
