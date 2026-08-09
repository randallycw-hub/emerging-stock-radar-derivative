import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../static-showcase/ipo-radar.html", import.meta.url);
const calendarHtmlPath = new URL("../static-showcase/ipo.html", import.meta.url);
const pagePath = new URL("../static-showcase/assets/ipo-radar-page.js", import.meta.url);
const dataPath = new URL("../static-showcase/assets/ipo-data.js", import.meta.url);

test("IPO radar page exposes filters, sorting, and responsive views", async () => {
  const [html, js] = await Promise.all([readFile(htmlPath, "utf8"), readFile(pagePath, "utf8")]);
  for (const text of ["IPO 進度雷達", "近期重要事件", "A 送件觀察", "B 審議進程", "C 契約／時程", "D 定價／掛牌"]) {
    assert.match(html, new RegExp(text));
  }
  for (const id of ["ipo-radar-search", "ipo-radar-market", "ipo-radar-stage", "ipo-radar-sort-field", "ipo-radar-sort-direction", "ipo-radar-table-body", "ipo-radar-pagination"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /assets\/ipo-radar-page\.js/);
  assert.match(js, /loadIpoSnapshot/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(js, /data-radar-sort/);
  assert.match(js, /popstate/);
  assert.match(js, /state\.stage === "AB"/);
  assert.match(html, /data-page-error/);
  assert.match(js, /#ipo-radar-card-list"\)\.innerHTML = visible\.length \? visible\.map\(cardHtml\)\.join\(""\) : emptyCard\(\)/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /behavior: matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
  assert.doesNotMatch(`${html}\n${js}`, /成交價|漲跌幅|週漲跌|波動價差|資料方法|擷取版本|官方快照/);
});

test("IPO loader reads the API snapshot when it is available", async () => {
  globalThis.location = new URL("https://market.example/ipo-radar.html");
  const { loadIpoSnapshot } = await import(`${dataPath.href}?api-test=1`);
  const snapshot = { schemaVersion: 1, records: [{ companyCode: "1234" }] };
  let requestedUrl;
  const result = await loadIpoSnapshot({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers.Accept, "application/json");
      return { ok: true, json: async () => snapshot };
    },
  });
  assert.equal(requestedUrl.pathname, "/api/ipo-events");
  assert.deepEqual(result, snapshot);
  assert.equal(await loadIpoSnapshot({ fetchImpl: async () => ({ ok: false }) }), null);
  assert.equal(await loadIpoSnapshot({ fetchImpl: async () => ({ ok: true, json: async () => ({ schemaVersion: 2, records: [] }) }) }), null);
});

test("IPO loader falls back to the published static snapshot when the API is unavailable", async () => {
  globalThis.location = new URL("https://market.example/market-site/ipo-radar.html");
  const { loadIpoSnapshot } = await import(`${dataPath.href}?fallback-test=1`);
  const snapshot = { schemaVersion: 1, dataDate: "2026-07-31", records: [{ companyCode: "1234", companyName: "測試公司" }] };
  const requested = [];
  const result = await loadIpoSnapshot({
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      requested.push(pathname);
      if (pathname === "/api/ipo-events") return { ok: false, status: 503 };
      if (pathname === "/market-site/data/current.json") return { ok: true, json: async () => ({ runtimeUrl: "./data/generations/test/runtime.json" }) };
      if (pathname === "/market-site/data/generations/test/runtime.json") return { ok: true, json: async () => ({ ipoEventsUrl: "./data/generations/test/ipo-events.json" }) };
      if (pathname === "/market-site/data/generations/test/ipo-events.json") return { ok: true, json: async () => snapshot };
      throw new Error(`unexpected request ${pathname}`);
    },
  });
  assert.deepEqual(result, snapshot);
  assert.deepEqual(requested, [
    "/api/ipo-events",
    "/market-site/data/current.json",
    "/market-site/data/generations/test/runtime.json",
    "/market-site/data/generations/test/ipo-events.json",
  ]);
});

test("IPO pages expose the shared dashboard panel contract", async () => {
  const [radarHtml, calendarHtml] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(calendarHtmlPath, "utf8"),
  ]);
  for (const [name, html] of [["radar", radarHtml], ["calendar", calendarHtml]]) {
    assert.match(html, /data-ipo-dashboard/, name);
    assert.match(html, /data-ipo-summary/, name);
    assert.match(html, /data-ipo-data-status/, name);
    assert.match(html, /data-ipo-responsive-cards/, name);
    assert.match(html, /aria-sort="none"/, name);
  }
  assert.match(calendarHtml, /data-ipo-stage-count/);
  assert.match(radarHtml, /data-ipo-stage-filter/);
});
