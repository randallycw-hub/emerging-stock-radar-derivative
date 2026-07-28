import type { NormalizedCompany28567 } from "../../source-verification/source-28567.ts";
import type { NormalizedBondIssue11406 } from "../../source-verification/source-11406.ts";
import type { NormalizedMonthlyRevenue94025 } from "../../source-verification/source-94025.ts";
import { isIsoDate } from "../../domain/dates.ts";
import type { ListingApplicationStage11586, NormalizedListingApplicationWithStage11586 } from "../adapters/11586-csv.ts";
import type { D1Database, D1Prepared } from "./d1.ts";
import { RepositoryError } from "./errors.ts";
import type { DatasetId, DatasetRecord } from "./types.ts";

const REVENUE_INSERT = `INSERT INTO emerging_monthly_revenue (snapshot_id,company_code,company_name,industry,report_date,revenue_year_month,current_month_revenue_thousands_twd,previous_month_revenue_thousands_twd,previous_year_same_month_revenue_thousands_twd,month_over_month_percent,year_over_year_percent,current_year_cumulative_revenue_thousands_twd,previous_year_cumulative_revenue_thousands_twd,cumulative_year_over_year_percent,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const PROFILE_INSERT = `INSERT INTO public_company_profiles (snapshot_id,company_code,company_name,company_short_name,unified_business_number,paid_in_capital,chairperson,general_manager,industry_code,industry_name,establishment_date,company_address,company_phone,company_website,public_offering_date,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,NULL,?,?,?,NULL,?,NULL,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const BOND_INSERT = `INSERT INTO bond_issuances (snapshot_id,bond_code,bond_name,issuer_company_code,issuer_company_name,source_bond_type_code,series_number,tranche_number,issue_date,listing_date,maturity_date,issue_amount,current_outstanding_balance,coupon_rate,guarantee_status,security_description,initial_conversion_price,conversion_start_date,conversion_end_date,underwriter,trustee,latest_balance_change_date,latest_balance_change_reason,offering_method,official_data_date,source_record_identity,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const BOND_PUT_RIGHT_INSERT = `INSERT INTO bond_put_rights (snapshot_id,bond_code,sequence,put_date,put_price) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bond_issuances WHERE snapshot_id = ? AND bond_code = ? AND source_id = ? AND resource_id = ?)`;
const LISTING_APPLICATION_INSERT = `INSERT INTO listing_applications (snapshot_id,source_record_identity,official_index,company_code,company_short_name,chairman_name,application_date,application_capital_thousands_twd,listing_review_date,board_approval_date,listing_contract_approval_or_filing_date,listing_date,note,chronology_status,source_id,resource_id,fetched_at,response_hash) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,source_id,resource_id,fetched_at,response_hash FROM source_snapshots WHERE snapshot_id = ? AND dataset_id = ? AND source_id = ? AND resource_id = ?`;
const LISTING_UNDERWRITER_INSERT = `INSERT INTO listing_application_underwriters (snapshot_id,source_record_identity,sequence,underwriter_name) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM listing_applications WHERE snapshot_id = ? AND source_record_identity = ? AND source_id = ? AND resource_id = ?)`;

const REVENUE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, industry, report_date as reportDate, revenue_year_month as revenueYearMonth, current_month_revenue_thousands_twd as currentMonthRevenueThousandsTwd, previous_month_revenue_thousands_twd as previousMonthRevenueThousandsTwd, previous_year_same_month_revenue_thousands_twd as previousYearSameMonthRevenueThousandsTwd, month_over_month_percent as monthOverMonthPercent, year_over_year_percent as yearOverYearPercent, current_year_cumulative_revenue_thousands_twd as currentYearCumulativeRevenueThousandsTwd, previous_year_cumulative_revenue_thousands_twd as previousYearCumulativeRevenueThousandsTwd, cumulative_year_over_year_percent as cumulativeYearOverYearPercent, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM emerging_monthly_revenue WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code, revenue_year_month`;
const PROFILE_SELECT = `SELECT snapshot_id as snapshotId, company_code as companyCode, company_name as companyName, company_short_name as companyShortName, unified_business_number as unifiedBusinessNumber, paid_in_capital as paidInCapital, chairperson, general_manager as generalManager, industry_code as industryCode, industry_name as industryName, establishment_date as establishmentDate, company_address as companyAddress, company_phone as companyPhone, company_website as companyWebsite, public_offering_date as publicOfferingDate, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM public_company_profiles WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY company_code`;
const BOND_SELECT = `SELECT snapshot_id as snapshotId, bond_code as bondCode, bond_name as bondName, issuer_company_code as issuerCompanyCode, issuer_company_name as issuerCompanyName, source_bond_type_code as sourceBondTypeCode, series_number as seriesNumber, tranche_number as trancheNumber, issue_date as issueDate, listing_date as listingDate, maturity_date as maturityDate, issue_amount as issueAmount, current_outstanding_balance as currentOutstandingBalance, coupon_rate as couponRate, guarantee_status as guaranteeStatus, security_description as securityDescription, initial_conversion_price as initialConversionPrice, conversion_start_date as conversionStartDate, conversion_end_date as conversionEndDate, underwriter, trustee, latest_balance_change_date as latestBalanceChangeDate, latest_balance_change_reason as latestBalanceChangeReason, offering_method as offeringMethod, official_data_date as officialDataDate, source_record_identity as sourceRecordId, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM bond_issuances WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY bond_code`;
const BOND_PUT_RIGHT_SELECT = `SELECT child.snapshot_id as snapshotId, parent.source_record_identity as sourceRecordId, child.bond_code as bondCode, child.sequence, child.put_date as putDate, child.put_price as putPrice FROM bond_put_rights AS child INNER JOIN bond_issuances AS parent ON parent.snapshot_id = child.snapshot_id AND parent.bond_code = child.bond_code WHERE child.snapshot_id = ? AND parent.source_id = ? AND parent.resource_id = ? ORDER BY child.bond_code, child.sequence`;
const LISTING_APPLICATION_SELECT = `SELECT snapshot_id as snapshotId, source_record_identity as sourceRecordId, official_index as officialIndex, company_code as companyCode, company_short_name as companyShortName, chairman_name as chairmanName, application_date as applicationDate, application_capital_thousands_twd as applicationCapitalThousandsTwd, listing_review_date as listingReviewDate, board_approval_date as boardApprovalDate, listing_contract_approval_or_filing_date as listingContractApprovalOrFilingDate, listing_date as listingDate, note, chronology_status as chronologyStatus, source_id as sourceId, resource_id as resourceId, fetched_at as fetchedAt, response_hash as responseHash FROM listing_applications WHERE snapshot_id = ? AND source_id = ? AND resource_id = ? ORDER BY official_index, company_code`;
const LISTING_UNDERWRITER_SELECT = `SELECT child.snapshot_id as snapshotId, child.source_record_identity as sourceRecordId, child.sequence, child.underwriter_name as underwriterName FROM listing_application_underwriters AS child INNER JOIN listing_applications AS parent ON parent.snapshot_id = child.snapshot_id AND parent.source_record_identity = child.source_record_identity WHERE child.snapshot_id = ? AND parent.source_id = ? AND parent.resource_id = ? ORDER BY child.source_record_identity, child.sequence`;

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

