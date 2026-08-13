import { isIsoDate } from "../../lib/domain/dates.ts";
import { multiplyDecimal } from "../../lib/market-data/decimal.ts";

export function bondTermSummariesFrom11406Rows(rows) {
  if (!Array.isArray(rows)) throw new TypeError("11406 rows must be an array");
  return rows.flatMap((row, index) => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new TypeError(`11406 row ${index + 1} must be an object`);
    }
    const bondCode = sourceText(row, "債券代碼");
    if (bondCode === "") {
      if (isExplicitPrivateUnlistedBond(row)) return [];
      throw new TypeError(`11406 row ${index + 1} has missing bond code`);
    }
    if (!/^\d{5,6}$/.test(bondCode)) {
      if (isExplicitPrivateUnlistedBond(row)) return [];
      throw new TypeError(`11406 row ${index + 1} has invalid bond code`);
    }
    const putText = sourceText(row, "賣回權日期");
    const putDates = putText === "" ? [] : putText
      .split(/[、,;；|\s]+/)
      .filter(Boolean)
      .map((date) => officialDate(date, `11406 row ${index + 1} putDate`));
    const shortName = requiredSourceText(row, "債券簡稱", index);
    const optionalDate = (key, aliases = []) => optionalOfficialDate(row, key, index, aliases);
    const optionalAmount = (key) => optionalOfficialAmount(row, key, index);
    return [{
      bondCode,
      issuerCode: requiredSourceText(row, "機構代碼", index),
      issuerName: requiredSourceText(row, "機構名稱", index),
      shortName,
      bondName: shortName,
      issueDate: optionalDate("發行日期"),
      listingDate: optionalDate("掛牌日期"),
      maturityDate: officialDate(
        requiredSourceText(row, "到期日期", index),
        `11406 row ${index + 1} maturityDate`,
      ),
      issueAmount: officialAmount(
        requiredSourceText(row, "發行總額", index),
        `11406 row ${index + 1} issueAmount`,
      ),
      outstandingAmount: officialAmount(
        requiredSourceText(row, "目前餘額", index),
        `11406 row ${index + 1} outstandingAmount`,
      ),
      outstandingDataDate: optionalDate("資料日期", ["DataDate"]),
      initialConversionPrice: optionalAmount("發行時轉換價格"),
      conversionStartDate: optionalDate("轉換期間起"),
      conversionEndDate: optionalDate("迄"),
      putDates,
      putPrice: putDates.length === 0 ? null : optionalAmount("賣回權價格"),
      securedStatus: optionalSourceText(row, "有無擔保"),
      underwriter: optionalSourceText(row, "承銷機構"),
      trustee: optionalSourceText(row, "受託人"),
    }];
  });
}

function isExplicitPrivateUnlistedBond(row) {
  return sourceText(row, "募集方式") === "8" && sourceText(row, "上市櫃否") === "5";
}

function sourceText(row, key) {
  if (!(key in row) || typeof row[key] !== "string") {
    throw new TypeError(`11406 row is missing string field: ${key}`);
  }
  const text = row[key].trim();
  return new Set(["-", "—", "－"]).has(text) ? "" : text;
}

function requiredSourceText(row, key, index) {
  const value = sourceText(row, key);
  if (value === "") throw new TypeError(`11406 row ${index + 1} requires ${key}`);
  return value;
}

function optionalSourceText(row, key) {
  if (!(key in row)) return null;
  const value = sourceText(row, key);
  if (value === "") return null;
  return value;
}

function optionalSourceAliasText(row, primary, aliases, index) {
  const keys = [primary, ...aliases];
  const present = keys.filter((key) => key in row);
  if (present.length === 0) return "";
  if (present.length !== 1) throw new TypeError(`11406 row ${index + 1} requires exactly one of ${keys.join("/")}`);
  return sourceText(row, present[0]);
}

function optionalOfficialDate(row, key, index, aliases = []) {
  const value = aliases.length === 0
    ? (!(key in row) ? "" : sourceText(row, key))
    : optionalSourceAliasText(row, key, aliases, index);
  return value === "" ? null : officialDate(value, `11406 ${key}`);
}

export function bondInputsFrom11406Rows(rows) {
  return bondTermSummariesFrom11406Rows(rows).map((term) => ({
    bondCode: term.bondCode,
    issuerCode: term.issuerCode,
    issuerName: term.issuerName,
    shortName: term.shortName,
    maturityDate: term.maturityDate,
    issueAmount: term.issueAmount,
    outstandingAmount: term.outstandingAmount,
    outstandingDataDate: term.outstandingDataDate,
    putDates: term.putDates,
  }));
}

function optionalOfficialAmount(row, key, index) {
  if (!(key in row)) return null;
  const value = sourceText(row, key);
  return value === "" ? null : officialAmount(value, `11406 row ${index + 1} ${key}`);
}

function officialDate(value, name) {
  let iso;
  let match;
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(value))) {
    iso = `${match[1]}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})(\d{2})(\d{2})$/.exec(value))) {
    iso = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else if ((match = /^(\d{3})\/(\d{2})\/(\d{2})$/.exec(value))) {
    iso = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  } else {
    iso = value;
  }
  if (!isIsoDate(iso)) throw new TypeError(`${name} must be a valid date`);
  return iso;
}

function officialAmount(value, name) {
  const unitMatch = /^(.*?)(仟元|元)?$/.exec(value.replaceAll(",", ""));
  if (!unitMatch) throw new TypeError(`${name} has an unsupported unit`);
  const text = unitMatch[1];
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new TypeError(`${name} must be a non-negative decimal`);
  const canonical = text.replace(/\.0+$/, "");
  return unitMatch[2] === "仟元" ? multiplyDecimal(canonical, "1000", 0) : canonical;
}
