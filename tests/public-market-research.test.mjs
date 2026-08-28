import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicMarketResearch } from "../static-showcase/assets/public-market-research.js";

const manifest = {
  market: { dataDate: "2026-08-26", generatedAt: "2026-08-26T12:00:00Z" },
  datasets: [{ sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics" }],
};

const workbench = {
  records: [{
    bondCode: "23031",
    status: "active",
    term: {
      bondCode: "23031",
      bondName: "聯電一",
      issuerCode: "2303",
      issuerName: "聯電",
      issueAmount: "1000000000",
      issueDate: "2026-08-20",
      listingDate: "2026-08-26",
    },
    view: { currentConversionPrice: "45" },
    events: [{
      type: "listing",
      date: "2026-08-26",
      title: "聯電一上櫃買賣",
      sourceId: "internal-only",
      sourceUrl: "https://www.tpex.org.tw/zh-tw/bond/issue/cbond/listed.html",
    }, {
      type: "maturity",
      date: "2031-08-07",
      title: "聯電一到期日",
      sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    }],
  }],
};

const ipo = {
  records: [{
    companyCode: "3595",
    companyName: "山太士",
    stage: "D",
    market: "上櫃",
    events: [
      { kind: "auction_bid_start", date: "2026-08-27", label: "競拍投標開始" },
      { kind: "public_draw", date: "2026-09-03", label: "公開抽籤" },
      { kind: "contract_approved", date: "2026-08-26", label: "契約核准" },
    ],
  }],
};

test("V5.1 builds one public index and same-date home modules without internal fields", () => {
  const research = buildPublicMarketResearch({
    manifest,
    emerging: { records: [{
      companyCode: "3595",
      companyName: "山太士",
      tradingDate: "2026-08-26",
      transactionVolume: "100",
      estimatedTransactionAmount: "5000",
      averageChangePercent: "2.5",
    }] },
    ipo,
    workbench,
    stockCloses: [{ companyCode: "2303", tradingDate: "2026-08-26", close: "52", change: "2" }],
    history: [{ bondCode: "23031", date: "2026-08-26", cbTradingUnits: "8", cbClose: "102", premiumRate: "5" }],
  });

  assert.equal(research.meta.dataDate, "2026-08-26");
  assert.equal(research.meta.status, "ok");
  assert.deepEqual(research.searchIndex.find((item) => item.cbCode === "23031"), {
    id: "cb:23031",
    type: "cb",
    stockCode: "2303",
    companyName: "聯電",
    cbCode: "23031",
    cbName: "聯電一",
    market: "CB",
    aliases: [],
    url: "./bonds.html?bond=23031",
    dataDate: "2026-08-26",
  });
  assert.equal(research.home.cbStockLeaders.state, "ready");
  assert.equal(research.home.cbStockLeaders.entries[0].changePercent, 4);
  assert.equal(research.home.cbTurnover.daily.state, "ready");
  assert.equal(research.home.cbTurnover.daily.entries[0].tradingUnits, 8);
  assert.equal(research.home.cbIssuance.entries[0].stage, "已公告掛牌");
  assert.deepEqual(research.home.cbOfficialEvents.entries.map((entry) => entry.title), ["聯電一上櫃買賣"]);
  assert.deepEqual(research.home.ipoCalendar.days7.entries.map((entry) => entry.label), ["競拍投標開始"]);
  assert.deepEqual(research.home.ipoCalendar.days30.entries.map((entry) => entry.label), ["競拍投標開始", "公開抽籤"]);
  assert.equal(research.home.latestEvents.entries.some((entry) => /契約核准/u.test(entry.title)), false);
  assert.equal(JSON.stringify(research).includes("sourceId"), false);
  assert.equal(JSON.stringify(research).includes("missingReasons"), false);
  assert.equal(research.home.latestEvents.entries.some((entry) => /到期日/u.test(entry.title)), false);
});

test("V5.1 does not turn stale or absent CB records into zeros", () => {
  const research = buildPublicMarketResearch({
    manifest,
    ipo: { records: [] },
    workbench,
    stockCloses: [{ companyCode: "2303", tradingDate: "2026-08-25", close: "52", change: "2" }],
    history: [],
  });

  assert.equal(research.home.cbStockLeaders.state, "data_unavailable");
  assert.deepEqual(research.home.cbStockLeaders.entries, []);
  assert.equal(research.home.cbTurnover.daily.state, "no_verified_data");
  assert.deepEqual(research.home.cbTurnover.daily.entries, []);
});

test("V5.1 preserves a verified zero-trade day separately from missing data", () => {
  const research = buildPublicMarketResearch({
    manifest,
    ipo: { records: [] },
    workbench,
    history: [{ bondCode: "23031", date: "2026-08-26", cbTradingUnits: "0", cbClose: null, premiumRate: null }],
  });

  assert.equal(research.home.cbTurnover.daily.state, "no_trades");
  assert.deepEqual(research.home.cbTurnover.daily.entries, []);
});