function stringValue(value: unknown): string {
  if (typeof value !== "string") return invalidRecord();
  return value;
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return requiredString(value);
}

function normalizedUnavailableString(value: unknown): string | null {
  if (value === "") return null;
  return requiredString(value);
}

function requiredIsoDate(value: unknown): string {
  const date = requiredString(value);
  if (!isIsoDate(date)) return invalidRecord();
  return date;
}

function optionalIsoDate(value: unknown): string | null {
  const date = optionalString(value);
  if (date !== null && !isIsoDate(date)) return invalidRecord();
  return date;
}

function requiredPositiveDecimal(value: unknown): string {
  const decimal = requiredString(value);
  if (
    decimal === "0"
    || !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/.test(decimal)
  ) return invalidRecord();
  return decimal;
}

const LISTING_STAGES = new Set<ListingApplicationStage11586>([
  "applied",
  "listing_review_completed",
  "board_approved",
  "contract_filed_or_regulator_approved",
  "listed_for_trading",
]);
const PROHIBITED_LISTING_FIELDS = ["underwritingPrice", "price", "stockPrice", "volume", "recommendation"] as const;

function requiredStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return invalidRecord();
  return value.map(requiredString);
}

function deriveListingStage(
  listingReviewDate: string | null,
  boardApprovalDate: string | null,
  listingContractApprovalOrFilingDate: string | null,
  listingDate: string | null,
): ListingApplicationStage11586 {
  if (listingDate) return "listed_for_trading";
  if (listingContractApprovalOrFilingDate) return "contract_filed_or_regulator_approved";
  if (boardApprovalDate) return "board_approved";
  if (listingReviewDate) return "listing_review_completed";
  return "applied";
}

