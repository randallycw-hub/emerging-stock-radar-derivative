import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectPublicOfferings } from "../static-showcase/assets/ipo-offering-page.js";

test("public offering projection combines approved auction and subscription facts", () => {
  const rows = projectPublicOfferings({
    dataDate: "2026-08-24",
    sourceManifest: [{ sourceId: "twse-auctions" }, { sourceId: "twse-public-offerings" }],
    records: [{
      companyCode: "1234",
      companyName: "測試公司",
      market: "上市",
      stage: "D",
      underwriter: "測試承銷商",
      finalUnderwritingPrice: "50",
      auction: { bidStartDate: "2026-08-26", bidEndDate: "2026-08-28", auctionOpenDate: "2026-08-29", sourceRecordId: "TWSE:auction:1234:2026-08-29" },
      publicOffering: { subscriptionStartDate: "2026-08-31", subscriptionEndDate: "2026-09-02", drawDate: "2026-09-03", listingDate: "2026-09-10", sourceRecordId: "TWSE:public-offering:1234:2026-09-03" },
      events: [
        { date: "2026-08-29", label: "競拍開標", sourceRecordIds: ["TWSE:auction:1234:2026-08-29"] },
        { date: "2026-09-03", label: "公開申購抽籤", sourceRecordIds: ["TWSE:public-offering:1234:2026-09-03"] },
      ],
    }, {
      companyCode: "3456",
      companyName: "取消公司",
      market: "上市",
      stage: "cancelled",
      exceptionStatus: "cancelled",
      auction: { bidStartDate: "2026-08-26", sourceRecordId: "TWSE:auction:3456:2026-08-26" },
      events: [],
    }],
  });

  assert.deepEqual(rows, [{
    companyCode: "1234",
    companyName: "測試公司",
    market: "上市",
    bidStartDate: "2026-08-26",
    bidEndDate: "2026-08-28",
    auctionOpenDate: "2026-08-29",
    underwritingPrice: "50",
    subscriptionStartDate: "2026-08-31",
    subscriptionEndDate: "2026-09-02",
    drawDate: "2026-09-03",
    listingDate: "2026-09-10",
    underwriter: "測試承銷商",
    asOfDate: "2026-08-24",
  }]);
  assert.equal(JSON.stringify(rows).includes("sourceId"), false);
});

test("IPO offering route exposes all required public columns", async () => {
  const source = await readFile(new URL("../static-showcase/ipo-offering.html", import.meta.url), "utf8");
  for (const label of ["競拍開始", "競拍截止", "開標", "承銷價／暫定價格", "申購期間", "抽籤日期", "掛牌日期", "主辦券商", "資料日期"]) {
    assert.match(source, new RegExp(label));
  }
});

test("public offering projection accepts release-stage verified nested facts without source identifiers", () => {
  const rows = projectPublicOfferings({
    dataDate: "2026-08-24",
    records: [{
      companyCode: "1234",
      companyName: "測試公司",
      market: "上市",
      underwriter: "測試承銷商",
      auction: { bidStartDate: "2026-08-26", verified: true },
      publicOffering: { subscriptionStartDate: "2026-08-31", verified: true },
    }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bidStartDate, "2026-08-26");
  assert.equal(rows[0].subscriptionStartDate, "2026-08-31");
});

test("public offering projection accepts numeric V5.6 prices without treating them as unavailable", () => {
  const rows = projectPublicOfferings({
    dataDate: "2026-08-28",
    records: [{
      companyCode: "7825", companyName: "和亞智慧", market: "興櫃", underwriter: "測試承銷商",
      auction: { bidStartDate: "2026-08-26", finalUnderwritingPrice: 56, verified: true },
    }],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].underwritingPrice, "56");
});
