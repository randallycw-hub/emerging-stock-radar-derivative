import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("static showcase exposes the complete CB trading workspace", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("assets/app.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);

  for (const label of [
    "CB 代碼／名稱",
    "CB 收盤價",
    "股票收盤價",
    "目前轉換價",
    "轉換價值",
    "轉換溢價率",
    "CB 成交量",
    "流通餘額",
    "到期／賣回事件",
    "非當日成交",
    "資料暫缺",
  ]) {
    assert.match(js, new RegExp(label));
  }
  for (const section of [
    "交易摘要",
    "價格日期與估值日",
    "價格走勢",
    "轉換與餘額",
    "契約生命週期",
    "發行條款",
    "公告與文件",
    "資料來源",
  ]) {
    assert.match(js, new RegExp(section));
  }
  assert.match(html, /assets\/app\.css/);
  assert.match(html, /assets\/app\.js/);
  assert.match(html, /aria-label="切換深淺色模式"/);
  assert.match(css, /--clay:\s*#b96849/);
  assert.match(css, /--clay-ink:\s*#8b412d/);
  assert.match(css, /--violet:\s*#7a638f/);
  assert.match(css, /color:\s*var\(--clay-ink\)/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.doesNotMatch(
    js,
    /const history =[\s\S]*history\.replaceState/,
    "單檔歷史資料不得遮蔽瀏覽器 history 導覽物件",
  );
  assert.match(js, /drawHistoryChart/);
  assert.match(js, /data-history-range="1M"/);
  assert.match(js, /<canvas[^>]+bond-history-chart/);
});

test("static showcase keeps presentation out of generated runtime data", async () => {
  const runtime = await readFile(new URL("data/runtime.js", root), "utf8");
  assert.match(runtime, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(runtime, /manifestUrl/);
  assert.doesNotMatch(runtime, /document\.querySelector|innerHTML|const val =/);
});
