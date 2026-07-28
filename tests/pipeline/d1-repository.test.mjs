import assert from "node:assert/strict";
import test from "node:test";
import { createD1PipelineRepository } from "../../lib/pipeline/repositories/d1.ts";

function createRecordingD1({ first = null } = {}) {
  const sql = [];
  const binds = [];
  return {
    sql,
    binds,
    prepare(statement) {
      sql.push(statement);
      return {
        bind(...values) {
          binds.push(values);
          return this;
        },
        async first() { return first; },
        async all() { return { results: [] }; },
        async run() { return { success: true }; },
      };
    },
    async batch() { return []; },
  };
}

function createRepo(db) {
  return createD1PipelineRepository(db, { clock: () => "2026-07-28T00:00:00.000Z" });
}

test("D1 repository uses prepared statements and never global fetch", async () => { const calls = []; const db = { prepare(sql) { calls.push(sql); return { bind(...v) { calls.push(v); return this; }, async run() { return { success: true }; }, async first() { return undefined; }, async all() { return { results: [] }; } }; } }; const repo = createD1PipelineRepository(db, { clock: () => "2026-07-26T00:00:00.000Z" }); await repo.getIngestionRun("missing"); assert.equal(calls.some((sql) => String(sql).includes("SELECT *")), false); assert.equal(calls.every((sql) => !String(sql).includes("INSERT OR REPLACE")), true); });

test("D1 repository reads the pointer only for the requested dataset", async () => {
  const db = createRecordingD1({
    first: {
      datasetId: "94025",
      sourceId: "94025",
      resourceId: "94025-csv",
      currentSnapshotId: "snapshot-2",
      previousSnapshotId: "snapshot-1",
      publicationRunId: "run-2",
      publishedAt: "2026-07-28T00:00:00.000Z",
      version: 2,
    },
  });

  const pointer = await createRepo(db).getPublishedSnapshotPointer("94025");

  assert.deepEqual(pointer, {
    datasetId: "94025",
    sourceId: "94025",
    resourceId: "94025-csv",
    currentSnapshotId: "snapshot-2",
    previousSnapshotId: "snapshot-1",
    publicationRunId: "run-2",
    publishedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.match(db.sql[0], /WHERE dataset_id = \?/);
  assert.equal(db.binds[0][0], "94025");
});

test("D1 repository returns undefined when the requested dataset has no pointer", async () => {
  const pointer = await createRepo(createRecordingD1()).getPublishedSnapshotPointer("94025");

  assert.equal(pointer, undefined);
});

test("D1 repository rejects pointer rows with blank required fields", async () => {
  const validRow = {
    datasetId: "94025",
    sourceId: "94025",
    resourceId: "94025-csv",
    currentSnapshotId: "snapshot-2",
    previousSnapshotId: "snapshot-1",
    publicationRunId: "run-2",
    publishedAt: "2026-07-28T00:00:00.000Z",
  };
  for (const [field, value] of [
    ["sourceId", " "],
    ["resourceId", "\t"],
    ["currentSnapshotId", "  "],
    ["previousSnapshotId", "\n"],
    ["publicationRunId", " "],
    ["publishedAt", " "],
  ]) {
    const pointer = await createRepo(createRecordingD1({
      first: { ...validRow, [field]: value },
    })).getPublishedSnapshotPointer("94025");

    assert.equal(pointer, undefined, `${field} must be nonblank when present`);
  }
});
