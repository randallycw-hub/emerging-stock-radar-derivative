import {
  compareIsoDates,
  isIsoDate,
  isIsoDateTime,
  isYearMonth,
  toTaipeiDate,
} from "./dates.ts";
import {
  deriveCompanyId,
  type BondAlertWindow,
  type BondBalanceSnapshot,
  type BondEvent,
  type BondIssue,
  type BondIssuerProfile,
  type BondStatus,
  type Company,
  type CompanyEvent,
  type CompanyIdentifier,
  type DataFreshness,
  type DataFreshnessLevel,
  type DerivedEvent,
  type EmergingCompanyProfile,
  type EndOfDayMarketData,
  type IngestionRun,
  type ListingApplication,
  type ManualPlannedIssue,
  type MonthlyRevenue,
  type OfficialSource,
  type RawSnapshotMetadata,
  type SourceAttribution,
  type SourceHealth,
  type SourceHealthStatus,
} from "./types.ts";

export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: DomainValidationError };

export interface RuntimeSchema<T> {
  parse(value: unknown): T;
  safeParse(value: unknown): SafeParseResult<T>;
}

function schema<T>(name: string, parser: (value: unknown) => T): RuntimeSchema<T> {
  return {
    parse(value) {
      try {
        return parser(value);
      } catch (error) {
        if (error instanceof DomainValidationError) throw error;
        throw new DomainValidationError(
          `${name}: ${error instanceof Error ? error.message : "validation failed"}`,
        );
      }
    },
    safeParse(value) {
      try {
        return { success: true, data: this.parse(value) };
      } catch (error) {
        return {
          success: false,
          error: error instanceof DomainValidationError
            ? error
            : new DomainValidationError(`${name}: validation failed`),
        };
      }
    },
  };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DomainValidationError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strict(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const allowed = new Set(allowedKeys);
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unknownKey) {
    throw new DomainValidationError(`${path} contains unknown key: ${unknownKey}`);
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DomainValidationError(`${path} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requiredString(value, path);
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new DomainValidationError(`${path} must be a boolean`);
  }
  return value;
}

function enumValue<const T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new DomainValidationError(`${path} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function isoDate(value: unknown, path: string): string {
  if (!isIsoDate(value)) throw new DomainValidationError(`${path} must be a valid ISO date`);
  return value;
}

function optionalIsoDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : isoDate(value, path);
}

function isoDateTime(value: unknown, path: string): string {
  if (!isIsoDateTime(value)) {
    throw new DomainValidationError(`${path} must be an ISO datetime with a timezone`);
  }
  return value;
}

function optionalIsoDateTime(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : isoDateTime(value, path);
}

function nonNegativeDecimal(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new DomainValidationError(`${path} must be a non-negative plain decimal string`);
  }
  return value;
}

function optionalNonNegativeDecimal(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : nonNegativeDecimal(value, path);
}

function signedDecimal(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new DomainValidationError(`${path} must be a signed plain decimal string`);
  }
  return value;
}

function optionalSignedDecimal(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : signedDecimal(value, path);
}

