const PAGE_SIZE = 50;

export function normalizeBondQuery(value = "") {
  return String(value).normalize("NFC").trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

function normalizeBondDate(value = "") {
  const date = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function normalizeRemainingMax(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function finiteRecordNumber(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validDayCount(value) {
  const parsed = finiteRecordNumber(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizedSecuredStatus(value) {
  if (String(value).trim() === "1") return "有擔保";
  if (String(value).trim() === "2") return "無擔保";
  return normalizeBondQuery(value);
}

export function filterBondRecords(records, {
  query = "",
  archived = false,
  event = "",
  quality = "",
  maturityBefore = "",
  remainingMax = null,
  secured = "",
} = {}) {
  const needle = normalizeBondQuery(query);
  const normalizedEvent = event === "rights90" || event === "maturity365" ? event : "";
  const normalizedQuality = quality === "pending" ? quality : "";
  const normalizedMaturityBefore = normalizeBondDate(maturityBefore);
  const normalizedRemainingMax = normalizeRemainingMax(remainingMax);
  const normalizedSecured = normalizeBondQuery(secured);
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!archived && (record.archived === true || record.status === "archived")) return false;
    if (needle && ![record.bondCode, record.bondName, record.issuerName]
      .some((value) => normalizeBondQuery(value).includes(needle))) return false;
    if (normalizedEvent === "rights90" && !(validDayCount(record.daysToNextEvent) <= 90)) return false;
    if (normalizedEvent === "maturity365" && !(validDayCount(record.daysToMaturity) <= 365)) return false;
    if (normalizedQuality === "pending" && record.dataQuality === "complete") return false;
    if (normalizedMaturityBefore && !(normalizeBondDate(record.maturityDate) && normalizeBondDate(record.maturityDate) <= normalizedMaturityBefore)) return false;
    if (normalizedRemainingMax !== null && !(finiteRecordNumber(record.remainingRatio) <= normalizedRemainingMax)) return false;
    if (normalizedSecured && normalizedSecuredStatus(record.securedStatus) !== normalizedSecured) return false;
    return true;
  });
}

export function sortBondRecords(records, { key = "bondCode", direction = "asc" } = {}) {
  const multiplier = direction === "desc" ? -1 : 1;
  return (Array.isArray(records) ? records : []).map((record, index) => ({ record, index })).sort((left, right) => {
    const a = left.record[key];
    const b = right.record[key];
    const aMissing = a === null || a === undefined || a === "" || a === "-";
    const bMissing = b === null || b === undefined || b === "" || b === "-";
    if (aMissing || bMissing) return aMissing === bMissing ? left.index - right.index : aMissing ? 1 : -1;
    const aNumber = Number(a);
    const bNumber = Number(b);
    const comparison = Number.isFinite(aNumber) && Number.isFinite(bNumber)
      ? aNumber - bNumber
      : normalizeBondQuery(a).localeCompare(normalizeBondQuery(b), "zh-Hant");
    return comparison === 0 ? left.index - right.index : comparison * multiplier;
  }).map(({ record }) => record);
}

export function paginateBondRecords(records, requestedPage = 1) {
  const total = Array.isArray(records) ? records.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.parseInt(requestedPage, 10) || 1), pageCount);
  return { records: records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pageCount, total };
}

export function parseBondListState(search = "") {
  const params = new URLSearchParams(search);
  const event = params.get("event");
  const quality = params.get("quality");
  return {
    query: normalizeBondQuery(params.get("q") || ""),
    archived: params.get("archived") === "1",
    sortKey: params.get("sort") || "bondCode",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
    event: event === "rights90" || event === "maturity365" ? event : "",
    quality: quality === "pending" ? quality : "",
    maturityBefore: normalizeBondDate(params.get("maturityBefore") || ""),
    remainingMax: normalizeRemainingMax(params.get("remainingMax")),
    secured: normalizeBondQuery(params.get("secured") || ""),
  };
}

export function serializeBondListState({
  query = "",
  archived = false,
  sortKey = "bondCode",
  direction = "asc",
  page = 1,
  event = "",
  quality = "",
  maturityBefore = "",
  remainingMax = null,
  secured = "",
} = {}) {
  const params = new URLSearchParams();
  if (normalizeBondQuery(query)) params.set("q", normalizeBondQuery(query));
  if (archived) params.set("archived", "1");
  if (event === "rights90" || event === "maturity365") params.set("event", event);
  if (quality === "pending") params.set("quality", quality);
  if (normalizeBondDate(maturityBefore)) params.set("maturityBefore", normalizeBondDate(maturityBefore));
  if (normalizeRemainingMax(remainingMax) !== null) params.set("remainingMax", String(normalizeRemainingMax(remainingMax)));
  if (normalizeBondQuery(secured)) params.set("secured", normalizeBondQuery(secured));
  if (sortKey) params.set("sort", sortKey);
  params.set("direction", direction === "desc" ? "desc" : "asc");
  params.set("page", String(Math.max(1, Number.parseInt(page, 10) || 1)));
  return `?${params}`;
}
