export function parsePublicCompanyCode(value) {
  return /^\d{4}$/.test(String(value ?? "")) ? String(value) : null;
}

export function canonicalCompanyHref(companyCode) {
  return `./company.html?code=${encodeURIComponent(companyCode)}`;
}

if (typeof document !== "undefined") {
  const root = document.querySelector("#emerging-detail-root");
  const companyCode = parsePublicCompanyCode(new URLSearchParams(location.search).get("code"));
  if (!companyCode) {
    if (root) root.innerHTML = '<p class="empty-cell">請由興櫃市場選擇公司。</p>';
  } else {
    if (root) root.innerHTML = '<p class="empty-cell">正在前往公司研究頁…</p>';
    location.replace(canonicalCompanyHref(companyCode));
  }
}
