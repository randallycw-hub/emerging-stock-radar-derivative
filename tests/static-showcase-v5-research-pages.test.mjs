import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("V5 research pages use compact product labels and only known IPO time windows", async () => {
  const [emerging, radar, calendar, bonds, calendarScript] = await Promise.all([
    readFile(new URL("emerging.html", root), "utf8"),
    readFile(new URL("ipo-radar.html", root), "utf8"),
    readFile(new URL("ipo.html", root), "utf8"),
    readFile(new URL("bonds.html", root), "utf8"),
    readFile(new URL("assets/ipo-page.js", root), "utf8"),
  ]);

  for (const label of ["市場概況", "漲跌排行", "成交排行", "全部公司"]) {
    assert.match(emerging, new RegExp(`>${label}<`));
  }
  for (const [page, label] of [[radar, "進度"], [calendar, "時程"], [calendar, "競拍與申購"]]) {
    assert.match(page, new RegExp(`>${label}<`));
  }
  for (const value of ["week", "next-week", "30-days", "all"]) {
    assert.match(calendar, new RegExp(`data-ipo-date-filter="${value}"`));
  }
  assert.match(bonds, /5\/6 位代碼、債券名稱或發行人/);
  assert.match(calendarScript, /dateRange/);
  assert.doesNotMatch(`${radar}\n${calendar}\n${calendarScript}`, /預估價格|推估日期/);
});

test("V5 IPO date range retains only formally recorded events in the selected window", async () => {
  const { filterIpoCalendarRows } = await import("../static-showcase/assets/ipo-page.js");
  const rows = [
    { companyCode: "1111", companyName: "甲", underwriter: "", market: "上市", stage: "A", events: [{ kind: "submission", date: "2026-08-26" }] },
    { companyCode: "2222", companyName: "乙", underwriter: "", market: "上櫃", stage: "B", events: [{ kind: "review", date: "2026-09-03" }] },
    { companyCode: "3333", companyName: "丙", underwriter: "", market: "上櫃", stage: "C", events: [{ kind: "contract", date: "2026-09-20" }] },
  ];
  const filters = { query: "", market: "all", stage: "all", event: "all", year: "all", dateRange: "week" };
  assert.deepEqual(filterIpoCalendarRows(rows, filters, "2026-08-26").map((row) => row.companyCode), ["1111"]);
  assert.deepEqual(filterIpoCalendarRows(rows, { ...filters, dateRange: "next-week" }, "2026-08-26").map((row) => row.companyCode), ["2222"]);
  assert.deepEqual(filterIpoCalendarRows(rows, { ...filters, dateRange: "30-days" }, "2026-08-26").map((row) => row.companyCode), ["1111", "2222", "3333"]);
});
