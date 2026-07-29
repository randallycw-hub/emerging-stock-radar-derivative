import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

async function filesUnder(relativePath) {
  const directory = path.join(root, relativePath);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else files.push(child);
  }
  return files;
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `missing CSS rule ${selector}`);
  return match[1];
}

function cssDeclaration(source, selector, property) {
  const rule = cssRule(source, selector);
  const match = rule.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`));
  assert.ok(match, `missing ${property} in ${selector}`);
  return match[1].trim();
}

function themeBColor(source, value) {
  const variable = /^var\((--[^)]+)\)$/.exec(value);
  const resolved = variable
    ? cssDeclaration(source, '[data-preview-theme="b"]', variable[1])
    : value;
  const hex = resolved.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${[...hex.slice(1)].map((digit) => digit.repeat(2)).join("")}`;
  }
  assert.match(hex, /^#[0-9a-f]{6}$/);
  return hex;
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((index) => (
      Number.parseInt(hex.slice(index, index + 2), 16) / 255
    )).map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const values = [luminance(foreground), luminance(background)]
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("preview exposes exactly the requested five route pages and no API route", async () => {
  const routePages = [
    "app/dev-preview/page.tsx",
    "app/dev-preview/emerging/page.tsx",
    "app/dev-preview/emerging/[companyId]/page.tsx",
    "app/dev-preview/bonds/page.tsx",
    "app/dev-preview/bonds/[bondId]/page.tsx",
  ];
  for (const route of routePages) assert.ok((await read(route)).length > 0, route);
  await assert.rejects(read("app/dev-preview/api/route.ts"));
});

test("preview layout fixes brand, subtitle, warning and noindex metadata for every nested page", async () => {
  const [layout, components, themeToggle] = await Promise.all([
    read("app/dev-preview/layout.tsx"),
    read("app/dev-preview/_components/PreviewUi.tsx"),
    read("app/dev-preview/_components/PreviewThemeToggle.tsx"),
  ]);
  const source = `${layout}\n${components}\n${themeToggle}`;
  assert.match(source, /興債觀測網/);
  assert.match(source, /興櫃公司、可轉債與上市櫃進度資訊/);
  assert.match(
    source,
    /開發預覽版：目前畫面使用經最小化的測試樣本，不代表完整或最新市場資料。/,
  );
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/s);
  assert.match(layout, /notFound\(\)/);
  assert.match(layout, /isPreviewDevelopmentRuntime/);
  assert.match(layout, /data-preview-theme="b"/);
  assert.match(layout, /xingzhai-preview-theme/);
  assert.ok(layout.indexOf("dangerouslySetInnerHTML") < layout.indexOf("<PreviewHeader"));
  assert.match(themeToggle, /"use client"/);
  assert.match(themeToggle, /aria-pressed/);
  assert.match(themeToggle, /type="button"/);
  assert.match(themeToggle, />淺色</);
  assert.match(themeToggle, />深色</);
});

test("preview homepage is a fixture-derived daily dashboard with search and exact sections", async () => {
  const [page, search] = await Promise.all([
    read("app/dev-preview/page.tsx"),
    read("app/dev-preview/_components/PreviewSearch.tsx"),
  ]);

  assert.match(page, /每日興櫃與可轉債資訊儀表板/);
  assert.match(page, /興債觀測網/);
  assert.match(page, /興櫃公司、可轉債與上市櫃進度資訊/);
  assert.match(page, /整理興櫃公司營收、可轉債發行條款與重要日期。/);
  assert.match(page, /buildPreviewDashboard/);
  assert.match(page, /PreviewSearch/);
  assert.match(search, /searchPreviewEntities/);
  assert.match(search, /找不到符合的預覽樣本。/);
  assert.match(search, /result\.href/);

  for (const label of [
    "公司樣本數",
    "債券樣本數",
    "最新資料月份",
    "最近一個可轉債重要日期",
    "預覽樣本營收摘要",
    "可轉債發行條款",
    "重要日期",
    "資料時間軸",
    "快速入口",
    "上市櫃進度",
    "資料透明度",
  ]) {
    assert.match(page, new RegExp(label));
  }
  assert.ok(page.match(/預覽樣本/g)?.length >= 4);
  assert.match(page, /依預覽樣本日期自動整理/);
  assert.match(page, /官方資料來源尚在驗證中，完成後將提供申請、審議與掛牌進度。/);
  assert.doesNotMatch(page, /富味鄉|詠勝昌|因華|御頂|史坦賽薾/);
});

