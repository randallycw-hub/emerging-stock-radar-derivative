import {
  parseFixtureMetadata,
} from "../source-verification/fixture-metadata.ts";
import {
  normalize11406Row,
  parse11406Csv,
} from "../source-verification/source-11406.ts";
import {
  normalize94025Row,
  parse94025Csv,
} from "../source-verification/source-94025.ts";
import type { FixtureMetadata } from "../source-verification/types.ts";
import type {
  EmergingMarketRow,
  PreviewBondDto,
  PreviewCompanyDto,
  PreviewDataDto,
  PreviewSourceDto,
} from "./types.ts";

export interface EmergingMarketInput {
  code: string;
  name: string;
  industry?: string;
  closePrice?: number;
  change?: number;
  volume?: number;
  turnover?: number;
  asOf: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export function normalizeEmergingRow(input: EmergingMarketInput): EmergingMarketRow {
  if (!input.code.trim() || !input.name.trim()) {
    throw new TypeError("emerging market identity is required");
  }
  if (!input.asOf.trim()) throw new TypeError("emerging market asOf is required");
  return {
    companyId: input.code,
    code: input.code,
    name: input.name,
    industry: input.industry,
    closePrice: finiteOrUndefined(input.closePrice),
    change: finiteOrUndefined(input.change),
    volume: finiteOrUndefined(input.volume),
    turnover: finiteOrUndefined(input.turnover),
    priceLabel: "收盤價",
    asOf: input.asOf,
    source: {
      label: input.sourceLabel ?? "資料來源",
      url: input.sourceUrl,
      asOf: input.asOf,
    },
  };
}

function finiteOrUndefined(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

export interface PreviewDataInput {
  revenueCsv: string;
  revenueMetadataJson: string;
  bondCsv: string;
  bondMetadataJson: string;
}

export function buildPreviewData(input: PreviewDataInput): PreviewDataDto {
  const revenueMetadata = revenueCsvMetadata(input.revenueMetadataJson);
  const bondMetadata = bondCsvMetadata(input.bondMetadataJson);

  const companies = parse94025Csv(input.revenueCsv).map((row): PreviewCompanyDto => {
    const normalized = normalize94025Row(row);
    return {
      companyId: normalized.companyCode,
      ...normalized,
      source: sourceDto(revenueMetadata, normalized.sourcePublishedOn),
    };
  });

  const bonds = parse11406Csv(input.bondCsv).map((row): PreviewBondDto => {
    const normalized = normalize11406Row(row);
    return {
      bondId: normalized.bondId,
      bondCode: normalized.bondCode,
      shortName: normalized.shortName,
      issuerCode: normalized.issuerCode,
      issuerName: normalized.issuerName,
      issueDate: normalized.issueDate,
      listingDate: normalized.listingDate,
      maturityDate: normalized.maturityDate,
      issueAmount: normalized.issueAmount,
      outstandingAmount: normalized.outstandingAmount,
      couponRate: normalized.couponRate,
      secured: normalized.secured,
      securityDescription: normalized.securityDescription,
      initialConversionPrice: normalized.initialConversionPrice,
      conversionStartDate: normalized.conversionStartDate,
      conversionEndDate: normalized.conversionEndDate,
      putDates: [...normalized.putDates],
      putPrice: normalized.putPrice,
      underwriter: normalized.underwriter,
      trustee: normalized.trustee,
      outstandingChangeDate: normalized.outstandingChangeDate,
      outstandingChangeReason: normalized.outstandingChangeReason,
      offeringMethod: normalized.offeringMethod,
      source: sourceDto(bondMetadata, normalized.officialDataDate),
    };
  });

  const revenueSource = sourceDto(
    revenueMetadata,
    companies[0]?.sourcePublishedOn ?? "",
  );
  const bondSource = sourceDto(
    bondMetadata,
    bonds[0]?.source.officialDataDate ?? "",
  );

  return {
    companies,
    bonds,
    revenueSource,
    bondSource,
    lastUpdatedAt: [revenueMetadata.fetchedAt, bondMetadata.fetchedAt].sort().at(-1)!,
    fixtureNotice: "測試樣本",
  };
}

export function findPreviewCompany(
  data: PreviewDataDto,
  companyId: string,
): PreviewCompanyDto | undefined {
  return data.companies.find((company) => company.companyId === companyId);
}

export function findPreviewBond(
  data: PreviewDataDto,
  bondId: string,
): PreviewBondDto | undefined {
  return data.bonds.find((bond) => bond.bondId === bondId);
}

function sourceDto(
  metadata: FixtureMetadata,
  officialDataDate: string,
): PreviewSourceDto {
  return {
    sourceId: metadata.sourceId,
    providerName: metadata.providerName,
    datasetName: metadata.datasetName,
    officialUrl: metadata.resourceUrl,
    licenseName: metadata.licenseName,
    officialDataDate,
    fetchedAt: metadata.fetchedAt,
    fixtureVersion: metadata.fixtureVersion,
  };
}

function revenueCsvMetadata(json: string): FixtureMetadata {
  const value: unknown = JSON.parse(json);
  const container = requireRecord(value, "94025 metadata");
  return parseFixtureMetadata(container.csv);
}

function bondCsvMetadata(json: string): FixtureMetadata {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) throw new TypeError("11406 metadata must be an array");
  const metadata = value.map(parseFixtureMetadata).find((item) => item.resourceRole === "csv");
  if (!metadata) throw new TypeError("11406 CSV metadata is required");
  return metadata;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}
