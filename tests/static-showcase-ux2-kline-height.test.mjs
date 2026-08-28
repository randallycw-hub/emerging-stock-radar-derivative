import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("UX 2.0 K 線桌面繪圖區使用 520px 高度，行動版維持至少 360px", async () => {
  const source = await readFile(new URL("../static-showcase/assets/klinechart-adapter.js", import.meta.url), "utf8");

  assert.match(source, /const paneHeight = typeof window !== "undefined" && window\.matchMedia\("\(max-width: 768px\)"\)\.matches \? 360 : 520/);
  assert.match(source, /layout: \{ pane: \{ height: paneHeight, minHeight: 180 \} \}/);
});
