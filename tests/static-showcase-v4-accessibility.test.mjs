import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("V5 頁尾提供人類可讀的使用、方法、更新、免責與隱私入口", async () => {
  const [shell, methodology] = await Promise.all([
    readFile(new URL("assets/site-shell.js", root), "utf8"),
    readFile(new URL("methodology.html", root), "utf8"),
  ]);
  for (const label of ["如何使用", "資料與方法", "更新紀錄", "關於本站", "意見回饋", "免責聲明", "隱私權"]) {
    assert.match(shell, new RegExp(`>${label}<`));
  }
  for (const id of ["methodology", "usage", "updates", "disclaimer", "privacy"]) {
    assert.match(methodology, new RegExp(`id=\"${id}\"`));
  }
});

test("V4 小螢幕維持可觸及操作與不溢出的研究控制列", async () => {
  const css = await readFile(new URL("assets/app.css", root), "utf8");
  assert.match(css, /@media \(max-width: 1280px\)/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.mobile-bottom-navigation a \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.view-tabs,\s*\.bond-context-nav,\s*\.ipo-context-nav \{[\s\S]*?overflow-x: auto/);
  assert.match(css, /\.view-tabs button,\s*\.bond-context-nav a,\s*\.ipo-context-nav a \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.skip-link,\s*\.site-mark,\s*\.nav-toggle \{[\s\S]*?min-height: 44px/);
  assert.match(css, /\.home-research-panel \.section-heading a,\s*\.home-compact-event,\s*\.home-cb-quick a,\s*\.public-footer a \{[\s\S]*?min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.ok(css.lastIndexOf("@media (max-width: 900px)") > css.lastIndexOf("@media (max-width: 1280px)"), "較窄的行動版規則必須覆寫 1280px 版面規則");
});
