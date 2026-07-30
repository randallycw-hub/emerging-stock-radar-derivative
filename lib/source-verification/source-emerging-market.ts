import { isIsoDate } from "../domain/dates.ts";

export type EmergingMarketSourceRow = {
  tradingDate: string;
  publishedTime: string;
  companyCode: string;
  companyName: string;
  previousAveragePrice: string | null;
  dailyAveragePrice: string | null;
  dailyHighPrice: string | null;
  dailyLowPrice: string | null;
  transactionVolume: string | null;
  applyingDate: string | null;
  applyingStatus: string | null;
};

export function parseEmergingMarketSource(
  payload: unknown,
): EmergingMarketSourceRow[] {
  if (!Array.isArray(payload)) {
    throw new TypeError("emerging market payload must be an array");
  }

  const seen = new Set<string>();
  return payload.map((value, index) => {
    const source = requireRecord(value, `emerging market row ${index + 1}`);
    const tradingDate = normalizeRocDate(requiredString(source.Date, "Date"));
    const companyCode = requiredString(source.SecuritiesCompanyCode, "SecuritiesCompanyCode");
    const key = `${tradingDate}:${companyCode}`;
    if (seen.has(key)) {
      throw new TypeError(`duplicate company code: ${companyCode} on ${tradingDate}`);
    }
    seen.add(key);

    return {
      tradingDate,
      publishedTime: normalizeTime(requiredString(source.Time, "Time")),
      companyCode,
      companyName: requiredString(source.CompanyName, "CompanyName"),
      previousAveragePrice: optionalNumeric(source.PreviousAveragePrice, "PreviousAveragePrice"),
      dailyAveragePrice: optionalNumeric(source.Average, "Average"),
      dailyHighPrice: optionalNumeric(source.Highest, "Highest"),
      dailyLowPrice: optionalNumeric(source.Lowest, "Lowest"),
      transactionVolume: optionalNumeric(source.TransactionVolume, "TransactionVolume"),
      applyingDate: optionalString(source.ApplyingDate, "ApplyingDate"),
      applyingStatus: optionalString(source.ApplyingStatus, "ApplyingStatus"),
    };
  });
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string | null {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  const text = value.trim();
  return text === "" || text === "-" ? null : text;
}

function optionalNumeric(value: unknown, field: string): string | null {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  const text = value.trim();
  if (text === "" || text === "-") return null;
  return Number.isFinite(Number(text.replaceAll(",", ""))) ? text : null;
}

function normalizeRocDate(value: string): string {
  const match = /^(\d{3})(\d{2})(\d{2})$/.exec(value);
  if (match === null) throw new TypeError("Date must use ROC YYYMMDD format");
  const isoDate = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  if (!isIsoDate(isoDate)) throw new TypeError("Date must be a valid ROC date");
  return isoDate;
}

function normalizeTime(value: string): string {
  const match = /^(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (match === null) throw new TypeError("Time must use HHMMSS format");
  const [hour, minute, second] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new TypeError("Time must be a valid time");
  }
  return `${match[1]}:${match[2]}:${match[3]}`;
}
