import {
  formatDate,
  formatNumber,
  renderMarketStatusLine,
  safeJsonFetch,
} from "./site-shell.js";
import { buildCrossMarketEventEntries, buildPublicEventDigest, isPublishedIsoDate } from "./public-event-digest.js";
import { countPublishedPositive, publicNumber, sumPublishedValues } from "./public-data-state.js";

const updateTarget = globalThis.document?.querySelector("#last-successful-update") ?? null;
const coverageTarget = globalThis.document?.querySelector("#home-data-coverage") ?? null;
const todayChangesTarget = globalThis.document?.querySelector("#home-today-changes") ?? null;
const nextEventsTarget = globalThis.document?.querySelector("#home-next-events") ?? null;
const eventStrip = nextEventsTarget;
const summaryTarget = globalThis.document?.querySelector("#home-market-summary") ?? null;
const rankingTarget = globalThis.document?.querySelector("#home-emerging-rankings") ?? null;
const ipoEventsTarget = globalThis.document?.querySelector("#home-ipo-events") ?? null;
const cbQuickTarget = globalThis.document?.querySelector("#home-cb-quick") ?? null;
const cbRightsTarget = null;
const workbenchTarget = globalThis.document?.querySelector(".home-v51-workbench-section") ?? null;
const bootstrapConfig = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? {
  generationPointerUrl: new URL("../data/current.json", import.meta.url).href,
};
const pointerUrl = bootstrapConfig.generationPointerUrl;

if (globalThis.window && globalThis.document) loadHomeData();

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_IPO_STAGES = new Set(["A", "B", "C", "D"]);

export function buildDashboardHealth({ dataDate = null, dataAvailable = false } = {}) {
  return dataAvailable && isPublishedIsoDate(dataDate)
    ? { label: "資料已發布", detail: `資料日期 ${dataDate}` }
    : { label: "公開資料尚未提供", detail: "資料日期 —" };
}

function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : null;
}

function firstPublishedNumber(record, fields) {
  return fields.map((field) => publicNumber(record?.[field])).find((candidate) => candidate !== null) ?? null;
}

function sum(records, fields) {
  return sumPublishedValues(records, (record) => firstPublishedNumber(record, fields));
}

function countPublishedFieldPositive(records, fields) {
  return countPublishedPositive(records, (record) => firstPublishedNumber(record, fields));
}

export function publishedMarketDates(manifest = {}) {
  const dataDate = isPublishedIsoDate(manifest?.market?.dataDate)
    ? manifest.market.dataDate
    : null;
  const updatedAt = typeof manifest?.market?.generatedAt === "string"
    ? manifest.market.generatedAt
    : typeof manifest?.generatedAt === "string"
      ? manifest.generatedAt
      : null;
  return { dataDate, updatedAt };
}

