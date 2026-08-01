import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);
const pageFiles = [
  ["index.html", "首頁"],
  ["bonds.html", "可轉債"],
  ["emerging.html", "興櫃市場"],
  ["ipo.html", "IPO 行程"],
  ["methodology.html", "資料方法"],
];

async function readShowcaseFile(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

for (const [currentFile, pageName] of pageFiles) {
  test(`${pageName}具備共用五頁導覽與無障礙頁面骨架`, async () => {
    const html = await readShowcaseFile(currentFile);

    assert.match(html, /<html\s+lang="zh-Hant"/);
    assert.match(html, /href="\.\/assets\/app\.css"/);
    assert.match(html, /src="\.\/assets\/site-shell\.js"/);
    assert.match(html, /<a[^>]+class="skip-link"[^>]+href="#main-content"/);
    assert.match(html, /<main[^>]+id="main-content"/);
    assert.match(html, /<button[^>]+id="nav-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="primary-navigation"/);
    assert.match(html, /<nav[^>]+id="primary-navigation"[^>]+aria-label="主要導覽"/);
    assert.match(html, /<button[^>]+id="theme-toggle"[^>]+aria-label="切換深淺色模式"/);

    for (const [linkedFile] of pageFiles) {
      assert.match(html, new RegExp(`href="\\./${linkedFile}"`));
    }

    assert.match(
      html,
      new RegExp(`href="\\./${currentFile}"[^>]+aria-current="page"`),
    );
    assert.doesNotMatch(html, /href="#(?!main-content)/);
  });
}

test("首頁只提供四個市場入口與最後成功更新狀態", async () => {
  const home = await readShowcaseFile("index.html");

  assert.match(home, /<h1[^>]*>可轉債與興櫃盤後資訊<\/h1>/);
  assert.match(home, /href="\.\/bonds\.html"/);
  assert.match(home, /href="\.\/emerging\.html"/);
  assert.match(home, /href="\.\/ipo\.html"/);
  assert.match(home, /href="\.\/methodology\.html"/);
  assert.match(home, /id="last-successful-update"/);
  assert.doesNotMatch(home, />384<|>343<|>354<|資料日期/);
  assert.doesNotMatch(home, /<table\b/);
});

test("資料方法頁使用核准專業詞彙並說明估值公式", async () => {
  const methodology = await readShowcaseFile("methodology.html");

  for (const term of [
    "DATA METHODOLOGY",
    "資料來源與計算方法",
    "可轉債發行條款",
    "盤後行情資料",
    "轉換價格資料",
    "估值計算原則",
  ]) {
    assert.match(methodology, new RegExp(term));
  }
  assert.match(methodology, /同一資料日期/);
  assert.match(methodology, /估算成交金額（盤後）/);
  assert.doesNotMatch(methodology, /興櫃估計成交金額/);
  assert.match(methodology, /當日成交均價（盤後）\s*[×xX＊*]\s*成交股數/);
  assert.doesNotMatch(
    methodology,
    /<h[1-6][^>]*>\s*(?:官方資料|官方快照|擷取版本)\s*<\/h[1-6]>/,
  );
});

test("共用格式與安全讀取工具提供可預期的顯示結果", async () => {
  const {
    formatDate,
    formatNumber,
    safeJsonFetch,
  } = await import(new URL("assets/site-shell.js", showcaseRoot));

  assert.equal(formatDate("2026-07-30"), "2026/07/30");
  assert.equal(formatNumber(1234567), "1,234,567");

  const target = { hidden: true, textContent: "" };
  const result = await safeJsonFetch("data.json", {
    errorTarget: target,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(result, null);
  assert.equal(target.hidden, false);
  assert.match(target.textContent, /資料暫時無法讀取/);
});
