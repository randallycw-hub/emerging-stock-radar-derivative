export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type CompanyMarket = "listed" | "otc" | "emerging" | "public_unlisted" | "unknown";
export type CompanyIdentifierKind = "tax_id" | "lei" | "stock_code" | "other_official";
export type PriceSemantics = "emerging_daily_average" | "official_end_of_day_close";

export type SourceHealthStatus = "healthy" | "delayed" | "partial" | "stale" | "unavailable";
export type DataFreshnessLevel = "current" | "delayed" | "stale" | "unknown";

export interface OfficialSource {
  sourceId: string;
  providerName: string;
  datasetName: string;
  endpoint: string;
  licenseName: string;
  schemaVersion: string;
  approvalStatus: ApprovalStatus;
  updatedAt: string;
}

export interface SourceAttribution {
  sourceId: string;
  providerName: string;
  datasetName: string;
  officialUrl: string;
  licenseName: string;
  sourceDataDate: string;
  sourcePublishedAt?: string;
  fetchedAt: string;
  normalizedAt: string;
  schemaVersion: string;
  isFixture: boolean;
}

export interface CompanyIdentifier {
  kind: CompanyIdentifierKind;
  value: string;
  authority: string;
  validFrom?: string;
  validTo?: string;
  sourceAttribution: SourceAttribution;
}

export interface Company {
  id: string;
  identifiers: CompanyIdentifier[];
  name: string;
  shortName?: string;
  market: CompanyMarket;
  industryCode?: string;
  industryName?: string;
  createdAt: string;
  updatedAt: string;
  sourceAttribution: SourceAttribution;
}

export interface EmergingCompanyProfile {
  companyId: string;
  industry?: string;
  registeredOn?: string;
  address?: string;
  phone?: string;
  websiteUrl?: string;
  issuedShares?: string;
  sourceAttribution: SourceAttribution;
}

export interface BondIssuerProfile {
  companyId: string;
  issuerCode: string;
  market: CompanyMarket;
  sourceAttribution: SourceAttribution;
}

export interface MonthlyRevenue {
  companyId: string;
  yearMonth: string;
  currentMonthRevenue: string;
  previousMonthRevenue?: string;
  priorYearMonthRevenue?: string;
  monthOverMonthPercent?: string;
  yearOverYearPercent?: string;
  cumulativeRevenue?: string;
  cumulativeYearOverYearPercent?: string;
  sourceAttribution: SourceAttribution;
}

export interface EndOfDayMarketData {
  market: CompanyMarket;
  tradingDate: string;
  priceSemantics: PriceSemantics;
  dailyAveragePrice: string;
  previousDailyAveragePrice: string;
  dayHigh: string;
  dayLow: string;
  dailyVolume: string;
  dailyTurnover: string;
  sourceAttribution: SourceAttribution;
}

export type EmergingMarketDirection = "up" | "down" | "flat" | "unavailable";

export interface EmergingMarketView {
  tradingDate: string;
  companyCode: string;
  companyName: string;
  industryName: string | null;
  lastTradedPrice: string | null;
  dailyAveragePrice: string | null;
  previousAveragePrice: string | null;
  dailyHighPrice: string | null;
  dailyLowPrice: string | null;
  averageChange: string | null;
  averageChangePercent: string | null;
  direction: EmergingMarketDirection;
  transactionVolume: string | null;
  estimatedTransactionAmount: string | null;
  applyingDate: string | null;
  applyingStatus: string | null;
}

export interface BondIssue {
  id: string;
  bondCode: string;
  issuerCompanyId: string;
  bondType: "convertible" | "exchangeable";
  shortName: string;
  issueDate: string;
  listingDate?: string;
  maturityDate: string;
  issueAmount?: string;
  outstandingAmount?: string;
  couponRate?: string;
  secured: boolean;
  securityDescription?: string;
  faceValue?: string;
  initialConversionPrice?: string;
  conversionStartDate?: string;
  conversionEndDate?: string;
  putDates: string[];
  putPrice?: string;
  underwriter?: string;
  trustee?: string;
  offeringMethod?: string;
  officialDataDate: string;
  fetchedAt: string;
  sourceAttribution: SourceAttribution;
}

export interface BondBalanceSnapshot {
  bondId: string;
  effectiveDate: string;
  outstandingAmount: string;
  changeAmount: string;
  changeReason: string;
  fetchedAt: string;
  sourceAttribution: SourceAttribution;
}

export interface ListingApplication {
  id: string;
  companyId: string;
  targetMarket: "listed" | "otc";
  appliedOn: string;
  status: string;
  statusUpdatedOn?: string;
  sourceAttribution: SourceAttribution;
}

