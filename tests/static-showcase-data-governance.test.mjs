import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectDatasetHealth } from "../static-showcase/assets/data-center-page.js";

test("資料中心只呈現公開可理解的更新與檢核摘要", async () => {
  const [html, script, statusModule] = await Promise.all([
    readFile(new URL("../static-showcase/data-center.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/data-center-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/data-center-status.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["最後完整更新", "公開資料檢核", "資料狀態說明"]) assert.match(statusModule, new RegExp(label));
  assert.match(script, /chooseStatusSnapshot/);
  assert.doesNotMatch(html + script + statusModule, /來源 ID|缺漏原因|response_hash|sha256/);
});

test("資料中心僅投影可理解的公開資料狀態與更新日期", () => {
  const rows = projectDatasetHealth({
    emergingMarketUrl: "./emerging-market.json",
    ipoEventsUrl: "./ipo-events.json",
    datasets: { bondWorkbench: "./bond-workbench.json", "94025": "./94025.json" },
  }, { market: { dataDate: "2026-08-26" } });
  assert.deepEqual(rows, [
    { label: "興櫃盤後", source: "TPEx", status: "已發布", dataDate: "2026-08-26" },
    { label: "IPO 公開時程", source: "TWSE／TPEx", status: "已發布", dataDate: "2026-08-26" },
    { label: "可轉債", source: "TPEx", status: "已發布", dataDate: "2026-08-26" },
    { label: "月營收", source: "公開資訊觀測站", status: "已發布", dataDate: "2026-08-26" },
  ]);
  assert.equal(JSON.stringify(rows).includes("bondWorkbench"), false);
});

test("資料中心頁面提供資料集狀態與更新紀錄，且不含內部診斷欄位", async () => {
  const [html, script, statusModule] = await Promise.all([
    readFile(new URL("../static-showcase/data-center.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/data-center-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/data-center-status.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="data-center-static-summary"/);
  assert.match(html, /id="data-center-bootstrap"/);
  assert.match(statusModule, /Dataset Health/);
  assert.match(statusModule, /更新紀錄/);
  assert.doesNotMatch(html + script + statusModule, /sourceId|missingReasons|approved_cb_history|目前無核准公開資料|待確認/);
});

test("方法論定義來源優先、衝突處理與資料刷新邊界", async () => {
  const html = await readFile(new URL("../static-showcase/methodology.html", import.meta.url), "utf8");
  for (const label of ["來源優先順序", "資料衝突處理", "更新時程", "公開資料邊界"]) assert.match(html, new RegExp(label));
  assert.doesNotMatch(html, /來源 ID|缺漏原因|sha256/);
});
