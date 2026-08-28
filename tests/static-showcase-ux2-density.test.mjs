import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);
const tableHeader = (html) => html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1] ?? "";

test("UX 2.0 將資料日期保留在頁面更新狀態，而非每一列的重複欄位", async () => {
  const [ipoRadar, bonds, emerging] = await Promise.all([
    readFile(new URL("ipo-radar.html", root), "utf8"),
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("emerging.html", root), "utf8"),
  ]);

  for (const html of [ipoRadar, bonds, emerging]) {
    assert.match(html, /update-status/);
    assert.doesNotMatch(tableHeader(html), /資料日期/);
  }
});