test("preview homepage keeps natural mobile order and exposes all required fixture fields", async () => {
  const page = await read("app/dev-preview/page.tsx");
  const orderedSections = [
    "className=\"preview-dashboard-hero\"",
    "aria-label=\"摘要指標\"",
    "id=\"revenue-summary\"",
    "id=\"bond-contracts\"",
    "id=\"important-dates\"",
    "id=\"timeline\"",
    "id=\"quick-links\"",
    "id=\"listing-progress\"",
    "id=\"data-sources\"",
  ];
  let previousIndex = -1;
  for (const section of orderedSections) {
    const index = page.indexOf(section);
    assert.ok(index > previousIndex, `${section} must follow the preceding mobile section`);
    previousIndex = index;
  }
  for (const field of [
    "companyCode",
    "companyName",
    "currentMonthRevenue",
    "monthOverMonthPercent",
    "yearOverYearPercent",
    "cumulativeYearOverYearPercent",
    "yearMonth",
    "shortName",
    "bondCode",
    "issuerName",
    "issueAmount",
    "outstandingAmount",
    "conversionStartDate",
    "conversionEndDate",
    "maturityDate",
    "secured",
  ]) {
    assert.match(page, new RegExp(field));
  }
  assert.match(page, /preview-table-region/);
  assert.match(page, /preview-card-list/);
  assert.match(page, /href="#important-dates"/);
  assert.match(page, /href="#data-sources"/);
});

test("preview emerging list uses the exact coverage title and required table plus mobile cards", async () => {
  const source = await read("app/dev-preview/emerging/page.tsx");
  assert.match(source, /興櫃月營收資料涵蓋公司/);
  assert.doesNotMatch(source, /完整名單/);
  for (const field of [
    "companyCode",
    "companyName",
    "industryName",
    "yearMonth",
    "currentMonthRevenue",
    "monthOverMonthPercent",
    "yearOverYearPercent",
    "cumulativeYearOverYearPercent",
  ]) {
    assert.match(source, new RegExp(field));
  }
  assert.match(source, /preview-table-scroll/);
  assert.match(source, /preview-card-list/);
});

test("preview detail pages expose required fixture-backed contract sections and unknown-id 404s", async () => {
  const [company, bond] = await Promise.all([
    read("app/dev-preview/emerging/[companyId]/page.tsx"),
    read("app/dev-preview/bonds/[bondId]/page.tsx"),
  ]);
  assert.match(company, /findPreviewCompany/);
  assert.match(company, /notFound\(\)/);
  assert.match(company, /currentMonthRevenue/);
  assert.match(company, /previousMonthRevenue/);
  assert.match(company, /priorYearMonthRevenue/);
  assert.match(company, /cumulativeRevenue/);
  assert.doesNotMatch(company, /12\s*個月|十二個月/);

  assert.match(bond, /findPreviewBond/);
  assert.match(bond, /notFound\(\)/);
  for (const field of [
    "issueAmount",
    "outstandingAmount",
    "issueDate",
    "listingDate",
    "maturityDate",
    "conversionStartDate",
    "conversionEndDate",
    "putDates",
    "putPrice",
    "securityDescription",
    "underwriter",
    "trustee",
    "outstandingChangeDate",
    "outstandingChangeReason",
  ]) {
    assert.match(bond, new RegExp(field));
  }
});

