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
  const [layout, components] = await Promise.all([
    read("app/dev-preview/layout.tsx"),
    read("app/dev-preview/_components/PreviewUi.tsx"),
  ]);
  const source = `${layout}\n${components}`;
  assert.match(source, /興債觀測網/);
  assert.match(source, /興櫃公司、可轉債與上市櫃進度資訊/);
  assert.match(
    source,
    /開發預覽版：目前畫面使用經最小化的測試樣本，不代表完整或最新市場資料。/,
  );
  assert.match(layout, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/s);
  assert.match(layout, /notFound\(\)/);
  assert.match(layout, /isPreviewDevelopmentRuntime/);
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

test("preview styles keep tables locally scrollable and switch to cards without body overflow", async () => {
  const css = await read("app/dev-preview/preview.css");
  assert.match(css, /\.preview-root\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/s);
  assert.match(css, /\.preview-table-scroll\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /@media[\s\S]*\.preview-table-region\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media[\s\S]*\.preview-card-list\s*\{[^}]*display:\s*grid/s);
});

test("preview sources contain no network calls, API routes or prohibited decision surfaces", async () => {
  const files = [
    ...await filesUnder("app/dev-preview"),
    ...await filesUnder("lib/preview"),
  ];
  const source = (await Promise.all(files.map(read))).join("\n");
  const networkCall = ["fe", "tch("].join("");
  assert.equal(source.includes(networkCall), false);
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
