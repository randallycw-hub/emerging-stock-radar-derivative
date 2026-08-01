import assert from "node:assert/strict";
import test from "node:test";
import { createIpoSnapshotRepository } from "../lib/ipo-events/repository.ts";

const oldSnapshot = {
  schemaVersion: 1,
  dataDate: "2026-07-31",
  generatedAt: "2026-07-31T22:30:00+08:00",
  sourceManifest: [],
  records: [],
};
const newSnapshot = {
  schemaVersion: 1,
  dataDate: "2026-08-01",
  generatedAt: "2026-08-01T22:30:00+08:00",
  sourceManifest: [],
  records: [],
};

function createSnapshotDatabase(initialSnapshot) {
  const snapshots = new Map();
  let currentSnapshotId = null;
  let failBatchAt = null;
  if (initialSnapshot) {
    const snapshotId = "existing-snapshot";
    snapshots.set(snapshotId, JSON.stringify(initialSnapshot));
    currentSnapshotId = snapshotId;
  }
  return {
    get failBatchAt() { return failBatchAt; },
    set failBatchAt(value) { failBatchAt = value; },
    prepare(sql) {
      const statement = { sql, binds: [] };
      return {
        bind(...binds) { statement.binds = binds; return this; },
        async first() {
          if (!sql.includes("ipo_event_snapshot_pointer")) return null;
          const payloadJson = currentSnapshotId ? snapshots.get(currentSnapshotId) : undefined;
          return payloadJson ? { payloadJson } : null;
        },
        async all() { return { success: true, results: [] }; },
        async run() { return { success: true }; },
        statement,
      };
    },
    async batch(statements) {
      if (failBatchAt !== null) return statements.map((_, index) => ({ success: index !== failBatchAt }));
      const nextSnapshots = new Map(snapshots);
      let nextCurrentSnapshotId = currentSnapshotId;
      for (const { statement } of statements) {
        if (statement.sql.includes("INSERT INTO ipo_event_snapshots")) nextSnapshots.set(statement.binds[0], statement.binds[3]);
        if (statement.sql.includes("INSERT INTO ipo_event_snapshot_pointer")) nextCurrentSnapshotId = statement.binds[0];
      }
      snapshots.clear();
      for (const [snapshotId, payloadJson] of nextSnapshots) snapshots.set(snapshotId, payloadJson);
      currentSnapshotId = nextCurrentSnapshotId;
      return statements.map(() => ({ success: true }));
    },
  };
}

test("IPO snapshot repository reads the current snapshot after an atomic publication", async () => {
  const database = createSnapshotDatabase(oldSnapshot);
  const repository = createIpoSnapshotRepository(database);

  assert.deepEqual(await repository.readCurrent(), oldSnapshot);
  await repository.publish(newSnapshot);
  assert.deepEqual(await repository.readCurrent(), newSnapshot);
});

test("IPO snapshot publication failure leaves the valid current snapshot unchanged", async () => {
  const database = createSnapshotDatabase(oldSnapshot);
  const repository = createIpoSnapshotRepository(database);
  database.failBatchAt = 1;

  await assert.rejects(repository.publish(newSnapshot), /IPO_SNAPSHOT_PUBLISH_FAILED/);
  assert.deepEqual(await repository.readCurrent(), oldSnapshot);
});
