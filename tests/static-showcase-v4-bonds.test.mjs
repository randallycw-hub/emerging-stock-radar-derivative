import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("V4 可轉債工作台以搜尋、客觀快捷條件與欄位說明開始", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
  ]);
  assert.match(html, /placeholder="5\/6 位代碼、債券名稱或發行人"/);
  for (const label of ["新發行", "低溢價", "接近轉換價值", "90 日內權利事件", "365 日內到期", "欄位說明"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /轉換價值：標的股價/);
  assert.match(html, /轉換溢價率：CB 收盤相對轉換價值/);
  assert.match(script, /data-company-context/);
  assert.match(script, /company\.html\?code/);
  assert.match(script, /event\.target\.closest\("\[data-company-context\]"\)/);
});
