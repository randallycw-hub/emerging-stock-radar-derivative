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

function companyCodeOf(record) {
  return safeText(record?.companyCode ?? record?.issuerCode ?? record?.term?.issuerCode);
}

function companyNameOf(record) {
  return safeText(record?.companyName ?? record?.issuerName ?? record?.term?.issuerName);
}

function bondCodeOf(record) {
  return safeText(record?.bondCode ?? record?.term?.bondCode);
}

function bondNameOf(record) {
  return safeText(record?.bondName ?? record?.term?.bondName);
}

export function buildCompanySearchResults(query, indexes = {}) {
  const needle = normalizePublicSearch(query);
  if (!needle) return [];
  const companies = new Map();
  const ensureCompany = (record) => {
    const code = companyCodeOf(record);
    const label = companyNameOf(record);
    if (!/^\d{4}$/.test(code) || !label) return null;
    const current = companies.get(code);
    if (current) return current;
    const next = { code, label, bonds: [] };
    companies.set(code, next);
    return next;
  };

  for (const record of Array.isArray(indexes.emerging) ? indexes.emerging : []) ensureCompany(record);
  for (const record of Array.isArray(indexes.ipo) ? indexes.ipo : []) ensureCompany(record);
  for (const record of Array.isArray(indexes.bonds) ? indexes.bonds : []) {
    const company = ensureCompany(record);
    const bondCode = bondCodeOf(record);
    const bondName = bondNameOf(record);
    if (!company || !bondCode || !bondName) continue;
    if (!company.bonds.some((bond) => bond.code === bondCode)) {
      company.bonds.push({
        code: bondCode,
        label: bondName,
        href: `./bonds.html?bond=${encodeURIComponent(bondCode)}`,
      });
    }
  }

  return [...companies.values()]
    .filter((company) => recordMatches(needle, [
      company.code,
      company.label,
      ...company.bonds.flatMap((bond) => [bond.code, bond.label]),
    ]))
    .map((company) => ({
      kind: "公司",
      code: company.code,
      label: company.label,
      href: `./company.html?code=${encodeURIComponent(company.code)}`,
      bonds: company.bonds.sort((left, right) => left.code.localeCompare(right.code)),
    }))
    .sort((left, right) => (normalizePublicSearch(left.code) === needle ? -1 : 0)
      - (normalizePublicSearch(right.code) === needle ? -1 : 0)
      || left.code.localeCompare(right.code, "zh-Hant"))
    .slice(0, MAX_RESULTS);
}

export function searchPublicRecords(query, indexes = {}) {
  return buildCompanySearchResults(query, indexes);
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
    runtime.datasets?.bondWorkbench ? fetchJson(new URL(runtime.datasets.bondWorkbench, document.baseURI)) : null,
    runtime.emergingMarketUrl ? fetchJson(new URL(runtime.emergingMarketUrl, document.baseURI)) : null,
    runtime.ipoEventsUrl ? fetchJson(new URL(runtime.ipoEventsUrl, document.baseURI)) : null,
  ]);
  return {
    bonds: Array.isArray(bonds?.records) ? bonds.records : Array.isArray(bonds) ? bonds : [],
    emerging: Array.isArray(emerging) ? emerging : Array.isArray(emerging?.records) ? emerging.records : [],
    ipo: Array.isArray(ipo?.records) ? ipo.records : [],
  };
}

export function isGlobalSearchShortcut(event = {}) {
  return Boolean((event.ctrlKey || event.metaKey)
    && !event.altKey
    && String(event.key ?? "").toLowerCase() === "k");
}

function renderSearchResults(results, rows) {
  const matches = buildCompanySearchResults(results.value, rows);
  results.hidden = matches.length === 0;
  results.innerHTML = matches.map((row) => `<article class="search-result-card"><a role="option" href="${escapeHtml(row.href)}"><strong>${escapeHtml(row.code)} ${escapeHtml(row.label)}</strong><span>查看公司研究</span></a>${row.bonds.length ? `<div class="search-result-card__bonds"><span>可轉債</span>${row.bonds.map((bond) => `<a href="${escapeHtml(bond.href)}">${escapeHtml(bond.code)} ${escapeHtml(bond.label)}</a>`).join("")}</div>` : ""}</article>`).join("");
  return matches.length;
}

function createHeaderSearch(header) {
  if (header.querySelector("[data-site-search]")) return header.querySelector("[data-site-search]");
  const form = document.createElement("form");
  form.className = "site-search";
  form.dataset.siteSearch = "";
  form.setAttribute("role", "search");
  form.innerHTML = '<button type="button" class="site-search__mobile-trigger" aria-label="開啟全站搜尋" aria-controls="site-search-results" aria-expanded="false">搜尋</button><label><span class="sr-only">搜尋公司、股票代碼、CB</span><input type="search" autocomplete="off" placeholder="搜尋公司、股票代碼、CB" aria-controls="site-search-results" aria-expanded="false"></label><div id="site-search-results" class="site-search__results" data-site-search-results role="listbox" hidden></div>';
  header.insertBefore(form, header.querySelector("#theme-toggle"));
  return form;
}

function bindSearchSurface(form, indexes) {
  if (!form || form.dataset.searchBound === "true") return null;
  const input = form.querySelector("input");
  const results = form.querySelector("[data-site-search-results]");
  const mobileTrigger = form.querySelector(".site-search__mobile-trigger");
  if (!input || !results) return null;
  form.dataset.searchBound = "true";
  let activeResultIndex = -1;
  const closeMobileSearch = () => {
    delete form.dataset.mobileOpen;
    mobileTrigger?.setAttribute("aria-expanded", "false");
    activeResultIndex = -1;
    input.setAttribute("aria-expanded", "false");
    results.hidden = true;
  };
  mobileTrigger?.addEventListener("click", () => {
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
  input.addEventListener("input", () => {
    const count = renderSearchResults(input, indexes);
    activeResultIndex = -1;
    input.setAttribute("aria-expanded", String(count > 0));
  });
  input.addEventListener("keydown", (event) => {
    const options = [...results.querySelectorAll('a[role="option"]')];
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileSearch();
      input.focus();
      return;
    }
    if (!options.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    if (event.key === "Enter" && activeResultIndex >= 0) {
      event.preventDefault();
      options[activeResultIndex].click();
      return;
    }
    if (event.key === "Enter") return;
    event.preventDefault();
    activeResultIndex = event.key === "ArrowDown"
      ? (activeResultIndex + 1) % options.length
      : (activeResultIndex - 1 + options.length) % options.length;
    options[activeResultIndex].focus();
  });
  return { form, input, close: closeMobileSearch };
}

async function initializeSiteSearch() {
  const header = document.querySelector(".site-header__inner");
  if (!header) return;
  const headerForm = createHeaderSearch(header);
  const indexes = await loadIndexes();
  const surfaces = [
    bindSearchSurface(headerForm, indexes),
    bindSearchSurface(document.querySelector("#home-primary-search"), indexes),
  ].filter(Boolean);
  const headerSurface = surfaces[0];
  document.addEventListener("keydown", (event) => {
    if (!isGlobalSearchShortcut(event)) return;
    event.preventDefault();
    if (headerSurface) {
      headerSurface.form.dataset.mobileOpen = "";
      headerSurface.input.focus();
    }
  });
}

if (globalThis.window && globalThis.document) initializeSiteSearch();
