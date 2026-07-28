import type { NormalizedCompany28567 } from "../../source-verification/source-28567.ts";
import type { NormalizedBondIssue11406 } from "../../source-verification/source-11406.ts";
import type { NormalizedMonthlyRevenue94025 } from "../../source-verification/source-94025.ts";
import type { D1Database, D1Prepared } from "./d1.ts";
import { RepositoryError } from "./errors.ts";
import type { DatasetId, DatasetRecord } from "./types.ts";

const REVENUE_INSERT = `INSERT INTO emerging_monthly_revenue (snapshot_id,company_code,company_name,industry,report_date,revenue_year_month,current_month_revenue_thousands_twd,previous_month_revenue_thousands_twd,previous_year_same_month_revenue_thousands_twd,month_over_month_percent,year_over_year_percent,current_year_cumulative_revenue_thousands_twd,previous_year_cumulative_revenue_thousands_twd,cumulative_year_over_year_percent,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const PROFILE_INSERT = `INSERT INTO public_company_profiles (snapshot_id,company_code,company_name,company_short_name,unified_business_number,paid_in_capital,chairperson,general_manager,industry_code,industry_name,establishment_date,company_address,company_phone,company_website,public_offering_date,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL,?,NULL,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const BOND_INSERT = `INSERT INTO bond_issuances (snapshot_id,bond_code,bond_name,issuer_company_code,issuer_company_name,issue_date,listing_date,maturity_date,issue_amount,current_outstanding_balance,coupon_rate,guarantee_status,initial_conversion_price,conversion_start_date,conversion_end_date,underwriter,trustee,latest_balance_change_date,latest_balance_change_reason,offering_method,official_data_date,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const BOND_PUT_RIGHT_INSERT = `INSERT INTO bond_put_rights (snapshot_id,bond_code,sequence,put_date,put_price) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bond_issuances WHERE snapshot_id = ? AND bond_code = ? AND source_id = ? AND resource_id = ?)`;

const REVENUE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, industry, report_date as reportDate, revenue_year_month as revenueYearMonth, current_month_revenue_thousands_twd as currentMonthRevenueThousandsTwd, previous_month_revenue_thousands_twd as previousMonthRevenueThousandsTwd, previous_year_same_month_revenue_thousands_twd as previousYearSameMonthRevenueThousandsTwd, month_over_month_percent as monthOverMonthPercent, year_over_year_percent as yearOverYearPercent, current_year_cumulative_revenue_thousands_twd as currentYearCumulativeRevenueThousandsTwd, previous_year_cumulative_revenue_thousands_twd as previousYearCumulativeRevenueThousandsTwd, cumulative_year_over_year_percent as cumulativeYearOverYearPercent, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM emerging_monthly_revenue WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code, revenue_year_month`;
const PROFILE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, company_short_name as companyShortName, unified_business_number as unifiedBusinessNumber, paid_in_capital as paidInCapital, chairperson, general_manager as generalManager, industry_code as industryCode, industry_name as industryName, establishment_date as establishmentDate, company_address as companyAddress, company_phone as companyPhone, company_website as companyWebsite, public_offering_date as publicOfferingDate, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM public_company_profiles WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code`;
const BOND_SELECT = `SELECT snapshot_id as snapshotId, bond_code as bondCode, bond_name as bondName, issuer_company_code as issuerCompanyCode, issuer_company_name as issuerCompanyName, issue_date as issueDate, listing_date as listingDate, maturity_date as maturityDate, issue_amount as issueAmount, current_outstanding_balance as currentOutstandingBalance, coupon_rate as couponRate, guarantee_status as guaranteeStatus, initial_conversion_price as initialConversionPrice, conversion_start_date as conversionStartDate, conversion_end_date as conversionEndDate, underwriter, trustee, latest_balance_change_date as latestBalanceChangeDate, latest_balance_change_reason as latestBalanceChangeReason, offering_method as offeringMethod, official_data_date as officialDataDate, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM bond_issuances WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY bond_code`;
const BOND_PUT_RIGHT_SELECT = `SELECT snapshot_id as snapshotId, bond_code as bondCode, sequence, put_date as putDate, put_price as putPrice FROM bond_put_rights WHERE snapshot_id = ? ORDER BY bond_code, sequence`;

function assertRecordScope(datasetId: DatasetId, snapshotId: string, record: DatasetRecord): void {
  if (
    !snapshotId.trim()
    || record.datasetId !== datasetId
    || record.snapshotId !== snapshotId
    || !record.naturalIdentity.trim()
  ) {
    throw new RepositoryError("DATASET_RECORD_SCOPE_MISMATCH");
  }
}

function invalidRecord(): never {
  throw new RepositoryError("INVALID_DATASET_RECORD");
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalidRecord();
  return value as Record<string, unknown>;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalidRecord();
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value);
}

function bindRevenueInsert(db: D1Database, snapshotId: string, record: DatasetRecord): D1Prepared[] {
  const value = asObject(record.value);
  if (value.revenueUnit !== "仟元") return invalidRecord();
  const binds = [
    snapshotId,
    requiredString(value.companyCode),
    requiredString(value.companyName),
    requiredString(value.industryName),
    requiredString(value.sourcePublishedOn),
    requiredString(value.yearMonth),
    requiredString(value.currentMonthRevenue),
    optionalString(value.previousMonthRevenue),
    optionalString(value.priorYearMonthRevenue),
    optionalString(value.monthOverMonthPercent),
    optionalString(value.yearOverYearPercent),
    optionalString(value.cumulativeRevenue),
    optionalString(value.priorYearCumulativeRevenue),
    optionalString(value.cumulativeYearOverYearPercent),
    record.naturalIdentity,
    snapshotId,
    "94025",
    "94025",
    "94025-csv",
  ];
  return [db.prepare(REVENUE_INSERT).bind(...binds)];
}

function bindProfileInsert(db: D1Database, snapshotId: string, record: DatasetRecord): D1Prepared[] {
  const value = asObject(record.value);
  if (value.sourceDatasetId !== "28567" || requiredString(value.sourceRecordId) !== record.naturalIdentity) {
    return invalidRecord();
  }
  const binds = [
    snapshotId,
    requiredString(value.companyCode),
    requiredString(value.companyName),
    requiredString(value.companyShortName),
    requiredString(value.taxId),
    requiredString(value.paidInCapital),
    requiredString(value.chairperson),
    requiredString(value.generalManager),
    requiredString(value.industryName),
    requiredString(value.establishmentDate),
    requiredString(value.address),
    requiredString(value.websiteUrl),
    record.naturalIdentity,
    snapshotId,
    "28567",
    "28567",
    "28567-csv",
  ];
  return [db.prepare(PROFILE_INSERT).bind(...binds)];
}

function bindBondInsert(db: D1Database, snapshotId: string, record: DatasetRecord): D1Prepared[] {
  const value = asObject(record.value);
  const bondId = requiredString(value.bondId);
  if (record.naturalIdentity !== bondId) return invalidRecord();
  const bondCode = optionalString(value.bondCode) ?? bondId;
  const putDates = value.putDates;
  if (!Array.isArray(putDates)) return invalidRecord();
  const putPrice = putDates.length === 0 ? optionalString(value.putPrice) : requiredString(value.putPrice);
  if (putDates.length === 0 && putPrice !== null) return invalidRecord();
  const parentBinds = [
    snapshotId,
    bondCode,
    requiredString(value.shortName),
    requiredString(value.issuerCode),
    requiredString(value.issuerName),
    requiredString(value.issueDate),
    optionalString(value.listingDate),
    requiredString(value.maturityDate),
    requiredString(value.issueAmount),
    requiredString(value.outstandingAmount),
    optionalString(value.couponRate),
    value.secured === true ? "secured" : value.secured === false ? "unsecured" : invalidRecord(),
    optionalString(value.initialConversionPrice),
    optionalString(value.conversionStartDate),
    optionalString(value.conversionEndDate),
    optionalString(value.underwriter),
    optionalString(value.trustee),
    optionalString(value.outstandingChangeDate),
    optionalString(value.outstandingChangeReason),
    optionalString(value.offeringMethod),
    requiredString(value.officialDataDate),
    record.naturalIdentity,
    snapshotId,
    "11406",
    "11406",
    "11406-csv",
  ];
  const statements = [db.prepare(BOND_INSERT).bind(...parentBinds)];
  const dates = new Set<string>();
  for (const [index, putDate] of putDates.entries()) {
    const normalizedDate = requiredString(putDate);
    if (dates.has(normalizedDate) || index + 1 <= 0) return invalidRecord();
    dates.add(normalizedDate);
    statements.push(db.prepare(BOND_PUT_RIGHT_INSERT).bind(
      snapshotId,
      bondCode,
      index + 1,
      normalizedDate,
      putPrice,
      snapshotId,
      bondCode,
      "11406",
      "11406-csv",
    ));
  }
  return statements;
}

function bindInsertStatements(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
  record: DatasetRecord,
): D1Prepared[] {
  switch (datasetId) {
    case "94025":
      return bindRevenueInsert(db, snapshotId, record);
    case "28567":
      return bindProfileInsert(db, snapshotId, record);
    case "11406":
      return bindBondInsert(db, snapshotId, record);
    case "11586":
      return invalidRecord();
    default: {
      const unhandledDataset: never = datasetId;
      void unhandledDataset;
      return invalidRecord();
    }
  }
}

function assertRowScope(row: Record<string, unknown>, snapshotId: string, sourceId: string, resourceId: string): void {
  if (
    requiredString(row.snapshotId) !== snapshotId
    || requiredString(row.sourceId) !== sourceId
    || requiredString(row.resourceId) !== resourceId
  ) return invalidRecord();
  requiredString(row.fetchedAt);
  requiredString(row.responseHash);
}

function mapRevenueRow(row: Record<string, unknown>, snapshotId: string): DatasetRecord {
  assertRowScope(row, snapshotId, "94025", "94025-csv");
  const value: NormalizedMonthlyRevenue94025 = {
    companyCode: requiredString(row.companyCode),
    companyName: requiredString(row.companyName),
    industryName: requiredString(row.industry),
    yearMonth: requiredString(row.revenueYearMonth),
    sourcePublishedOn: requiredString(row.reportDate),
    revenueUnit: "仟元",
    currentMonthRevenue: requiredString(row.currentMonthRevenueThousandsTwd),
    previousMonthRevenue: optionalString(row.previousMonthRevenueThousandsTwd) ?? undefined,
    priorYearMonthRevenue: optionalString(row.previousYearSameMonthRevenueThousandsTwd) ?? undefined,
    monthOverMonthPercent: optionalString(row.monthOverMonthPercent) ?? undefined,
    yearOverYearPercent: optionalString(row.yearOverYearPercent) ?? undefined,
    cumulativeRevenue: optionalString(row.currentYearCumulativeRevenueThousandsTwd) ?? undefined,
    priorYearCumulativeRevenue: optionalString(row.previousYearCumulativeRevenueThousandsTwd) ?? undefined,
    cumulativeYearOverYearPercent: optionalString(row.cumulativeYearOverYearPercent) ?? undefined,
  };
  return { datasetId: "94025", snapshotId, naturalIdentity: requiredString(row.sourceRecordId), value };
}

function mapProfileRow(row: Record<string, unknown>, snapshotId: string): DatasetRecord {
  assertRowScope(row, snapshotId, "28567", "28567-csv");
  const sourceRecordId = requiredString(row.sourceRecordId);
  const value: NormalizedCompany28567 = {
    sourceDatasetId: "28567",
    sourceRecordId,
    companyCode: requiredString(row.companyCode),
    companyName: requiredString(row.companyName),
    companyShortName: requiredString(row.companyShortName),
    industryName: requiredString(row.industryName),
    websiteUrl: requiredString(row.companyWebsite),
    establishmentDate: requiredString(row.establishmentDate),
    paidInCapital: requiredString(row.paidInCapital),
    chairperson: requiredString(row.chairperson),
    generalManager: requiredString(row.generalManager),
    taxId: requiredString(row.unifiedBusinessNumber),
    address: requiredString(row.companyAddress),
  };
  return { datasetId: "28567", snapshotId, naturalIdentity: sourceRecordId, value };
}

interface BondPutRightRow {
  bondCode: string;
  sequence: number;
  putDate: string;
  putPrice: string;
}

function mapBondPutRightRow(row: Record<string, unknown>, snapshotId: string): BondPutRightRow {
  if (requiredString(row.snapshotId) !== snapshotId) return invalidRecord();
  const sequence = row.sequence;
  if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence <= 0) return invalidRecord();
  return {
    bondCode: requiredString(row.bondCode),
    sequence,
    putDate: requiredString(row.putDate),
    putPrice: requiredString(row.putPrice),
  };
}

function mapBondRow(
  row: Record<string, unknown>,
  snapshotId: string,
  putRights: readonly BondPutRightRow[],
): DatasetRecord {
  assertRowScope(row, snapshotId, "11406", "11406-csv");
  const sourceRecordId = requiredString(row.sourceRecordId);
  const bondCode = requiredString(row.bondCode);
  const seenSequences = new Set<number>();
  for (const putRight of putRights) {
    if (putRight.bondCode !== bondCode || seenSequences.has(putRight.sequence)) return invalidRecord();
    seenSequences.add(putRight.sequence);
  }
  const putPrice = putRights.length === 0
    ? undefined
    : requiredString(putRights[0].putPrice);
  if (putRights.some((putRight) => putRight.putPrice !== putPrice)) return invalidRecord();
  const guaranteeStatus = requiredString(row.guaranteeStatus);
  if (guaranteeStatus !== "secured" && guaranteeStatus !== "unsecured") return invalidRecord();
  const value = {
    bondId: sourceRecordId,
    bondCode: bondCode === sourceRecordId ? undefined : bondCode,
    issuerCode: requiredString(row.issuerCompanyCode),
    issuerName: requiredString(row.issuerCompanyName),
    shortName: requiredString(row.bondName),
    issueDate: requiredString(row.issueDate),
    listingDate: optionalString(row.listingDate) ?? undefined,
    maturityDate: requiredString(row.maturityDate),
    issueAmount: requiredString(row.issueAmount),
    outstandingAmount: requiredString(row.currentOutstandingBalance),
    couponRate: optionalString(row.couponRate) ?? undefined,
    secured: guaranteeStatus === "secured",
    initialConversionPrice: optionalString(row.initialConversionPrice) ?? undefined,
    conversionStartDate: optionalString(row.conversionStartDate) ?? undefined,
    conversionEndDate: optionalString(row.conversionEndDate) ?? undefined,
    putDates: putRights.map((putRight) => putRight.putDate),
    putPrice,
    underwriter: optionalString(row.underwriter) ?? undefined,
    trustee: optionalString(row.trustee) ?? undefined,
    outstandingChangeDate: optionalString(row.latestBalanceChangeDate) ?? undefined,
    outstandingChangeReason: optionalString(row.latestBalanceChangeReason) ?? undefined,
    offeringMethod: optionalString(row.offeringMethod) ?? undefined,
    officialDataDate: requiredString(row.officialDataDate),
  } satisfies Partial<NormalizedBondIssue11406>;
  return { datasetId: "11406", snapshotId, naturalIdentity: sourceRecordId, value };
}

async function readRows(db: D1Database, sql: string, snapshotId: string, sourceId: string, resourceId: string): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(sql).bind(snapshotId, sourceId, resourceId).all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function writeD1DatasetRecords(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
  records: readonly DatasetRecord[],
): Promise<void> {
  records.forEach((record) => assertRecordScope(datasetId, snapshotId, record));
  const statements = records.flatMap((record) => bindInsertStatements(db, datasetId, snapshotId, record));
  if (statements.length === 0) return;

  const results = await db.batch(statements);
  if (results.length !== statements.length || results.some((result) => {
    const changes = (result.meta as { changes?: unknown } | undefined)?.changes;
    return result.success !== true || changes !== 1;
  })) {
    throw new RepositoryError("DATASET_RECORD_WRITE_FAILED");
  }
}

export async function readD1DatasetRecords(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
): Promise<readonly DatasetRecord[]> {
  switch (datasetId) {
    case "94025":
      return (await readRows(db, REVENUE_SELECT, snapshotId, "94025", "94025-csv"))
        .map((row) => mapRevenueRow(asObject(row), snapshotId));
    case "28567":
      return (await readRows(db, PROFILE_SELECT, snapshotId, "28567", "28567-csv"))
        .map((row) => mapProfileRow(asObject(row), snapshotId));
    case "11406":
      return readBondRecords(db, snapshotId);
    case "11586":
      return [];
    default: {
      const unhandledDataset: never = datasetId;
      void unhandledDataset;
      return invalidRecord();
    }
  }
}

async function readBondRecords(db: D1Database, snapshotId: string): Promise<readonly DatasetRecord[]> {
  const [parentRows, putRightRows] = await Promise.all([
    readRows(db, BOND_SELECT, snapshotId, "11406", "11406-csv"),
    db.prepare(BOND_PUT_RIGHT_SELECT).bind(snapshotId).all<Record<string, unknown>>(),
  ]);
  const putRightsByBondCode = new Map<string, BondPutRightRow[]>();
  for (const row of putRightRows.results ?? []) {
    const putRight = mapBondPutRightRow(asObject(row), snapshotId);
    const existing = putRightsByBondCode.get(putRight.bondCode) ?? [];
    existing.push(putRight);
    putRightsByBondCode.set(putRight.bondCode, existing);
  }
  const records = parentRows.map((row) => {
    const parent = asObject(row);
    const bondCode = requiredString(parent.bondCode);
    const putRights = putRightsByBondCode.get(bondCode) ?? [];
    putRightsByBondCode.delete(bondCode);
    return mapBondRow(parent, snapshotId, putRights);
  });
  if (putRightsByBondCode.size !== 0) return invalidRecord();
  return records;
}