export interface CompanyEvent {
  id: string;
  companyId: string;
  kind:
    | "became_emerging"
    | "market_identity_changed"
    | "listing_application_submitted"
    | "otc_application_submitted"
    | "review_status_changed"
    | "listed"
    | "otc_listed";
  occurredOn: string;
  title: string;
  sourceAttributions: SourceAttribution[];
}

export interface BondEvent {
  id: string;
  bondId: string;
  kind:
    | "listed"
    | "conversion_started"
    | "conversion_ended"
    | "matured"
    | "put_date_reached"
    | "balance_changed";
  occurredOn: string;
  title: string;
  sourceAttributions: SourceAttribution[];
}

export type BondStatusCode =
  | "not_yet_convertible"
  | "conversion_active"
  | "conversion_ended"
  | "approaching_maturity"
  | "matured"
  | "missing_from_latest_snapshot"
  | "awaiting_official_confirmation";

export interface BondStatus {
  bondId: string;
  status: BondStatusCode;
  effectiveOn: string;
  sourceAttribution: SourceAttribution;
  updatedAt: string;
}

export interface BondAlertWindow {
  id: string;
  bondId: string;
  kind:
    | "conversion_start_within_30_days"
    | "conversion_end_within_30_days"
    | "maturity_within_30_days"
    | "maturity_within_60_days"
    | "maturity_within_90_days"
    | "put_date_within_30_days";
  startsOn: string;
  endsOn: string;
  calculatedAt: string;
  sourceAttribution: SourceAttribution;
}

export interface DerivedEvent {
  id: string;
  entityId: string;
  occurredOn: string;
  title: string;
  derivedFrom: string[];
  ruleId: string;
  ruleVersion: string;
  calculatedAt: string;
  sourceAttribution: SourceAttribution;
  noticeText: "本事件由興債觀測網依官方日期欄位自動整理。";
}

export interface ManualPlannedIssue {
  id: string;
  issuerName: string;
  issuerCode: string;
  status: "filed" | "supplement_required" | "suspended" | "withdrawn" | "revoked" | "issued";
  expectedEffectiveDate?: string;
  officialPublishedOn: string;
  createdOn: string;
  lastReviewedOn: string;
  reviewerNote?: string;
  sourceAttribution: SourceAttribution;
}

export interface IngestionRun {
  id: string;
  sourceId: string;
  startedAt: string;
  finishedAt?: string;
  outcome: "success" | "partial" | "failed";
  receivedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  sourceHealthStatus: SourceHealthStatus;
  dataFreshnessLevel: DataFreshnessLevel;
  errorCode?: string;
}

export interface RawSnapshotMetadata {
  id: string;
  sourceId: string;
  officialUrl: string;
  fetchedAt: string;
  httpStatus: number;
  sourceDataDate?: string;
  responseHash: string;
  recordCount: number;
  schemaVersion: string;
  completeSuccess: boolean;
  isFixture: boolean;
}

export interface SourceHealth {
  sourceId: string;
  status: SourceHealthStatus;
  checkedAt: string;
  lastSuccessfulAt?: string;
  expectedUpdateAt?: string;
}

export interface DataFreshness {
  sourceId: string;
  level: DataFreshnessLevel;
  assessedAt: string;
  sourceDataDate?: string;
  lastSuccessfulAt?: string;
  expectedUpdateAt?: string;
}

const identifierPriority: Record<CompanyIdentifierKind, number> = {
  tax_id: 0,
  lei: 1,
  stock_code: 2,
  other_official: 3,
};

/**
 * Stable identity priority: tax_id > lei > stock_code > other_official.
 * Company names are intentionally excluded so a rename never changes the id.
 */
export function deriveCompanyId(
  identifiers: readonly Pick<CompanyIdentifier, "kind" | "value">[],
): string {
  const identifier = [...identifiers]
    .filter(({ value }) => value.trim().length > 0)
    .sort((left, right) => {
      const priorityDifference = identifierPriority[left.kind] - identifierPriority[right.kind];
      if (priorityDifference !== 0) return priorityDifference;
      const normalizedLeft = left.value.trim().toUpperCase();
      const normalizedRight = right.value.trim().toUpperCase();
      if (normalizedLeft === normalizedRight) return 0;
      return normalizedLeft < normalizedRight ? -1 : 1;
    })[0];

  if (!identifier) {
    throw new Error("at least one non-empty company identifier is required");
  }

  return `company:${identifier.kind}:${identifier.value.trim().toUpperCase()}`;
}