function assertListingChronology(
  applicationDate: string,
  listingReviewDate: string | null,
  boardApprovalDate: string | null,
  listingContractApprovalOrFilingDate: string | null,
  listingDate: string | null,
): void {
  let previous = applicationDate;
  for (const date of [listingReviewDate, boardApprovalDate, listingContractApprovalOrFilingDate, listingDate]) {
    if (date !== null && date < previous) invalidRecord();
    if (date !== null) previous = date;
  }
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
  const putPrice = putDates.length === 0 ? optionalString(value.putPrice) : requiredPositiveDecimal(value.putPrice);
  if (putDates.length === 0 && putPrice !== null) return invalidRecord();
  const issueDate = requiredIsoDate(value.issueDate);
  const maturityDate = requiredIsoDate(value.maturityDate);
  if (issueDate > maturityDate) return invalidRecord();
  const parentBinds = [
    snapshotId,
    bondCode,
    requiredString(value.shortName),
    requiredString(value.issuerCode),
    requiredString(value.issuerName),
    requiredString(value.sourceBondTypeCode),
    optionalString(value.seriesNumber),
    optionalString(value.trancheNumber),
    issueDate,
    optionalString(value.listingDate),
    maturityDate,
    requiredString(value.issueAmount),
    requiredString(value.outstandingAmount),
    optionalString(value.couponRate),
    value.secured === true ? "secured" : value.secured === false ? "unsecured" : invalidRecord(),
    optionalString(value.securityDescription),
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
  let previousPutDate: string | undefined;
  for (const [index, putDate] of putDates.entries()) {
    const normalizedDate = requiredIsoDate(putDate);
    if (
      dates.has(normalizedDate)
      || normalizedDate < issueDate
      || normalizedDate > maturityDate
      || (previousPutDate !== undefined && normalizedDate <= previousPutDate)
    ) return invalidRecord();
    dates.add(normalizedDate);
    previousPutDate = normalizedDate;
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

function bindListingApplicationInsert(db: D1Database, snapshotId: string, record: DatasetRecord): D1Prepared[] {
  const value = asObject(record.value);
  if (
    value.sourceDatasetId !== "11586"
    || requiredString(value.sourceRecordId) !== record.naturalIdentity
    || PROHIBITED_LISTING_FIELDS.some((field) => Object.hasOwn(value, field))
  ) return invalidRecord();
  const applicationDate = requiredIsoDate(value.applicationDate);
  const listingReviewDate = optionalIsoDate(value.listingReviewDate);
  const boardApprovalDate = optionalIsoDate(value.boardApprovalDate);
  const listingContractApprovalOrFilingDate = optionalIsoDate(value.listingContractApprovalOrFilingDate);
  const listingDate = optionalIsoDate(value.listingDate);
  assertListingChronology(
    applicationDate,
    listingReviewDate,
    boardApprovalDate,
    listingContractApprovalOrFilingDate,
    listingDate,
  );
  const stage = value.stage;
  if (typeof stage !== "string" || !LISTING_STAGES.has(stage as ListingApplicationStage11586)) return invalidRecord();
  if (stage !== deriveListingStage(listingReviewDate, boardApprovalDate, listingContractApprovalOrFilingDate, listingDate)) return invalidRecord();
  const underwriters = requiredStringArray(value.underwriters);
  const parentBinds = [
    snapshotId,
    record.naturalIdentity,
    record.naturalIdentity,
    requiredString(value.companyCode),
    requiredString(value.companyName),
    stringValue(value.chairmanName),
    applicationDate,
    normalizedUnavailableString(value.applicationCapitalThousandsTwd),
    listingReviewDate,
    boardApprovalDate,
    listingContractApprovalOrFilingDate,
    listingDate,
    stringValue(value.note),
    stage === "listed_for_trading" ? "complete" : "partial",
    snapshotId,
    "11586",
    "11586",
    "11586-csv",
  ];
  const statements = [db.prepare(LISTING_APPLICATION_INSERT).bind(...parentBinds)];
  for (const [index, underwriter] of underwriters.entries()) {
    statements.push(db.prepare(LISTING_UNDERWRITER_INSERT).bind(
      snapshotId,
      record.naturalIdentity,
      index + 1,
      underwriter,
      snapshotId,
      record.naturalIdentity,
      "11586",
      "11586-csv",
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
      return bindListingApplicationInsert(db, snapshotId, record);
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
  sourceRecordId: string;
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
    sourceRecordId: requiredString(row.sourceRecordId),
    bondCode: requiredString(row.bondCode),
    sequence,
    putDate: requiredIsoDate(row.putDate),
    putPrice: requiredPositiveDecimal(row.putPrice),
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
  const issueDate = requiredIsoDate(row.issueDate);
  const maturityDate = requiredIsoDate(row.maturityDate);
  if (issueDate > maturityDate) return invalidRecord();
  const seenDates = new Set<string>();
  let previousPutDate: string | undefined;
  for (const [index, putRight] of putRights.entries()) {
    if (
      putRight.sourceRecordId !== sourceRecordId
      || putRight.bondCode !== bondCode
      || putRight.sequence !== index + 1
      || seenDates.has(putRight.putDate)
      || putRight.putDate < issueDate
      || putRight.putDate > maturityDate
      || (previousPutDate !== undefined && putRight.putDate <= previousPutDate)
    ) return invalidRecord();
    seenDates.add(putRight.putDate);
    previousPutDate = putRight.putDate;
  }
  const putPrice = putRights.length === 0
    ? undefined
    : requiredString(putRights[0].putPrice);
  if (putRights.some((putRight) => putRight.putPrice !== putPrice)) return invalidRecord();
  const guaranteeStatus = requiredString(row.guaranteeStatus);
  if (guaranteeStatus !== "secured" && guaranteeStatus !== "unsecured") return invalidRecord();
  const value: NormalizedBondIssue11406 = {
    bondId: sourceRecordId,
    bondCode: bondCode === sourceRecordId ? undefined : bondCode,
    issuerCode: requiredString(row.issuerCompanyCode),
    issuerName: requiredString(row.issuerCompanyName),
    shortName: requiredString(row.bondName),
    sourceBondTypeCode: requiredString(row.sourceBondTypeCode),
    seriesNumber: optionalString(row.seriesNumber) ?? undefined,
    trancheNumber: optionalString(row.trancheNumber) ?? undefined,
    issueDate,
    listingDate: optionalString(row.listingDate) ?? undefined,
    maturityDate,
    issueAmount: requiredString(row.issueAmount),
    outstandingAmount: requiredString(row.currentOutstandingBalance),
    couponRate: optionalString(row.couponRate) ?? undefined,
    secured: guaranteeStatus === "secured",
    securityDescription: optionalString(row.securityDescription) ?? undefined,
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
  };
  return { datasetId: "11406", snapshotId, naturalIdentity: sourceRecordId, value };
}

interface ListingApplicationUnderwriterRow {
  sourceRecordId: string;
  sequence: number;
  underwriterName: string;
}

function mapListingApplicationUnderwriterRow(
  row: Record<string, unknown>,
  snapshotId: string,
): ListingApplicationUnderwriterRow {
  if (requiredString(row.snapshotId) !== snapshotId) return invalidRecord();
  const sequence = row.sequence;
  if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence <= 0) return invalidRecord();
  return {
    sourceRecordId: requiredString(row.sourceRecordId),
    sequence,
    underwriterName: requiredString(row.underwriterName),
  };
}

function mapListingApplicationRow(
  row: Record<string, unknown>,
  snapshotId: string,
  underwriterRows: readonly ListingApplicationUnderwriterRow[],
): DatasetRecord {
  assertRowScope(row, snapshotId, "11586", "11586-csv");
  const sourceRecordId = requiredString(row.sourceRecordId);
  if (requiredString(row.officialIndex) !== sourceRecordId) return invalidRecord();
  const applicationDate = requiredIsoDate(row.applicationDate);
  const listingReviewDate = optionalIsoDate(row.listingReviewDate);
  const boardApprovalDate = optionalIsoDate(row.boardApprovalDate);
  const listingContractApprovalOrFilingDate = optionalIsoDate(row.listingContractApprovalOrFilingDate);
  const listingDate = optionalIsoDate(row.listingDate);
  assertListingChronology(
    applicationDate,
    listingReviewDate,
    boardApprovalDate,
    listingContractApprovalOrFilingDate,
    listingDate,
  );
  const stage = deriveListingStage(listingReviewDate, boardApprovalDate, listingContractApprovalOrFilingDate, listingDate);
  const chronologyStatus = requiredString(row.chronologyStatus);
  if (chronologyStatus !== (stage === "listed_for_trading" ? "complete" : "partial")) return invalidRecord();
  for (const [index, underwriter] of underwriterRows.entries()) {
    if (underwriter.sourceRecordId !== sourceRecordId || underwriter.sequence !== index + 1) return invalidRecord();
  }
  const value: NormalizedListingApplicationWithStage11586 = {
    sourceDatasetId: "11586",
    sourceRecordId,
    companyCode: requiredString(row.companyCode),
    companyName: requiredString(row.companyShortName),
    applicationDate,
    chairmanName: stringValue(row.chairmanName),
    applicationCapitalThousandsTwd: optionalString(row.applicationCapitalThousandsTwd) ?? "",
    listingReviewDate: listingReviewDate ?? undefined,
    boardApprovalDate: boardApprovalDate ?? undefined,
    listingContractApprovalOrFilingDate: listingContractApprovalOrFilingDate ?? undefined,
    listingDate: listingDate ?? undefined,
    underwriters: underwriterRows.map((underwriter) => underwriter.underwriterName),
    note: stringValue(row.note),
    stage,
  };
  return { datasetId: "11586", snapshotId, naturalIdentity: sourceRecordId, value };
}

function requireReadRows<T>(result: { success?: boolean; results?: T[] }): T[] {
  if (result.success !== true || !Array.isArray(result.results)) {
    throw new RepositoryError("DATASET_RECORD_READ_FAILED");
  }
  return result.results;
}

async function readRows(db: D1Database, sql: string, snapshotId: string, sourceId: string, resourceId: string): Promise<Record<string, unknown>[]> {
  const result = await db.prepare(sql).bind(snapshotId, sourceId, resourceId).all<Record<string, unknown>>();
  return requireReadRows(result);
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
      return readListingApplicationRecords(db, snapshotId);
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
    db.prepare(BOND_PUT_RIGHT_SELECT).bind(snapshotId, "11406", "11406-csv").all<Record<string, unknown>>(),
  ]);
  const putRightsByBondCode = new Map<string, BondPutRightRow[]>();
  for (const row of requireReadRows(putRightRows)) {
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

async function readListingApplicationRecords(db: D1Database, snapshotId: string): Promise<readonly DatasetRecord[]> {
  const [parentRows, underwriterResult] = await Promise.all([
    readRows(db, LISTING_APPLICATION_SELECT, snapshotId, "11586", "11586-csv"),
    db.prepare(LISTING_UNDERWRITER_SELECT).bind(snapshotId, "11586", "11586-csv").all<Record<string, unknown>>(),
  ]);
  const underwritersBySourceRecordId = new Map<string, ListingApplicationUnderwriterRow[]>();
  for (const row of requireReadRows(underwriterResult)) {
    const underwriter = mapListingApplicationUnderwriterRow(asObject(row), snapshotId);
    const existing = underwritersBySourceRecordId.get(underwriter.sourceRecordId) ?? [];
    existing.push(underwriter);
    underwritersBySourceRecordId.set(underwriter.sourceRecordId, existing);
  }
  const records = parentRows.map((row) => {
    const parent = asObject(row);
    const sourceRecordId = requiredString(parent.sourceRecordId);
    const underwriters = underwritersBySourceRecordId.get(sourceRecordId) ?? [];
    underwritersBySourceRecordId.delete(sourceRecordId);
    return mapListingApplicationRow(parent, snapshotId, underwriters);
  });
  if (underwritersBySourceRecordId.size !== 0) return invalidRecord();
  return records;
}
