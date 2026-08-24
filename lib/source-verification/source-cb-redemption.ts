export type CbRedemptionEvent = {
  issuerCode: string;
  issuerName: string;
  bondCode: string;
  bondName: string;
  announcementDate: string;
  delistingDate: string;
  subject: string;
  detailUrl: string;
};

const ROOT_FIELDS = ["date", "tables", "stat"] as const;
const TABLE_FIELDS = ["title", "data", "fields", "totalCount"] as const;
const REDEMPTION_FIELDS = ["公司代號", "公司名稱", "申報日期", "主旨", "內容"] as const;
const TABLE_TITLE = "轉換公司債行使贖回權公告";
const SUBJECT_PATTERN = /簡稱[：:]\s*([^，,)]+)[，,]\s*代碼[：:]\s*(\d{5,6})\).*?訂於(\d{3})年(\d{2})月(\d{2})日終止櫃檯買賣/;
const DETAIL_QUERY_PARAMETERS = ["TYPEK", "co_id", "date1", "seq_no", "pub_class", "firstin"] as const;

export function parseCbRedemptionAnnouncements(payload: unknown): readonly CbRedemptionEvent[] {
  const root = requireRecord(payload, "CB redemption root");
  assertExactKeys(root, ROOT_FIELDS, "root");
  const announcementYear = parseAnnualRootDate(root.date);
  if (root.stat !== "ok") {
    throw new TypeError("CB redemption root stat must be ok");
  }
  if (!Array.isArray(root.tables) || root.tables.length !== 1) {
    throw new TypeError("CB redemption root must contain exactly one table");
  }

  const table = requireRecord(root.tables[0], "CB redemption table");
  assertExactKeys(table, TABLE_FIELDS, "table");
  if (table.title !== TABLE_TITLE) {
    throw new TypeError("CB redemption table title does not match the verified contract");
  }
  assertExactFields(table.fields);
  if (!Array.isArray(table.data)) {
    throw new TypeError("CB redemption table data must be an array");
  }
  const totalCount = table.totalCount;
  if (
    typeof totalCount !== "number"
    || !Number.isSafeInteger(totalCount)
    || totalCount < 0
  ) {
    throw new TypeError("CB redemption table totalCount must be a non-negative integer");
  }
  if (totalCount !== table.data.length) {
    throw new TypeError("CB redemption table totalCount does not match row count");
  }

  const seen = new Set<string>();
  return table.data.map((row, index) => {
    const event = parseRow(row, index, announcementYear);
    const eventKey = `${event.bondCode}:${event.announcementDate}`;
    if (seen.has(eventKey)) {
      throw new TypeError(`CB redemption table contains duplicate bond announcement: ${eventKey}`);
    }
    seen.add(eventKey);
    return event;
  });
}

function parseRow(row: unknown, index: number, announcementYear: string): CbRedemptionEvent {
  if (!Array.isArray(row) || row.length !== REDEMPTION_FIELDS.length) {
    throw new TypeError(`CB redemption row ${index + 1} must contain 5 fields`);
  }
  if (!row.every((cell) => typeof cell === "string")) {
    throw new TypeError(`CB redemption row ${index + 1} cells must be strings`);
  }

  const [issuerCode, issuerName, rocAnnouncementDate, subject, detailUrl] = row;
  if (!/^\d{4}$/.test(issuerCode)) {
    throw new TypeError("CB redemption issuer code must be a four-digit code");
  }
  if (issuerName.trim() === "") {
    throw new TypeError("CB redemption issuer name must not be empty");
  }
  const announcementDate = parseRocDate(rocAnnouncementDate, "announcement date");
  if (!announcementDate.startsWith(`${announcementYear}-`)) {
    throw new TypeError("CB redemption announcement date does not match the annual query year");
  }
  const subjectMatch = SUBJECT_PATTERN.exec(subject);
  if (!subjectMatch) {
    throw new TypeError("CB redemption subject is missing a valid delisting date");
  }
  const [, bondName, bondCode, rocDelistingYear, delistingMonth, delistingDay] = subjectMatch;
  const bondSuffix = bondCode.slice(issuerCode.length);
  if (!bondCode.startsWith(issuerCode) || !/^\d{1,2}$/.test(bondSuffix)) {
    throw new TypeError("CB redemption issuer does not match the extracted bond code");
  }
  if (!subject.startsWith(`公告${issuerName}`)) {
    throw new TypeError("CB redemption issuer name does not match the subject announcement prefix");
  }
  const delistingDate = parseRocDate(
    `${rocDelistingYear}/${delistingMonth}/${delistingDay}`,
    "delisting date",
  );
  assertDetailUrl(detailUrl, issuerCode, announcementDate);

  return {
    issuerCode,
    issuerName,
    bondCode,
    bondName,
    announcementDate,
    delistingDate,
    subject,
    detailUrl,
  };
}

