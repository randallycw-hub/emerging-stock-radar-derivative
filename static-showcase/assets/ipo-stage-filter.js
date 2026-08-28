const activeStages = new Set(["A", "B", "C", "D"]);
const selectableStages = new Set(["all", "active", "market", "A", "B", "C", "D", "listed", "withdrawn", "delayed", "cancelled"]);
const activeWindowDays = 365;
const approvedSourceIds = new Set([
  "twse-applications",
  "tpex-applications",
  "tpex-ipo-listings",
  "twse-auctions",
  "twse-public-offerings",
]);

export function defaultIpoStage(value, { includeAB = false, activeOnly = false, marketFirst = false } = {}) {
  if (value === null) return marketFirst ? "market" : "active";
  if (includeAB && value === "AB") return "AB";
  if (!selectableStages.has(value)) return "all";
  if (activeOnly && !activeStages.has(value) && value !== "active" && value !== "market" && value !== "all") {
    return "all";
  }
  return value;
}

export function matchesIpoStage(stage, selectedStage) {
  if (selectedStage === "all") return true;
  if (selectedStage === "active") return activeStages.has(stage);
  if (selectedStage === "market") return stage === "C" || stage === "D";
  if (selectedStage === "AB") return stage === "A" || stage === "B";
  return stage === selectedStage;
}

export function matchesIpoRecordStage(row, selectedStage, dataDate) {
  if (selectedStage === "all") return true;
  if (!isActiveIpoRecord(row, dataDate)) return false;
  return matchesIpoStage(row?.stage, selectedStage);
}

export function displayIpoStage(value) {
  return String(value ?? "").trim() || "unknown";
}

export function isActiveIpoRecord(row, dataDate) {
  if (!activeStages.has(row?.stage) || row?.exceptionStatus || !validDate(dataDate)) return false;
  const evidenceDates = (Array.isArray(row?.events) ? row.events : [])
    .filter((event) => hasApprovedIpoEventEvidence(event) && validDate(event?.date))
    .map((event) => event.date);
  if (evidenceDates.length === 0) return false;
  const latestActivityDate = [row?.applicationDate, ...evidenceDates].filter(validDate).sort().at(-1);
  return latestActivityDate
    ? calendarDistance(latestActivityDate, dataDate) <= activeWindowDays
    : false;
}

export function normalizeApprovedIpoEvents(record, sourceManifest = []) {
  const manifestSourceIds = new Set((Array.isArray(sourceManifest) ? sourceManifest : [])
    .map((entry) => entry?.sourceId)
    .filter((sourceId) => approvedSourceIds.has(sourceId)));
  return (Array.isArray(record?.events) ? record.events : [])
    .filter((event) => validDate(event?.date) && event?.label)
    .map((event) => {
      const sourceId = approvedSourceIdForRecordIds(event.sourceRecordIds, manifestSourceIds);
      const verified = event?.verified === true || sourceId !== null;
      return {
        date: event.date,
        label: String(event.label),
        kind: String(event.kind ?? event.type ?? event.label),
        ...(sourceId === null ? {} : { sourceId }),
        verified,
      };
    })
    .filter((event) => event.verified);
}

export function projectActiveIpoEventEntries(rows, dataDate) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => (
    isActiveIpoRecord(row, dataDate)
      ? row.events
        .filter((event) => hasApprovedIpoEventEvidence(event)
          && validDate(event?.date)
          && calendarDistance(event.date, dataDate) <= activeWindowDays)
        .map((event) => ({ row, event }))
      : []
  ));
}

export function selectPublishedUpcomingEvents(entries, dataDate, days = 7) {
  if (!validDate(dataDate)) return [];
  return (Array.isArray(entries) ? entries : [])
    .filter(({ event }) => validDate(event?.date))
    .filter(({ event }) => {
      const distance = calendarDistance(dataDate, event.date);
      return distance >= 0 && distance <= days;
    })
    .sort((left, right) => left.event.date.localeCompare(right.event.date)
      || String(left.row?.companyCode ?? "").localeCompare(String(right.row?.companyCode ?? "")));
}

export function publicIpoTimelineHref(companyCode) {
  return `./ipo.html?q=${encodeURIComponent(String(companyCode ?? "").trim())}`;
}

export function publicCompanyHref(companyCode) {
  return `./company.html?code=${encodeURIComponent(String(companyCode ?? "").trim())}`;
}

function hasApprovedIpoEventEvidence(event) {
  return event?.verified === true || approvedSourceIds.has(event?.sourceId);
}

export function shouldWriteIpoStage(stage) {
  return stage !== "active" && stage !== "market";
}

function approvedSourceIdForRecordIds(recordIds, manifestSourceIds) {
  for (const recordId of Array.isArray(recordIds) ? recordIds : []) {
    const sourceId = sourceIdForRecordId(recordId);
    if (sourceId && manifestSourceIds.has(sourceId)) return sourceId;
  }
  return null;
}

function sourceIdForRecordId(recordId) {
  const value = String(recordId ?? "");
  if (/^TWSE:auction:\d{4}:/.test(value)) return "twse-auctions";
  if (/^TWSE:(?:public|public-offering):\d{4}:/.test(value)) return "twse-public-offerings";
  if (/^TPEx:ipo-no-limit:\d{4}:/i.test(value)) return "tpex-ipo-listings";
  if (/^TWSE:\d{4}:/.test(value)) return "twse-applications";
  if (/^TPEx:\d{4}:/.test(value)) return "tpex-applications";
  return null;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function calendarDistance(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
