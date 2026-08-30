import { formatDate, formatNumber, safeJsonFetch } from "./site-shell.js";
import {
  EVENT_TYPE_LABELS,
  buildEventMetrics,
  calendarDistance,
  eventTimeLabel,
  filterMarketEvents,
  groupMarketEventsByDate,
  groupMarketEventsByEntity,
  projectMarketEvents,
} from "./market-event-model.js";

const state = {
  allEvents: [],
  asOfDate: null,
  market: "all",
  period: "30",
  eventType: "all",
  status: "all",
  query: "",
  customStart: null,
  customEnd: null,
  view: "list",
  calendarMonth: null,
};

const errorTarget = globalThis.document?.querySelector("[data-page-error]") ?? null;
const root = globalThis.document?.querySelector(".market-events-page") ?? null;

if (root) {
  initializeFromUrl();
  bindControls();
  await loadEvents();
}

async function loadEvents() {
  const pointer = await safeJsonFetch(new URL("./data/current.json", location.href), { errorTarget });
  const runtime = pointer?.runtimeUrl
    ? await safeJsonFetch(new URL(pointer.runtimeUrl, location.href), { errorTarget })
    : null;
  if (!runtime?.canonicalEventsV54Url && (!runtime?.ipoEventsUrl || !runtime?.datasets?.bondWorkbench)) {
    showUnavailable();
    return;
  }
  const [canonicalEvents, ipoSnapshot, bondWorkbench] = await Promise.all([
    runtime.canonicalEventsV54Url
      ? safeJsonFetch(new URL(runtime.canonicalEventsV54Url, location.href), { errorTarget })
      : null,
    runtime.ipoEventsUrl ? safeJsonFetch(new URL(runtime.ipoEventsUrl, location.href), { errorTarget }) : null,
    runtime.datasets?.bondWorkbench ? safeJsonFetch(new URL(runtime.datasets.bondWorkbench, location.href), { errorTarget }) : null,
  ]);
  const asOfDate = validDate(canonicalEvents?.dataDate) ? canonicalEvents.dataDate
    : validDate(ipoSnapshot?.dataDate) ? ipoSnapshot.dataDate
    : validDate(bondWorkbench?.dataDate) ? bondWorkbench.dataDate
      : null;
  if (!asOfDate) {
    showUnavailable();
    return;
  }
  state.asOfDate = asOfDate;
  state.calendarMonth = validMonth(state.calendarMonth) ? state.calendarMonth : asOfDate.slice(0, 7);
  state.allEvents = projectMarketEvents({ asOfDate, canonicalEvents, ipoSnapshot, bonds: bondWorkbench?.records });
  populateEventTypes();
  applyStateToControls();
  render();
  document.querySelector("#market-event-update").textContent = `資料日期 ${formatDate(asOfDate)} · 已發布公開事件`;
}

