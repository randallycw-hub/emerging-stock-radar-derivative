import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("市場預覽提供篩選與資料日期元件", async () => {
  const [filters, freshness, css] = await Promise.all([
    readFile(new URL("../app/dev-preview/_components/MarketFilters.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dev-preview/_components/DataFreshness.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dev-preview/preview.css", import.meta.url), "utf8"),
  ]);
  assert.match(filters, /搜尋代號或名稱/);
  assert.match(filters, /清除篩選/);
  assert.match(freshness, /資料日期/);
  assert.match(freshness, /資料來源/);
  assert.match(css, /\.market-filters/);
  assert.match(css, /\.data-freshness/);
});
