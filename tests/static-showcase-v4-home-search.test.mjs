import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { isGlobalSearchShortcut } from "../static-showcase/assets/site-search.js";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);

async function readShowcaseFile(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

test("V5.2 首頁保留研究工作台且移除重複 Hero 搜尋入口", async () => {
  const [home, css] = await Promise.all([
    readShowcaseFile("index.html"),
    readShowcaseFile("assets/app.css"),
  ]);

  assert.doesNotMatch(home, /id="home-primary-search"/);
  assert.match(home, /id="home-today-changes"/);
  assert.match(home, /class="home-v51-workbench-section"/);
  assert.match(home, /HOME_V51_WORKBENCH/);
  assert.doesNotMatch(home, /class="market-module/);
  assert.match(css, /\.home-today-grid/);
  assert.match(css, /\.home-v51-start-grid/);
  assert.match(css, /\.home-v51-workbench/);
});

test("V5.2 全站搜尋只有 Header 元件並支援 Ctrl 或 Cmd 加 K", async () => {
  const [search, home] = await Promise.all([
    readShowcaseFile("assets/site-search.js"),
    readShowcaseFile("index.html"),
  ]);

  assert.match(search, /搜尋公司、股票代碼、CB/);
  assert.match(search, /isGlobalSearchShortcut/);
  assert.match(search, /header\.querySelector\("\[data-site-search\]"\)/);
  assert.equal(isGlobalSearchShortcut({ key: "k", ctrlKey: true, metaKey: false, altKey: false }), true);
  assert.equal(isGlobalSearchShortcut({ key: "K", ctrlKey: false, metaKey: true, altKey: false }), true);
  assert.equal(isGlobalSearchShortcut({ key: "k", ctrlKey: false, metaKey: false, altKey: false }), false);
  assert.doesNotMatch(home, /搜尋公司、股票代碼、CB/);
});
