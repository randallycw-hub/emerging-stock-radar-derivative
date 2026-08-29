import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCompanyOverview, parseCompanyTab } from "../static-showcase/assets/company-overview.js";

test("V5.2 公司頁以正規主檔、營收、IPO、可轉債與公開事件組織資料", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("../static-showcase/company.html", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/company-overview.js", import.meta.url), "utf8"),
  ]);
  for (const label of ["概覽", "營收", "IPO／事件", "可轉債", "公開事件"]) {
    assert.match(script, new RegExp(`>${label}<`));
  }
  assert.match(script, /data-company-panel/);
  assert.match(html, /公司研究/);
  assert.doesNotMatch(html + script, /來源 ID|缺漏原因|待確認/);
});

test("V4 公司事件只投影已公開的標籤、日期與市場", () => {
  const overview = buildCompanyOverview({
    code: "1234",
    companyMaster: [{ stockCode: "1234", companyName: "公開公司", market: "上市", industry: "電子業", cbCodes: ["12341"], cbNames: ["公開一"], aliases: [], ipoStage: null, dataDate: "2026-08-20" }],
    ipo: [{ companyCode: "1234", companyName: "公開公司", stage: "C", events: [{ label: "審議", date: "2026-08-20", sourceId: "private" }] }],
    workbench: [{ status: "active", term: { issuerCode: "1234", bondCode: "12341", bondName: "公開一" }, events: [{ label: "到期", date: "2026-09-01", sourceId: "private" }] }],
  });
  assert.deepEqual(overview.events, [
    { market: "IPO", label: "審議", date: "2026-08-20" },
    { market: "CB", label: "到期", date: "2026-09-01" },
  ]);
  assert.equal(JSON.stringify(overview.events).includes("sourceId"), false);
});

test("V5.2 公司頁維持舊 IPO／CB 分頁網址並導向對應的公開資料分頁", () => {
  assert.equal(parseCompanyTab("ipo"), "ipo-events");
  assert.equal(parseCompanyTab("bonds"), "bonds");
  assert.equal(parseCompanyTab("events"), "events");
  assert.equal(parseCompanyTab("unknown"), "overview");
});

test("V4 IPO 與 CB 清單都提供公司整合頁入口", async () => {
  const [radar, timeline, offering, bonds, routes] = await Promise.all([
    readFile(new URL("../static-showcase/assets/ipo-radar-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/ipo-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/ipo-offering-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/bonds-page.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/ipo-stage-filter.js", import.meta.url), "utf8"),
  ]);
  assert.match(radar, /publicCompanyHref/);
  assert.match(timeline, /publicCompanyHref/);
  assert.match(routes, /company\.html\?code/);
  assert.match(offering, /company\.html\?code/);
  assert.match(bonds, /company\.html\?code/);
});
