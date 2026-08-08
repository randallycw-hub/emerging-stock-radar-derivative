import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("bond page exposes the complete sortable CB workbench", async () => {
  const [home, bondsHtml, js, sortJs, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
    readFile(new URL("assets/table-sort.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);

  for (const label of [
    "CB 代碼／名稱",
    "CB 收盤價（盤後）",
    "股票收盤價",
    "目前轉換價",
    "轉換價值",
    "轉換溢價率",
    "CB 成交量",
    "流通餘額",
    "到期日",
    "距到期／賣回",
    "一鍵切換排序",
  ]) {
    assert.match(bondsHtml + js, new RegExp(label));
  }
  for (const section of [
    "交易摘要",
    "價格日期與估值日",
    "價格走勢",
    "轉換與餘額",
    "契約生命週期",
    "發行條款",
    "公告與文件",
  ]) {
    assert.match(js, new RegExp(section));
  }
  assert.match(home, /assets\/app\.css/);
  assert.doesNotMatch(home, /assets\/(?:app|bonds-page)\.js/);
  assert.match(bondsHtml, /id="bond-search"/);
  assert.match(bondsHtml, /id="bond-preset"/);
  assert.match(bondsHtml, /id="bond-sort-field"/);
  assert.match(bondsHtml, /id="bond-sort-direction"/);
  assert.match(bondsHtml, /id="bond-table-body"/);
  assert.match(bondsHtml, /id="bond-workbench"/);
  assert.match(bondsHtml, /assets\/site-shell\.js/);
  assert.match(bondsHtml, /assets\/bonds-page\.js/);
  assert.doesNotMatch(bondsHtml, /href="\.\/methodology\.html"/);
  assert.match(bondsHtml, /aria-label="可轉債分頁"/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /maturityDate/);
  assert.match(js, /daysToMaturity/);
  assert.match(js, /cbPriceDate/);
  assert.match(js, /官方目前餘額/);
  assert.match(js, /共同估值日/);
  assert.match(js, /value === null \|\| value === undefined/);
  assert.match(js, /bond/);
  assert.match(js, /sort/);
  assert.match(js, /direction/);
  assert.match(js, /page/);
  assert.match(js, /history\.(?:pushState|replaceState)/);
  assert.doesNotMatch(js, /location\.hash|hashchange/);
  assert.doesNotMatch(js, /資料來源|擷取版本/);
  assert.match(sortJs, /export function sortRows/);
  assert.match(css, /--clay:\s*#b96849/);
  assert.match(css, /--clay-ink:\s*#8b412d/);
  assert.match(css, /--violet:\s*#7a638f/);
  assert.match(css, /color:\s*var\(--clay-ink\)/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.doesNotMatch(
    js,
    /const history =[\s\S]*history\.replaceState/,
    "區域資料變數不可遮蔽瀏覽器 history 物件",
  );
  assert.match(js, /drawHistoryChart/);
  assert.match(js, /data-history-range="1M"/);
  assert.match(js, /<canvas[^>]+bond-history-chart/);
});

test("static showcase keeps presentation out of generated runtime data", async () => {
  const runtime = await readFile(new URL("data/runtime.js", root), "utf8");
  assert.match(runtime, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(runtime, /generationPointerUrl/);
  assert.doesNotMatch(runtime, /manifestUrl/);
  assert.doesNotMatch(runtime, /document\.querySelector|innerHTML|const val =/);
});
