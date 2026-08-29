function recordsOf(value) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.records) ? value.records : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function companyCode(value) {
  const code = text(value);
  return /^\d{4}$/.test(code) ? code : null;
}

function bondCode(value) {
  const code = text(value);
  return /^\d{5,6}$/.test(code) ? code : null;
}

function isoDate(value) {
  const date = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** Creates an exact-code lookup for public company display identity. */
export function indexCanonicalCompanies(value) {
  const indexed = new Map();
  for (const record of recordsOf(value)) {
    const stockCode = companyCode(record?.stockCode);
    const companyName = text(record?.companyName);
    const market = text(record?.market);
    if (!stockCode || !companyName || !market) continue;
    indexed.set(stockCode, {
      companyCode: stockCode,
      companyName,
      market,
      industryName: text(record?.industry) || "—",
      companyDataDate: isoDate(record?.dataDate),
    });
  }
  return indexed;
}

/** Returns no identity when a company is absent rather than guessing by name. */
export function applyCanonicalCompanyIdentity(record, companies) {
  if (!(companies instanceof Map)) return null;
  return companies.get(companyCode(record?.companyCode)) ?? null;
}

/** Creates an exact-code lookup for public CB and underlying-company identity. */
export function indexCanonicalBonds(value) {
  const indexed = new Map();
  for (const record of recordsOf(value)) {
    const code = bondCode(record?.bondCode);
    const stockCode = companyCode(record?.stockCode);
    const bondName = text(record?.bondName);
    const companyName = text(record?.companyName);
    const market = text(record?.market);
    if (!code || !stockCode || !bondName || !companyName || !market) continue;
    indexed.set(code, {
      bondCode: code,
      bondName,
      issuerCode: stockCode,
      issuerName: companyName,
      market,
      bondDataDate: isoDate(record?.dataDate),
    });
  }
  return indexed;
}

/** Returns no relationship when the exact CB code is not in the canonical master. */
export function applyCanonicalBondIdentity(record, bonds) {
  if (!(bonds instanceof Map)) return null;
  return bonds.get(bondCode(record?.bondCode)) ?? null;
}

async function readJson(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
}

/** Loads the published canonical masters used by every display page. */
export async function loadCanonicalPublicMasters({
  fetchImpl = globalThis.fetch,
  baseUrl = globalThis.location?.href,
  includeBonds = true,
} = {}) {
  if (typeof fetchImpl !== "function" || typeof baseUrl !== "string") return null;
  try {
    const pointer = await readJson(new URL("./data/current.json", baseUrl), fetchImpl);
    if (typeof pointer?.runtimeUrl !== "string") return null;
    const runtime = await readJson(new URL(pointer.runtimeUrl, baseUrl), fetchImpl);
    if (typeof runtime?.companyMasterUrl !== "string") return null;
    if (includeBonds && typeof runtime?.cbMasterUrl !== "string") return null;
    const companyMaster = await readJson(new URL(runtime.companyMasterUrl, baseUrl), fetchImpl);
    const cbMaster = includeBonds
      ? await readJson(new URL(runtime.cbMasterUrl, baseUrl), fetchImpl)
      : [];
    return {
      companies: indexCanonicalCompanies(companyMaster),
      bonds: indexCanonicalBonds(cbMaster),
    };
  } catch {
    return null;
  }
}
