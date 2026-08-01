import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("IPO 頁保留完整事件順序並提供獨立篩選排序", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("ipo.html", root), "utf8"),
    readFile(new URL("assets/ipo-page.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);
  const source = html + js;

  for (const label of [
    "公司代碼／名稱",
    "市場",
    "目前進度",
    "申請日期",
    "審議日期",
    "董事會通過日期",
    "契約核准／備查日期",
    "掛牌交易日期",
    "承銷商",
    "備註",
    "資料更新",
  ]) {
    assert.match(source, new RegExp(label));
  }
  for (const id of [
    "ipo-search",
    "ipo-market",
    "ipo-status",
    "ipo-year",
    "ipo-sort-field",
    "ipo-sort-direction",
    "ipo-table-body",
    "ipo-pagination",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /assets\/ipo-page\.js/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /pageSize\(\)/);
  assert.match(js, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(js, /listed_for_trading/);
  assert.match(js, /contract_filed_or_regulator_approved/);
  assert.match(js, /board_approved/);
  assert.match(js, /listing_review_completed/);
  assert.match(js, /withdrawn/);
  assert.match(css, /ipo-timeline/);
  assert.match(css, /ipo-card-list/);
  for (const mobileLabel of ["申請", "審議", "董事會", "核准／備查", "掛牌", "資料更新"]) {
    assert.match(js, new RegExp(mobileLabel));
  }
  assert.doesNotMatch(html, /<h[1-6][^>]*>\s*(?:資料來源|擷取版本|官方快照)\s*<\/h[1-6]>/);
  assert.doesNotMatch(html, /class="[^"]*(?:source-card|capture-card)[^"]*"/);
});
