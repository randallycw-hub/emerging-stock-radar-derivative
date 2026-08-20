const PAGE_SIZE = 50;

export function normalizeBondQuery(value = "") {
  return String(value).normalize("NFC").trim().replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

export function filterBondRecords(records, { query = "", archived = false } = {}) {
  const needle = normalizeBondQuery(query);
  return (Array.isArray(records) ? records : []).filter((record) => {
    if (!archived && (record.archived === true || record.status === "archived")) return false;
    if (!needle) return true;
    return [record.bondCode, record.bondName, record.issuerName]
      .some((value) => normalizeBondQuery(value).includes(needle));
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
  return {
    query: normalizeBondQuery(params.get("q") || ""),
    archived: params.get("archived") === "1",
    sortKey: params.get("sort") || "bondCode",
    direction: params.get("direction") === "desc" ? "desc" : "asc",
    page: Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1),
  };
}

export function serializeBondListState({ query = "", archived = false, sortKey = "bondCode", direction = "asc", page = 1 } = {}) {
  const params = new URLSearchParams();
  if (normalizeBondQuery(query)) params.set("q", normalizeBondQuery(query));
  if (archived) params.set("archived", "1");
  if (sortKey) params.set("sort", sortKey);
  params.set("direction", direction === "desc" ? "desc" : "asc");
  params.set("page", String(Math.max(1, Number.parseInt(page, 10) || 1)));
  return `?${params}`;
}
