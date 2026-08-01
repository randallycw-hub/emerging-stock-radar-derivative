export type PipelineSourceId = "11406" | "94025" | "11586" | "28567";
export type ResourceApprovalStatus =
  | "VERIFIED_FOR_IMPLEMENTATION"
  | "APPROVED_FOR_PRODUCTION";
export type UsageRole = "primary_csv";

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
}

const resources: readonly ApprovedResource[] = [
  { sourceId: "11406", resourceId: "11406-csv", exactUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv", protocol: "https:", hostname: "www.tpex.org.tw", pathname: "/storage/bond_publish/ISSBD5_data.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "APPROVED_FOR_PRODUCTION", usageRole: "primary_csv" },
  { sourceId: "94025", resourceId: "94025-csv", exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv", protocol: "https:", hostname: "mopsfin.twse.com.tw", pathname: "/opendata/t187ap05_R.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "APPROVED_FOR_PRODUCTION", usageRole: "primary_csv" },
  { sourceId: "11586", resourceId: "11586-csv", exactUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data", protocol: "https:", hostname: "www.twse.com.tw", pathname: "/company/applylistingCsvAndHtml", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "APPROVED_FOR_PRODUCTION", usageRole: "primary_csv" },
  { sourceId: "28567", resourceId: "28567-csv", exactUrl: "https://mopsfin.twse.com.tw/opendata/t187ap03_P.csv", protocol: "https:", hostname: "mopsfin.twse.com.tw", pathname: "/opendata/t187ap03_P.csv", allowedContentTypes: ["text/csv"], maxResponseBytes: 8_000_000, timeoutMs: 30_000, approvalStatus: "VERIFIED_FOR_IMPLEMENTATION", usageRole: "primary_csv" },
];

export function listApprovedResources(): readonly ApprovedResource[] {
  return resources.map((resource) => ({ ...resource, allowedContentTypes: [...resource.allowedContentTypes] }));
}

export function getApprovedResource(sourceId: PipelineSourceId, resourceId: string): ApprovedResource {
  const resource = resources.find((item) => item.sourceId === sourceId && item.resourceId === resourceId);
  if (!resource) throw new Error(`RESOURCE_NOT_APPROVED: ${sourceId}/${resourceId}`);
  return { ...resource, allowedContentTypes: [...resource.allowedContentTypes] };
}

export function assertExactResourceUrl(resource: ApprovedResource, requestedUrl: string): URL {
  let parsed: URL;
  try { parsed = new URL(requestedUrl); } catch { throw new Error("URL_NOT_ALLOWED"); }
  const expected = new URL(resource.exactUrl);
  if (parsed.protocol !== resource.protocol || parsed.username || parsed.password || parsed.hostname !== resource.hostname || parsed.port || parsed.pathname !== resource.pathname || parsed.hash || parsed.href !== expected.href) throw new Error("URL_NOT_ALLOWED");
  return parsed;
}
