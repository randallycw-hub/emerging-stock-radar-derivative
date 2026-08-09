export type CbUnderwritingCase = {
  referenceNumber: string;
  filedDate: string;
  leadUnderwriter: string;
  issuerName: string;
  guaranteeType: "secured" | "unsecured";
  placementMethods: readonly string[];
  caseStatus: string;
};

export type CbUnderwritingSnapshot = {
  rocYear: number;
  notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。";
  records: readonly CbUnderwritingCase[];
};

const NOTICE = "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。";
const RESULT_TABLE_ID = "ctl00_cphMain_gvResult";
const HEADERS = [
  "序號",
  "申報日期",
  "主辦承銷商",
  "案件名稱",
  "方式",
  "發行性質",
  "發行種類",
  "配售方式一",
  "配售方式二",
  "案件狀態",
  "公告檔",
] as const;

const ENTITY_VALUES: Readonly<Record<string, string>> = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function parseCbUnderwritingHtml(html: string): CbUnderwritingSnapshot {
  if (typeof html !== "string") {
    throw new TypeError("CB underwriting HTML must be a string");
  }

  const documentHtml = stripScriptsAndStyles(html);
  if (!toText(documentHtml).includes(NOTICE)) {
    throw new TypeError("CB underwriting notice does not match the verified contract");
  }

  const rocYear = parseRocYear(documentHtml);
  const tableHtml = findResultTable(documentHtml);
  const rows = extractRows(tableHtml);
  if (rows.length < 1) {
    throw new TypeError("CB underwriting result table must contain a header row");
  }

  const headers = extractCells(rows[0]);
  assertExactHeaders(headers);

  const records = rows.slice(1).map((row, index) => parseCaseRow(extractCells(row), index));
  return { rocYear, notice: NOTICE, records: records.filter((record): record is CbUnderwritingCase => record !== null) };
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
}

function parseRocYear(html: string): number {
  const title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!title) {
    throw new TypeError("CB underwriting page title is missing");
  }
  const match = /^(\d{3})年－承銷公告$/.exec(toText(title[1]));
  if (!match || match[1] === "000") {
    throw new TypeError("CB underwriting page title does not match the verified contract");
  }
  return Number(match[1]);
}

function findResultTable(html: string): string {
  const tables = Array.from(html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table\s*>/gi));
  const resultTables = tables.filter((table) => hasExactId(table[1], RESULT_TABLE_ID));
  if (resultTables.length !== 1) {
    throw new TypeError("CB underwriting result table does not match the verified contract");
  }
  return resultTables[0][2];
}

function hasExactId(attributes: string, id: string): boolean {
  const attribute = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes);
  return attribute !== null && (attribute[1] ?? attribute[2]) === id;
}

function extractRows(tableHtml: string): readonly string[] {
  return Array.from(
    tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi),
    (match) => match[1],
  );
}

function extractCells(rowHtml: string): readonly string[] {
  return Array.from(
    rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)\s*>/gi),
    (match) => toText(match[1]),
  );
}

function assertExactHeaders(headers: readonly string[]): void {
  if (
    headers.length !== HEADERS.length
    || !headers.every((header, index) => header === HEADERS[index])
  ) {
    throw new TypeError("CB underwriting headers do not match the verified contract");
  }
}

function parseCaseRow(cells: readonly string[], index: number): CbUnderwritingCase | null {
  if (cells.length !== HEADERS.length) {
    throw new TypeError(`CB underwriting row ${index + 1} must contain 11 fields`);
  }

  const [
    referenceNumber,
    filedDate,
    leadUnderwriter,
    issuerName,
    ,
    issuanceNature,
    issuanceKind,
    primaryPlacementMethod,
    secondaryPlacementMethod,
    caseStatus,
  ] = cells;
  assertRequiredCell(referenceNumber, "reference number", index);
  assertRequiredCell(filedDate, "filed date", index);
  assertRequiredCell(leadUnderwriter, "lead underwriter", index);
  assertRequiredCell(issuerName, "issuer name", index);
  assertRequiredCell(caseStatus, "case status", index);

  const guaranteeType = getGuaranteeType(issuanceNature, issuanceKind);
  if (guaranteeType === null) {
    return null;
  }

  return {
    referenceNumber,
    filedDate,
    leadUnderwriter,
    issuerName,
    guaranteeType,
    placementMethods: [primaryPlacementMethod, secondaryPlacementMethod].filter((method) => method !== ""),
    caseStatus,
  };
}

function assertRequiredCell(value: string, name: string, index: number): void {
  if (value === "") {
    throw new TypeError(`CB underwriting row ${index + 1} ${name} must not be empty`);
  }
}

function getGuaranteeType(
  issuanceNature: string,
  issuanceKind: string,
): CbUnderwritingCase["guaranteeType"] | null {
  if (issuanceNature !== "公司債") {
    return null;
  }
  if (issuanceKind === "有擔保轉換公司債") {
    return "secured";
  }
  if (issuanceKind === "無擔保轉換公司債") {
    return "unsecured";
  }
  return null;
}

function toText(html: string): string {
  return decodeNamedEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeNamedEntities(value: string): string {
  return value.replace(/&(amp|gt|lt|nbsp|quot);/g, (_, name: string) => ENTITY_VALUES[name]);
}
