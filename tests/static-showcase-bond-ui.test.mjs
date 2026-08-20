import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("bond page exposes the complete sortable CB workbench", async () => {
  const [home, bondsHtml, js, detailJs, sortJs, css] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
    readFile(new URL("assets/table-sort.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);

  for (const label of [
    "CB 代碼／名稱",
    "CB 收盤",
    "標的股收盤",
    "目前轉換價",
    "轉換價值",
    "轉換溢價率",
    "流通餘額比例",
    "下一事件",
    "資料日期",
    "資料品質",
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
  assert.match(bondsHtml, /id="bond-archive-toggle"/);
  assert.match(bondsHtml, /id="bond-clear-filter"/);
  assert.match(bondsHtml, /id="bond-table-body"/);
  assert.match(bondsHtml, /id="bond-workbench"/);
  assert.match(bondsHtml, /data-detail-url-param="bond"/);
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
  assert.match(js, /bond-list-page/);
  assert.match(js, /bond-detail-page/);
  assert.match(js, /bondWorkbench/);
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
  assert.match(js, /bindBondDetail\(target, closeDetail, \{ history: state\.history\.filter/);
  assert.match(js, /data-history-range="1M"/);
  assert.match(js, /<canvas[^>]+bond-history-chart/);
  assert.match(detailJs, /function noAdviceViolations/);
  assert.match(detailJs, /FORBIDDEN_UI_PATTERNS/);
  assert.match(detailJs, /bond-candlestick/);
  assert.match(detailJs, /noopener noreferrer/);
  assert.match(detailJs, /目前無核准公開資料／待確認/);
});

test("detail UI gate scans static presentation strings for prohibited public investment directions", async () => {
  const [html, listJs] = await Promise.all([
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/bonds-page.js", root), "utf8"),
  ]);
  const { noAdviceViolations } = await import("../static-showcase/assets/bond-detail-page.js");
  assert.deepEqual(noAdviceViolations(html + listJs), []);
  assert.deepEqual(noAdviceViolations("條件符合"), []);
  assert.deepEqual(noAdviceViolations("建議買進後下單"), ["recommendation", "buy-sell-short", "order"]);
});

test("static showcase keeps presentation out of generated runtime data", async () => {
  const runtime = await readFile(new URL("data/runtime.js", root), "utf8");
  assert.match(runtime, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(runtime, /generationPointerUrl/);
  assert.doesNotMatch(runtime, /manifestUrl/);
  assert.doesNotMatch(runtime, /document\.querySelector|innerHTML|const val =/);
});

test("bond list module round-trips only supported list URL state", async () => {
  const { parseBondListState, serializeBondListState } = await import("../static-showcase/assets/bond-list-page.js");
  const state = parseBondListState("?q=%E7%94%B2&archived=1&sort=cbClose&direction=desc&page=3");
  assert.deepEqual(state, { query: "甲", archived: true, sortKey: "cbClose", direction: "desc", page: 3 });
  assert.equal(serializeBondListState(state), "?q=%E7%94%B2&archived=1&sort=cbClose&direction=desc&page=3");
});

test("mobile bond cards keep every list field and archived metadata visible", async () => {
  const js = await readFile(new URL("assets/bonds-page.js", root), "utf8");
  const card = js.slice(js.indexOf("function renderBondCard"), js.indexOf("function bindBondOpeners"));
  for (const label of ["CB 收盤", "轉換價值", "轉換溢價率", "標的股收盤", "目前轉換價", "流通餘額比例", "下一事件", "資料日期", "資料品質"]) {
    assert.match(card, new RegExp(label));
  }
  assert.match(card, /archiveReason/);
  assert.match(card, /archiveDate/);
  assert.match(card, /archivedAt/);
});
