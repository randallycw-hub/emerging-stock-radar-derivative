import assert from "node:assert/strict";
import test from "node:test";

test("static IPO fallback builds timeline records from the published application snapshots", async () => {
  const { buildStaticIpoSnapshot } = await import("../scripts/static-ipo-fallback.mjs");
  const snapshot = buildStaticIpoSnapshot({
    twseRows: [{
      公司代號: "1234",
      公司簡稱: "測試上市",
      申請日期: "1150727",
      上市審議委員會審議日期: "1150801",
      交易所董事會通過上市日期: "",
      "上市契約報請主管機關備查(主管機關核准)日期": "",
      股票上市買賣日期: "",
      承銷商: "承銷商甲",
      承銷價: "50",
      備註: "",
    }],
    tpexRows: [{
      Date: "1150726",
      SecuritiesCompanyCode: "5678",
      CompanyName: "測試上櫃",
      TPExListingScreeningCommitteeDate: "",
      TPExSanctionedDate: "1150802",
      TPExApprovedTradingDate: "",
      ListingDate: "",
      LeadUnderwriter: "承銷商乙",
      Note: "",
    }],
    dataDate: "2026-08-02",
    generatedAt: "2026-08-02T16:30:00+08:00",
  });

  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.records.length, 2);
  assert.deepEqual(snapshot.records.map((row) => row.companyCode), ["1234", "5678"]);
  assert.equal(snapshot.records[0].market, "上市");
  assert.equal(snapshot.records[0].reviewDate, "2026-08-01");
  assert.equal(snapshot.records[0].events[0].date, "2026-07-27");
  assert.equal(snapshot.records[1].market, "上櫃");
  assert.equal(snapshot.records[1].boardDate, "2026-08-02");
});