test("preview data loader guards development before raw fixture chunks and never uses snapshots", async () => {
  const loader = await read("lib/preview/loader.ts");
  const guardIndex = loader.indexOf("assertPreviewDevelopmentRuntime();");
  const rawImportIndex = loader.indexOf("?raw");
  assert.ok(guardIndex >= 0);
  assert.ok(rawImportIndex > guardIndex);
  assert.match(loader, /94025\/csv-minimal\.csv\?raw/);
  assert.match(loader, /94025\/metadata\.json\?raw/);
  assert.match(loader, /11406\/csv-minimal\.csv\?raw/);
  assert.match(loader, /11406\/metadata\.json\?raw/);
  assert.doesNotMatch(loader, /company-basic-snapshot|tpex-applicant-snapshot/);
  assert.doesNotMatch(loader, /node:fs|from\s+["']fs/);
});

test("preview styles keep the bond ledger horizontally scrollable without body overflow", async () => {
  const css = await read("app/dev-preview/preview.css");
  assert.match(css, /\.preview-root\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/s);
  assert.match(css, /\.preview-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media[\s\S]*\.preview-table-region\s*\{[^}]*display:\s*block/s);
  assert.match(css, /@media[\s\S]*\.preview-card-list\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.preview-bond-ledger-table\s*\{[^}]*min-width:\s*1540px/s);
  assert.match(css, /:focus-visible/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.preview-theme-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.preview-search-input\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.preview-root\[data-preview-theme="b"\] \.preview-panel-head h2[\s\S]*color:\s*var\(--preview-ink\)/);
  assert.match(css, /\.preview-root\[data-preview-theme="b"\] \.preview-source > a[\s\S]*color:\s*var\(--preview-navy\)/);
});

test("Theme B uses the exact approved tokens while Theme A retains its original palette", async () => {
  const css = (await read("app/dev-preview/preview.css")).toLowerCase();
  for (const token of [
    "#1a1918",
    "#3b3733",
    "#d99158",
    "#ffcb9c",
    "#242322",
    "#302e2b",
    "#fff8ed",
    "#d0c4b8",
    "#61584f",
    "#4a3428",
  ]) {
    assert.equal(css.includes(token), true, `missing Theme B token ${token}`);
  }
  for (const original of [
    "#292725",
    "#403b37",
    "#a85f32",
    "#7a3e20",
    "#f1e3d7",
    "#6d6761",
    "#d9d0c7",
  ]) {
    assert.equal(css.includes(original), true, `missing Theme A color ${original}`);
  }
  assert.match(css, /\[data-preview-theme="a"\]/);
  assert.match(css, /\[data-preview-theme="b"\]/);
});

test("Theme B small accents, primary links, banner and hero meet 4.5 to 1 contrast", async () => {
  const css = await read("app/dev-preview/preview.css");
  const paper = themeBColor(css, "var(--preview-paper)");
  const smallAccentSelectors = [
    ".preview-page-title span",
    ".preview-section-label",
    ".preview-entry-card b",
    ".preview-bond-card-head span",
    ".preview-table a:hover",
    ".preview-source > div > span",
  ];
  for (const selector of smallAccentSelectors) {
    const declared = cssDeclaration(css, selector, "color");
    assert.equal(declared, "var(--preview-teal-dark)", selector);
    assert.ok(contrastRatio(themeBColor(css, declared), paper) >= 4.5, `${selector} must meet 4.5:1 on Theme B paper`);
  }

  const sourceLinkForeground = themeBColor(
    css,
    cssDeclaration(css, ".preview-source > a", "color"),
  );
  const sourceLinkBackground = themeBColor(
    css,
    cssDeclaration(css, ".preview-source > a", "background"),
  );
  assert.ok(
    contrastRatio(sourceLinkForeground, sourceLinkBackground) >= 4.5,
    "official source link must meet 4.5:1",
  );

  const bannerForeground = themeBColor(
    css,
    cssDeclaration(css, ".preview-banner > span", "color"),
  );
  const bannerBackground = themeBColor(
    css,
    cssDeclaration(css, ".preview-banner > span", "background"),
  );
  assert.ok(
    contrastRatio(bannerForeground, bannerBackground) >= 4.5,
    "DEV banner badge must meet 4.5:1",
  );
  assert.match(
    cssRule(css, ".preview-banner > span"),
    /border:[^;]*var\(--preview-amber\)/,
  );

  const heroForeground = themeBColor(
    css,
    cssDeclaration(css, ".preview-dashboard-hero .preview-section-label", "color"),
  );
  for (const heroBackground of ["var(--preview-navy)", "var(--preview-navy-soft)"]) {
    assert.ok(
      contrastRatio(heroForeground, themeBColor(css, heroBackground)) >= 4.5,
      `hero label must meet 4.5:1 on ${heroBackground}`,
    );
  }
});

test("preview sources contain no network calls, API routes or prohibited decision surfaces", async () => {
  const files = [
    ...await filesUnder("app/dev-preview"),
    ...await filesUnder("lib/preview"),
  ];
  const source = (await Promise.all(files.map(read))).join("\n");
  const networkCall = ["fe", "tch("].join("");
  assert.equal(source.includes(networkCall), false);
  assert.doesNotMatch(source, /Yahoo|CBAS|broker/i);
  for (const phrase of [
    ["成交", "價"].join(""),
    ["買賣", "價"].join(""),
    ["成交", "量"].join(""),
    ["漲", "跌"].join(""),
    ["折溢", "價"].join(""),
    ["轉換", "價值"].join(""),
    ["理論", "價"].join(""),
    ["套", "利"].join(""),
    ["建", "議"].join(""),
  ]) {
    assert.equal(source.includes(phrase), false, phrase);
  }
});

test("preview pages show source attribution, fetched time and fixture status", async () => {
  const pages = await Promise.all([
    read("app/dev-preview/page.tsx"),
    read("app/dev-preview/emerging/page.tsx"),
    read("app/dev-preview/emerging/[companyId]/page.tsx"),
    read("app/dev-preview/bonds/page.tsx"),
    read("app/dev-preview/bonds/[bondId]/page.tsx"),
  ]);
  const source = pages.join("\n");
  assert.match(source, /SourceAttribution/);
  assert.match(source, /fetchedAt/);
  assert.match(source, /測試樣本/);
});

test("dashboard transparency is fixture-scoped and contains no fake listing or market surface", async () => {
  const [page, dashboard] = await Promise.all([
    read("app/dev-preview/page.tsx"),
    read("lib/preview/dashboard.ts"),
  ]);
  const source = `${page}\n${dashboard}`;
  assert.match(page, /datasetName/);
  assert.match(page, /companies\.length/);
  assert.match(page, /bonds\.length/);
  assert.match(page, /fetchedAt/);
  assert.match(page, /licenseName/);
  assert.match(page, /正式版資料仍以官方來源為準/);
  assert.doesNotMatch(source, /\bDate\.now\b|new Date\(\)/);
  assert.doesNotMatch(source, /Yahoo|CBAS|broker/i);
});
