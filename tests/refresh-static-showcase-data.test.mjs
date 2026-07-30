import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildRuntimeBootstrap,
  fetchOfficialCsvWithRetry,
  updateRuntimeCacheKey,
} from "../scripts/refresh-static-showcase-data.mjs";

test("正式展示資料只從核准的三個官方 CSV 匯入", () => {
  assert.deepEqual(OFFICIAL_SHOWCASE_SOURCES, {
    "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
    "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    "11586":
      "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  });
});

test("重新產生 runtime 時只寫入正式資料網址，不嵌入呈現程式", () => {
  const manifest = { generatedAt: "2026-07-30", datasets: [] };
  const result = buildRuntimeBootstrap(manifest);

  assert.match(result, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(result, /"manifestUrl":"\.\/data\/manifest\.json"/);
  assert.match(result, /"11406":"\.\/data\/11406\.json"/);
  assert.doesNotMatch(result, /公司代號|document\.querySelector/);
});

test("正式 CSV 遇到暫時 DNS 或伺服器錯誤時只重試相同網址", async () => {
  const url = OFFICIAL_SHOWCASE_SOURCES["94025"];
  const requested = [];
  const responses = [
    {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/csv" }),
      arrayBuffer: async () => {
        throw new TypeError("terminated");
      },
    },
    new Response("欄位\n資料", {
      status: 200,
      headers: { "content-type": "text/csv" },
    }),
  ];
  const response = await fetchOfficialCsvWithRetry(
    url,
    async (requestedUrl) => {
      requested.push(String(requestedUrl));
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    { sleep: async () => {} },
  );

  assert.equal(response.status, 200);
  assert.equal(new TextDecoder().decode(response.bytes), "欄位\n資料");
  assert.deepEqual(requested, [url, url]);
});

test("runtime 快取標記可重複執行且仍拒絕缺少標記的 HTML", () => {
  const current =
    '<script src="./data/runtime.js?v=d8e5aa9336d0"></script>';

  assert.equal(updateRuntimeCacheKey(current, "d8e5aa9336d0"), current);
  assert.equal(
    updateRuntimeCacheKey(current, "abc123"),
    '<script src="./data/runtime.js?v=abc123"></script>',
  );
  assert.throws(
    () => updateRuntimeCacheKey("<html></html>", "abc123"),
    /runtime cache key marker not found/,
  );
});
