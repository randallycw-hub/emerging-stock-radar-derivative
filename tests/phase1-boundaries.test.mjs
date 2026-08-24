import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { PUBLIC_PRIMARY_NAVIGATION } from "../static-showcase/assets/site-shell.js";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["app", "lib", "worker", "db", "scripts", "public"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".json", ".css", ".html", ".svg"]);
const rootFormalFiles = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "vite.config.ts",
  "postcss.config.mjs",
  "eslint.config.mjs",
  "tsconfig.json",
];
const fixtureRoot = "tests/fixtures/phase1-guardrails";
const privateImportRoot = "lib/private-cb-import/";

async function filesUnder(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(child);
  }
  return files;
}

export async function assertNoProhibitedMarketFeatures(files) {
  const provider = ["Ya", "hoo"].join("");
  const violations = [];

  for (const relativePath of files) {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    const source = (await readFile(path.join(root, relativePath), "utf8"))
      .replaceAll("paidInCapital", "");

    if (/\/api\/(?:market|quote|yahoo|cbas)(?:\/|$)/i.test(normalizedPath)) {
      violations.push(`${normalizedPath}: prohibited route`);
    }
    if (/\/adapters\/[^/]*(?:market|quote|yahoo|cbas|broker|proxy)/i.test(normalizedPath)) {
      violations.push(`${normalizedPath}: prohibited adapter`);
    }
    if (new RegExp(provider, "i").test(source)) {
      violations.push(`${normalizedPath}: prohibited provider`);
    }
    if (/\bcbas\b|cbas\./i.test(source)) {
      violations.push(`${normalizedPath}: prohibited CBAS dependency`);
    }
    if (/https?:\/\/[^"'`\s]*(?:broker|券商)[^"'`\s]*|(?:broker|proxy)[A-Za-z_$\w-]*(?:fallback|market)|(?:fallback)[A-Za-z_$\w-]*(?:broker|proxy)/i.test(source)) {
      violations.push(`${normalizedPath}: prohibited broker or proxy fallback`);
    }
    const isClientCode = /^[\s\S]*["']use client["']/i.test(source);
    const hasOfficialOpenApiUrl = /https:\/\/[^"'`\s]+\/openapi\//i.test(source)
      || (/https:\/\/(?:www\.)?(?:tpex|twse)\.org\.tw/i.test(source) && /\bopenapi\b/i.test(source));
    if (isClientCode && hasOfficialOpenApiUrl) {
      violations.push(`${normalizedPath}: client code must not call an official OpenAPI directly`);
    }
    if (/\bnew\s+(?:WebSocket|EventSource)\s*\(/.test(source)) {
      violations.push(`${normalizedPath}: prohibited realtime transport`);
    }
    if (/\bsetInterval\s*\(/.test(source) && (
      /(?:market|quote|realtime)/i.test(source)
      || /\bsetInterval\s*\([\s\S]{0,250}(?:refresh|fetch|poll|load)[A-Za-z_$\w]*(?:data|snapshot)/i.test(source)
    )) {
      violations.push(`${normalizedPath}: prohibited realtime polling`);
    }
    if (/(?:emerging|興櫃)/i.test(normalizedPath) || /\bEmerging[A-Za-z_$\w]*\b/.test(source)) {
      if (/\bclosePrice\b/.test(source)) {
        violations.push(`${normalizedPath}: emerging end-of-day average must not use closePrice`);
      }
    }
  }

  assert.deepEqual([...new Set(violations)], []);
}

test("formal code has no banned provider, source path, fallback, realtime transport, or emerging closePrice", async () => {
  const files = [
    ...(await Promise.all(sourceRoots.map(filesUnder))).flat(),
    ...rootFormalFiles,
  ].filter((relativePath) => !relativePath.replaceAll("\\", "/").startsWith(privateImportRoot));
  await assertNoProhibitedMarketFeatures(files);
});

test("private CB import code is local-only and never opens a network or process boundary", async () => {
  const files = await filesUnder(privateImportRoot);
  assert.ok(files.length > 0);
  for (const relativePath of files) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /https?:\/\/|\bfetch\s*\(|\bXMLHttpRequest\b|\b(?:WebSocket|EventSource)\b|node:child_process/);
  }
});

test("permits approved end-of-day and contractual price field names", async () => {
  await assert.doesNotReject(
    assertNoProhibitedMarketFeatures([path.join(fixtureRoot, "allowed-fields.txt")]),
  );
});

test("rejects explicitly banned provider, fallback, client OpenAPI, and realtime patterns", async () => {
  const prohibitedFixtures = [
    "yahoo-dependency.txt",
    "cbas-dependency.txt",
    "broker-dependency.txt",
    "broker-proxy-fallback.txt",
    "frontend-openapi.txt",
    "frontend-openapi-template.txt",
    "frontend-openapi-indirect.txt",
    "realtime-socket.txt",
    "realtime-polling.txt",
    "realtime-polling-semantic.txt",
    "emerging-close-price.txt",
  ];

  for (const fixture of prohibitedFixtures) {
    await assert.rejects(
      assertNoProhibitedMarketFeatures([path.join(fixtureRoot, fixture)]),
      undefined,
      fixture,
    );
  }
});

test("uses only the approved formal brand and fixed subtitle", async () => {
  const formalBrandFiles = [
    "app/layout.tsx",
    "app/manifest.ts",
    "app/Dashboard.tsx",
    "app/LegalPage.tsx",
    "README.md",
    "package.json",
  ];
  const sources = await Promise.all(
    formalBrandFiles.map((file) => readFile(path.join(root, file), "utf8")),
  );

  for (const source of sources) {
    assert.match(source, /興債觀測網/);
    assert.match(source, /興櫃公司、可轉債與上市櫃進度資訊/);
    assert.doesNotMatch(source, /興櫃雷達|台灣興櫃與可轉債事件雷達/);
  }

  const appSources = await Promise.all(
    (await filesUnder("app")).map((file) => readFile(path.join(root, file), "utf8")),
  );
  for (const source of appSources) {
    assert.doesNotMatch(source, /興櫃雷達|台灣興櫃與可轉債事件雷達/);
  }
});

test("does not retain unused market-price UI selectors", async () => {
  const stylesheet = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.doesNotMatch(stylesheet, /\.price-cell\b/);
  assert.doesNotMatch(stylesheet, /\.quote-(?:clock|source-bar|panel)\b/);
});

test("V2 public navigation and presentation vocabulary stay research-only", async () => {
  assert.deepEqual(PUBLIC_PRIMARY_NAVIGATION.map((item) => item.label), [
    "首頁",
    "興櫃市場",
    "IPO",
    "可轉債",
    "資料中心",
  ]);

  const publicFiles = await filesUnder("static-showcase");
  const publicSource = await Promise.all(
    publicFiles.map((file) => readFile(path.join(root, file), "utf8")),
  );
  assert.doesNotMatch(publicSource.join("\n"), /快速策略|綜合健診|強勢推薦|今日推薦/);
});
