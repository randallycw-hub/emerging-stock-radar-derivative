import { RepositoryError } from "../repositories/errors.ts";
import type { DatasetId, DatasetRecord } from "../repositories/types.ts";
import type { AdapterExecutionResult } from "../adapters/types.ts";

const SOURCE_SCOPE: Record<DatasetId, { sourceId: string; resourceId: string }> = {
  "94025": { sourceId: "94025", resourceId: "94025-csv" },
  "28567": { sourceId: "28567", resourceId: "28567-csv" },
  "11406": { sourceId: "11406", resourceId: "11406-csv" },
  "11586": { sourceId: "11586", resourceId: "11586-csv" },
};

const prohibitedKeys = new Set(["price", "stockPrice", "tradingVolume", "quote", "recommendation", "underwritingPrice"]);

function identityFor(datasetId: DatasetId, value: Record<string, unknown>): string {
  if (datasetId === "94025") return `${value.companyCode}:${value.yearMonth}`;
  if (datasetId === "28567") return String(value.sourceRecordId ?? "");
  if (datasetId === "11406") return String(value.bondId ?? "");
  return String(value.sourceRecordId ?? "");
}

export function toDatasetRecords(
  datasetId: DatasetId,
  snapshotId: string,
  result: AdapterExecutionResult<unknown>,
): DatasetRecord[] {
  const scope = SOURCE_SCOPE[datasetId];
  if (result.executionStatus !== "succeeded") throw new RepositoryError("ADAPTER_NOT_SUCCESSFUL");
  if (result.sourceId !== scope.sourceId || result.resourceId !== scope.resourceId) {
    throw new RepositoryError("ADAPTER_SCOPE_OR_INTEGRITY_MISMATCH");
  }
  const identities = new Set<string>();
  return result.records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new RepositoryError("INVALID_DATASET_RECORD");
    const value = structuredClone(record) as Record<string, unknown>;
    for (const key of Object.keys(value)) if (prohibitedKeys.has(key)) throw new RepositoryError("PROHIBITED_DATASET_FIELD");
    const naturalIdentity = identityFor(datasetId, value);
    if (!naturalIdentity) throw new RepositoryError("INVALID_DATASET_RECORD");
    if (identities.has(naturalIdentity)) throw new RepositoryError("DUPLICATE_NATURAL_IDENTITY");
    identities.add(naturalIdentity);
    return { datasetId, snapshotId, naturalIdentity, value };
  });
}