function daysFrom(asOfDate, date) {
  if (!isPublishedIsoDate(asOfDate) || !isPublishedIsoDate(date)) return null;
  return (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${asOfDate}T00:00:00Z`)) / DAY_MS;
}

function countUpcomingEvents(records, asOfDate, matcher, days) {
  const seen = new Set();
  for (const record of records) {
    for (const event of Array.isArray(record?.events) ? record.events : []) {
      const distance = daysFrom(asOfDate, event?.date);
      if (distance === null || distance < 0 || distance > days || !matcher.test(String(event?.label ?? event?.title ?? event?.type ?? ""))) continue;
      seen.add(String(record?.companyCode ?? record?.bondCode ?? event?.bondCode ?? `${event.date}:${event.label ?? event.title}`));
    }
  }
  return seen.size;
}

function activeBond(record) {
  return String(record?.status ?? "").toLowerCase() === "active";
}

export function buildHomeSummary({ emerging, ipo, bonds, asOfDate = null } = {}) {
  const emergingRecords = recordsOf(emerging);
  const ipoRecords = recordsOf(ipo);
  const bondRecords = recordsOf(bonds);
  const activeIpoRecords = ipoRecords?.filter((record) => ACTIVE_IPO_STAGES.has(String(record?.stage ?? ""))) ?? null;
  const activeBondRecords = bondRecords?.filter(activeBond) ?? null;
  return {
    emerging: emergingRecords === null ? null : {
      marketCount: emergingRecords.length,
      tradedCount: countPublishedFieldPositive(emergingRecords, ["transactionVolume"]),
      totalTurnover: sum(emergingRecords, ["estimatedTransactionAmount", "transactionAmount"]),
      upCount: emergingRecords.filter((record) => record?.direction === "up").length,
      downCount: emergingRecords.filter((record) => record?.direction === "down").length,
      newListingCount: emergingRecords.filter((record) => record?.listingDate === asOfDate || record?.isNewListing === true).length,
      lowLiquidityCount: emergingRecords.filter((record) => record?.lowLiquidity === true || record?.liquidityStatus === "low").length,
    },
    ipo: ipoRecords === null ? null : {
      activeCases: activeIpoRecords.length,
      upcomingReviews: countUpcomingEvents(activeIpoRecords, asOfDate, /審議/u, 90),
      auctionOrSubscription7d: countUpcomingEvents(activeIpoRecords, asOfDate, /競拍|申購|抽籤/u, 7),
      plannedListings30d: countUpcomingEvents(activeIpoRecords, asOfDate, /掛牌|上市|上櫃買賣/u, 30),
    },
    bonds: bondRecords === null ? null : {
      activeCount: activeBondRecords.length,
      tradedCount: countPublishedFieldPositive(activeBondRecords, ["cbTradeUnits", "transactionVolume"]),
      totalTurnover: sum(activeBondRecords, ["cbTurnoverAmount", "transactionAmount", "turnoverAmount"]),
      events30d: countUpcomingEvents(activeBondRecords, asOfDate, /./u, 30),
      recentListings: activeBondRecords.filter((record) => {
        const distance = daysFrom(asOfDate, record?.listingDate);
        return distance !== null && distance <= 0 && distance >= -30;
      }).length,
    },
    emergingCount: emergingRecords?.length ?? null,
    ipoCount: ipoRecords?.length ?? null,
    activeBondCount: activeBondRecords?.length ?? null,
  };
}

export function buildHomeCbRightsEvents({ events = [], asOfDate } = {}) {
  if (!isPublishedIsoDate(asOfDate)) return { counts: null, events: [] };
  const relevant = (Array.isArray(events) ? events : [])
    .filter((event) => event?.marketScope === "cb" && ["early_redemption", "suspension", "put", "maturity", "conversion_price_adjustment", "listing"].includes(event?.eventType))
    .map((event) => ({
      ...event,
      keyDate: event?.deadlineDate ?? event?.effectiveDate ?? event?.startDate ?? event?.announcementDate ?? null,
    }))
    .filter((event) => isPublishedIsoDate(event.keyDate));
  const within = (event, days) => {
    const distance = daysFrom(asOfDate, event.keyDate);
    return distance !== null && distance >= 0 && distance <= days;
  };
  return {
    counts: {
      redemptions: relevant.filter((event) => event.eventType === "early_redemption" && ["active", "deadline_soon"].includes(event.status)).length,
      suspensions: relevant.filter((event) => event.eventType === "suspension" && event.status !== "completed").length,
      puts: relevant.filter((event) => event.eventType === "put" && within(event, 30)).length,
      maturity90: relevant.filter((event) => event.eventType === "maturity" && within(event, 90)).length,
    },
    events: relevant
      .filter((event) => event.status !== "completed" && within(event, 90))
      .sort((left, right) => left.keyDate.localeCompare(right.keyDate) || String(left.cbCode).localeCompare(String(right.cbCode)))
      .slice(0, 5),
  };
}

function ranked(records, { label, code, name, metric, direction = "desc" }) {
  return {
    label,
    metric,
    entries: records
      .map((record) => ({ code: String(record?.[code] ?? "").trim(), name: String(record?.[name] ?? "").trim(), value: publicNumber(record?.[metric]) }))
      .filter((record) => record.code && record.value !== null)
      .sort((left, right) => direction === "asc" ? left.value - right.value : right.value - left.value)
      .slice(0, 10),
  };
}

export function buildObjectiveRankings({ emerging, bonds } = {}) {
  const emergingRecords = recordsOf(emerging) ?? [];
  const bondRecords = recordsOf(bonds)?.filter(activeBond) ?? [];
  return [
    ranked(emergingRecords, { label: "興櫃成交金額前 10", code: "companyCode", name: "companyName", metric: "estimatedTransactionAmount" }),
    ranked(emergingRecords, { label: "興櫃成交量前 10", code: "companyCode", name: "companyName", metric: "transactionVolume" }),
    ranked(emergingRecords, { label: "興櫃日均價漲幅前 10", code: "companyCode", name: "companyName", metric: "averageChangePercent" }),
    ranked(emergingRecords, { label: "興櫃週漲幅前 10", code: "companyCode", name: "companyName", metric: "weeklyChangePercent" }),
    ranked(bondRecords, { label: "CB 成交量前 10", code: "bondCode", name: "bondName", metric: "cbTradeUnits" }),
    ranked(bondRecords, { label: "CB 成交金額前 10", code: "bondCode", name: "bondName", metric: "cbTurnoverAmount" }),
    ranked(bondRecords, { label: "CB 轉換溢價率排序", code: "bondCode", name: "bondName", metric: "premiumRate", direction: "asc" }),
    ranked(bondRecords, { label: "CB 流通餘額變化排序", code: "bondCode", name: "bondName", metric: "outstandingReductionRate" }),
  ];
}

/**
 * A deliberately compact public homepage view. It reads only the V5.6 shared
 * model so individual widgets cannot disagree about dates or identity.
 */
export function buildV56HomeBrief(model = {}) {
  const dataDate = isPublishedIsoDate(model?.dataDate) ? model.dataDate : null;
  if (model?.schemaVersion !== 3 || dataDate === null) {
    return {
      dataDate: null,
      cbChanges: [],
      ipoChanges: [],
      emergingChanges: [],
      cbPerformance: [],
      ipoMilestones: [],
      emergingTurnover: [],
      importantEvents: [],
    };
  }
  const cbByCode = new Map(recordsOf(model?.cbMaster)?.map((record) => [record?.cbCode, record]) ?? []);
  const ipoByCode = new Map(recordsOf(model?.ipoPipeline)?.map((record) => [record?.stockCode, record]) ?? []);
  const emergingByCode = new Map(recordsOf(model?.emerging)?.map((record) => [record?.stockCode, record]) ?? []);
  const changes = recordsOf(model?.dailyChanges) ?? [];
  const cbChanges = changes
    .filter((change) => change?.entityType === "cb" && typeof change?.entityId === "string")
    .map((change) => ({
      cbCode: change.entityId,
      cbName: cbByCode.get(change.entityId)?.cbName ?? null,
      label: v56ChangeLabel(change.changeType),
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
      date: isPublishedIsoDate(change.effectiveDate) ? change.effectiveDate : dataDate,
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.cbCode.localeCompare(right.cbCode))
    .slice(0, 6);
  const ipoChanges = changes
    .filter((change) => change?.entityType === "ipo" && typeof change?.entityId === "string")
    .map((change) => ({
      stockCode: change.entityId,
      companyName: ipoByCode.get(change.entityId)?.companyName ?? null,
      label: typeof change.newValue === "string" && change.newValue ? change.newValue : v56ChangeLabel(change.changeType),
      date: isPublishedIsoDate(change.effectiveDate) ? change.effectiveDate : dataDate,
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.stockCode.localeCompare(right.stockCode))
    .slice(0, 6);
  const emergingChanges = changes
    .filter((change) => change?.entityType === "emerging" && typeof change?.entityId === "string")
    .map((change) => ({
      stockCode: change.entityId,
      companyName: emergingByCode.get(change.entityId)?.companyName ?? null,
      label: v56ChangeLabel(change.changeType),
      oldValue: change.oldValue ?? null,
      newValue: change.newValue ?? null,
      date: isPublishedIsoDate(change.effectiveDate) ? change.effectiveDate : dataDate,
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.stockCode.localeCompare(right.stockCode))
    .slice(0, 6);
  const cbPerformance = (recordsOf(model?.performance) ?? [])
    .filter((record) => record?.entityType === "cb" && typeof record?.cbCode === "string" && typeof record?.periods?.["1D"] === "number")
    .map((record) => ({
      cbCode: record.cbCode,
      cbName: cbByCode.get(record.cbCode)?.cbName ?? null,
      rate: record.periods["1D"],
    }))
    .sort((left, right) => Math.abs(right.rate) - Math.abs(left.rate) || left.cbCode.localeCompare(right.cbCode))
    .slice(0, 6);
  const ipoMilestones = (recordsOf(model?.ipoPipeline) ?? [])
    .flatMap((record) => v56IpoMilestones(record, dataDate))
    .sort((left, right) => left.date.localeCompare(right.date) || left.stockCode.localeCompare(right.stockCode))
    .slice(0, 6);
  const emergingTurnover = (recordsOf(model?.emerging) ?? [])
    .filter((record) => typeof record?.stockCode === "string" && typeof record?.transactionAmount === "number")
    .map((record) => ({
      stockCode: record.stockCode,
      companyName: record.companyName ?? null,
      amount: record.transactionAmount,
    }))
    .sort((left, right) => right.amount - left.amount || left.stockCode.localeCompare(right.stockCode))
    .slice(0, 5);
  const importantEvents = (recordsOf(model?.cbEvents) ?? [])
    .flatMap((event) => {
      const date = firstPublishedDate(event?.deadlineDate, event?.effectiveDate, event?.startDate, event?.announcementDate);
      if (date === null || typeof event?.cbCode !== "string") return [];
      return [{
        cbCode: event.cbCode,
        cbName: cbByCode.get(event.cbCode)?.cbName ?? null,
        label: homeCbEventLabel(event.eventType),
        title: typeof event.title === "string" && event.title.trim() ? event.title.trim() : homeCbEventLabel(event.eventType),
        date,
        status: event.status ?? null,
      }];
    })
    .filter((event) => event.date >= dataDate && event.status !== "completed")
    .sort((left, right) => left.date.localeCompare(right.date) || left.cbCode.localeCompare(right.cbCode))
    .slice(0, 8);
  return { dataDate, cbChanges, ipoChanges, emergingChanges, cbPerformance, ipoMilestones, emergingTurnover, importantEvents };
}

/**
 * V5.7 keeps the public homepage to two non-overlapping questions: what the
 * latest snapshot changed, and which already-published events occur next.
 */
export function buildV57HomeSections(model = {}) {
  const brief = buildV56HomeBrief(model);
  if (brief.dataDate === null) return { dataDate: null, todayChanges: [], nextEvents: [] };
  const todayChanges = [
    ...brief.cbChanges.map((entry) => ({ market: "CB", code: entry.cbCode, name: entry.cbName, label: entry.label, date: entry.date, href: `./bonds.html?bond=${encodeURIComponent(entry.cbCode)}` })),
    ...brief.ipoChanges.map((entry) => ({ market: "IPO", code: entry.stockCode, name: entry.companyName, label: entry.label, date: entry.date, href: `./ipo-radar.html?q=${encodeURIComponent(entry.stockCode)}` })),
    ...brief.emergingChanges.map((entry) => ({ market: "興櫃", code: entry.stockCode, name: entry.companyName, label: entry.label, date: entry.date, href: `./emerging.html?q=${encodeURIComponent(entry.stockCode)}` })),
  ].sort((left, right) => left.market.localeCompare(right.market, "zh-Hant") || left.code.localeCompare(right.code));
  const candidates = [
    ...brief.importantEvents.map((event) => ({ market: "CB", code: event.cbCode, name: event.cbName, label: event.label, date: event.date, href: `./bonds.html?bond=${encodeURIComponent(event.cbCode)}` })),
    ...brief.ipoMilestones.map((event) => ({ market: "IPO", code: event.stockCode, name: event.companyName, label: event.label, date: event.date, href: `./ipo.html?q=${encodeURIComponent(event.stockCode)}` })),
  ].filter((event) => calendarDaysFrom(brief.dataDate, event.date) >= 0 && calendarDaysFrom(brief.dataDate, event.date) <= 7);
  const seen = new Set();
  const nextEvents = candidates
    .sort((left, right) => left.date.localeCompare(right.date) || left.market.localeCompare(right.market, "zh-Hant") || left.code.localeCompare(right.code))
    .filter((event) => {
      const identity = `${event.market}:${event.code}:${event.date}:${event.label}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, 8);
  return { dataDate: brief.dataDate, todayChanges, nextEvents };
}