function assertDetailUrl(value: string, issuerCode: string, announcementDate: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("CB redemption detail URL must be an absolute URL");
  }
  if (url.protocol !== "https:") {
    throw new TypeError("CB redemption detail URL must use HTTPS");
  }
  if (url.host !== "mopsov.twse.com.tw") {
    throw new TypeError("CB redemption detail URL host does not match the verified MOPS host");
  }
  if (url.pathname !== "/mops/web/ajax_t120sb23") {
    throw new TypeError("CB redemption detail URL path does not match the verified MOPS detail path");
  }
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new TypeError("CB redemption detail URL must not contain credentials or a fragment");
  }
  assertExactDetailQuery(url.searchParams);
  if (
    url.searchParams.get("TYPEK") !== "otc"
    || !/^[1-9]\d*$/.test(url.searchParams.get("seq_no") ?? "")
    || url.searchParams.get("pub_class") !== "0"
    || url.searchParams.get("firstin") !== "1"
  ) {
    throw new TypeError("CB redemption detail URL query values do not match the verified contract");
  }
  if (url.searchParams.get("co_id") !== issuerCode) {
    throw new TypeError("CB redemption detail URL issuer code does not match the row issuer");
  }
  if (url.searchParams.get("date1") !== announcementDate.replaceAll("-", "")) {
    throw new TypeError("CB redemption detail URL announcement date does not match the row announcement date");
  }
}

function parseAnnualRootDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}0101$/.test(value)) {
    throw new TypeError("CB redemption root date must be an annual YYYY0101 date");
  }
  const year = value.slice(0, 4);
  if (year === "0000") {
    throw new TypeError("CB redemption root date must not use a zero year");
  }
  if (!isIsoDate(`${year}-01-01`)) {
    throw new TypeError("CB redemption root date must be a valid annual date");
  }
  return year;
}

function parseRocDate(value: string, name: string): string {
  const match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!match) {
    throw new TypeError(`CB redemption ${name} must be a ROC date`);
  }
  if (match[1] === "000") {
    throw new TypeError(`CB redemption ${name} must not use a zero year`);
  }
  const isoDate = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  if (!isIsoDate(isoDate)) {
    throw new TypeError(`CB redemption ${name} must be a valid ROC date`);
  }
  return isoDate;
}

function assertExactDetailQuery(searchParams: URLSearchParams): void {
  for (const [parameter] of searchParams) {
    if (!DETAIL_QUERY_PARAMETERS.includes(parameter as typeof DETAIL_QUERY_PARAMETERS[number])) {
      throw new TypeError(`CB redemption detail URL query contains an unexpected parameter: ${parameter}`);
    }
  }
  for (const parameter of DETAIL_QUERY_PARAMETERS) {
    if (searchParams.getAll(parameter).length !== 1) {
      throw new TypeError(`CB redemption detail URL query parameter must appear exactly once: ${parameter}`);
    }
  }
}

function isIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertExactFields(value: unknown): void {
  if (
    !Array.isArray(value)
    || value.length !== REDEMPTION_FIELDS.length
    || !value.every((field, index) => field === REDEMPTION_FIELDS[index])
  ) {
    throw new TypeError("CB redemption fields do not match the verified contract");
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  fields: readonly string[],
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!fields.includes(key)) {
      throw new TypeError(`CB redemption ${name} has unknown ${name} field: ${key}`);
    }
  }
  for (const field of fields) {
    if (!(field in record)) {
      throw new TypeError(`CB redemption ${name} is missing ${name} field: ${field}`);
    }
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
