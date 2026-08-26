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
  assert.doesNotMatch(js, /sessionStorage/);
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

  assert.match(js, /const filtered = filterIpoCalendarRows\(state\.rows, state, state\.dataDate\);/);
  assert.match(js, /const filteredEvents = filteredEventEntries\(filtered, state, state\.dataDate\);/);
  assert.match(js, /renderUpcoming\(filteredEvents\);/);
  assert.match(js, /renderMonthView\(filteredEvents\);/);
  assert.match(js, /function filteredEventEntries[\s\S]*event\.kind === filters\.event[\s\S]*event\.date\.slice\(0, 4\) === filters\.year/);
});

test("IPO life-cycle projects only normalized official events in the fixed public order", async () => {
  const { projectIpoLifecycle } = await import("../static-showcase/assets/ipo-page.js");
  const row = {
    events: [
      { type: "董事會決議", date: "2026-08-01", sourceId: "twse-applications" },
      { type: "送件", date: "2026-08-03", sourceId: "twse-applications" },
      { type: "核准生效", date: "2026-08-04", sourceId: "twse-applications" },
      { type: "競拍", date: "2026-09-10", sourceId: "twse-auctions" },
      { type: "掛牌", date: "2026-10-01", sourceId: "tpex-ipo-listings" },
      { type: "其他", date: "2026-09-01", sourceId: "twse-applications" },
    ],
  };

  assert.deepEqual(projectIpoLifecycle(row, "2026-08-24"), [
    { key: "announcement", label: "公告", date: null, sourceId: null, state: "unavailable" },
    { key: "submission", label: "送件", date: "2026-08-03", sourceId: "twse-applications", state: "complete" },
    { key: "effective", label: "核准／生效", date: "2026-08-04", sourceId: "twse-applications", state: "complete" },
    { key: "auction", label: "詢圈或競拍", date: "2026-09-10", sourceId: "twse-auctions", state: "upcoming" },
    { key: "pricing", label: "轉換價確認", date: null, sourceId: null, state: "unavailable" },
    { key: "listing", label: "掛牌", date: "2026-10-01", sourceId: "tpex-ipo-listings", state: "upcoming" },
  ]);
});

test("IPO lifecycle leaves unapproved and missing evidence unavailable", async () => {
  const { normalizeIpoRecord, projectIpoLifecycle } = await import("../static-showcase/assets/ipo-page.js");
  const row = normalizeIpoRecord({
    companyCode: "1234",
    companyName: "測試公司",
    market: "上市",
    stage: "D",
    events: [
      { kind: "application_submitted", date: "2026-08-01", label: "申請送件", sourceRecordIds: ["ATTACKER:1234"] },
      { kind: "auction", date: "2026-09-10", label: "競拍", sourceRecordIds: [] },
    ],
  }, {
    dataDate: "2026-08-24",
    sourceManifest: [{ sourceId: "twse-applications" }],
  });

  assert.deepEqual(row.events, []);
  assert.ok(projectIpoLifecycle(row, "2026-08-24").every((step) => step.state === "unavailable"));
});

test("IPO lifecycle UI labels unavailable public evidence without inventing offering facts", async () => {
  const [html, js] = await Promise.all([
    readFile(new URL("ipo.html", root), "utf8"),
    readFile(new URL("assets/ipo-page.js", root), "utf8"),
  ]);
  const source = html + js;

  for (const label of ["公告", "送件", "核准／生效", "詢圈或競拍", "轉換價確認", "掛牌", "尚無公開資料"]) {
    assert.match(source, new RegExp(label));
  }
});

test("IPO evidence accepts only manifest-backed approved source-record identifiers", async () => {
  const { normalizeIpoRecord, projectIpoEvidence } = await import("../static-showcase/assets/ipo-page.js");
  const record = {
    companyCode: "1234", companyName: "測試公司", market: "上市", stage: "D", applicationDate: "2026-08-01",
    underwriter: "未核准承銷商",
    auction: { sourceRecordId: "attacker:auction:1234", auctionOpenDate: "2026-09-10" },
    publicOffering: { sourceRecordId: "attacker:offering:1234", label: "未核准發行" },
    events: [{ kind: "application_submitted", date: "2026-08-01", label: "申請送件", sourceRecordIds: ["attacker:1234"] }],
  };
  const denied = normalizeIpoRecord(record, { dataDate: "2026-08-24", sourceManifest: [{ sourceId: "twse-applications" }] });
  assert.deepEqual(projectIpoEvidence(denied), { underwriter: null, issuance: null, auction: null });

  const allowed = normalizeIpoRecord({
    ...record,
    underwriter: "正式承銷商",
    events: [{ kind: "application_submitted", date: "2026-08-01", label: "申請送件", sourceRecordIds: ["TWSE:1234:20260801"] }],
  }, { dataDate: "2026-08-24", sourceManifest: [{ sourceId: "twse-applications" }] });
  assert.equal(projectIpoEvidence(allowed).underwriter, "正式承銷商");
});

