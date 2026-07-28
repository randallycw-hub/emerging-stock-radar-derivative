import type { NormalizedCompany28567 } from "../../source-verification/source-28567.ts";
import type { NormalizedMonthlyRevenue94025 } from "../../source-verification/source-94025.ts";
import type { D1Database, D1Prepared } from "./d1.ts";
import { RepositoryError } from "./errors.ts";
import type { DatasetId, DatasetRecord } from "./types.ts";

const REVENUE_INSERT = `INSERT INTO emerging_monthly_revenue (snapshot_id,company_code,company_name,industry,report_date,revenue_year_month,current_month_revenue_thousands_twd,previous_month_revenue_thousands_twd,previous_year_same_month_revenue_thousands_twd,month_over_month_percent,year_over_year_percent,current_year_cumulative_revenue_thousands_twd,previous_year_cumulative_revenue_thousands_twd,cumulative_year_over_year_percent,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const PROFILE_INSERT = `INSERT INTO public_company_profiles (snapshot_id,company_code,company_name,company_short_name,unified_business_number,paid_in_capital,chairperson,general_manager,industry_code,industry_name,establishment_date,company_address,company_phone,company_website,public_offering_date,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,NULL,?,?,?,?,NULL,?,NULL,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;

const REVENUE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, industry, report_date as reportDate, revenue_year_month as revenueYearMonth, current_month_revenue_thousands_twd as currentMonthRevenueThousandsTwd, previous_month_revenue_thousands_twd as previousMonthRevenueThousandsTwd, previous_year_same_month_revenue_thousands_twd as previousYearSameMonthRevenueThousandsTwd, month_over_month_percent as monthOverMonthPercent, year_over_year_percent as yearOverYearPercent, current_year_cumulative_revenue_thousands_twd as currentYearCumulativeRevenueThousandsTwd, previous_year_cumulative_revenue_thousands_twd as previousYearCumulativeRevenueThousandsTwd, cumulative_year_over_year_percent as cumulativeYearOverYearPercent, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM emerging_monthly_revenue WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code, revenue_year_month`;
const PROFILE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, company_short_name as companyShortName, unified_business_number as unifiedBusinessNumber, paid_in_capital as paidInCapital, chairperson, general_manager as generalManager, industry_code as industryCode, industry_name as industryName, establishment_date as establishmentDate, company_address as companyAddress, company_phone as companyPhone, company_website as companyWebsite, public_offering_date as publicOfferingDate, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM public_company_profiles WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code`;

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
  if (results.some((result) => {
    const changes = (result.meta as { changes?: unknown } | undefined)?.changes;
    return result.success === false || (changes !== undefined && changes !== 1);
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
    case "11586":
      return [];
    default: {
      const unhandledDataset: never = datasetId;
      void unhandledDataset;
      return invalidRecord();
    }
  }
}
