export type CbInstitutionTrade = {
  bondCode: string;
  bondName: string;
  tradingDate: string;
  foreignBuyUnits: string;
  foreignSellUnits: string;
  foreignNetUnits: string;
  trustBuyUnits: string;
  trustSellUnits: string;
  trustNetUnits: string;
  dealerBuyUnits: string;
  dealerSellUnits: string;
  dealerNetUnits: string;
  totalNetUnits: string;
};

export type CbInstitutionDailySnapshot = {
  tradingDate: string;
  tradingUnitFaceValueTwd: "100000";
  records: readonly CbInstitutionTrade[];
};

const ROOT_FIELDS = ["date", "tables", "stat"] as const;
const TABLE_FIELDS = [
  "title",
  "type",
  "date",
  "fields",
  "data",
  "totalCount",
  "notes",
] as const;
const INSTITUTION_FIELDS = [
  "代號",
  "名稱",
  "買張數",
  "賣張數",
  "淨買張數",
  "買張數",
  "賣張數",
  "淨買張數",
  "買張數",
  "賣張數",
  "淨買張數",
  "三大法人買賣超張數",
] as const;
const FACE_VALUE_TITLE_FRAGMENT = "以面額新台幣十萬元為一成交單位";

export function parseCbInstitutionDaily(payload: unknown): CbInstitutionDailySnapshot {
  const root = requireRecord(payload, "CB institutional root");
  assertExactKeys(root, ROOT_FIELDS, "root");
  const tradingDate = parseGregorianDate(root.date);
  if (root.stat !== "ok") {
    throw new TypeError("CB institutional root stat must be ok");
  }
  if (!Array.isArray(root.tables) || root.tables.length !== 1) {
    throw new TypeError("CB institutional root must contain exactly one table");
  }

  const table = requireRecord(root.tables[0], "CB institutional table");
  assertExactKeys(table, TABLE_FIELDS, "table");
  if (table.type !== "Daily") {
    throw new TypeError("CB institutional table type must be Daily");
  }
  if (table.date !== toRocDate(tradingDate)) {
    throw new TypeError("CB institutional date mismatch");
  }
  if (typeof table.title !== "string" || !table.title.includes(FACE_VALUE_TITLE_FRAGMENT)) {
    throw new TypeError("CB institutional title is missing the verified face-value unit");
  }
  assertExactFields(table.fields);
  if (!Array.isArray(table.data)) {
    throw new TypeError("CB institutional table data must be an array");
  }
  const totalCount = table.totalCount;
  if (
    typeof totalCount !== "number"
    || !Number.isSafeInteger(totalCount)
    || totalCount < 0
  ) {
    throw new TypeError("CB institutional totalCount must be a non-negative integer");
  }
  if (totalCount !== table.data.length) {
    throw new TypeError("CB institutional totalCount does not match row count");
  }
  if (!Array.isArray(table.notes)) {
    throw new TypeError("CB institutional table notes must be an array");
  }

  const seenBondCodes = new Set<string>();
  const records = table.data.map((row, index) => {
    const record = parseTradeRow(row, index, tradingDate);
    if (seenBondCodes.has(record.bondCode)) {
      throw new TypeError(`CB institutional table contains duplicate bond code: ${record.bondCode}`);
    }
    seenBondCodes.add(record.bondCode);
    return record;
  });

  return {
    tradingDate,
    tradingUnitFaceValueTwd: "100000",
    records,
  };
}

