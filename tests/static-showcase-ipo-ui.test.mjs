import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../static-showcase/", import.meta.url);

test("IPO 時程頁由正式事件快照提供五階段、篩選與完整時程", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("ipo.html", root), "utf8"),
    readFile(new URL("assets/ipo-page.js", root), "utf8"),
    readFile(new URL("assets/app.css", root), "utf8"),
  ]);
  const source = html + js;

  for (const label of ["IPO 時程", "送件待審", "審議後", "董事會後", "契約後", "競拍／買賣", "未來關鍵事件", "清單檢視", "月份檢視", "定價狀態", "競拍進度"]) {
    assert.match(source, new RegExp(label));
  }
  for (const id of [
    "ipo-search",
    "ipo-market",
    "ipo-stage",
    "ipo-event",
    "ipo-year",
    "ipo-sort-field",
    "ipo-sort-direction",
    "ipo-table-body",
    "ipo-pagination",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }

  assert.match(html, /assets\/ipo-page\.js/);
  assert.match(js, /loadIpoSnapshot/);
  assert.match(js, /URLSearchParams/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /popstate/);
  assert.match(js, /sessionStorage/);
  assert.match(js, /pageSize\(\)/);
  assert.match(js, /matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(js, /data-page-error/);
  assert.match(html, /id="ipo-stage-flow"/);
  assert.match(html, /id="ipo-upcoming-grid"/);
  assert.match(html, /id="ipo-month-view"/);
  assert.match(js, /data-ipo-view/);
  for (const key of ["companyCode", "stage", "eventDate", "distanceDays", "auctionOpenDate", "listingDate"]) {
    assert.match(html, new RegExp(`data-ipo-sort="${key}"`));
  }
  assert.match(js, /withdrawn/);
  assert.match(js, /cancelled/);
  assert.match(css, /ipo-card/);
  assert.match(css, /ipo-card-list/);
  assert.match(css, /\.ipo-stage-flow/);
  assert.match(css, /\.ipo-card-details/);
  for (const mobileLabel of ["最近事件", "事件日期", "承銷與完整歷程"]) {
    assert.match(js, new RegExp(mobileLabel));
  }
  assert.doesNotMatch(source, /本站擷取|資料方法|擷取版本|官方快照/);
  assert.doesNotMatch(source, /暫定承銷價|實際承銷價|承銷價格|漲跌幅|報酬率/);
});

test("IPO 時程的未來與月份檢視在事件層共用目前篩選", async () => {
  const js = await readFile(new URL("assets/ipo-page.js", root), "utf8");

  assert.match(js, /const filteredEvents = filteredEventEntries\(state\.rows, state\);/);
  assert.match(js, /renderUpcoming\(filteredEvents\);/);
  assert.match(js, /renderMonthView\(filteredEvents\);/);
  assert.match(js, /function filteredEventEntries[\s\S]*event\.kind === filters\.event[\s\S]*event\.date\.slice\(0, 4\) === filters\.year/);
});