function optionalPositiveDecimal(value: unknown, path: string): string | undefined {
  const parsed = optionalNonNegativeDecimal(value, path);
  if (parsed !== undefined && /^0(?:\.0+)?$/.test(parsed)) {
    throw new DomainValidationError(`${path} must be positive`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new DomainValidationError(`${path} must be a non-negative integer`);
  }
  return value;
}

function httpsUrl(value: unknown, path: string): string {
  const parsed = requiredString(value, path);
  try {
    if (new URL(parsed).protocol !== "https:") throw new Error("not https");
  } catch {
    throw new DomainValidationError(`${path} must be an HTTPS URL`);
  }
  return parsed;
}

function fixtureUrl(value: unknown, path: string): string {
  const parsed = requiredString(value, path);
  try {
    if (new URL(parsed).protocol !== "fixture:") throw new Error("not fixture");
  } catch {
    throw new DomainValidationError(`${path} must be a fixture URL`);
  }
  return parsed;
}

function sourceAttribution(value: unknown, path = "sourceAttribution"): SourceAttribution {
  const input = record(value, path);
  strict(input, [
    "sourceId",
    "providerName",
    "datasetName",
    "officialUrl",
    "licenseName",
    "sourceDataDate",
    "sourcePublishedAt",
    "fetchedAt",
    "normalizedAt",
    "schemaVersion",
    "isFixture",
  ], path);

  const isFixture = booleanValue(input.isFixture, `${path}.isFixture`);
  const sourceId = requiredString(input.sourceId, `${path}.sourceId`);
  const fetchedAt = isoDateTime(input.fetchedAt, `${path}.fetchedAt`);
  const sourceDataDate = isoDate(input.sourceDataDate, `${path}.sourceDataDate`);
  const sourcePublishedAt = optionalIsoDateTime(
    input.sourcePublishedAt,
    `${path}.sourcePublishedAt`,
  );
  const normalizedAt = isoDateTime(input.normalizedAt, `${path}.normalizedAt`);

  if (compareIsoDates(sourceDataDate, toTaipeiDate(fetchedAt)) > 0) {
    throw new DomainValidationError(`${path}.sourceDataDate cannot be later than fetchedAt`);
  }
  if (
    sourcePublishedAt
    && compareIsoDates(sourceDataDate, toTaipeiDate(sourcePublishedAt)) > 0
  ) {
    throw new DomainValidationError(
      `${path}.sourceDataDate cannot be later than sourcePublishedAt`,
    );
  }
  if (sourcePublishedAt && Date.parse(sourcePublishedAt) > Date.parse(fetchedAt)) {
    throw new DomainValidationError(
      `${path}.sourcePublishedAt cannot be later than fetchedAt`,
    );
  }
  if (Date.parse(fetchedAt) > Date.parse(normalizedAt)) {
    throw new DomainValidationError(`${path}.normalizedAt cannot be earlier than fetchedAt`);
  }
  if (isFixture !== sourceId.startsWith("fixture:")) {
    throw new DomainValidationError(`${path}.sourceId and isFixture must agree`);
  }

  return {
    sourceId,
    providerName: requiredString(input.providerName, `${path}.providerName`),
    datasetName: requiredString(input.datasetName, `${path}.datasetName`),
    officialUrl: isFixture
      ? fixtureUrl(input.officialUrl, `${path}.officialUrl`)
      : httpsUrl(input.officialUrl, `${path}.officialUrl`),
    licenseName: requiredString(input.licenseName, `${path}.licenseName`),
    sourceDataDate,
    sourcePublishedAt,
    fetchedAt,
    normalizedAt,
    schemaVersion: requiredString(input.schemaVersion, `${path}.schemaVersion`),
    isFixture,
  };
}

export const SourceAttributionSchema = schema<SourceAttribution>(
  "SourceAttribution",
  sourceAttribution,
);

export const OfficialSourceSchema = schema<OfficialSource>("OfficialSource", (value) => {
  const input = record(value, "OfficialSource");
  strict(input, [
    "sourceId",
    "providerName",
    "datasetName",
    "endpoint",
    "licenseName",
    "schemaVersion",
    "approvalStatus",
    "updatedAt",
  ], "OfficialSource");
  return {
    sourceId: requiredString(input.sourceId, "OfficialSource.sourceId"),
    providerName: requiredString(input.providerName, "OfficialSource.providerName"),
    datasetName: requiredString(input.datasetName, "OfficialSource.datasetName"),
    endpoint: httpsUrl(input.endpoint, "OfficialSource.endpoint"),
    licenseName: requiredString(input.licenseName, "OfficialSource.licenseName"),
    schemaVersion: requiredString(input.schemaVersion, "OfficialSource.schemaVersion"),
    approvalStatus: enumValue(
      input.approvalStatus,
      ["PENDING", "APPROVED", "REJECTED"],
      "OfficialSource.approvalStatus",
    ),
    updatedAt: isoDateTime(input.updatedAt, "OfficialSource.updatedAt"),
  };
});

function companyIdentifier(value: unknown, path = "CompanyIdentifier"): CompanyIdentifier {
  const input = record(value, path);
  strict(input, [
    "kind",
    "value",
    "authority",
    "validFrom",
    "validTo",
    "sourceAttribution",
  ], path);
  const validFrom = optionalIsoDate(input.validFrom, `${path}.validFrom`);
  const validTo = optionalIsoDate(input.validTo, `${path}.validTo`);
  if (validFrom && validTo && compareIsoDates(validFrom, validTo) > 0) {
    throw new DomainValidationError(`${path}.validFrom cannot be later than validTo`);
  }
  return {
    kind: enumValue(
      input.kind,
      ["tax_id", "lei", "stock_code", "other_official"],
      `${path}.kind`,
    ),
    value: requiredString(input.value, `${path}.value`),
    authority: requiredString(input.authority, `${path}.authority`),
    validFrom,
    validTo,
    sourceAttribution: sourceAttribution(
      input.sourceAttribution,
      `${path}.sourceAttribution`,
    ),
  };
}

export const CompanyIdentifierSchema = schema<CompanyIdentifier>(
  "CompanyIdentifier",
  companyIdentifier,
);

const companyMarkets = [
  "listed",
  "otc",
  "emerging",
  "public_unlisted",
  "unknown",
] as const;

export const CompanySchema = schema<Company>("Company", (value) => {
  const input = record(value, "Company");
  strict(input, [
    "id",
    "identifiers",
    "name",
    "shortName",
    "market",
    "industryCode",
    "industryName",
    "createdAt",
    "updatedAt",
    "sourceAttribution",
  ], "Company");
  if (!Array.isArray(input.identifiers) || input.identifiers.length === 0) {
    throw new DomainValidationError("Company.identifiers must be a non-empty array");
  }
  const identifiers = input.identifiers.map((item, index) =>
    companyIdentifier(item, `Company.identifiers[${index}]`)
  );
  const id = requiredString(input.id, "Company.id");
  if (id !== deriveCompanyId(identifiers)) {
    throw new DomainValidationError("Company.id must equal the derived company id");
  }
  return {
    id,
    identifiers,
    name: requiredString(input.name, "Company.name"),
    shortName: optionalString(input.shortName, "Company.shortName"),
    market: enumValue(input.market, companyMarkets, "Company.market"),
    industryCode: optionalString(input.industryCode, "Company.industryCode"),
    industryName: optionalString(input.industryName, "Company.industryName"),
    createdAt: isoDateTime(input.createdAt, "Company.createdAt"),
    updatedAt: isoDateTime(input.updatedAt, "Company.updatedAt"),
    sourceAttribution: sourceAttribution(input.sourceAttribution),
  };
});

export const EmergingCompanyProfileSchema = schema<EmergingCompanyProfile>(
  "EmergingCompanyProfile",
  (value) => {
    const input = record(value, "EmergingCompanyProfile");
    strict(input, [
      "companyId",
      "industry",
      "registeredOn",
      "address",
      "phone",
      "websiteUrl",
      "issuedShares",
      "sourceAttribution",
    ], "EmergingCompanyProfile");
    return {
      companyId: requiredString(input.companyId, "EmergingCompanyProfile.companyId"),
      industry: optionalString(input.industry, "EmergingCompanyProfile.industry"),
      registeredOn: optionalIsoDate(
        input.registeredOn,
        "EmergingCompanyProfile.registeredOn",
      ),
      address: optionalString(input.address, "EmergingCompanyProfile.address"),
      phone: optionalString(input.phone, "EmergingCompanyProfile.phone"),
      websiteUrl: input.websiteUrl === undefined
        ? undefined
        : httpsUrl(input.websiteUrl, "EmergingCompanyProfile.websiteUrl"),
      issuedShares: optionalNonNegativeDecimal(
        input.issuedShares,
        "EmergingCompanyProfile.issuedShares",
      ),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

export const BondIssuerProfileSchema = schema<BondIssuerProfile>(
  "BondIssuerProfile",
  (value) => {
    const input = record(value, "BondIssuerProfile");
    strict(input, ["companyId", "issuerCode", "market", "sourceAttribution"], "BondIssuerProfile");
    return {
      companyId: requiredString(input.companyId, "BondIssuerProfile.companyId"),
      issuerCode: requiredString(input.issuerCode, "BondIssuerProfile.issuerCode"),
      market: enumValue(input.market, companyMarkets, "BondIssuerProfile.market"),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

export const MonthlyRevenueSchema = schema<MonthlyRevenue>("MonthlyRevenue", (value) => {
  const input = record(value, "MonthlyRevenue");
  strict(input, [
    "companyId",
    "yearMonth",
    "currentMonthRevenue",
    "previousMonthRevenue",
    "priorYearMonthRevenue",
    "monthOverMonthPercent",
    "yearOverYearPercent",
    "cumulativeRevenue",
    "cumulativeYearOverYearPercent",
    "sourceAttribution",
  ], "MonthlyRevenue");
  if (!isYearMonth(input.yearMonth)) {
    throw new DomainValidationError("MonthlyRevenue.yearMonth must use YYYY-MM");
  }
  return {
    companyId: requiredString(input.companyId, "MonthlyRevenue.companyId"),
    yearMonth: input.yearMonth,
    currentMonthRevenue: nonNegativeDecimal(
      input.currentMonthRevenue,
      "MonthlyRevenue.currentMonthRevenue",
    ),
    previousMonthRevenue: optionalNonNegativeDecimal(
      input.previousMonthRevenue,
      "MonthlyRevenue.previousMonthRevenue",
    ),
    priorYearMonthRevenue: optionalNonNegativeDecimal(
      input.priorYearMonthRevenue,
      "MonthlyRevenue.priorYearMonthRevenue",
    ),
    monthOverMonthPercent: optionalSignedDecimal(
      input.monthOverMonthPercent,
      "MonthlyRevenue.monthOverMonthPercent",
    ),
    yearOverYearPercent: optionalSignedDecimal(
      input.yearOverYearPercent,
      "MonthlyRevenue.yearOverYearPercent",
    ),
    cumulativeRevenue: optionalNonNegativeDecimal(
      input.cumulativeRevenue,
      "MonthlyRevenue.cumulativeRevenue",
    ),
    cumulativeYearOverYearPercent: optionalSignedDecimal(
      input.cumulativeYearOverYearPercent,
      "MonthlyRevenue.cumulativeYearOverYearPercent",
    ),
    sourceAttribution: sourceAttribution(input.sourceAttribution),
  };
});

export const EndOfDayMarketDataSchema = schema<EndOfDayMarketData>(
  "EndOfDayMarketData",
  (value) => {
    const input = record(value, "EndOfDayMarketData");
    strict(input, [
      "id",
      "companyId",
      "market",
      "tradingDate",
      "sourceTime",
      "priceSemantics",
      "dailyAveragePrice",
      "previousDailyAveragePrice",
      "dayHigh",
      "dayLow",
      "dailyVolume",
      "dailyTurnover",
      "sourceAttribution",
    ], "EndOfDayMarketData");
    const market = enumValue(input.market, companyMarkets, "EndOfDayMarketData.market");
    const priceSemantics = enumValue(
      input.priceSemantics,
      ["emerging_daily_average", "official_end_of_day_close"],
      "EndOfDayMarketData.priceSemantics",
    );
    const dailyAveragePrice = optionalPositiveDecimal(
      input.dailyAveragePrice,
      "EndOfDayMarketData.dailyAveragePrice",
    );
    if (market === "emerging" && priceSemantics !== "emerging_daily_average") {
      throw new DomainValidationError(
        "EndOfDayMarketData for emerging companies requires emerging_daily_average semantics",
      );
    }
    if (market === "emerging" && dailyAveragePrice === undefined) {
      throw new DomainValidationError(
        "EndOfDayMarketData.dailyAveragePrice is required for emerging companies",
      );
    }
    return {
      id: requiredString(input.id, "EndOfDayMarketData.id"),
      companyId: requiredString(input.companyId, "EndOfDayMarketData.companyId"),
      market,
      tradingDate: isoDate(input.tradingDate, "EndOfDayMarketData.tradingDate"),
      sourceTime: requiredString(input.sourceTime, "EndOfDayMarketData.sourceTime"),
      priceSemantics,
      dailyAveragePrice,
      previousDailyAveragePrice: optionalPositiveDecimal(
        input.previousDailyAveragePrice,
        "EndOfDayMarketData.previousDailyAveragePrice",
      ),
      dayHigh: optionalPositiveDecimal(input.dayHigh, "EndOfDayMarketData.dayHigh"),
      dayLow: optionalPositiveDecimal(input.dayLow, "EndOfDayMarketData.dayLow"),
      dailyVolume: optionalNonNegativeDecimal(
        input.dailyVolume,
        "EndOfDayMarketData.dailyVolume",
      ),
      dailyTurnover: optionalNonNegativeDecimal(
        input.dailyTurnover,
        "EndOfDayMarketData.dailyTurnover",
      ),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

export const BondIssueSchema = schema<BondIssue>("BondIssue", (value) => {
  const input = record(value, "BondIssue");
  strict(input, [
    "id",
    "bondCode",
    "issuerCompanyId",
    "bondType",
    "shortName",
    "issueDate",
    "listingDate",
    "maturityDate",
    "issueAmount",
    "outstandingAmount",
    "couponRate",
    "secured",
    "securityDescription",
    "faceValue",
    "initialConversionPrice",
    "conversionStartDate",
    "conversionEndDate",
    "putDates",
    "putPrice",
    "underwriter",
    "trustee",
    "offeringMethod",
    "officialDataDate",
    "fetchedAt",
    "sourceAttribution",
  ], "BondIssue");
  const bondCode = requiredString(input.bondCode, "BondIssue.bondCode");
  const id = requiredString(input.id, "BondIssue.id");
  if (id !== `bond:${bondCode}`) {
    throw new DomainValidationError("BondIssue bond id must equal bond:<bondCode>");
  }
  if (!Array.isArray(input.putDates)) {
    throw new DomainValidationError("BondIssue.putDates must be an array");
  }
  const putDates = input.putDates.map((item, index) =>
    isoDate(item, `BondIssue.putDates[${index}]`)
  );
  const issueDate = isoDate(input.issueDate, "BondIssue.issueDate");
  const maturityDate = isoDate(input.maturityDate, "BondIssue.maturityDate");
  if (compareIsoDates(issueDate, maturityDate) >= 0) {
    throw new DomainValidationError("BondIssue.maturityDate must be after issueDate");
  }
  const listingDate = optionalIsoDate(input.listingDate, "BondIssue.listingDate");
  if (
    listingDate
    && (
      compareIsoDates(issueDate, listingDate) > 0
      || compareIsoDates(listingDate, maturityDate) > 0
    )
  ) {
    throw new DomainValidationError(
      "BondIssue.listingDate must be between issueDate and maturityDate",
    );
  }
  const conversionStartDate = optionalIsoDate(
    input.conversionStartDate,
    "BondIssue.conversionStartDate",
  );
  const conversionEndDate = optionalIsoDate(
    input.conversionEndDate,
    "BondIssue.conversionEndDate",
  );
  if (
    conversionStartDate
    && (
      compareIsoDates(issueDate, conversionStartDate) > 0
      || compareIsoDates(conversionStartDate, maturityDate) > 0
    )
  ) {
    throw new DomainValidationError(
      "BondIssue.conversionStartDate must be within the bond lifecycle",
    );
  }
  if (
    conversionEndDate
    && (
      compareIsoDates(issueDate, conversionEndDate) > 0
      || compareIsoDates(conversionEndDate, maturityDate) > 0
    )
  ) {
    throw new DomainValidationError(
      "BondIssue.conversionEndDate must be within the bond lifecycle",
    );
  }
  if (
    conversionStartDate
    && conversionEndDate
    && compareIsoDates(conversionStartDate, conversionEndDate) > 0
  ) {
    throw new DomainValidationError(
      "BondIssue conversionStartDate cannot be after conversionEndDate",
    );
  }
  for (const putDate of putDates) {
    if (
      compareIsoDates(issueDate, putDate) > 0
      || compareIsoDates(putDate, maturityDate) > 0
    ) {
      throw new DomainValidationError(
        "BondIssue.putDates must be within the bond lifecycle",
      );
    }
  }
  const fetchedAt = isoDateTime(input.fetchedAt, "BondIssue.fetchedAt");
  const officialDataDate = isoDate(
    input.officialDataDate,
    "BondIssue.officialDataDate",
  );
  if (compareIsoDates(officialDataDate, toTaipeiDate(fetchedAt)) > 0) {
    throw new DomainValidationError(
      "BondIssue.officialDataDate cannot be later than fetchedAt",
    );
  }
  return {
    id,
    bondCode,
    issuerCompanyId: requiredString(input.issuerCompanyId, "BondIssue.issuerCompanyId"),
    bondType: enumValue(
      input.bondType,
      ["convertible", "exchangeable"],
      "BondIssue.bondType",
    ),
    shortName: requiredString(input.shortName, "BondIssue.shortName"),
    issueDate,
    listingDate,
    maturityDate,
    issueAmount: optionalNonNegativeDecimal(input.issueAmount, "BondIssue.issueAmount"),
    outstandingAmount: optionalNonNegativeDecimal(
      input.outstandingAmount,
      "BondIssue.outstandingAmount",
    ),
    couponRate: optionalNonNegativeDecimal(input.couponRate, "BondIssue.couponRate"),
    secured: booleanValue(input.secured, "BondIssue.secured"),
    securityDescription: optionalString(
      input.securityDescription,
      "BondIssue.securityDescription",
    ),
    faceValue: optionalPositiveDecimal(input.faceValue, "BondIssue.faceValue"),
    initialConversionPrice: optionalPositiveDecimal(
      input.initialConversionPrice,
      "BondIssue.initialConversionPrice",
    ),
    conversionStartDate,
    conversionEndDate,
    putDates,
    putPrice: optionalPositiveDecimal(input.putPrice, "BondIssue.putPrice"),
    underwriter: optionalString(input.underwriter, "BondIssue.underwriter"),
    trustee: optionalString(input.trustee, "BondIssue.trustee"),
    offeringMethod: optionalString(input.offeringMethod, "BondIssue.offeringMethod"),
    officialDataDate,
    fetchedAt,
    sourceAttribution: sourceAttribution(input.sourceAttribution),
  };
});

export function findDuplicateBondCodes(
  bonds: readonly Pick<BondIssue, "bondCode">[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { bondCode } of bonds) {
    if (seen.has(bondCode)) duplicates.add(bondCode);
    seen.add(bondCode);
  }
  return [...duplicates].sort();
}

export const BondBalanceSnapshotSchema = schema<BondBalanceSnapshot>(
  "BondBalanceSnapshot",
  (value) => {
    const input = record(value, "BondBalanceSnapshot");
    strict(input, [
      "bondId",
      "effectiveDate",
      "outstandingAmount",
      "changeAmount",
      "changeReason",
      "fetchedAt",
      "sourceAttribution",
    ], "BondBalanceSnapshot");
    return {
      bondId: requiredString(input.bondId, "BondBalanceSnapshot.bondId"),
      effectiveDate: isoDate(input.effectiveDate, "BondBalanceSnapshot.effectiveDate"),
      outstandingAmount: nonNegativeDecimal(
        input.outstandingAmount,
        "BondBalanceSnapshot.outstandingAmount",
      ),
      changeAmount: signedDecimal(input.changeAmount, "BondBalanceSnapshot.changeAmount"),
      changeReason: requiredString(input.changeReason, "BondBalanceSnapshot.changeReason"),
      fetchedAt: isoDateTime(input.fetchedAt, "BondBalanceSnapshot.fetchedAt"),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

export const ListingApplicationSchema = schema<ListingApplication>(
  "ListingApplication",
  (value) => {
    const input = record(value, "ListingApplication");
    strict(input, [
      "id",
      "companyId",
      "targetMarket",
      "appliedOn",
      "status",
      "statusUpdatedOn",
      "sourceAttribution",
    ], "ListingApplication");
    return {
      id: requiredString(input.id, "ListingApplication.id"),
      companyId: requiredString(input.companyId, "ListingApplication.companyId"),
      targetMarket: enumValue(
        input.targetMarket,
        ["listed", "otc"],
        "ListingApplication.targetMarket",
      ),
      appliedOn: isoDate(input.appliedOn, "ListingApplication.appliedOn"),
      status: requiredString(input.status, "ListingApplication.status"),
      statusUpdatedOn: optionalIsoDate(
        input.statusUpdatedOn,
        "ListingApplication.statusUpdatedOn",
      ),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

const companyEventKinds = [
  "became_emerging",
  "market_identity_changed",
  "listing_application_submitted",
  "otc_application_submitted",
  "review_status_changed",
  "listed",
  "otc_listed",
] as const;

const bondEventKinds = [
  "listed",
  "conversion_started",
  "conversion_ended",
  "matured",
  "put_date_reached",
  "balance_changed",
] as const;

function attributionArray(value: unknown, path: string): SourceAttribution[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DomainValidationError(`${path} must be a non-empty array`);
  }
  return value.map((item, index) => sourceAttribution(item, `${path}[${index}]`));
}

export const CompanyEventSchema = schema<CompanyEvent>("CompanyEvent", (value) => {
  const input = record(value, "CompanyEvent");
  strict(input, [
    "id",
    "companyId",
    "kind",
    "occurredOn",
    "title",
    "sourceAttributions",
  ], "CompanyEvent");
  return {
    id: requiredString(input.id, "CompanyEvent.id"),
    companyId: requiredString(input.companyId, "CompanyEvent.companyId"),
    kind: enumValue(input.kind, companyEventKinds, "CompanyEvent.kind"),
    occurredOn: isoDate(input.occurredOn, "CompanyEvent.occurredOn"),
    title: requiredString(input.title, "CompanyEvent.title"),
    sourceAttributions: attributionArray(
      input.sourceAttributions,
      "CompanyEvent.sourceAttributions",
    ),
  };
});

export const BondEventSchema = schema<BondEvent>("BondEvent", (value) => {
  const input = record(value, "BondEvent");
  strict(input, [
    "id",
    "bondId",
    "kind",
    "occurredOn",
    "title",
    "sourceAttributions",
  ], "BondEvent");
  return {
    id: requiredString(input.id, "BondEvent.id"),
    bondId: requiredString(input.bondId, "BondEvent.bondId"),
    kind: enumValue(input.kind, bondEventKinds, "BondEvent.kind"),
    occurredOn: isoDate(input.occurredOn, "BondEvent.occurredOn"),
    title: requiredString(input.title, "BondEvent.title"),
    sourceAttributions: attributionArray(
      input.sourceAttributions,
      "BondEvent.sourceAttributions",
    ),
  };
});

const bondStatusCodes = [
  "not_yet_convertible",
  "conversion_active",
  "conversion_ended",
  "approaching_maturity",
  "matured",
  "missing_from_latest_snapshot",
  "awaiting_official_confirmation",
] as const;

export const BondStatusSchema = schema<BondStatus>("BondStatus", (value) => {
  const input = record(value, "BondStatus");
  strict(input, [
    "bondId",
    "status",
    "effectiveOn",
    "sourceAttribution",
    "updatedAt",
  ], "BondStatus");
  return {
    bondId: requiredString(input.bondId, "BondStatus.bondId"),
    status: enumValue(input.status, bondStatusCodes, "BondStatus.status"),
    effectiveOn: isoDate(input.effectiveOn, "BondStatus.effectiveOn"),
    sourceAttribution: sourceAttribution(input.sourceAttribution),
    updatedAt: isoDateTime(input.updatedAt, "BondStatus.updatedAt"),
  };
});

export const BondAlertWindowSchema = schema<BondAlertWindow>(
  "BondAlertWindow",
  (value) => {
    const input = record(value, "BondAlertWindow");
    strict(input, [
      "id",
      "bondId",
      "kind",
      "startsOn",
      "endsOn",
      "calculatedAt",
      "sourceAttribution",
    ], "BondAlertWindow");
    const startsOn = isoDate(input.startsOn, "BondAlertWindow.startsOn");
    const endsOn = isoDate(input.endsOn, "BondAlertWindow.endsOn");
    if (compareIsoDates(startsOn, endsOn) > 0) {
      throw new DomainValidationError("BondAlertWindow.startsOn cannot be after endsOn");
    }
    return {
      id: requiredString(input.id, "BondAlertWindow.id"),
      bondId: requiredString(input.bondId, "BondAlertWindow.bondId"),
      kind: enumValue(input.kind, [
        "conversion_start_within_30_days",
        "conversion_end_within_30_days",
        "maturity_within_30_days",
        "maturity_within_60_days",
        "maturity_within_90_days",
        "put_date_within_30_days",
      ], "BondAlertWindow.kind"),
      startsOn,
      endsOn,
      calculatedAt: isoDateTime(input.calculatedAt, "BondAlertWindow.calculatedAt"),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

const derivedNotice = "本事件由興債觀測網依官方日期欄位自動整理。" as const;

export const DerivedEventSchema = schema<DerivedEvent>("DerivedEvent", (value) => {
  const input = record(value, "DerivedEvent");
  strict(input, [
    "id",
    "entityId",
    "occurredOn",
    "title",
    "derivedFrom",
    "ruleId",
    "ruleVersion",
    "calculatedAt",
    "sourceAttribution",
    "noticeText",
  ], "DerivedEvent");
  if (!Array.isArray(input.derivedFrom) || input.derivedFrom.length === 0) {
    throw new DomainValidationError("DerivedEvent.derivedFrom must be a non-empty array");
  }
  const derivedFrom = input.derivedFrom.map((item, index) =>
    requiredString(item, `DerivedEvent.derivedFrom[${index}]`)
  );
  if (input.noticeText !== derivedNotice) {
    throw new DomainValidationError(`DerivedEvent.noticeText must equal: ${derivedNotice}`);
  }
  return {
    id: requiredString(input.id, "DerivedEvent.id"),
    entityId: requiredString(input.entityId, "DerivedEvent.entityId"),
    occurredOn: isoDate(input.occurredOn, "DerivedEvent.occurredOn"),
    title: requiredString(input.title, "DerivedEvent.title"),
    derivedFrom,
    ruleId: requiredString(input.ruleId, "DerivedEvent.ruleId"),
    ruleVersion: requiredString(input.ruleVersion, "DerivedEvent.ruleVersion"),
    calculatedAt: isoDateTime(input.calculatedAt, "DerivedEvent.calculatedAt"),
    sourceAttribution: sourceAttribution(input.sourceAttribution),
    noticeText: derivedNotice,
  };
});

export const ManualPlannedIssueSchema = schema<ManualPlannedIssue>(
  "ManualPlannedIssue",
  (value) => {
    const input = record(value, "ManualPlannedIssue");
    strict(input, [
      "id",
      "issuerName",
      "issuerCode",
      "status",
      "expectedEffectiveDate",
      "officialPublishedOn",
      "createdOn",
      "lastReviewedOn",
      "reviewerNote",
      "sourceAttribution",
    ], "ManualPlannedIssue");
    return {
      id: requiredString(input.id, "ManualPlannedIssue.id"),
      issuerName: requiredString(input.issuerName, "ManualPlannedIssue.issuerName"),
      issuerCode: requiredString(input.issuerCode, "ManualPlannedIssue.issuerCode"),
      status: enumValue(input.status, [
        "filed",
        "supplement_required",
        "suspended",
        "withdrawn",
        "revoked",
        "issued",
      ], "ManualPlannedIssue.status"),
      expectedEffectiveDate: optionalIsoDate(
        input.expectedEffectiveDate,
        "ManualPlannedIssue.expectedEffectiveDate",
      ),
      officialPublishedOn: isoDate(
        input.officialPublishedOn,
        "ManualPlannedIssue.officialPublishedOn",
      ),
      createdOn: isoDate(input.createdOn, "ManualPlannedIssue.createdOn"),
      lastReviewedOn: isoDate(input.lastReviewedOn, "ManualPlannedIssue.lastReviewedOn"),
      reviewerNote: optionalString(input.reviewerNote, "ManualPlannedIssue.reviewerNote"),
      sourceAttribution: sourceAttribution(input.sourceAttribution),
    };
  },
);

const sourceHealthStatuses = [
  "healthy",
  "delayed",
  "partial",
  "stale",
  "unavailable",
] as const satisfies readonly SourceHealthStatus[];

const dataFreshnessLevels = [
  "current",
  "delayed",
  "stale",
  "unknown",
] as const satisfies readonly DataFreshnessLevel[];

export const SourceHealthSchema = schema<SourceHealth>("SourceHealth", (value) => {
  const input = record(value, "SourceHealth");
  strict(input, [
    "sourceId",
    "status",
    "checkedAt",
    "lastSuccessfulAt",
    "expectedUpdateAt",
  ], "SourceHealth");
  const checkedAt = isoDateTime(input.checkedAt, "SourceHealth.checkedAt");
  const lastSuccessfulAt = optionalIsoDateTime(
    input.lastSuccessfulAt,
    "SourceHealth.lastSuccessfulAt",
  );
  if (lastSuccessfulAt && Date.parse(lastSuccessfulAt) > Date.parse(checkedAt)) {
    throw new DomainValidationError(
      "SourceHealth.lastSuccessfulAt cannot be later than checkedAt",
    );
  }
  return {
    sourceId: requiredString(input.sourceId, "SourceHealth.sourceId"),
    status: enumValue(input.status, sourceHealthStatuses, "SourceHealth.status"),
    checkedAt,
    lastSuccessfulAt,
    expectedUpdateAt: optionalIsoDateTime(
      input.expectedUpdateAt,
      "SourceHealth.expectedUpdateAt",
    ),
  };
});

export const DataFreshnessSchema = schema<DataFreshness>(
  "DataFreshness",
  (value) => {
    const input = record(value, "DataFreshness");
    strict(input, [
      "sourceId",
      "level",
      "assessedAt",
      "sourceDataDate",
      "lastSuccessfulAt",
      "expectedUpdateAt",
    ], "DataFreshness");
    const assessedAt = isoDateTime(input.assessedAt, "DataFreshness.assessedAt");
    const sourceDataDate = optionalIsoDate(
      input.sourceDataDate,
      "DataFreshness.sourceDataDate",
    );
    if (sourceDataDate && compareIsoDates(sourceDataDate, toTaipeiDate(assessedAt)) > 0) {
      throw new DomainValidationError(
        "DataFreshness.sourceDataDate cannot be later than assessedAt",
      );
    }
    const lastSuccessfulAt = optionalIsoDateTime(
      input.lastSuccessfulAt,
      "DataFreshness.lastSuccessfulAt",
    );
    if (lastSuccessfulAt && Date.parse(lastSuccessfulAt) > Date.parse(assessedAt)) {
      throw new DomainValidationError(
        "DataFreshness.lastSuccessfulAt cannot be later than assessedAt",
      );
    }
    return {
      sourceId: requiredString(input.sourceId, "DataFreshness.sourceId"),
      level: enumValue(input.level, dataFreshnessLevels, "DataFreshness.level"),
      assessedAt,
      sourceDataDate,
      lastSuccessfulAt,
      expectedUpdateAt: optionalIsoDateTime(
        input.expectedUpdateAt,
        "DataFreshness.expectedUpdateAt",
      ),
    };
  },
);

export const IngestionRunSchema = schema<IngestionRun>("IngestionRun", (value) => {
  const input = record(value, "IngestionRun");
  strict(input, [
    "id",
    "sourceId",
    "startedAt",
    "finishedAt",
    "outcome",
    "receivedCount",
    "acceptedCount",
    "rejectedCount",
    "sourceHealthStatus",
    "dataFreshnessLevel",
    "errorCode",
  ], "IngestionRun");
  const startedAt = isoDateTime(input.startedAt, "IngestionRun.startedAt");
  const finishedAt = optionalIsoDateTime(input.finishedAt, "IngestionRun.finishedAt");
  if (finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
    throw new DomainValidationError("IngestionRun.finishedAt cannot be before startedAt");
  }
  const receivedCount = nonNegativeInteger(input.receivedCount, "IngestionRun.receivedCount");
  const acceptedCount = nonNegativeInteger(input.acceptedCount, "IngestionRun.acceptedCount");
  const rejectedCount = nonNegativeInteger(input.rejectedCount, "IngestionRun.rejectedCount");
  if (acceptedCount + rejectedCount > receivedCount) {
    throw new DomainValidationError("IngestionRun accepted/rejected count exceeds received count");
  }
  return {
    id: requiredString(input.id, "IngestionRun.id"),
    sourceId: requiredString(input.sourceId, "IngestionRun.sourceId"),
    startedAt,
    finishedAt,
    outcome: enumValue(
      input.outcome,
      ["success", "partial", "failed"],
      "IngestionRun.outcome",
    ),
    receivedCount,
    acceptedCount,
    rejectedCount,
    sourceHealthStatus: enumValue(
      input.sourceHealthStatus,
      sourceHealthStatuses,
      "IngestionRun.sourceHealthStatus",
    ),
    dataFreshnessLevel: enumValue(
      input.dataFreshnessLevel,
      dataFreshnessLevels,
      "IngestionRun.dataFreshnessLevel",
    ),
    errorCode: optionalString(input.errorCode, "IngestionRun.errorCode"),
  };
});

export const RawSnapshotMetadataSchema = schema<RawSnapshotMetadata>(
  "RawSnapshotMetadata",
  (value) => {
    const input = record(value, "RawSnapshotMetadata");
    strict(input, [
      "id",
      "sourceId",
      "officialUrl",
      "fetchedAt",
      "httpStatus",
      "sourceDataDate",
      "responseHash",
      "recordCount",
      "schemaVersion",
      "completeSuccess",
      "isFixture",
    ], "RawSnapshotMetadata");
    const isFixture = booleanValue(input.isFixture, "RawSnapshotMetadata.isFixture");
    const sourceId = requiredString(input.sourceId, "RawSnapshotMetadata.sourceId");
    if (isFixture !== sourceId.startsWith("fixture:")) {
      throw new DomainValidationError(
        "RawSnapshotMetadata.sourceId and isFixture must agree",
      );
    }
    const httpStatus = nonNegativeInteger(input.httpStatus, "RawSnapshotMetadata.httpStatus");
    if (httpStatus > 599) {
      throw new DomainValidationError("RawSnapshotMetadata.httpStatus must be at most 599");
    }
    const completeSuccess = booleanValue(
      input.completeSuccess,
      "RawSnapshotMetadata.completeSuccess",
    );
    if (completeSuccess && (httpStatus < 200 || httpStatus > 299)) {
      throw new DomainValidationError(
        "RawSnapshotMetadata.completeSuccess requires a 2xx HTTP status",
      );
    }
    return {
      id: requiredString(input.id, "RawSnapshotMetadata.id"),
      sourceId,
      officialUrl: isFixture
        ? fixtureUrl(input.officialUrl, "RawSnapshotMetadata.officialUrl")
        : httpsUrl(input.officialUrl, "RawSnapshotMetadata.officialUrl"),
      fetchedAt: isoDateTime(input.fetchedAt, "RawSnapshotMetadata.fetchedAt"),
      httpStatus,
      sourceDataDate: optionalIsoDate(
        input.sourceDataDate,
        "RawSnapshotMetadata.sourceDataDate",
      ),
      responseHash: requiredString(
        input.responseHash,
        "RawSnapshotMetadata.responseHash",
      ),
      recordCount: nonNegativeInteger(
        input.recordCount,
        "RawSnapshotMetadata.recordCount",
      ),
      schemaVersion: requiredString(
        input.schemaVersion,
        "RawSnapshotMetadata.schemaVersion",
      ),
      completeSuccess,
      isFixture,
    };
  },
);
