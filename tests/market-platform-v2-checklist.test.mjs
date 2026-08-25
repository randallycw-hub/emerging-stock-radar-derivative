import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const checklistUrl = new URL("../docs/market-platform-v2-completion-checklist.md", import.meta.url);

test("PDF release checklist records the known feature gaps instead of overstating completion", async () => {
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

  assert.match(checklist, /部分完成/);
  assert.match(checklist, /待實作/);
  assert.match(checklist, /來源核准阻塞/);
  assert.doesNotMatch(checklist, /所有 requirement 已完成|全部完成/);
});
