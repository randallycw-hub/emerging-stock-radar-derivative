import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPublicMarketResearch } from "../static-showcase/assets/public-market-research.js";

test("V5.1 methodology names the official public sources and keeps market news outside financial data", async () => {
  const methodology = await readFile(new URL("../static-showcase/methodology.html", import.meta.url), "utf8");
  for (const url of [
    "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
    "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&amp;type=open_data",
    "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
  ]) assert.match(methodology, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(methodology, /市場新聞/);
  assert.doesNotMatch(methodology, /會員資料|登入資料/);
});

test("V5.1 keeps no verified CB trade data and a verified zero-trade day distinct", () => {
  const input = {
    manifest: { market: { dataDate: "2026-08-26", generatedAt: "2026-08-26T12:00:00Z" }, datasets: [] },
    workbench: { records: [{ bondCode: "23031", status: "active", term: { bondCode: "23031", bondName: "聯電一", issuerCode: "2303", issuerName: "聯電" } }] },
    ipo: { records: [] },
  };
  const missing = buildPublicMarketResearch({ ...input, history: [] });
  const knownZero = buildPublicMarketResearch({ ...input, history: [{ bondCode: "23031", date: "2026-08-26", cbTradingUnits: "0" }] });
  assert.deepEqual(missing.home.cbTurnover.daily, { state: "no_verified_data", dataDate: "2026-08-26", entries: [] });
  assert.deepEqual(knownZero.home.cbTurnover.daily, { state: "no_trades", dataDate: "2026-08-26", entries: [] });
});
