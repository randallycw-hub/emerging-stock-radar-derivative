import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);
const primaryPageFiles = [
  ["index.html", "首頁"],
  ["emerging.html", "興櫃"],
  ["ipo-radar.html", "IPO"],
  ["bonds.html", "可轉債"],
];
const v4Navigation = [
  ["首頁", "./index.html"],
  ["興櫃", "./emerging.html"],
  ["IPO", "./ipo-radar.html"],
  ["可轉債", "./bonds.html"],
];

async function readShowcaseFile(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

test("V4 主導覽在所有公開入口保持四個研究入口", async () => {
  const pages = ["index.html", "emerging.html", "ipo-radar.html", "ipo.html", "bonds.html", "company.html"];
  const shell = await readShowcaseFile("assets/site-shell.js");
  assert.match(shell, /PUBLIC_PRIMARY_NAVIGATION/);
  for (const page of pages) {
    const html = await readShowcaseFile(page);
    const navigation = html.match(/<nav id="primary-navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    for (const [label, href] of v4Navigation) {
      assert.match(navigation, new RegExp(`href="${href.replace(".", "\\.")}"[^>]*>${label}<`));
    }
    assert.doesNotMatch(navigation, /資料中心/);
    assert.doesNotMatch(navigation, />IPO 時程</);
    assert.doesNotMatch(navigation, />IPO 雷達</);
  }
});

test("V5 提供公司研究頁與行動導覽容器", async () => {
  const [company, shell] = await Promise.all([
    readShowcaseFile("company.html"),
    readShowcaseFile("assets/site-shell.js"),
  ]);
  assert.match(company, /公司研究/);
  assert.match(shell, /renderMobileNavigation/);
  assert.match(shell, /data-mobile-navigation/);
  assert.match(shell, /label: "更多"/);
});

for (const [currentFile, pageName] of primaryPageFiles) {
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

    for (const [linkedFile] of primaryPageFiles) {
      assert.match(html, new RegExp(`href="\\./${linkedFile}"`));
    }

    const navigation = html.match(/<nav id="primary-navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.doesNotMatch(navigation, /href="\.\/methodology\.html"/);

    assert.match(
      html,
      new RegExp(`href="\\./${currentFile}"[^>]+aria-current="page"`),
    );
    assert.doesNotMatch(html, /href="#(?!main-content)/);
  });
}

test("資料方法直接頁保留四項主要導覽", async () => {
  const html = await readShowcaseFile("methodology.html");
  for (const [linkedFile] of primaryPageFiles) {
    assert.match(html, new RegExp(`href="\\./${linkedFile}"`));
  }
  assert.doesNotMatch(html, /資料中心/);
});

test("首頁提供市場與 IPO 雙入口以及最後成功更新狀態", async () => {
  const home = await readShowcaseFile("index.html");

  assert.match(home, /<h1[^>]*>台灣盤後市場資訊台<\/h1>/);
  assert.match(home, /href="\.\/bonds\.html"/);
  assert.match(home, /href="\.\/emerging\.html"/);
  assert.match(home, /href="\.\/ipo-radar\.html"/);
  assert.match(home, /href="\.\/ipo\.html"/);
  assert.doesNotMatch(home, /href="\.\/methodology\.html"/);
  assert.match(home, /id="last-successful-update"/);
  assert.doesNotMatch(home, />384<|>343<|>354<|資料日期/);
  assert.doesNotMatch(home, /<table\b/);
});

test("V5.1 首頁使用研究工作台，並保留 IPO 雷達與完整時程入口", async () => {
  const home = await readShowcaseFile("index.html");
  assert.match(home, /class="home-v51-workbench-section"/);
  assert.match(home, /href="\.\/ipo-radar\.html"/);
  assert.match(home, /href="\.\/ipo\.html"/);
  assert.doesNotMatch(home, /class="market-module/);
});

test("首頁介紹文字在更新資訊列之上仍保有獨立的閱讀層級", async () => {
  const css = await readShowcaseFile("assets/app.css");

  assert.match(css, /\.home-hero > p:not\(\.kicker\)\s*(?:,|\{)/);
});

test("V5.1 首頁以 canonical 公開資料提供跨市場事件與客觀排行", async () => {
  const [home, script, css] = await Promise.all([
    readShowcaseFile("index.html"), readShowcaseFile("assets/home-page.js"), readShowcaseFile("assets/app.css"),
  ]);
  assert.match(home, /id="home-event-strip"/);
  assert.match(home, /id="home-data-coverage"/);
  assert.match(script, /renderMarketStatusLine/);
  assert.match(script, /safeJsonFetch/);
  assert.match(home, /HOME_V51_WORKBENCH/);
  assert.match(home, /HOME_V51_WORKBENCH/);
  assert.match(script, /buildCrossMarketEventEntries/);
  assert.match(script, /buildObjectiveRankings/);
  assert.match(script, /marketResearchUrl/);
  assert.match(script, /ipoEventsUrl/);
  assert.match(script, /bondWorkbench/);
  assert.match(css, /\.home-event-strip/);
  assert.match(css, /\.home-v51-start-grid/);
  assert.doesNotMatch(home + script, /推薦|買進|賣出|目標價/);
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

test("V5 深淺色主題具備規格色彩與鍵盤互動狀態", async () => {
  const css = await readShowcaseFile("assets/app.css");
  for (const [token, value] of [
    ["--color-bg", "#f5f7fa"],
    ["--color-surface", "#ffffff"],
    ["--color-subtle", "#f8fafc"],
    ["--color-text", "#162033"],
    ["--color-muted", "#667085"],
    ["--color-border", "#dde3ea"],
    ["--color-primary", "#2563eb"],
    ["--color-up", "#c62828"],
    ["--color-down", "#078a55"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${value}`, "i"));
  }
  assert.match(css, /\[data-theme="dark"\][\s\S]*--focus:/);
  assert.match(css, /button:hover/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /button:disabled/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.mobile-bottom-navigation/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*\.mobile-bottom-navigation\s*\{\s*display:\s*grid/);
  assert.match(css, /\.site-header\[data-nav-open\]\s+\.primary-navigation\s*\{\s*display:\s*flex/);
  assert.match(css, /\.home-modules,\s*\n\s*\.methodology-grid\s*\{\s*grid-template-columns:\s*1fr/);
  for (const [foreground, background] of [
    ["#172033", "#ffffff"],
    ["#536176", "#ffffff"],
    ["#194584", "#ffffff"],
    ["#573c92", "#ffffff"],
    ["#f4f7fb", "#111b2d"],
    ["#b6c2d4", "#111b2d"],
    ["#9fc0ff", "#111b2d"],
    ["#cdbbff", "#111b2d"],
  ]) {
    assert.ok(contrastRatio(foreground, background) >= 4.5);
  }
});

test("可轉債工作台在桌機與手機維持局部捲動、分頁與鍵盤替代資訊", async () => {
  const [html, css, list, detail, chart] = await Promise.all([
    readShowcaseFile("bonds.html"),
    readShowcaseFile("assets/app.css"),
    readShowcaseFile("assets/bonds-page.js"),
    readShowcaseFile("assets/bond-detail-page.js"),
    readShowcaseFile("assets/klinechart-adapter.js"),
  ]);
  assert.match(html, /<html[^>]+data-theme="light"/);
  assert.match(css, /body\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(css, /\.bond-table-shell\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.bond-table-shell\s*\{\s*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.bond-card-list\s*\{\s*display:\s*grid/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.detail-tabs\s*\{\s*display:\s*none/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?\.detail-mobile-area\s*\{\s*display:\s*block/);
  assert.match(detail, /role="tablist"/);
  assert.match(detail, /<details class="detail-mobile-area"/);
  assert.match(list, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(chart, /mountKlineChart/);
  assert.match(chart, /ResizeObserver/);
  assert.match(detail, /data-chart-crosshair[^>]+aria-live="polite"/);
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
