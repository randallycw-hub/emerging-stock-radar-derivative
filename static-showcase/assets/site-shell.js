const themeStorageKey = "market-theme";

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

function initializeShell() {
  initializeTheme();
  initializeNavigation();
  initializeActivePage();
}

if (typeof document !== "undefined") initializeShell();
