const PAGE_SIZE = 50;
const PUBLIC_BOND_SCREENERS = new Set([
  "recent90",
  "issue90",
  "maturity90",
  "maturity365",
  "price110",
  "price120",
  "premium0to10",
  "premium10to20",
  "conversion90to110",
  "remainingUnder50",
  "event30",
  "converted75",
  "cheap",
  "conversion100",
  "lowPremium",
]);

export function normalizeBondQuery(value = "") {
  return String(value).normalize("NFC").trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function buildBondSearchSuggestions(records, query, limit = 8) {
  const needle = normalizeBondQuery(query);
  if (!needle) return [];
  const max = Number.isInteger(limit) && limit > 0 ? limit : 8;
  return (Array.isArray(records) ? records : [])
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => [record?.bondCode, record?.bondName, record?.issuerCode, record?.issuerName]
      .some((value) => normalizeBondQuery(value).includes(needle)))
    .sort((left, right) => {
      const leftExact = normalizeBondQuery(left.record.bondCode) === needle;
      const rightExact = normalizeBondQuery(right.record.bondCode) === needle;
      if (leftExact !== rightExact) return leftExact ? -1 : 1;
      return left.index - right.index;
    })
    .slice(0, max)
    .map(({ record }) => ({
      bondCode: String(record.bondCode ?? ""),
      bondName: String(record.bondName ?? ""),
      issuerCode: String(record.issuerCode ?? ""),
      issuerName: String(record.issuerName ?? ""),
      exact: normalizeBondQuery(record.bondCode) === needle,
    }));
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
  maturityBefore = "",
  remainingMax = null,
  secured = "",
} = {}) {
  const needle = normalizeBondQuery(query);
  const normalizedEvent = event === "rights90" || event === "maturity365" ? event : "";
  const normalizedMaturityBefore = normalizeBondDate(maturityBefore);
  const normalizedRemainingMax = normalizeRemainingMax(remainingMax);
  const normalizedSecured = normalizeBondQuery(secured);
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!archived && (record.archived === true || record.status === "archived")) return false;
    if (needle && ![record.bondCode, record.bondName, record.issuerCode, record.issuerName]
      .some((value) => normalizeBondQuery(value).includes(needle))) return false;
    const nextEventDays = validDayCount(record.daysToNextEvent);
    if (normalizedEvent === "rights90" && (nextEventDays === null || nextEventDays > 90)) return false;
    const maturityDays = validDayCount(record.daysToMaturity);
    if (normalizedEvent === "maturity365" && (maturityDays === null || maturityDays > 365)) return false;
    if (normalizedMaturityBefore && !(normalizeBondDate(record.maturityDate) && normalizeBondDate(record.maturityDate) <= normalizedMaturityBefore)) return false;
    const remainingRatio = finiteRecordNumber(record.remainingRatio);
    if (normalizedRemainingMax !== null && (remainingRatio === null || remainingRatio > normalizedRemainingMax)) return false;
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

export function normalizePublicBondScreener(value = "") {
  return PUBLIC_BOND_SCREENERS.has(value) ? value : "";
}

