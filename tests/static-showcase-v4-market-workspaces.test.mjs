import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);
const read = (path) => readFile(new URL(path, showcaseRoot), "utf8");

test("V5 興櫃以緊湊研究分頁串接同一份市場資料", async () => {
  const [html, script] = await Promise.all([
    read("emerging.html"),
    read("assets/emerging-page.js"),
  ]);

  for (const label of ["市場概況", "漲跌排行", "成交排行", "月營收", "全部公司"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  for (const view of ["summary", "price", "volume", "revenue", "all"]) {
    assert.match(html, new RegExp(`data-emerging-view="${view}"`));
  }
  assert.match(script, /viewAliases/);
  assert.match(script, /state\.view === "price"/);
  assert.match(script, /state\.view === "volume"/);
  assert.match(script, /marketDetailHref/);
});

test("V5 IPO 將進度、時程與競拍申購維持同一產品群組", async () => {
  const pages = await Promise.all(["ipo-radar.html", "ipo.html", "ipo-offering.html"].map(read));
  for (const html of pages) {
    assert.match(html, /class="ipo-context-nav bond-context-nav"/);
    assert.match(html, />進度</);
    assert.match(html, />時程</);
    assert.match(html, />競拍與申購</);
    assert.match(html, /href="\.\/ipo-radar\.html"/);
    assert.match(html, /href="\.\/ipo\.html"/);
    assert.match(html, /href="\.\/ipo-offering\.html"/);
  }
  assert.doesNotMatch(pages.join("\n"), /送件待審\s*154/);
});
