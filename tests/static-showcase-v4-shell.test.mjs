import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);

async function readShowcaseFile(path) {
  return readFile(new URL(path, showcaseRoot), "utf8");
}

test("V4 primary shell prioritizes four public research destinations", async () => {
  const [shell, pages] = await Promise.all([
    readShowcaseFile("assets/site-shell.js"),
    Promise.all(["index.html", "emerging.html", "ipo-radar.html", "ipo.html", "ipo-offering.html", "bonds.html", "company.html"]
      .map(readShowcaseFile)),
  ]);

  assert.match(shell, /label: "首頁"/);
  assert.match(shell, /label: "興櫃"/);
  assert.match(shell, /label: "IPO"/);
  assert.match(shell, /label: "可轉債"/);
  assert.doesNotMatch(shell, /label: "資料中心"/);
  assert.match(shell, /label: "更多"/);

  for (const html of pages) {
    const navigation = html.match(/<nav id="primary-navigation"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(navigation, />首頁</);
    assert.match(navigation, />興櫃</);
    assert.match(navigation, />IPO</);
    assert.match(navigation, />可轉債</);
    assert.doesNotMatch(navigation, />資料中心</);
    assert.match(html, /data-public-footer/);
  }
});

test("V4 uses one accessible product token system and keeps operational monitoring outside navigation", async () => {
  const [css, systemStatus, dataCenter] = await Promise.all([
    readShowcaseFile("assets/app.css"),
    readShowcaseFile("system-status.html"),
    readShowcaseFile("data-center.html"),
  ]);

  for (const token of [
    "--font-sans", "--color-bg", "--color-surface", "--color-text", "--color-primary",
    "--space-4", "--radius-card", "--table-row-height",
  ]) assert.match(css, new RegExp(`${token}:`));
  assert.match(css, /Noto Sans TC/);
  assert.match(css, /\.site-header\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /:focus-visible/);
  assert.match(systemStatus, /<meta[^>]+name="robots"[^>]+noindex/);
  assert.match(systemStatus, /系統資料狀態/);
  assert.match(dataCenter, /system-status\.html|系統資料狀態/);
});