export function applyPublicBondScreener(records, screener, { asOfDate = null } = {}) {
  const values = Array.isArray(records) ? [...records] : [];
  const selected = normalizePublicBondScreener(screener);
  if (!selected) return values;
  if (selected === "recent90") {
    const asOf = normalizeBondDate(asOfDate);
    if (!asOf) return [];
    const start = new Date(`${asOf}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 90);
    const lowerBound = start.toISOString().slice(0, 10);
    return values.filter((record) => {
      const issueDate = normalizeBondDate(record?.issueDate);
      return issueDate && issueDate >= lowerBound && issueDate <= asOf;
    }).sort((left, right) => String(right.issueDate).localeCompare(String(left.issueDate)));
  }
  if (selected === "issue90") return applyPublicBondScreener(values, "recent90", { asOfDate });
  if (selected === "maturity90") return numericScreener(values, "daysToMaturity", (value) => value >= 0 && value <= 90);
  if (selected === "maturity365") return numericScreener(values, "daysToMaturity", (value) => value >= 0 && value <= 365);
  if (selected === "price110") return numericScreener(values, "cbClose", (value) => value <= 110);
  if (selected === "price120") return numericScreener(values, "cbClose", (value) => value <= 120);
  if (selected === "premium0to10") return numericScreener(values, "premiumRate", (value) => value >= 0 && value <= 10);
  if (selected === "premium10to20") return numericScreener(values, "premiumRate", (value) => value >= 10 && value <= 20);
  if (selected === "conversion90to110") return numericScreener(values, "conversionValue", (value) => value >= 90 && value <= 110);
  if (selected === "remainingUnder50") return numericScreener(values, "remainingRatio", (value) => value >= 0 && value < 50);
  if (selected === "event30") return numericScreener(values, "daysToNextEvent", (value) => value >= 0 && value <= 30);
  if (selected === "converted75") return numericScreener(values, "remainingRatio", (value) => value >= 0 && value <= 25);
  if (selected === "cheap") return numericSort(values, (record) => finiteRecordNumber(record?.cbClose));
  if (selected === "conversion100") return numericSort(values, (record) => {
    const conversionValue = finiteRecordNumber(record?.conversionValue);
    return conversionValue === null ? null : Math.abs(conversionValue - 100);
  });
  if (selected === "lowPremium") return numericSort(values, (record) => finiteRecordNumber(record?.premiumRate));
  return values;
}

function numericScreener(records, key, predicate) {
  return records
    .map((record, index) => ({ record, index, value: finiteRecordNumber(record?.[key]) }))
    .filter((item) => item.value !== null && predicate(item.value))
    .sort((left, right) => left.value - right.value || left.index - right.index)
    .map((item) => item.record);
}

function numericSort(records, valueForRecord) {
  return records
    .map((record, index) => ({ record, index, value: valueForRecord(record) }))
    .sort((left, right) => {
      if (left.value === null || right.value === null) return left.value === right.value ? left.index - right.index : left.value === null ? 1 : -1;
      return left.value - right.value || left.index - right.index;
    })
    .map((item) => item.record);
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
  return {
    query: normalizeBondQuery(params.get("q") || ""),
    archived: params.get("archived") === "1",
    sortKey: params.get("sort") || "bondCode",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
    event: event === "rights90" || event === "maturity365" ? event : "",
    maturityBefore: normalizeBondDate(params.get("maturityBefore") || ""),
    remainingMax: normalizeRemainingMax(params.get("remainingMax")),
    secured: normalizeBondQuery(params.get("secured") || ""),
    screener: normalizePublicBondScreener(params.get("screener") || ""),
  };
}

export function serializeBondListState({
  query = "",
  archived = false,
  sortKey = "bondCode",
  direction = "asc",
  page = 1,
  event = "",
  maturityBefore = "",
  remainingMax = null,
  secured = "",
  screener = "",
} = {}) {
  const params = new URLSearchParams();
  if (normalizeBondQuery(query)) params.set("q", normalizeBondQuery(query));
  if (archived) params.set("archived", "1");
  if (event === "rights90" || event === "maturity365") params.set("event", event);
  if (normalizeBondDate(maturityBefore)) params.set("maturityBefore", normalizeBondDate(maturityBefore));
  if (normalizeRemainingMax(remainingMax) !== null) params.set("remainingMax", String(normalizeRemainingMax(remainingMax)));
  if (normalizeBondQuery(secured)) params.set("secured", normalizeBondQuery(secured));
  if (normalizePublicBondScreener(screener)) params.set("screener", normalizePublicBondScreener(screener));
  if (sortKey) params.set("sort", sortKey);
  params.set("direction", direction === "desc" ? "desc" : "asc");
  params.set("page", String(Math.max(1, Number.parseInt(page, 10) || 1)));
  return `?${params}`;
}
