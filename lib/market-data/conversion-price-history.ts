import { isIsoDate } from "../domain/dates.ts";
import type { ConversionPriceVersion } from "./types.ts";

export type EffectiveConversionPriceVersion = Pick<
  ConversionPriceVersion,
  "bondCode" | "issuerCode" | "effectiveDate" | "currentConversionPrice"
>;

export function selectEffectiveConversionPrice(
  versions: readonly ConversionPriceVersion[],
  evaluationDate: string,
): EffectiveConversionPriceVersion | null {
  if (!isIsoDate(evaluationDate)) {
    throw new TypeError("evaluationDate must be a valid ISO date");
  }
  const normalized = normalizeEffectiveVersions(versions);
  const matching = normalized.filter((version) => version.effectiveDate <= evaluationDate);
  return matching.at(-1) ?? null;
}

function normalizeEffectiveVersions(
  value: readonly ConversionPriceVersion[],
): EffectiveConversionPriceVersion[] {
  if (!Array.isArray(value)) throw new TypeError("conversion price versions must be an array");
  const identities = new Set<string>();
  return value.map((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("conversion price version must be an object");
    }
    const version = value as Record<string, unknown>;
    if (!/^\d{5,6}$/.test(String(version.bondCode)) || !/^\d{4,8}$/.test(String(version.issuerCode))) {
      throw new TypeError("conversion price version identity is invalid");
    }
    if (!isIsoDate(version.effectiveDate)) throw new TypeError("conversion price effectiveDate is invalid");
    if (typeof version.currentConversionPrice !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(version.currentConversionPrice)) {
      throw new TypeError("conversion price currentConversionPrice is invalid");
    }
    const identity = `${version.bondCode}:${version.effectiveDate}`;
    if (identities.has(identity)) throw new TypeError(`duplicate conversion price version: ${identity}`);
    identities.add(identity);
    return Object.freeze({
      bondCode: String(version.bondCode),
      issuerCode: String(version.issuerCode),
      effectiveDate: version.effectiveDate,
      currentConversionPrice: version.currentConversionPrice,
    });
  }).sort(compareVersions);
}

export function mergeConversionPriceVersions(
  previous: readonly ConversionPriceVersion[],
  current: readonly ConversionPriceVersion[],
): readonly ConversionPriceVersion[] {
  const merged = new Map<string, ConversionPriceVersion>();
  for (const version of [...normalizeVersions(previous), ...normalizeVersions(current)]) {
    const key = `${version.bondCode}:${version.effectiveDate}`;
    const existing = merged.get(key);
    if (existing !== undefined && !sameVersion(existing, version)) {
      throw new TypeError(`conflicting conversion price version: ${key}`);
    }
    merged.set(key, version);
  }
  return Object.freeze([...merged.values()].sort(compareVersions));
}

function normalizeVersions(value: readonly ConversionPriceVersion[]): ConversionPriceVersion[] {
  if (!Array.isArray(value)) throw new TypeError("conversion price versions must be an array");
  const versions = value.map((version) => cloneVersion(version));
  const identities = new Set<string>();
  for (const version of versions) {
    const identity = `${version.bondCode}:${version.effectiveDate}`;
    if (identities.has(identity)) throw new TypeError(`duplicate conversion price version: ${identity}`);
    identities.add(identity);
  }
  return versions.sort(compareVersions);
}

function cloneVersion(value: ConversionPriceVersion): ConversionPriceVersion {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("conversion price version must be an object");
  }
  const version = value as Record<string, unknown>;
  const keys = Object.keys(version).sort();
  const expected = [
    "bondCode",
    "currentConversionPrice",
    "effectiveDate",
    "initialConversionPrice",
    "issuerCode",
    "officialDetailUrl",
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError("conversion price version keys do not match the verified contract");
  }
  if (!/^\d{5,6}$/.test(String(version.bondCode)) || !/^\d{4,8}$/.test(String(version.issuerCode))) {
    throw new TypeError("conversion price version identity is invalid");
  }
  if (!isIsoDate(version.effectiveDate)) throw new TypeError("conversion price effectiveDate is invalid");
  for (const key of ["initialConversionPrice", "currentConversionPrice"] as const) {
    if (typeof version[key] !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(version[key])) {
      throw new TypeError(`conversion price ${key} is invalid`);
    }
  }
  const officialDetailUrl = String(version.officialDetailUrl);
  let url: URL;
  try { url = new URL(officialDetailUrl); } catch { throw new TypeError("conversion price officialDetailUrl is invalid"); }
  if (url.protocol !== "https:" || url.hostname !== "mopsov.twse.com.tw") {
    throw new TypeError("conversion price officialDetailUrl is unapproved");
  }
  return Object.freeze({
    bondCode: String(version.bondCode),
    issuerCode: String(version.issuerCode),
    initialConversionPrice: version.initialConversionPrice as string,
    currentConversionPrice: version.currentConversionPrice as string,
    effectiveDate: version.effectiveDate as string,
    officialDetailUrl,
  });
}

function sameVersion(left: ConversionPriceVersion, right: ConversionPriceVersion): boolean {
  return left.bondCode === right.bondCode
    && left.issuerCode === right.issuerCode
    && left.initialConversionPrice === right.initialConversionPrice
    && left.currentConversionPrice === right.currentConversionPrice
    && left.effectiveDate === right.effectiveDate
    && left.officialDetailUrl === right.officialDetailUrl;
}

function compareVersions(
  left: Pick<ConversionPriceVersion, "bondCode" | "effectiveDate">,
  right: Pick<ConversionPriceVersion, "bondCode" | "effectiveDate">,
): number {
  return left.bondCode.localeCompare(right.bondCode)
    || left.effectiveDate.localeCompare(right.effectiveDate);
}