function bindControls() {
  document.querySelector("#market-event-filters")?.addEventListener("submit", (event) => event.preventDefault());
  document.querySelector("#market-event-filters")?.addEventListener("reset", () => {
    window.setTimeout(() => {
      Object.assign(state, { market: "all", period: "30", eventType: "all", status: "all", query: "", customStart: null, customEnd: null });
      syncUrl();
      applyStateToControls();
      render();
    });
  });
  for (const [selector, key] of [["#market-event-period", "period"], ["#market-event-type", "eventType"], ["#market-event-status", "status"], ["#market-event-search", "query"], ["#market-event-start", "customStart"], ["#market-event-end", "customEnd"]]) {
    document.querySelector(selector)?.addEventListener("input", (event) => {
      state[key] = event.target.value || null;
      syncUrl();
      applyStateToControls();
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-event-market]")) {
    button.addEventListener("click", () => {
      state.market = button.dataset.eventMarket ?? "all";
      syncUrl();
      applyStateToControls();
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-event-metric]")) {
    button.addEventListener("click", () => applyMetric(button.dataset.eventMetric));
  }
  for (const button of document.querySelectorAll("[data-event-view]")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.eventView ?? "list";
      syncUrl();
      applyStateToControls();
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-calendar-nav]")) {
    button.addEventListener("click", () => {
      state.calendarMonth = offsetMonth(state.calendarMonth, button.dataset.calendarNav === "next" ? 1 : -1);
      renderCalendar(visibleEvents());
    });
  }
  document.querySelector("#market-event-list")?.addEventListener("click", onEventRowClick);
  document.querySelector("#market-event-list")?.addEventListener("keydown", onEventRowKeydown);
  document.querySelector("#market-event-clusters")?.addEventListener("click", onEventRowClick);
  document.querySelector("#market-event-clusters")?.addEventListener("keydown", onEventRowKeydown);
  document.querySelector("#market-event-calendar-content")?.addEventListener("click", onCalendarDayClick);
  document.querySelector("[data-event-drawer-close]")?.addEventListener("click", closeDrawer);
  document.querySelector("#market-event-drawer")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeDrawer();
  });
  window.addEventListener("popstate", () => {
    initializeFromUrl();
    applyStateToControls();
    render();
  });
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  state.market = ["all", "ipo", "bonds"].includes(params.get("market")) ? params.get("market") : "all";
  state.period = ["all", "today", "tomorrow", "7", "30", "custom"].includes(params.get("range")) ? params.get("range") : "30";
  state.eventType = params.get("type") ?? "all";
  state.status = ["all", "ongoing", "upcoming", "completed"].includes(params.get("status")) ? params.get("status") : "all";
  state.query = params.get("q") ?? "";
  state.customStart = validDate(params.get("start")) ? params.get("start") : null;
  state.customEnd = validDate(params.get("end")) ? params.get("end") : null;
  state.view = ["list", "calendar", "cluster"].includes(params.get("view")) ? params.get("view") : "list";
  state.calendarMonth = validMonth(params.get("month")) ? params.get("month") : null;
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.market !== "all") params.set("market", state.market);
  if (state.period !== "30") params.set("range", state.period);
  if (state.eventType !== "all") params.set("type", state.eventType);
  if (state.status !== "all") params.set("status", state.status);
  if (state.query) params.set("q", state.query);
  if (state.customStart) params.set("start", state.customStart);
  if (state.customEnd) params.set("end", state.customEnd);
  if (state.view !== "list") params.set("view", state.view);
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
}

function applyMetric(metric) {
  if (metric === "today") Object.assign(state, { period: "today", market: "all", status: "all" });
  if (metric === "tomorrow") Object.assign(state, { period: "tomorrow", market: "all", status: "all" });
  if (metric === "next7") Object.assign(state, { period: "7", market: "all", status: "all" });
  if (metric === "ipo") Object.assign(state, { period: "30", market: "ipo", status: "all" });
  if (metric === "bonds") Object.assign(state, { period: "30", market: "bonds", status: "all" });
  syncUrl();
  applyStateToControls();
  render();
}

function applyStateToControls() {
  const customRange = document.querySelector("[data-market-event-custom-range]");
  document.querySelector("#market-event-period").value = state.period;
  document.querySelector("#market-event-type").value = optionExists("#market-event-type", state.eventType) ? state.eventType : "all";
  document.querySelector("#market-event-status").value = state.status;
  document.querySelector("#market-event-search").value = state.query;
  document.querySelector("#market-event-start").value = state.customStart ?? "";
  document.querySelector("#market-event-end").value = state.customEnd ?? "";
  customRange.hidden = state.period !== "custom";
  for (const button of document.querySelectorAll("[data-event-market]")) button.setAttribute("aria-pressed", String(button.dataset.eventMarket === state.market));
  for (const button of document.querySelectorAll("[data-event-view]")) button.setAttribute("aria-pressed", String(button.dataset.eventView === state.view));
}

