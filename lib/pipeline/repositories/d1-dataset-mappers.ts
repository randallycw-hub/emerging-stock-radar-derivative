import type { D1Database, D1Prepared } from "./d1.ts";
import { RepositoryError } from "./errors.ts";
import type { DatasetId, DatasetRecord } from "./types.ts";

function assertRecordScope(datasetId: DatasetId, snapshotId: string, record: DatasetRecord): void {
  if (record.datasetId !== datasetId || record.snapshotId !== snapshotId || !record.naturalIdentity) {
    throw new RepositoryError("DATASET_RECORD_SCOPE_MISMATCH");
  }
}

function rejectUnsupportedValue(record: DatasetRecord): never {
  void record;
  throw new RepositoryError("INVALID_DATASET_RECORD");
}

function bindInsertStatements(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
  record: DatasetRecord,
): D1Prepared[] {
  void db;
  void snapshotId;

  switch (datasetId) {
    case "94025":
      return rejectUnsupportedValue(record);
    case "28567":
      return rejectUnsupportedValue(record);
    case "11406":
      return rejectUnsupportedValue(record);
    case "11586":
      return rejectUnsupportedValue(record);
    default: {
      const unhandledDataset: never = datasetId;
      void unhandledDataset;
      throw new RepositoryError("INVALID_DATASET_RECORD");
    }
  }
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
  if (results.some((result) => result.success === false)) {
    throw new RepositoryError("DATASET_RECORD_WRITE_FAILED");
  }
}

export async function readD1DatasetRecords(
  db: D1Database,
  datasetId: DatasetId,
  snapshotId: string,
): Promise<readonly DatasetRecord[]> {
  void db;
  void snapshotId;

  switch (datasetId) {
    case "94025":
    case "28567":
    case "11406":
    case "11586":
      return [];
    default: {
      const unhandledDataset: never = datasetId;
      void unhandledDataset;
      throw new RepositoryError("INVALID_DATASET_RECORD");
    }
  }
}