function calendarDaysFrom(start, end) {
  if (!isPublishedIsoDate(start) || !isPublishedIsoDate(end)) return Number.NaN;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS);
}

function firstPublishedDate(...values) {
  return values.find((value) => isPublishedIsoDate(value)) ?? null;
}

function v56IpoMilestones(record, dataDate) {
  if (typeof record?.stockCode !== "string" || typeof record?.companyName !== "string") return [];
  const dates = [
    ["審議", record.reviewDate],
    ["董事會", record.boardDate],
    ["契約", record.contractDate],
    ["掛牌", record.listingDate],
  ];
  return dates.flatMap(([label, date]) => isPublishedIsoDate(date) && date >= dataDate
    ? [{ stockCode: record.stockCode, companyName: record.companyName, stage: record.stage ?? null, label, date }]
    : []);
}

function v56ChangeLabel(value) {
  return ({
    conversion_price_changed: "轉換價調整",
    outstanding_changed: "流通餘額異動",
    new_early_redemption: "提前贖回公告",
    new_listing: "新掛牌",
    conversion_suspension_added: "停止轉換",
    put_window_added: "賣回窗口",
    maturity_window_entered: "進入到期窗口",
    ipo_stage_changed: "IPO 階段異動",
    new_ipo_event: "IPO 新事件",
    emerging_turnover_rank_changed: "成交金額名次異動",
  })[value] ?? "可轉債異動";
}

