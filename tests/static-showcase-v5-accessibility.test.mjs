import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);
const publicPages = [
  "index.html",
  "company.html",
  "emerging.html",
  "ipo.html",
  "ipo-radar.html",
  "bonds.html",
];

test("V5 public pages carry route-specific canonical metadata without internal diagnostic wording", async () => {
  for (const page of publicPages) {
    const html = await readFile(new URL(page, root), "utf8");
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://emerging-stock-radar-derivative-20260720\\.chiayu333\\.chatgpt\\.site/market-site/${page === "index.html" ? "" : page}">`));
    assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|目前無核准公開資料／待確認/);
  }
});

test("V5.2 primary controls preserve visible focus and dynamic status accessibility", async () => {
  const css = await readFile(new URL("assets/app.css", root), "utf8");
  const [detail, company] = await Promise.all([
    readFile(new URL("assets/bond-detail-page.js", root), "utf8"),
    readFile(new URL("assets/company-overview.js", root), "utf8"),
  ]);

  assert.match(css, /:focus-visible/);
  assert.match(detail, /aria-live="polite"/);
  assert.doesNotMatch(company, /data-company-chart-bond|klinechart|MACD|RSI|KDJ|BOLL/i);
});
