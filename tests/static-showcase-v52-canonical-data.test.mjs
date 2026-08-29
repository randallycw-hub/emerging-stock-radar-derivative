import assert from "node:assert/strict";
import test from "node:test";

import * as publicMarketResearch from "../static-showcase/assets/public-market-research.js";

const sourceSnapshot = {
  manifest: { market: { dataDate: "2026-08-28" } },
  emerging: {
    records: [{
      companyCode: "7777",
      companyName: "興櫃公司",
      industryName: "綠能環保",
    }],
  },
  ipo: {
    records: [
      { companyCode: "3313", companyName: "斐成", market: "上櫃", stage: "C" },
      { companyCode: "3314", companyName: "斐成", market: "上市", stage: "A" },
    ],
  },
  workbench: {
    records: [{
      status: "active",
      bondCode: "33131",
      term: { bondCode: "33131", bondName: "斐成一", issuerCode: "3313", issuerName: "斐成" },
      view: { issuerResearch: { market: "otc", industryName: "半導體業" } },
    }],
  },
  stockCloses: [{ companyCode: "3313", market: "otc", tradingDate: "2026-08-28" }],
};

test("V5.2 canonical masters join CBs by issuer code and preserve the verified OTC market", () => {
  const masters = publicMarketResearch.buildCanonicalPublicMasters?.(sourceSnapshot);
  const company = masters?.companyMaster?.find((entry) => entry.stockCode === "3313");
  const bond = masters?.cbMaster?.find((entry) => entry.bondCode === "33131");

  assert.deepEqual(company, {
    stockCode: "3313",
    companyName: "斐成",
    market: "上櫃",
    industry: "半導體業",
    cbCodes: ["33131"],
    cbNames: ["斐成一"],
    aliases: [],
    ipoStage: "C",
    dataDate: "2026-08-28",
  });
  assert.deepEqual(bond, {
    bondCode: "33131",
    bondName: "斐成一",
    stockCode: "3313",
    companyName: "斐成",
    market: "上櫃",
    dataDate: "2026-08-28",
  });
  assert.equal(masters?.companyMaster?.find((entry) => entry.stockCode === "3314")?.cbCodes.length, 0);
});
