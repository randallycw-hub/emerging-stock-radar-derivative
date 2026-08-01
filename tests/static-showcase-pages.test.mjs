import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);
const primaryPageFiles = [
  ["index.html", "首頁"],
  ["bonds.html", "可轉債"],
  ["emerging.html", "興櫃市場"],
  ["ipo-radar.html", "IPO 雷達"],
  ["ipo.html", "IPO 時程"],
];

async function readShowcaseFile(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

for (const [currentFile, pageName] of primaryPageFiles) {
  test(`${pageName}具備共用四頁導覽與無障礙頁面骨架`, async () => {
    const html = await readShowcaseFile(currentFile);

    assert.match(html, /<html\s+lang="zh-Hant"/);
    assert.match(html, /href="\.\/assets\/app\.css"/);
    assert.match(html, /src="\.\/assets\/site-shell\.js"/);
    assert.match(html, /<a[^>]+class="skip-link"[^>]+href="#main-content"/);
    assert.match(html, /<main[^>]+id="main-content"/);
    assert.match(html, /<button[^>]+id="nav-toggle"[^>]+aria-expanded="false"[^>]+aria-controls="primary-navigation"/);
    assert.match(html, /<nav[^>]+id="primary-navigation"[^>]+aria-label="主要導覽"/);
    assert.match(html, /<button[^>]+id="theme-toggle"[^>]+aria-label="切換深淺色模式"/);

    for (const [linkedFile] of primaryPageFiles) {
      assert.match(html, new RegExp(`href="\\./${linkedFile}"`));
    }

    assert.doesNotMatch(html, /href="\.\/methodology\.html"/);

    assert.match(
      html,
      new RegExp(`href="\\./${currentFile}"[^>]+aria-current="page"`),
    );
    assert.doesNotMatch(html, /href="#(?!main-content)/);
  });
}

test("資料方法直接頁保留主要導覽但不列出自己", async () => {
  const html = await readShowcaseFile("methodology.html");
  for (const [linkedFile] of primaryPageFiles) {
    assert.match(html, new RegExp(`href="\\./${linkedFile}"`));
  }
  assert.doesNotMatch(html, /href="\.\/methodology\.html"/);
});

test("首頁提供市場與 IPO 雙入口以及最後成功更新狀態", async () => {
  const home = await readShowcaseFile("index.html");

  assert.match(home, /<h1[^>]*>可轉債與興櫃盤後資訊<\/h1>/);
  assert.match(home, /href="\.\/bonds\.html"/);
  assert.match(home, /href="\.\/emerging\.html"/);
  assert.match(home, /href="\.\/ipo-radar\.html"/);
  assert.match(home, /href="\.\/ipo\.html"/);
  assert.doesNotMatch(home, /href="\.\/methodology\.html"/);
  assert.match(home, /id="last-successful-update"/);
  assert.doesNotMatch(home, />384<|>343<|>354<|資料日期/);
  assert.doesNotMatch(home, /<table\b/);
});

test("IPO 兩頁使用可辨識的桌機資料表與行動卡片版面語意", async () => {
  const css = await readShowcaseFile("assets/app.css");
  for (const selector of ["ipo-radar-summary", "ipo-upcoming-grid", "ipo-stage-flow", "ipo-timeline-table", "ipo-card-list"]) {
    assert.match(css, new RegExp(`\\.${selector}`));
  }
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*\.ipo-timeline-table-shell\s*\{\s*display:\s*none/);
  assert.match(css, /\[data-theme="dark"\][\s\S]*--ipo-stage-a:/);
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

test("IPO 時程頁只標示簡潔資料日期，不揭露內部方法或擷取資訊", async () => {
  const [html, script] = await Promise.all([
    readShowcaseFile("ipo.html"),
    readShowcaseFile("assets/ipo-page.js"),
  ]);
  assert.match(`${html}\n${script}`, /資料日期/);
  assert.doesNotMatch(`${html}\n${script}`, /本站擷取|資料方法|擷取版本|官方快照/);
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

test("深淺色主題具備完整語意色彩與鍵盤互動狀態", async () => {
  const css = await readShowcaseFile("assets/app.css");
  for (const token of [
    "--page",
    "--surface",
    "--text",
    "--muted",
    "--border",
    "--accent",
    "--positive",
    "--negative",
    "--focus",
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*#[0-9a-f]{6}`, "i"));
  }
  assert.match(css, /\[data-theme="dark"\][\s\S]*--focus:/);
  assert.match(css, /button:hover/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /button:disabled/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.site-header\[data-nav-open\]\s+\.primary-navigation\s*\{\s*display:\s*flex/);
  assert.match(css, /\.home-modules,\s*\n\s*\.methodology-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(css, /--(?:page|surface|accent):\s*#(?:0[0-9a-f]|1[0-9a-f]|2[0-9a-f])(?:[4-9a-f][0-9a-f]){2}/i);

  for (const [foreground, background] of [
    ["#241f22", "#fffaf0"],
    ["#655f62", "#fffaf0"],
    ["#8b412d", "#fffaf0"],
    ["#624d78", "#fffaf0"],
    ["#f7f1e9", "#211f23"],
    ["#b8adb1", "#211f23"],
    ["#f0a080", "#211f23"],
    ["#c4abe0", "#211f23"],
  ]) {
    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
});

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    const [red, green, blue] = channels.map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