function bindV51HomeInteractions() {
  const buttons = [...document.querySelectorAll("[data-home-v51-ranking-tab]")];
  const panels = [...document.querySelectorAll("[data-home-v51-ranking-panel]")];
  if (!buttons.length || !panels.length) return;
  const select = (key) => {
    for (const button of buttons) {
      button.setAttribute("aria-selected", String(button.dataset.homeV51RankingTab === key));
      button.tabIndex = button.dataset.homeV51RankingTab === key ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.homeV51RankingPanel !== key;
  };
  for (const button of buttons) {
    if (button.dataset.homeV51Bound === "true") continue;
    button.dataset.homeV51Bound = "true";
    button.addEventListener("click", () => select(button.dataset.homeV51RankingTab));
    button.addEventListener("keydown", (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = buttons.indexOf(button);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? buttons.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
      const next = buttons[nextIndex];
      select(next.dataset.homeV51RankingTab);
      next.focus();
    });
  }
  const selected = buttons.find((button) => button.getAttribute("aria-selected") === "true") ?? buttons[0];
  select(selected.dataset.homeV51RankingTab);
}

async function loadHomeData() {
  const pointer = await safeJsonFetch(pointerUrl, { errorTarget: updateTarget });
  if (!pointer?.runtimeUrl) return renderHomeEvents({});

  const runtime = await safeJsonFetch(
    new URL(pointer.runtimeUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  if (!runtime?.manifestUrl) return renderHomeEvents({});

  if (typeof runtime.v56MarketDataUrl === "string") {
    const v56 = await safeJsonFetch(
      new URL(runtime.v56MarketDataUrl, document.baseURI),
      { errorTarget: updateTarget },
    );
    if (v56?.schemaVersion === 3 && isPublishedIsoDate(v56?.dataDate)) {
      renderV56Home(v56);
      return;
    }
  }

  const canonicalUrl = runtime.canonicalEventsV55Url ?? runtime.canonicalEventsV54Url ?? null;
  const canonicalEvents = typeof canonicalUrl === "string"
    ? await safeJsonFetch(new URL(canonicalUrl, document.baseURI), { errorTarget: coverageTarget })
    : null;

  const marketResearchUrl = runtime.marketResearchUrl
    ?? (typeof pointer.generation === "string" ? `./data/${pointer.generation}/market-research.json` : null);
  if (typeof marketResearchUrl === "string") {
    const research = await safeJsonFetch(
      new URL(marketResearchUrl, document.baseURI),
      { errorTarget: updateTarget },
    );
    if (research?.home && research?.meta) {
      const dataDate = research.meta.dataDate;
      if (updateTarget && isPublishedIsoDate(dataDate)) {
        updateTarget.textContent = renderMarketStatusLine({ dataDate, updatedAt: research.meta.updatedAt });
      }
      if (coverageTarget && isPublishedIsoDate(dataDate)) coverageTarget.textContent = `資料日期 ${formatDate(dataDate)}`;
      renderHomeCbRightsEvents({ canonicalEvents, asOfDate: dataDate });
      bindV51HomeInteractions();
      return;
    }
  }

  const manifest = await safeJsonFetch(
    new URL(runtime.manifestUrl, document.baseURI),
    { errorTarget: updateTarget },
  );
  const workbenchUrl = runtime.datasets?.bondWorkbench;
  const ipoEventsUrl = runtime.ipoEventsUrl;
  const emergingUrl = runtime.emergingMarketUrl;
  const [workbench, ipo, emerging] = await Promise.all([
    typeof workbenchUrl === "string"
      ? safeJsonFetch(new URL(workbenchUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
    typeof ipoEventsUrl === "string"
      ? safeJsonFetch(new URL(ipoEventsUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
    typeof emergingUrl === "string"
      ? safeJsonFetch(new URL(emergingUrl, document.baseURI), { errorTarget: coverageTarget })
      : Promise.resolve(null),
  ]);

  const { dataDate: asOfDate, updatedAt } = publishedMarketDates(manifest);
  updateTarget.textContent = asOfDate
    ? renderMarketStatusLine({ dataDate: asOfDate, updatedAt })
    : "資料暫時無法取得";
  renderDashboardHealth(buildDashboardHealth({
    dataDate: asOfDate,
    dataAvailable: Boolean(workbench && ipo && emerging),
  }));
  const eventInput = {
    asOfDate,
    bonds: Array.isArray(workbench?.records) ? workbench.records : undefined,
    emergingEvents: Array.isArray(emerging?.events) ? emerging.events : undefined,
    ipoDataDate: ipo?.dataDate,
    ipoRecords: Array.isArray(ipo?.records) ? ipo.records : undefined,
    ipoSourceManifest: Array.isArray(ipo?.sourceManifest) ? ipo.sourceManifest : undefined,
  };
  const summary = buildHomeSummary({ emerging, ipo, bonds: workbench, asOfDate });
  const rankings = buildObjectiveRankings({ emerging, bonds: workbench });
  const events = renderHomeEvents(eventInput);
  renderHomeCbRightsEvents({ canonicalEvents, asOfDate });
  renderHomeSummary(summary);
  renderHomeRankings(rankings);
  renderHomeQuickResearch({ events, digest: buildPublicEventDigest(eventInput), rankings });
}

function renderV56Home(model) {
  const sections = buildV57HomeSections(model);
  if (sections.dataDate === null) return;
  if (updateTarget) updateTarget.textContent = `資料日期 ${formatDate(sections.dataDate)} · 已驗證盤後快照`;
  if (coverageTarget) coverageTarget.textContent = `資料日期 ${formatDate(sections.dataDate)}`;
  renderV57TodayChanges(sections);
  renderV57NextEvents(sections);
  renderV56Destinations(buildV56HomeBrief(model));
}

function renderV57TodayChanges(sections) {
  if (!todayChangesTarget) return;
  const items = (entries, render, empty) => entries.length
    ? `<ol class="home-v56-list">${entries.map(render).join("")}</ol>`
    : `<p class="home-v56-empty">${escapeHtml(empty)}</p>`;
  const byMarket = (market) => sections.todayChanges.filter((entry) => entry.market === market);
  todayChangesTarget.innerHTML = `<section class="home-v56-today" aria-labelledby="home-v56-title">
    <header><p class="kicker">SNAPSHOT DIFF / VERIFIED</p><h2 id="home-v56-title">本次快照異動</h2><p>只列示本次已驗證快照相對前一個有效快照的欄位變化。</p></header>
    <div class="home-v56-today__grid">
      ${["CB", "IPO", "興櫃"].map((market) => `<article><h3>${escapeHtml(market)} 異動</h3>${items(byMarket(market), (entry) => `<li><a href="${escapeAttribute(entry.href)}"><span>${escapeHtml(entry.code)} ${escapeHtml(entry.name ?? "")}</span><strong>${escapeHtml(entry.label)}</strong><small>${formatDate(entry.date)}</small></a></li>`, "本次快照沒有已驗證異動。")}</article>`).join("")}
    </div>
  </section>`;
}

function renderV57NextEvents(sections) {
  if (!nextEventsTarget) return;
  nextEventsTarget.innerHTML = sections.nextEvents.length
    ? sections.nextEvents.map((event) => `<a class="home-event-card" href="${escapeAttribute(event.href)}"><time datetime="${escapeAttribute(event.date)}">${formatDate(event.date)}</time><p>${escapeHtml(event.market)} · ${escapeHtml(event.label)}</p><strong>${escapeHtml(event.code)} ${escapeHtml(event.name ?? "")}</strong><span aria-hidden="true">→</span></a>`).join("")
    : '<p class="empty-state">接下來 7 天沒有日期已確定的公開市場事件。</p>';
}

function renderV56Destinations(brief) {
  if (!workbenchTarget) return;
  const ipo = brief.ipoMilestones.length
    ? brief.ipoMilestones.map((entry) => `<a class="home-v56-destination__row" href="./ipo-radar.html?code=${encodeURIComponent(entry.stockCode)}"><time datetime="${escapeAttribute(entry.date)}">${formatDate(entry.date)}</time><span>${escapeHtml(entry.stockCode)} ${escapeHtml(entry.companyName)}</span><strong>${escapeHtml(entry.label)}</strong></a>`).join("")
    : '<p class="home-v56-empty">目前沒有日期明確的近期 IPO 里程碑。</p>';
  workbenchTarget.innerHTML = `<section class="home-v56-destinations" aria-labelledby="home-v56-destinations-title"><div class="home-v56-destinations__heading"><div><p class="kicker">RESEARCH DESTINATIONS</p><h2 id="home-v56-destinations-title">進一步研究</h2></div><p>從同一份已驗證資料快照開啟完整清單、事件與時程。</p></div><div class="home-v56-destinations__grid"><article><h3>IPO 近期里程碑</h3>${ipo}<a class="home-v56-destination__more" href="./ipo-radar.html">查看 IPO 雷達 →</a></article><article><h3>可轉債市場</h3><p>比較完整條款、事件與市場表現；沒有有效價格歷史的欄位會明確顯示「—」。</p><a class="home-v56-destination__more" href="./bonds.html">查看全部可轉債 →</a></article><article><h3>興櫃市場</h3><p>查看每日成交、排名與公司關聯資料。</p><a class="home-v56-destination__more" href="./emerging.html">查看興櫃市場 →</a></article></div></section>`;
}

function renderHomeCbRightsEvents({ canonicalEvents, asOfDate }) {
  if (!cbRightsTarget) return;
  const { counts, events } = buildHomeCbRightsEvents({
    events: Array.isArray(canonicalEvents?.records) ? canonicalEvents.records : [],
    asOfDate,
  });
  if (counts === null) {
    cbRightsTarget.innerHTML = '<p class="empty-state">可轉債事件資料讀取中。</p>';
    return;
  }
  const metric = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${formatNumber(value)}</dd></div>`;
  const eventList = events.length
    ? `<ol>${events.map((event) => `<li><a href="./bonds.html?bond=${encodeURIComponent(event.cbCode)}"><time datetime="${escapeAttribute(event.keyDate)}">${formatDate(event.keyDate)}</time><strong>${escapeHtml(event.cbCode)} ${escapeHtml(event.cbName ?? event.instrumentName)}</strong><span>${escapeHtml(homeCbEventLabel(event.eventType))} · ${escapeHtml(homeEventStatusLabel(event.status))}</span></a>${isOfficialSourceUrl(event.sourceUrl) ? `<a class="cb-official-link" href="${escapeAttribute(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a>` : ""}</li>`).join("")}</ol>`
    : '<p class="empty-state">未來 90 日沒有已發布的可轉債關鍵事件。</p>';
  cbRightsTarget.innerHTML = `<dl class="home-cb-rights-metrics">${metric("進行中／期限將近提前贖回", counts.redemptions)}${metric("停止轉換", counts.suspensions)}${metric("30 日內賣回", counts.puts)}${metric("90 日內到期", counts.maturity90)}</dl>${eventList}`;
}

function homeCbEventLabel(type) {
  return ({ early_redemption: "提前贖回", suspension: "停止轉換", put: "賣回權", maturity: "到期日", conversion_price_adjustment: "轉換價調整", listing: "掛牌" })[type] ?? "可轉債事件";
}

function homeEventStatusLabel(status) {
  return ({ active: "進行中", deadline_soon: "期限將近", upcoming: "即將發生" })[status] ?? "即將發生";
}

function isOfficialSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && new Set(["www.tpex.org.tw", "mopsov.twse.com.tw", "mops.twse.com.tw", "www.twse.com.tw"]).has(url.hostname);
  } catch {
    return false;
  }
}

function renderDashboardHealth(health) {
  const target = document.querySelector("#dashboard-health");
  if (!target) return;
  target.textContent = `${health.label} · ${isPublishedIsoDate(health.detail.slice(-10)) ? formatDate(health.detail.slice(-10)) : health.detail}`;
}

function renderHomeEvents(input) {
  const events = buildCrossMarketEventEntries(input);
  const dataDate = isPublishedIsoDate(input.asOfDate) ? formatDate(input.asOfDate) : "—";
  if (coverageTarget) coverageTarget.textContent = `資料日期 ${dataDate}`;
  if (!eventStrip) return events;
  const render = (market = "all") => {
    const selected = (market === "all" ? events : events.filter((event) => event.market === market)).slice(0, 8);
    eventStrip.innerHTML = selected.length
      ? selected.map(eventTimelineHtml).join("")
      : '<p class="empty-state">目前沒有近期已發布事件。</p>';
  };
  for (const button of document.querySelectorAll("[data-home-event-market]")) {
    button.addEventListener("click", () => {
      const market = button.dataset.homeEventMarket ?? "all";
      for (const control of document.querySelectorAll("[data-home-event-market]")) control.setAttribute("aria-pressed", String(control === button));
      render(market);
    });
  }
  render();
  return events;
}

function renderHomeSummary(summary) {
  if (!summaryTarget) return;
  const count = (value) => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "string") return escapeHtml(value);
    return new Intl.NumberFormat("zh-TW").format(value);
  };
  const metric = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${count(value)}</dd></div>`;
  const panel = (title, metrics) => `<article class="home-summary-panel"><h3>${escapeHtml(title)}</h3><dl>${metrics.map(([label, value]) => metric(label, value)).join("")}</dl></article>`;
  summaryTarget.innerHTML = [
    summary.emerging === null ? panel("興櫃市場", [["市場家數", null]]) : panel("興櫃市場", [["市場家數", summary.emerging.marketCount], ["今日有交易", summary.emerging.tradedCount], ["今日成交總額", summary.emerging.totalTurnover], ["上漲／下跌", `${summary.emerging.upCount}／${summary.emerging.downCount}`], ["新登錄", summary.emerging.newListingCount], ["低流動性", summary.emerging.lowLiquidityCount]]),
    summary.ipo === null ? panel("IPO 進度", [["進行中案件", null]]) : panel("IPO 進度", [["進行中案件", summary.ipo.activeCases], ["近期審議", summary.ipo.upcomingReviews], ["7 日內競拍／申購", summary.ipo.auctionOrSubscription7d], ["30 日內預計掛牌", summary.ipo.plannedListings30d]]),
    summary.bonds === null ? panel("可轉債事件", [["有效 CB", null]]) : panel("可轉債事件", [["有效 CB", summary.bonds.activeCount], ["今日有成交", summary.bonds.tradedCount], ["30 日內事件", summary.bonds.events30d], ["近期新掛牌", summary.bonds.recentListings]]),
  ].join("");
}

function renderHomeRankings(rankings) {
  if (!rankingTarget) return;
  rankingTarget.innerHTML = rankings.slice(0, 2).map((ranking) => `<section class="ranking-panel"><h3>${escapeHtml(ranking.label)}</h3><ol>${ranking.entries.slice(0, 5).map((entry) => `<li><span>${escapeHtml(entry.code)} ${escapeHtml(entry.name)}</span><strong>${formatNumber(entry.value)}</strong></li>`).join("") || '<li class="empty-cell">—</li>'}</ol></section>`).join("");
}

function renderHomeQuickResearch({ events = [], digest = [], rankings = [] } = {}) {
  if (ipoEventsTarget) {
    const ipoEvents = events.filter((event) => event.market === "ipo").slice(0, 5);
    ipoEventsTarget.innerHTML = ipoEvents.length
      ? ipoEvents.map((event) => compactEventHtml(event, "IPO")).join("")
      : '<p class="empty-state">目前沒有近期已發布的 IPO 進度事件。</p>';
  }
  if (cbQuickTarget) {
    const cbDigest = digest.filter((item) => item.id.startsWith("bond-"));
    const lowPremium = rankings.find((item) => item.label === "CB 轉換溢價率排序");
    cbQuickTarget.innerHTML = [
      ...cbDigest.map((item) => `<a href="${escapeAttribute(item.href)}"><span>${escapeHtml(item.label)}</span><strong>${item.count === null ? "—" : formatNumber(item.count)}</strong>${item.nearestDate ? `<small>最近 ${formatDate(item.nearestDate)}</small>` : ""}</a>`),
      lowPremium ? `<a href="./bonds.html?screener=lowPremium"><span>低轉換溢價率</span><strong>${formatNumber(lowPremium.entries.length)}</strong><small>以已發布盤後資料排序</small></a>` : "",
    ].join("") || '<p class="empty-state">可轉債公開條件尚未提供。</p>';
  }
}

function compactEventHtml(event, marketLabel) {
  return `<a class="home-compact-event" href="${escapeAttribute(event.href)}"><time datetime="${escapeAttribute(event.date)}">${formatDate(event.date)}</time><span>${escapeHtml(marketLabel)} · ${escapeHtml(event.title)}</span><strong>${escapeHtml(event.code ?? "—")}</strong></a>`;
}

function eventTimelineHtml(event) {
  const labels = { emerging: "興櫃", ipo: "IPO", bonds: "CB" };
  return `<a class="home-event-card" href="${escapeAttribute(event.href)}"><time datetime="${escapeAttribute(event.date)}">${formatDate(event.date)}</time><p>${escapeHtml(labels[event.market] ?? "市場")} · ${escapeHtml(event.title)}</p>${event.code ? `<strong>${escapeHtml(event.code)}</strong>` : ""}<span aria-hidden="true">→</span></a>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
