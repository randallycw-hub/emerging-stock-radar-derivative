import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);

async function readShowcase(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

test("UX 2.0 提供獨立市場事件入口與可存取的互動骨架", async () => {
  const [html, script, shell, staging] = await Promise.all([
    readShowcase("events.html"),
    readShowcase("assets/market-events-page.js"),
    readShowcase("assets/site-shell.js"),
    readFile(new URL("../scripts/stage-static-showcase.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<h1>市場事件<\/h1>/);
  assert.match(html, /data-event-metric="today"/);
  assert.match(html, /data-event-view="calendar"/);
  assert.match(html, /id="market-event-list"/);
  assert.match(html, /id="market-event-drawer"/);
  assert.match(html, /data-market-event-custom-range/);
  assert.match(html, /href="\.\/events\.html"/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /groupMarketEventsByEntity/);
  assert.match(script, /aria-expanded/);
  assert.match(shell, /label: "市場事件"/);
  assert.match(staging, /"events\.html"/);
  assert.match(staging, /"market-events-page\.js"/);
});

test("UX 2.0 公開事件前台不輸出內部資料診斷欄位", async () => {
  const [html, script, model] = await Promise.all([
    readShowcase("events.html"),
    readShowcase("assets/market-events-page.js"),
    readShowcase("assets/market-event-model.js"),
  ]);
  const publicSurface = `${html}\n${script}\n${model}`;

  for (const internalTerm of ["sourceId", "missingReason", "diagnostics", "assessment", "dataQuality"]) {
    assert.doesNotMatch(publicSurface, new RegExp(internalTerm, "i"));
  }
});
