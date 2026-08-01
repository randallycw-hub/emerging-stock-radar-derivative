import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../static-showcase/index.html", import.meta.url),
  "utf8",
);

test("公開展示頁原始 HTML 不包含測試或示範市場資料", () => {
  for (const prohibited of [
    "測試公司",
    "第二測試公司",
    "測試承銷商",
    "另一承銷商",
  ]) {
    assert.equal(
      html.includes(prohibited),
      false,
      `公開頁仍包含測試資料：${prohibited}`,
    );
  }
});

test("首頁使用核准標題且不再顯示資料筆數摘要列", () => {
  assert.match(html, /可轉債與興櫃盤後資訊/);
  assert.doesNotMatch(html, />384<|>343<|>354<|資料日期/);
});
