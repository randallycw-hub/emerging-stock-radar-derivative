const themeStorageKey = "market-theme";

export const PUBLIC_PRIMARY_NAVIGATION = Object.freeze([
  Object.freeze({ key: "home", label: "總覽", href: "./index.html" }),
  Object.freeze({ key: "emerging", label: "興櫃", href: "./emerging.html" }),
  Object.freeze({ key: "ipo", label: "IPO", href: "./ipo-radar.html" }),
  Object.freeze({ key: "bonds", label: "可轉債", href: "./bonds.html" }),
  Object.freeze({ key: "data-center", label: "資料中心", href: "./data-center.html" }),
]);

export function renderMobileNavigation(activePage = "") {
  return PUBLIC_PRIMARY_NAVIGATION.map(({ key, label, href }) => (
    `<a href="${href}"${key === activePage ? ' aria-current="page"' : ""}>${label}</a>`
  )).join("");
}

export function marketDetailHref(companyCode) {
  return `./market.html?code=${encodeURIComponent(String(companyCode ?? "").trim())}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const isoDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}/${isoDate[2]}/${isoDate[3]}`;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(date);
}

export function formatNumber(value, options = {}) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("zh-TW", options).format(number);
}

export function formatPublicProvenance(value) {
  if (!value || typeof value !== "object") return "";
  const label = typeof value.label === "string" ? value.label.trim() : "";
  const asOfDate = typeof value.asOfDate === "string" ? value.asOfDate : "";
  if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) return "";
  return `資料日期 ${formatDate(asOfDate)} · ${label}`;
}

export async function safeJsonFetch(
  url,
  {
    errorTarget = null,
    errorMessage = "資料暫時無法讀取，請稍後再試。",
    fetchImpl = globalThis.fetch,
  } = {},
) {
  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return await response.json();
  } catch {
    if (errorTarget) {
      errorTarget.textContent = errorMessage;
      errorTarget.hidden = false;
    }
    return null;
  }
}

function storedTheme() {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    if (stored === "dark" || stored === "light") return stored;
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;
  const isDark = theme === "dark";
  toggle.setAttribute("aria-pressed", String(isDark));
  const label = toggle.querySelector("[data-theme-label]");
  if (label) label.textContent = isDark ? "淺色模式" : "深色模式";
}

function initializeTheme() {
  applyTheme(storedTheme());
  document.querySelector("#theme-toggle")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {}
  });
}

function initializeNavigation() {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector("#nav-toggle");
  const navigation = document.querySelector("#primary-navigation");
  if (!header || !toggle || !navigation) return;

  const closeNavigation = ({ restoreFocus = false } = {}) => {
    header.removeAttribute("data-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) toggle.focus();
  };

  toggle.addEventListener("click", () => {
    const opens = toggle.getAttribute("aria-expanded") !== "true";
    if (!opens) {
      closeNavigation();
      return;
    }
    header.setAttribute("data-nav-open", "");
    toggle.setAttribute("aria-expanded", "true");
    navigation.querySelector("a")?.focus();
  });

  navigation.addEventListener("click", () => closeNavigation());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      closeNavigation({ restoreFocus: true });
    }
  });
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) closeNavigation();
  });
}

function initializeActivePage() {
  const activePage = document.body.dataset.page;
  if (!activePage) return;
  for (const link of document.querySelectorAll("[data-page-link]")) {
    if (link.dataset.pageLink === activePage) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function initializeMobileNavigation() {
  if (document.querySelector("[data-mobile-navigation]")) return;
  const navigation = document.createElement("nav");
  navigation.className = "mobile-bottom-navigation";
  navigation.dataset.mobileNavigation = "";
  navigation.setAttribute("aria-label", "行動版主要導覽");
  navigation.innerHTML = renderMobileNavigation(document.body.dataset.page);
  document.body.append(navigation);
}

function initializeShell() {
  initializeTheme();
  initializeNavigation();
  initializeActivePage();
  initializeMobileNavigation();
}

if (typeof document !== "undefined") initializeShell();
if (typeof document !== "undefined") import("./site-search.js");
