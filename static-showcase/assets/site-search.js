import { marketDetailHref } from "./site-shell.js";

const MAX_RESULTS = 8;

export function normalizePublicSearch(value = "") {
  return String(value).normalize("NFC").trim().toUpperCase();
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function recordMatches(query, values) {
  return values.some((value) => normalizePublicSearch(value).includes(query));
}

export function searchPublicRecords(query, indexes = {}) {
  const needle = normalizePublicSearch(query);
  if (!needle) return [];
  const companyRows = [
    ...(Array.isArray(indexes.emerging) ? indexes.emerging : []).map((record) => ({
      code: safeText(record?.companyCode), label: safeText(record?.companyName),
    })),
    ...(Array.isArray(indexes.ipo) ? indexes.ipo : []).map((record) => ({
      code: safeText(record?.companyCode), label: safeText(record?.companyName),
    })),
    ...(Array.isArray(indexes.bonds) ? indexes.bonds : []).map((record) => ({
      code: safeText(record?.issuerCode), label: safeText(record?.issuerName),
    })),
  ].filter((row) => /^\d{4}$/.test(row.code) && row.label && recordMatches(needle, [row.code, row.label]));
  const companies = companyRows.filter((row, index, rows) => rows.findIndex((candidate) => candidate.code === row.code) === index).map((row) => ({
    kind: "公司", ...row, href: `./company.html?code=${encodeURIComponent(row.code)}`,
  }));
  const rows = [
    ...companies,
    ...(Array.isArray(indexes.emerging) ? indexes.emerging : []).map((record) => ({
      kind: "興櫃", code: safeText(record?.companyCode), label: safeText(record?.companyName),
      href: marketDetailHref(safeText(record?.companyCode)),
    })),
    ...(Array.isArray(indexes.ipo) ? indexes.ipo : []).map((record) => ({
      kind: "IPO", code: safeText(record?.companyCode), label: safeText(record?.companyName),
      href: `./ipo-radar.html?q=${encodeURIComponent(safeText(record?.companyCode))}`,
    })),
    ...(Array.isArray(indexes.bonds) ? indexes.bonds : []).map((record) => ({
      kind: "可轉債", code: safeText(record?.bondCode),
      label: [safeText(record?.bondName), safeText(record?.issuerName)].filter(Boolean).join("／"),
      href: `./bonds.html?bond=${encodeURIComponent(safeText(record?.bondCode))}`,
    })),
  ].filter((row) => row.code && row.label && recordMatches(needle, [row.code, row.label]));

  return rows
    .sort((left, right) => (normalizePublicSearch(left.code) === needle ? -1 : 0)
      - (normalizePublicSearch(right.code) === needle ? -1 : 0)
      || left.kind.localeCompare(right.kind, "zh-Hant")
      || left.code.localeCompare(right.code, "zh-Hant"))
    .slice(0, MAX_RESULTS);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

async function loadIndexes() {
  const config = globalThis.window?.__OFFICIAL_SHOWCASE__ ?? { generationPointerUrl: "./data/current.json" };
  const pointer = await fetchJson(config.generationPointerUrl);
  const runtime = pointer?.runtimeUrl ? await fetchJson(new URL(pointer.runtimeUrl, document.baseURI)) : null;
  if (!runtime) return {};
  const [bonds, emerging, ipo] = await Promise.all([
    runtime.datasets?.["11406"] ? fetchJson(new URL(runtime.datasets["11406"], document.baseURI)) : null,
    runtime.emergingMarketUrl ? fetchJson(new URL(runtime.emergingMarketUrl, document.baseURI)) : null,
    runtime.ipoEventsUrl ? fetchJson(new URL(runtime.ipoEventsUrl, document.baseURI)) : null,
  ]);
  return {
    bonds: Array.isArray(bonds) ? bonds : [],
    emerging: Array.isArray(emerging) ? emerging : Array.isArray(emerging?.records) ? emerging.records : [],
    ipo: Array.isArray(ipo?.records) ? ipo.records : [],
  };
}

async function initializeSiteSearch() {
  const header = document.querySelector(".site-header__inner");
  if (!header || document.querySelector("[data-site-search]")) return;
  const form = document.createElement("form");
  form.className = "site-search";
  form.dataset.siteSearch = "";
  form.setAttribute("role", "search");
  form.innerHTML = '<button type="button" class="site-search__mobile-trigger" aria-label="開啟全站搜尋" aria-controls="site-search-results" aria-expanded="false">搜尋</button><label><span class="sr-only">搜尋公開代碼或名稱</span><input type="search" autocomplete="off" placeholder="搜尋代碼或名稱" aria-controls="site-search-results" aria-expanded="false"></label><div id="site-search-results" class="site-search__results" role="listbox" hidden></div>';
  header.insertBefore(form, header.querySelector("#theme-toggle"));
  const input = form.querySelector("input");
  const results = form.querySelector("#site-search-results");
  const mobileTrigger = form.querySelector(".site-search__mobile-trigger");
  const closeMobileSearch = () => {
    delete form.dataset.mobileOpen;
    mobileTrigger.setAttribute("aria-expanded", "false");
  };
  mobileTrigger.addEventListener("click", () => {
    form.dataset.mobileOpen = "";
    mobileTrigger.setAttribute("aria-expanded", "true");
    input.focus();
  });
  form.addEventListener("submit", (event) => event.preventDefault());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileSearch();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!form.contains(event.target)) closeMobileSearch();
  });
  const indexes = await loadIndexes();
  input.addEventListener("input", () => {
    const rows = searchPublicRecords(input.value, indexes);
    results.hidden = rows.length === 0;
    input.setAttribute("aria-expanded", String(rows.length > 0));
    results.innerHTML = rows.map((row) => `<a role="option" href="${escapeHtml(row.href)}"><span>${escapeHtml(row.kind)}</span><strong>${escapeHtml(row.code)}</strong> ${escapeHtml(row.label)}</a>`).join("");
  });
}

if (globalThis.window && globalThis.document) initializeSiteSearch();