function populateEventTypes() {
  const target = document.querySelector("#market-event-type");
  if (!target) return;
  const types = [...new Set(state.allEvents.map((event) => event.eventType))].sort((left, right) => (EVENT_TYPE_LABELS[left] ?? left).localeCompare(EVENT_TYPE_LABELS[right] ?? right, "zh-Hant"));
  target.innerHTML = `<option value="all">全部事件</option>${types.map((type) => `<option value="${escapeAttribute(type)}">${escapeHtml(EVENT_TYPE_LABELS[type] ?? "公開事件")}</option>`).join("")}`;
}

function visibleEvents() {
  return filterMarketEvents(state.allEvents, {
    asOfDate: state.asOfDate,
    market: state.market,
    period: state.period,
    eventType: state.eventType,
    status: state.status,
    query: state.query,
    customStart: state.customStart,
    customEnd: state.customEnd,
  });
}

function render() {
  if (!state.asOfDate) return;
  const events = visibleEvents();
  const metrics = buildEventMetrics(state.allEvents, state.asOfDate);
  for (const [key, value] of Object.entries(metrics)) {
    const target = document.querySelector(`[data-event-metric-count="${key}"]`);
    if (target) target.textContent = formatNumber(value);
  }
  document.querySelector("#market-event-result-count").textContent = `${formatNumber(events.length)} 筆公開事件`;
  renderList(events);
  renderCalendar(events);
  renderClusters(events);
  toggleView();
}

function renderList(events) {
  const target = document.querySelector("#market-event-list");
  if (!target) return;
  const groups = groupMarketEventsByDate(events);
  target.innerHTML = groups.length ? groups.map((group) => `<section class="market-event-date-group"><header><h3>${dateHeading(group.date, state.asOfDate)}</h3><time datetime="${group.date}">${formatDate(group.date)}</time></header><div>${group.events.map(eventRowHtml).join("")}</div></section>`).join("") : '<p class="empty-state">目前沒有符合條件的已發布公開事件。</p>';
}

function eventRowHtml(event) {
  const distance = calendarDistance(state.asOfDate, event.date);
  const className = distance === 0 ? "is-today" : distance !== null && distance > 0 && distance <= 3 ? "is-soon" : distance !== null && distance < 0 ? "is-complete" : "";
  return `<article class="market-event-row ${className}" data-market-event-id="${escapeAttribute(event.id)}" role="button" tabindex="0" aria-label="查看 ${escapeAttribute(event.entityName)} ${escapeAttribute(event.title)} 明細"><time datetime="${escapeAttribute(event.date)}"><strong>${formatDate(event.date)}</strong><span>${dateWeekday(event.date)}</span></time><span class="market-type-badge market-type-badge--${escapeAttribute(event.market)}">${event.market === "ipo" ? "IPO" : "CB"}</span><div class="market-event-row__identity"><strong>${escapeHtml(event.entityName)}</strong><span>${escapeHtml(event.code)}${event.subtitle ? ` · ${escapeHtml(event.subtitle)}` : ""}</span></div><div class="market-event-row__event"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.eventTypeLabel)}</span></div><span class="market-event-time ${className}">${escapeHtml(eventTimeLabel(event.date, state.asOfDate))}</span><a href="${escapeAttribute(event.detailHref)}" aria-label="前往 ${escapeAttribute(event.entityName)} 詳情">詳情 <span aria-hidden="true">→</span></a></article>`;
}

