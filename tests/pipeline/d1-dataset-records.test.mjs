import assert from "node:assert/strict";
import test from "node:test";
import { createD1PipelineRepository } from "../../lib/pipeline/repositories/d1.ts";

const fixedDependencies = { clock: () => "2026-07-28T00:00:00.000Z" };

function createRecordingD1() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ sql, binds: [] });
      return {
        bind(...binds) {
          calls.at(-1).binds = binds;
          return this;
        },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() { return { success: true }; },
      };
    },
    async batch(statements) {
      calls.push({ batch: statements });
      return statements.map(() => ({ success: true }));
    },
  };
}

test("D1 dataset mapper rejects mismatched dataset and snapshot identities", async () => {
  const db = createRecordingD1();
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("94025", "snapshot-a", [{
      datasetId: "28567",
      snapshotId: "snapshot-a",
      naturalIdentity: "1101:2026-06",
      value: {},
    }]),
    /DATASET_RECORD_SCOPE_MISMATCH/,
  );
  assert.equal(db.calls.length, 0);
});

test("D1 dataset mapper rejects unsupported value shapes before SQL", async () => {
  const db = createRecordingD1();
  const repo = createD1PipelineRepository(db, fixedDependencies);

  await assert.rejects(
    repo.writeDatasetRecords("94025", "snapshot-a", [{
      datasetId: "94025",
      snapshotId: "snapshot-a",
      naturalIdentity: "bad",
      value: { companyCode: "" },
    }]),
    /INVALID_DATASET_RECORD/,
  );
  assert.equal(db.calls.length, 0);
});
