import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("興櫃頁明確使用收盤價語意並保留來源日期", async () => {
  const html = await readFile(new URL("../app/dev-preview/emerging/page.tsx", import.meta.url), "utf8");
  assert.match(html, /DataFreshness/);
  assert.doesNotMatch(html, /即時行情|realtimePrice/);
});

test("IPO 頁在沒有經驗證資料時顯示透明空狀態", async () => {
  const html = await readFile(new URL("../app/dev-preview/ipo/page.tsx", import.meta.url), "utf8");
  assert.match(html, /IPO 申請與掛牌時程/);
  assert.match(html, /目前沒有可發布的 IPO 時程資料/);
  assert.match(html, /事件日期升冪/);
});