function renderClusters(events) {
  const target = document.querySelector("#market-event-clusters");
  if (!target) return;
  const groups = groupMarketEventsByEntity(events);
  target.innerHTML = groups.length ? groups.map((group) => `<article class="market-event-cluster"><header><div><span class="market-type-badge market-type-badge--${escapeAttribute(group.market)}">${group.market === "ipo" ? "IPO" : "CB"}</span><h3>${escapeHtml(group.entityName)} <small>${escapeHtml(group.code)}</small></h3><p>${escapeHtml(group.companyName)}</p></div><a href="${escapeAttribute(group.detailHref)}">查看詳情 →</a></header><ol>${group.events.map((event) => `<li class="${timelineClass(event)}"><time>${formatDate(event.date)}</time><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(eventTimeLabel(event.date, state.asOfDate))}</span></li>`).join("")}</ol><button type="button" class="link-button" data-market-event-id="${escapeAttribute(group.events[0].id)}" aria-expanded="false">查看完整事件脈絡</button></article>`).join("") : '<p class="empty-state">目前沒有可依公司或債券群組的公開事件。</p>';
}

function renderCalendar(events) {
  const target = document.querySelector("#market-event-calendar-content");
  const title = document.querySelector("#market-event-calendar-title");
  if (!target || !validMonth(state.calendarMonth)) return;
  const month = state.calendarMonth;
  if (title) title.textContent = month.replace("-", " 年 ") + " 月";
  const byDate = new Map(groupMarketEventsByDate(events).filter((group) => group.date.startsWith(month)).map((group) => [group.date, group.events]));
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells = ["日", "一", "二", "三", "四", "五", "六"].map((weekday) => `<span class="market-event-calendar__weekday">${weekday}</span>`);
  for (let index = 0; index < firstWeekday; index += 1) cells.push('<span class="market-event-calendar__blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const dayEvents = byDate.get(date) ?? [];
    cells.push(dayEvents.length ? `<button type="button" class="market-event-calendar__day ${date === state.asOfDate ? "is-today" : ""}" data-calendar-date="${date}"><strong>${day}</strong><span>${formatNumber(dayEvents.length)} 筆</span><small>${dayEvents.map((event) => event.market === "ipo" ? "IPO" : "CB").filter((value, index, values) => values.indexOf(value) === index).join(" · ")}</small></button>` : `<span class="market-event-calendar__day is-empty"><strong>${day}</strong></span>`);
  }
  const agenda = groupMarketEventsByDate(events).filter((group) => {
    const distance = calendarDistance(state.asOfDate, group.date);
    return distance !== null && distance >= 0 && distance <= 7;
  });
  target.innerHTML = `<div class="market-event-calendar__grid">${cells.join("")}</div><div class="market-event-calendar__agenda">${agenda.length ? agenda.map((group) => `<button type="button" data-calendar-date="${group.date}"><time>${formatDate(group.date)} · ${dateWeekday(group.date)}</time><strong>${group.events.length} 筆公開事件</strong><span>${group.events.map((event) => event.entityName).join("、")}</span></button>`).join("") : '<p class="empty-state">未來 7 日沒有符合條件的公開事件。</p>'}</div>`;
}

function toggleView() {
  document.querySelector("#market-event-list").hidden = state.view !== "list";
  document.querySelector("#market-event-calendar").hidden = state.view !== "calendar";
  document.querySelector("#market-event-clusters").hidden = state.view !== "cluster";
}

function onEventRowClick(event) {
  if (event.target.closest("a")) return;
  const id = event.target.closest("[data-market-event-id]")?.dataset.marketEventId;
  if (id) openDrawerForEvent(id);
}

function onEventRowKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const id = event.target.closest("[data-market-event-id]")?.dataset.marketEventId;
  if (!id) return;
  event.preventDefault();
  openDrawerForEvent(id);
}

function onCalendarDayClick(event) {
  const date = event.target.closest("[data-calendar-date]")?.dataset.calendarDate;
  if (!date) return;
  const events = state.allEvents.filter((candidate) => candidate.date === date);
  if (events.length) openDrawer(events[0], events);
}

function openDrawerForEvent(id) {
  const event = state.allEvents.find((candidate) => candidate.id === id);
  if (!event) return;
  const related = state.allEvents.filter((candidate) => candidate.entityKey === event.entityKey);
  openDrawer(event, related);
}

