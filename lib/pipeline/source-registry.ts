export type PipelineSourceId =
  | "11406"
  | "94025"
  | "11586"
  | "28567"
  | "tpex-applications"
  | "tpex-ipo-listings"
  | "twse-auctions"
  | "twse-public-offerings";
export type IpoManifestSourceId =
  | "twse-applications"
  | "tpex-applications"
  | "tpex-ipo-listings"
  | "twse-auctions"
  | "twse-public-offerings";
export type ResourceApprovalStatus =
  | "VERIFIED_FOR_IMPLEMENTATION"
  | "APPROVED_FOR_PRODUCTION";
export type UsageRole = "primary_csv" | "primary_json";

export interface IpoEventPolicy {
  manifestSourceId: IpoManifestSourceId;
  approvedPurpose: "ipo_events";
  allowedFields: readonly string[];
}

export interface ApprovedResource {
  sourceId: PipelineSourceId;
  resourceId: string;
  exactUrl: string;
  protocol: "https:";
  hostname: string;
  pathname: string;
  allowedContentTypes: readonly string[];
  maxResponseBytes: number;
  timeoutMs: number;
  approvalStatus: ResourceApprovalStatus;
  usageRole: UsageRole;
  annualQuery?: { parameter: "yy"; minimumYear: number; maximumYear: number };
  ipoEventPolicy?: IpoEventPolicy;
}

export type ApprovedIpoResource = ApprovedResource & { ipoEventPolicy: IpoEventPolicy };

const resources: readonly ApprovedResource[] = [
  { sourceId: "11406", resourceId: "11406-csv", exactUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv", protocol: "https:", hostname: "www.tpex.org.tw", pathname: "/storage/bond_publish/ISSBD5_data.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "APPROVED_FOR_PRODUCTION", usageRole: "primary_csv" },
  { sourceId: "94025", resourceId: "94025-csv", exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", protocol: "https:", hostname: "mopsfin.twse.com.tw", pathname: "/opendata/t187ap05_R.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "APPROVED_FOR_PRODUCTION", usageRole: "primary_csv" },
  {
    sourceId: "11586",
    resourceId: "11586-csv",
    exactUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
    protocol: "https:",
    hostname: "www.twse.com.tw",
    pathname: "/company/applylistingCsvAndHtml",
    allowedContentTypes: ["text/csv"],
    maxResponseBytes: 8_000_000,
    timeoutMs: 30_000,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    usageRole: "primary_csv",
    ipoEventPolicy: {
      manifestSourceId: "twse-applications",
      approvedPurpose: "ipo_events",
      allowedFields: [
        "companyCode", "companyName", "applicationDate", "listingReviewDate",
        "boardApprovalDate", "listingContractApprovalOrFilingDate", "listingDate",
        "underwriters", "note", "sourceRecordId",
      ],
    },
  },
  { sourceId: "28567", resourceId: "28567-csv", exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv", protocol: "https:", hostname: "mopsfin.twse.com.tw", pathname: "/opendata/t187ap03_P.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "VERIFIED_FOR_IMPLEMENTATION", usageRole: "primary_csv" },
  {
    sourceId: "tpex-applications",
    resourceId: "tpex-applications-json",
    exactUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
    protocol: "https:",
    hostname: "www.tpex.org.tw",
    pathname: "/openapi/v1/tpex_esb_applicant_companies",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 8_000_000,
    timeoutMs: 20_000,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    usageRole: "primary_json",
    ipoEventPolicy: {
      manifestSourceId: "tpex-applications",
      approvedPurpose: "ipo_events",
      allowedFields: [
        "companyCode", "companyName", "applicationDate", "reviewDate", "boardDate",
        "contractDate", "listingDate", "underwriter", "note", "sourceRecordId",
      ],
    },
  },
  {
    sourceId: "tpex-ipo-listings",
    resourceId: "tpex-ipo-listings-json",
    exactUrl: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
    protocol: "https:",
    hostname: "www.tpex.org.tw",
    pathname: "/openapi/v1/tpex_ipo_no_limit",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 8_000_000,
    timeoutMs: 20_000,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    usageRole: "primary_json",
    ipoEventPolicy: {
      manifestSourceId: "tpex-ipo-listings",
      approvedPurpose: "ipo_events",
      allowedFields: [
        "companyCode", "companyName", "listingDate", "finalUnderwritingPrice",
        "underwriter", "sourceRecordId",
      ],
    },
  },
  {
    sourceId: "twse-auctions",
    resourceId: "twse-auctions-json",
    exactUrl: "https://www.twse.com.tw/announcement/auction?response=json",
    protocol: "https:",
    hostname: "www.twse.com.tw",
    pathname: "/announcement/auction",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 8_000_000,
    timeoutMs: 20_000,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    usageRole: "primary_json",
    annualQuery: { parameter: "yy", minimumYear: 2000, maximumYear: 9999 },
    ipoEventPolicy: {
      manifestSourceId: "twse-auctions",
      approvedPurpose: "ipo_events",
      allowedFields: [
        "companyCode", "companyName", "market", "bidStartDate", "bidEndDate",
        "auctionOpenDate", "listingDate", "minimumBidPrice", "finalUnderwritingPrice",
        "underwriter", "cancelled", "sourceRecordId",
      ],
    },
  },
  {
    sourceId: "twse-public-offerings",
    resourceId: "twse-public-offerings-json",
    exactUrl: "https://www.twse.com.tw/announcement/publicForm?response=json",
    protocol: "https:",
    hostname: "www.twse.com.tw",
    pathname: "/announcement/publicForm",
    allowedContentTypes: ["application/json"],
    maxResponseBytes: 8_000_000,
    timeoutMs: 20_000,
    approvalStatus: "APPROVED_FOR_PRODUCTION",
    usageRole: "primary_json",
    annualQuery: { parameter: "yy", minimumYear: 2000, maximumYear: 9999 },
    ipoEventPolicy: {
      manifestSourceId: "twse-public-offerings",
      approvedPurpose: "ipo_events",
      allowedFields: [
        "companyCode", "companyName", "market", "subscriptionStartDate",
        "subscriptionEndDate", "drawDate", "listingDate", "provisionalUnderwritingPrice",
        "finalUnderwritingPrice", "underwriter", "cancelled", "sourceRecordId",
      ],
    },
  },
];

