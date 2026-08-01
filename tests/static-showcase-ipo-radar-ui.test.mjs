import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const htmlPath = new URL("../static-showcase/ipo-radar.html", import.meta.url);
const pagePath = new URL("../static-showcase/assets/ipo-radar-page.js", import.meta.url);
const dataPath = new URL("../static-showcase/assets/ipo-data.js", import.meta.url);

test("IPO 雷達頁提供進度導向的骨架與互動入口", async () => {
  const [html, js] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(pagePath, "utf8"),
  ]);

  for (const text of ["IPO 進度雷達", "近期重要事件", "A 送件觀察", "B 審議進程", "C 契約／時程", "D 定價／掛牌"]) {
    assert.match(html, new RegExp(text));
  }
  assert.match(html, /assets\/ipo-radar-page\.js/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /data-radar-sort/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /popstate/);
  assert.match(js, /state\.stage === "AB"/);
  assert.match(html, /data-page-error/);
  assert.doesNotMatch(`${html}\n${js}`, /成交價|漲跌幅|週漲跌|波動價差|資料方法|擷取版本|官方快照/);
});

test("IPO 共用載入器只接受有效的官方事件快照", async () => {
  globalThis.location = new URL("https://market.example/ipo-radar.html");
  const { loadIpoSnapshot } = await import(dataPath.href);
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

test("IPO 雷達頁不內嵌測試公司或假資料", async () => {
  const [html, js] = await Promise.all([readFile(htmlPath, "utf8"), readFile(pagePath, "utf8")]);
  assert.doesNotMatch(`${html}\n${js}`, /測試公司|假資料/);
});

test("IPO 雷達在行動卡片區保留空狀態並尊重減少動態效果", async () => {
  const js = await readFile(pagePath, "utf8");

  assert.match(js, /#ipo-radar-card-list"\)\.innerHTML = visible\.length \? visible\.map\(cardHtml\)\.join\(""\) : emptyCard\(\)/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /behavior: matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches \? "auto" : "smooth"/);
});
