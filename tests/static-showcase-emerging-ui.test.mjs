import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("興櫃頁提供完整盤後市場概況、排行榜與資料表", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("emerging.html", root), "utf8"),
    readFile(new URL("assets/emerging-page.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);
  const source = html + js;

  for (const label of [
    "最後成交價（盤後）",
    "當日成交均價（盤後）",
    "公司家數",
    "有效樣本",
    "上漲／下跌／持平",
    "成交股數合計",
    "估算成交金額（盤後）",
    "漲幅排行",
    "跌幅排行",
    "成交股數排行",
    "估算成交金額排行",
    "公司代碼／名稱",
    "產業",
    "均價漲跌",
    "最高",
    "最低",
    "申請狀態",
    "資料日期",
    "月營收",
  ]) {
    assert.match(source, new RegExp(label));
  }

  for (const id of [
    "emerging-search",
    "emerging-industry",
    "emerging-application",
    "emerging-direction",
    "emerging-sort-field",
    "emerging-sort-direction",
    "emerging-table-body",
    "emerging-pagination",
    "emerging-revenue-body",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /assets\/emerging-page\.js/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /pageSize\(\)/);
  assert.match(js, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(js, /\.slice\(0, 5\)/);
  assert.match(js, /estimatedTransactionAmount/);
  assert.match(js, /row\.lastTradedPrice/);
  assert.match(html, /data-market-sort="lastTradedPrice"/);
  assert.match(js, /emptyRow\(11/);
  assert.match(js, /monthlyRevenue/);
  assert.match(css, /market-breadth/);
  assert.match(css, /ranking-grid/);
  assert.match(css, /market-table/);
  assert.match(js, /marketCardHtml/);
  for (const mobileLabel of ["最高／最低", "成交股數", "估算成交金額（盤後）", "資料日期"]) {
    assert.match(js, new RegExp(mobileLabel));
  }

  assert.doesNotMatch(html, /即時|最新價|買進價|賣出價|買進量|賣出量|WebSocket|自動更新/);
  assert.doesNotMatch(html, /興櫃[^<]{0,12}收盤價|興櫃收盤價/);
});

test("月營收八個欄位可獨立排序並保留網址狀態", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("emerging.html", root), "utf8"),
    readFile(new URL("assets/emerging-page.js", root), "utf8"),
  ]);

  for (const [key, type] of [
    ["companyCode", "text"],
    ["industryName", "text"],
    ["yearMonth", "text"],
    ["monthRevenue", "number"],
    ["monthChangePercent", "number"],
    ["yearChangePercent", "number"],
    ["cumulativeRevenue", "number"],
    ["cumulativeChangePercent", "number"],
  ]) {
    assert.match(html, new RegExp(`data-revenue-sort="${key}" data-sort-type="${type}"`));
  }

  assert.match(js, /revenueSortKey/);
  assert.match(js, /revenueSortDirection/);
  assert.match(js, /params\.get\("revenueSort"\)/);
  assert.match(js, /params\.get\("revenueDirectionSort"\)/);
  assert.match(js, /params\.set\("revenueSort"/);
  assert.match(js, /params\.set\("revenueDirectionSort"/);
  assert.match(js, /querySelectorAll\("\[data-revenue-sort\]"\)/);
});
