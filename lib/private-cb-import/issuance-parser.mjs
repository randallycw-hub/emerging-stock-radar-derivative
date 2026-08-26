import readXlsxFile, { readSheetNames } from "read-excel-file/node";

import { isIsoDate } from "./contracts.mjs";

const ISSUANCE_SHEET = "IPO";

export async function parseIssuanceWorkbook(input) {
  const names = await readSheetNames(input.absolutePath);
  if (names.length !== 1 || names[0] !== ISSUANCE_SHEET) throw new TypeError("issuance workbook must contain only the IPO worksheet");
  const rows = await readXlsxFile(input.absolutePath, { sheet: ISSUANCE_SHEET });
  return Object.freeze({
    ...parseIssuanceRows({ fileName: input.absolutePath.split(/[\\/]/).at(-1), rows }),
    kind: "issuance",
    sourceRights: input.sourceRights,
    sha256: input.sha256,
    diagnostics: [],
  });
}

export function parseIssuanceRows({ fileName, rows } = {}) {
  const sourceDate = sourceDateFromFileName(fileName);
  const header = Array.isArray(rows) ? rows.findIndex((row) => text(row?.[1]) === "代碼" && text(row?.[2]) === "債券代碼") : -1;
  if (header < 0) throw new TypeError("issuance worksheet headers are invalid");
  const seen = new Set();
  const records = rows.slice(header + 1).filter((row) => text(row?.[2]) !== "").map((row) => {
    const record = {
      stage: text(row[0]).replaceAll(/\s*\n\s*/g, " / ").replaceAll(/(?:\s*\/\s*){2,}/g, " / "),
      issuerCode: code(row[1], "issuer code", 4),
      bondCode: code(row[2], "bond code", 5),
      bondName: required(row[3], "bond name"),
      tcriGuarantee: optional(row[4]),
      issueAmountBillion: number(row[5], "issue amount"),
      underwriter: optional(row[6]),
      announcementDate: optionalDate(row[7]),
      filingDate: optionalDate(row[8]),
      effectiveDate: optionalDate(row[9]),
      marketingEvent: optional(row[10]),
      premiumRate: numberOrText(row[11]),
      conversionPrice: number(row[12], "conversion price"),
      listingDate: optionalDate(row[13]),
      asoSplitDate: optionalDate(row[14]),
      putCondition: optional(row[15]),
      tenor: optional(row[16]),
      notes: optional(row[17]),
    };
    if (seen.has(record.bondCode)) throw new TypeError(`issuance workbook contains duplicate bond code: ${record.bondCode}`);
    seen.add(record.bondCode);
    return Object.freeze(record);
  });
  return Object.freeze({ sourceDate, records });
}

function sourceDateFromFileName(fileName) {
  const match = /^CB發行案件更新_(\d{4})(\d{2})(\d{2})\.xlsx$/i.exec(String(fileName ?? ""));
  if (!match) throw new TypeError("issuance file name must be CB發行案件更新_YYYYMMDD.xlsx");
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  if (!isIsoDate(date)) throw new TypeError("issuance file name date is invalid");
  return date;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function optional(value) {
  const result = text(value);
  return result === "" || ["-", "--", "—", "－"].includes(result) ? null : result;
}

function required(value, label) {
  const result = optional(value);
  if (!result) throw new TypeError(`${label} is required`);
  return result;
}

function code(value, label, length) {
  const result = text(value);
  if (!new RegExp(`^\\d{${length}}$`).test(result)) throw new TypeError(`${label} is invalid`);
  return result;
}

function number(value, label) {
  const result = optional(value);
  if (result === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`${label} must be finite`);
  return parsed;
}

function numberOrText(value) {
  const result = optional(value);
  if (result === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : result;
}

function optionalDate(value) {
  const result = optional(value);
  if (result === null) return null;
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : result.replace(/\s*\(.+\)$/, "").replaceAll("/", "-");
  return isIsoDate(date) ? date : result;
}