function parseTradeRow(
  row: unknown,
  index: number,
  tradingDate: string,
): CbInstitutionTrade {
  if (!Array.isArray(row) || row.length !== INSTITUTION_FIELDS.length) {
    throw new TypeError(`CB institutional row ${index + 1} must contain 12 fields`);
  }
  if (!row.every((cell) => typeof cell === "string")) {
    throw new TypeError(`CB institutional row ${index + 1} cells must be strings`);
  }

  const [
    bondCode,
    bondName,
    foreignBuyUnits,
    foreignSellUnits,
    foreignNetUnits,
    trustBuyUnits,
    trustSellUnits,
    trustNetUnits,
    dealerBuyUnits,
    dealerSellUnits,
    dealerNetUnits,
    totalNetUnits,
  ] = row;
  if (!/^\d{5,6}$/.test(bondCode)) {
    throw new TypeError(`invalid CB institutional bond code: ${bondCode}`);
  }
  if (bondName === "") {
    throw new TypeError("CB institutional bond name must not be empty");
  }
  const unitCells = [
    foreignBuyUnits,
    foreignSellUnits,
    foreignNetUnits,
    trustBuyUnits,
    trustSellUnits,
    trustNetUnits,
    dealerBuyUnits,
    dealerSellUnits,
    dealerNetUnits,
    totalNetUnits,
  ].map(normalizeSignedInteger);
  const [
    normalizedForeignBuyUnits,
    normalizedForeignSellUnits,
    normalizedForeignNetUnits,
    normalizedTrustBuyUnits,
    normalizedTrustSellUnits,
    normalizedTrustNetUnits,
    normalizedDealerBuyUnits,
    normalizedDealerSellUnits,
    normalizedDealerNetUnits,
    normalizedTotalNetUnits,
  ] = unitCells;
  if (BigInt(normalizedForeignNetUnits) !== BigInt(normalizedForeignBuyUnits) - BigInt(normalizedForeignSellUnits)) {
    throw new TypeError("CB institutional foreign net units do not match buy minus sell");
  }
  if (BigInt(normalizedTrustNetUnits) !== BigInt(normalizedTrustBuyUnits) - BigInt(normalizedTrustSellUnits)) {
    throw new TypeError("CB institutional trust net units do not match buy minus sell");
  }
  if (BigInt(normalizedDealerNetUnits) !== BigInt(normalizedDealerBuyUnits) - BigInt(normalizedDealerSellUnits)) {
    throw new TypeError("CB institutional dealer net units do not match buy minus sell");
  }
  if (
    BigInt(normalizedTotalNetUnits)
    !== BigInt(normalizedForeignNetUnits) + BigInt(normalizedTrustNetUnits) + BigInt(normalizedDealerNetUnits)
  ) {
    throw new TypeError("CB institutional total net units do not match institutional net units");
  }

  return {
    bondCode,
    bondName,
    tradingDate,
    foreignBuyUnits: normalizedForeignBuyUnits,
    foreignSellUnits: normalizedForeignSellUnits,
    foreignNetUnits: normalizedForeignNetUnits,
    trustBuyUnits: normalizedTrustBuyUnits,
    trustSellUnits: normalizedTrustSellUnits,
    trustNetUnits: normalizedTrustNetUnits,
    dealerBuyUnits: normalizedDealerBuyUnits,
    dealerSellUnits: normalizedDealerSellUnits,
    dealerNetUnits: normalizedDealerNetUnits,
    totalNetUnits: normalizedTotalNetUnits,
  };
}

function normalizeSignedInteger(value: string): string {
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) {
    throw new TypeError("CB institutional unit cells must be signed integers");
  }
  return value.replaceAll(",", "");
}

function assertExactFields(value: unknown): void {
  if (
    !Array.isArray(value)
    || value.length !== INSTITUTION_FIELDS.length
    || !value.every((field, index) => field === INSTITUTION_FIELDS[index])
  ) {
    throw new TypeError("CB institutional fields do not match the verified contract");
  }
}

function parseGregorianDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    throw new TypeError("CB institutional root date must be YYYYMMDD");
  }
  const isoDate = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new TypeError(`invalid CB institutional date: ${value}`);
  }
  return isoDate;
}

function toRocDate(isoDate: string): string {
  return `${Number(isoDate.slice(0, 4)) - 1911}/${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}`;
}

function assertExactKeys(
  record: Record<string, unknown>,
  fields: readonly string[],
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!fields.includes(key)) {
      throw new TypeError(`CB institutional ${name} has unknown ${name} field: ${key}`);
    }
  }
  for (const field of fields) {
    if (!(field in record)) {
      throw new TypeError(`CB institutional ${name} is missing ${name} field: ${field}`);
    }
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