test("IPO evidence restores a verified TWSE public-offering record", async () => {
  const { normalizeIpoRecord, projectIpoEvidence } = await import("../static-showcase/assets/ipo-page.js");
  const row = normalizeIpoRecord({
    companyCode: "1234", companyName: "測試公司", market: "上市", stage: "D", applicationDate: "2026-08-01",
    publicOffering: { sourceRecordId: "TWSE:public:1234:2026-09-10", label: "公開申購" },
    events: [],
  }, { dataDate: "2026-08-24", sourceManifest: [{ sourceId: "twse-public-offerings" }] });

  assert.equal(projectIpoEvidence(row).issuance, "公開申購");
});

test("IPO calendar retains release-stage verified evidence without source identifiers", async () => {
  const { normalizeIpoRecord, projectIpoEvidence, projectIpoLifecycle } = await import("../static-showcase/assets/ipo-page.js");
  const row = normalizeIpoRecord({
    companyCode: "1234", companyName: "測試公司", market: "上市", stage: "D", applicationDate: "2026-08-01",
    underwriter: "正式承銷商",
    auction: { auctionOpenDate: "2026-09-10", verified: true },
    publicOffering: { label: "公開申購", verified: true },
    events: [{ kind: "application_submitted", date: "2026-08-01", label: "申請送件", verified: true }],
  }, { dataDate: "2026-08-24" });

  assert.equal(row.events.length, 1);
  assert.deepEqual(projectIpoEvidence(row), {
    underwriter: "正式承銷商",
    issuance: "公開申購",
    auction: "已開標 2026/09/10",
  });
  assert.equal(projectIpoLifecycle(row, "2026-08-24").find((step) => step.key === "submission").state, "complete");
});

test("IPO default active path excludes terminal and historically stale applications", async () => {
  const { matchesIpoCalendarStage } = await import("../static-showcase/assets/ipo-page.js");
  const today = "2026-08-24";
  const current = { stage: "A", exceptionStatus: null, applicationDate: "2026-08-01", events: [{ date: "2026-08-01", sourceId: "twse-applications" }] };
  const stale = { stage: "A", exceptionStatus: null, applicationDate: "2025-08-23", events: [{ date: "2025-08-23", sourceId: "twse-applications" }] };
  const withdrawn = { stage: "withdrawn", exceptionStatus: "withdrawn", applicationDate: "2026-08-01", events: [{ date: "2026-08-01", sourceId: "twse-applications" }] };
  const cancelled = { stage: "cancelled", exceptionStatus: "cancelled", applicationDate: "2026-08-01", events: [{ date: "2026-08-01", sourceId: "twse-applications" }] };

  assert.equal(matchesIpoCalendarStage(current, "active", today), true);
  assert.equal(matchesIpoCalendarStage(stale, "active", today), false);
  assert.equal(matchesIpoCalendarStage(withdrawn, "active", today), false);
  assert.equal(matchesIpoCalendarStage(cancelled, "active", today), false);
  for (const row of [stale, withdrawn, cancelled]) assert.equal(matchesIpoCalendarStage(row, "all", today), true);
});

test("IPO all-history keeps a company without approved events and labels its evidence unavailable", async () => {
  const { filterIpoCalendarRows, normalizeIpoRecord } = await import("../static-showcase/assets/ipo-page.js");
  const row = normalizeIpoRecord({
    companyCode: "1234",
    companyName: "歷史公司",
    market: "上市",
    stage: "A",
    applicationDate: "2025-01-01",
    events: [{ date: "2025-01-01", label: "未核准事件", sourceRecordIds: ["attacker:1234"] }],
  }, { dataDate: "2026-08-24", sourceManifest: [{ sourceId: "twse-applications" }] });

  assert.equal(filterIpoCalendarRows([row], { query: "", market: "all", stage: "active", event: "all", year: "all" }, "2026-08-24").length, 0);
  assert.deepEqual(filterIpoCalendarRows([row], { query: "", market: "all", stage: "all", event: "all", year: "all" }, "2026-08-24"), [row]);
  assert.equal(row.primaryEventLabel, "尚無公開資料");
});
