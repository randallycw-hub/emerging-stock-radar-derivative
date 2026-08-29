import assert from "node:assert/strict";
import test from "node:test";

import * as siteSearch from "../static-showcase/assets/site-search.js";

const index = {
  records: [
    { id: "company:2303", type: "company", stockCode: "2303", companyName: "聯電", cbCode: null, cbName: null, market: "上市", industry: "半導體業", cbCodes: ["23031"], cbNames: ["聯電一"], aliases: ["UMC"], ipoStage: null, url: "./company.html?code=2303", dataDate: "2026-08-28" },
    { id: "cb:23031", type: "cb", stockCode: "2303", companyName: "聯電", cbCode: "23031", cbName: "聯電一", market: "上市", industry: "半導體業", cbCodes: ["23031"], cbNames: ["聯電一"], aliases: [], ipoStage: null, url: "./bonds.html?bond=23031", dataDate: "2026-08-28" },
    { id: "company:3313", type: "company", stockCode: "3313", companyName: "斐成", cbCode: null, cbName: null, market: "上櫃", industry: "電子業", cbCodes: [], cbNames: [], aliases: [], ipoStage: "C", url: "./company.html?code=3313", dataDate: "2026-08-28" },
  ],
};

test("V5.2 search reads the canonical index wrapper and ranks exact codes before partial matches", () => {
  assert.deepEqual(siteSearch.searchCanonicalIndex("　２３０３ ", index).map((row) => row.id), ["company:2303", "cb:23031"]);
  assert.equal(siteSearch.searchCanonicalIndex("23031", index)[0]?.id, "cb:23031");
  assert.equal(siteSearch.searchCanonicalIndex("UMC", index)[0]?.id, "company:2303");
  assert.equal(siteSearch.searchCanonicalIndex("斐", index)[0]?.market, "上櫃");
});

test("V5.2 search result model renders canonical matches into the result container", () => {
  const model = siteSearch.buildSearchResultMarkup("23031", { state: "ready", entries: index.records });
  assert.deepEqual(model, {
    count: 2,
    hidden: false,
    html: '<article class="search-result-card"><a role="option" href="./bonds.html?bond=23031"><strong>23031 聯電一</strong><span>可轉債・標的 2303 聯電</span></a></article><article class="search-result-card"><a role="option" href="./company.html?code=2303"><strong>2303 聯電</strong><span>公司研究・1 檔可轉債</span></a></article>',
  });
});

test("V5.2 search keeps no-results, index readiness, load failure and network failure distinct", () => {
  assert.equal(siteSearch.searchStateMessage?.("no_results"), "查無結果");
  assert.equal(siteSearch.searchStateMessage?.("not_ready"), "搜尋服務尚未就緒");
  assert.equal(siteSearch.searchStateMessage?.("load_error"), "搜尋資料載入失敗");
  assert.equal(siteSearch.searchStateMessage?.("network_error"), "暫時無法搜尋，請稍後再試");
});

test("V5.2 search loader preserves five distinct fetch and schema outcomes", async () => {
  const response = (value, ok = true) => ({ ok, json: async () => value });
  const pointer = "https://market.example/market-site/data/current.json";
  const load = (fetchImpl) => siteSearch.loadCanonicalSearchIndex({
    pointerUrl: pointer,
    baseUrl: "https://market.example/market-site/",
    fetchImpl,
  });

  assert.equal((await load(async () => response(null, false))).state, "load_error");
  assert.equal((await load(async () => response({}))).state, "not_ready");
  assert.equal((await load(async (url) => {
    if (String(url) === pointer) return response({ runtimeUrl: "./data/runtime.json" });
    return response({});
  })).state, "not_ready");
  assert.equal((await load(async () => { throw new Error("offline"); })).state, "network_error");
  assert.equal((await load(async (url) => {
    if (String(url) === pointer) return response({ runtimeUrl: "./data/runtime.json" });
    if (String(url).endsWith("/data/runtime.json")) return response({ searchIndexUrl: "./data/search-index.json" });
    return response({ records: null });
  })).state, "load_error");
  const ready = await load(async (url) => {
    if (String(url) === pointer) return response({ runtimeUrl: "./data/runtime.json" });
    if (String(url).endsWith("/data/runtime.json")) return response({ searchIndexUrl: "./data/search-index.json" });
    return response(index);
  });
  assert.deepEqual(ready, { state: "ready", entries: index.records });
});
