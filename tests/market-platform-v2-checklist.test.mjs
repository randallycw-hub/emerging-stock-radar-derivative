import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checklistUrl = new URL("../docs/market-platform-v2-completion-checklist.md", import.meta.url);

test("PDF release checklist records the completed public scope and explicit source boundaries", async () => {
  const checklist = await readFile(checklistUrl, "utf8");

  for (const item of [
    "首頁總覽",
    "IPO 競拍／申購",
    "CB 分類",
    "CB 個券",
    "資料中心",
    "最終驗收",
  ]) {
    assert.match(checklist, new RegExp(`\\| ${item} \\|`));
  }

  assert.match(checklist, /已完成（待發布）/);
  assert.match(checklist, /公開 JSON/);
  assert.match(checklist, /來源核准阻塞/);
  assert.match(checklist, /IPO 競拍／申購/);
  assert.doesNotMatch(checklist, /所有 requirement 已完成|全部完成/);
});