function openDrawer(event, relatedEvents) {
  const drawer = document.querySelector("#market-event-drawer");
  const target = document.querySelector("#market-event-drawer-content");
  const title = document.querySelector("#market-event-drawer-title");
  if (!drawer || !target || !title) return;
  title.textContent = `${event.entityName} · 事件明細`;
  target.innerHTML = `<dl class="market-event-drawer__facts"><div><dt>日期</dt><dd>${formatDate(event.date)}（${dateWeekday(event.date)}）</dd></div><div><dt>市場</dt><dd>${event.market === "ipo" ? "IPO" : "可轉債"}</dd></div><div><dt>事件</dt><dd>${escapeHtml(event.title)}</dd></div><div><dt>資料日期</dt><dd>${formatDate(event.updatedAt)}</dd></div><div><dt>公開資料</dt><dd>${event.market === "ipo" ? "TWSE／TPEx 已發布資料" : "TPEx 已發布可轉債資料"}</dd></div></dl><section class="market-event-drawer__timeline"><h3>同一標的事件脈絡</h3><ol>${relatedEvents.sort((left, right) => left.date.localeCompare(right.date)).map((item) => `<li class="${timelineClass(item)}"><time>${formatDate(item.date)}</time><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(eventTimeLabel(item.date, state.asOfDate))}</span></div></li>`).join("")}</ol></section><div class="market-event-drawer__actions"><a class="primary-button" href="${escapeAttribute(event.href)}">查看 ${event.market === "ipo" ? "IPO 時程" : "CB 資料"}</a><a class="secondary-button" href="${escapeAttribute(event.detailHref)}">前往個別詳情</a>${officialSourceAction(event)}</div>`;
  if (typeof drawer.showModal === "function") drawer.showModal();
  else drawer.setAttribute("open", "");
}

function closeDrawer() {
  const drawer = document.querySelector("#market-event-drawer");
  if (!drawer) return;
  if (typeof drawer.close === "function") drawer.close();
  else drawer.removeAttribute("open");
}

function officialSourceAction(event) {
  return isAllowedOfficialUrl(event?.officialUrl)
    ? `<a class="secondary-button" href="${escapeAttribute(event.officialUrl)}" target="_blank" rel="noopener noreferrer">官方公告</a>`
    : "";
}

function isAllowedOfficialUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && new Set([
      "www.tpex.org.tw", "www.twse.com.tw", "openapi.twse.com.tw",
      "mops.twse.com.tw", "mopsov.twse.com.tw", "www.tdcc.com.tw",
    ]).has(url.hostname);
  } catch {
    return false;
  }
}

function showUnavailable() {
  document.querySelector("#market-event-update").textContent = "資料暫時無法取得";
  document.querySelector("#market-event-list").innerHTML = '<p class="empty-state">目前沒有可顯示的已發布公開事件。</p>';
}

function timelineClass(event) {
  const distance = calendarDistance(state.asOfDate, event.date);
  return distance === 0 ? "is-current" : distance !== null && distance < 0 ? "is-complete" : "is-upcoming";
}

function dateHeading(date, asOfDate) {
  const distance = calendarDistance(asOfDate, date);
  if (distance === 0) return "今天";
  if (distance === 1) return "明天";
  if (distance !== null && distance > 1 && distance <= 7) return `未來 ${distance} 日`;
  if (distance !== null && distance < 0) return "已完成事件";
  return "後續事件";
}

function dateWeekday(value) {
  if (!validDate(value)) return "";
  return new Intl.DateTimeFormat("zh-TW", { weekday: "short", timeZone: "Asia/Taipei" }).format(new Date(`${value}T00:00:00Z`));
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value ?? ""));
}

function offsetMonth(month, amount) {
  const [year, currentMonth] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, currentMonth - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function optionExists(selector, value) {
  return [...document.querySelector(selector).options].some((option) => option.value === value);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