export function listApprovedResources(): readonly ApprovedResource[] {
  return resources.map(cloneResource);
}

export function getApprovedResource(sourceId: PipelineSourceId, resourceId: string): ApprovedResource {
  const resource = resources.find((item) => item.sourceId === sourceId && item.resourceId === resourceId);
  if (!resource) throw new Error(`RESOURCE_NOT_APPROVED: ${sourceId}/${resourceId}`);
  return cloneResource(resource);
}

export function getApprovedIpoResource(sourceId: string, year: number): ApprovedIpoResource {
  const resource = resources.find((item) => item.ipoEventPolicy?.manifestSourceId === sourceId);
  if (!resource?.ipoEventPolicy || resource.approvalStatus !== "APPROVED_FOR_PRODUCTION") {
    throw new Error(`IPO_RESOURCE_NOT_APPROVED: ${sourceId}`);
  }
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error("IPO_RESOURCE_YEAR_INVALID");
  const resolved = cloneResource(resource);
  if (resolved.annualQuery) {
    if (year < resolved.annualQuery.minimumYear || year > resolved.annualQuery.maximumYear) {
      throw new Error("IPO_RESOURCE_YEAR_INVALID");
    }
    const url = new URL(resolved.exactUrl);
    url.searchParams.set(resolved.annualQuery.parameter, String(year));
    resolved.exactUrl = url.href;
  }
  return resolved as ApprovedIpoResource;
}

export function listApprovedIpoResources(year: number): readonly ApprovedIpoResource[] {
  const sourceIds: readonly IpoManifestSourceId[] = [
    "twse-applications",
    "tpex-applications",
    "tpex-ipo-listings",
    "twse-auctions",
    "twse-public-offerings",
  ];
  return sourceIds.map((sourceId) => getApprovedIpoResource(sourceId, year));
}

export function assertExactResourceUrl(resource: ApprovedResource, requestedUrl: string): URL {
  let parsed: URL;
  try { parsed = new URL(requestedUrl); } catch { throw new Error("URL_NOT_ALLOWED"); }
  const expected = new URL(resource.exactUrl);
  if (parsed.protocol !== resource.protocol || parsed.username || parsed.password || parsed.hostname !== resource.hostname || parsed.port || parsed.pathname !== resource.pathname || parsed.hash || parsed.href !== expected.href) throw new Error("URL_NOT_ALLOWED");
  return parsed;
}

function cloneResource(resource: ApprovedResource): ApprovedResource {
  return {
    ...resource,
    allowedContentTypes: [...resource.allowedContentTypes],
    annualQuery: resource.annualQuery && { ...resource.annualQuery },
    ipoEventPolicy: resource.ipoEventPolicy && {
      ...resource.ipoEventPolicy,
      allowedFields: [...resource.ipoEventPolicy.allowedFields],
    },
  };
}
