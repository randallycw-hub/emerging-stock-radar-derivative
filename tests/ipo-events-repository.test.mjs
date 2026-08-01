import assert from "node:assert/strict";
import test from "node:test";
import { createIpoSnapshotRepository } from "../lib/ipo-events/repository.ts";
import { createValidIpoSnapshot } from "./helpers/ipo-snapshot.mjs";

const oldSnapshot = createValidIpoSnapshot({
  dataDate: "2026-07-31",
  generatedAt: "2026-07-31T22:30:00+08:00",
});
const newSnapshot = createValidIpoSnapshot({
  dataDate: "2026-08-01",
  generatedAt: "2026-08-01T22:30:00+08:00",
});

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
    get snapshotCount() { return snapshots.size; },
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
      const results = [];
      for (const { statement } of statements) {
        if (statement.sql.includes("INSERT") && statement.sql.includes("INTO ipo_event_snapshots (")) {
          const duplicate = nextSnapshots.has(statement.binds[0]);
          if (duplicate && !statement.sql.includes("OR IGNORE")) {
            return statements.map((_, index) => ({ success: index !== results.length }));
          }
          if (!duplicate) nextSnapshots.set(statement.binds[0], statement.binds[3]);
        }
        if (statement.sql.includes("INSERT INTO ipo_event_snapshot_pointer")) {
          const candidateId = statement.binds[0];
          const candidate = JSON.parse(nextSnapshots.get(candidateId));
          const current = currentSnapshotId ? JSON.parse(nextSnapshots.get(currentSnapshotId)) : null;
          const isForward = current === null
            || candidate.dataDate > current.dataDate
            || (candidate.dataDate === current.dataDate && candidate.generatedAt > current.generatedAt);
          if (!statement.sql.includes("WHERE (") || isForward) nextCurrentSnapshotId = candidateId;
        }
        results.push({ success: true });
      }
      snapshots.clear();
      for (const [snapshotId, payloadJson] of nextSnapshots) snapshots.set(snapshotId, payloadJson);
      currentSnapshotId = nextCurrentSnapshotId;
      return results;
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

test("publishing the same immutable IPO snapshot twice is idempotent", async () => {
  const database = createSnapshotDatabase(oldSnapshot);
  const repository = createIpoSnapshotRepository(database);

  await repository.publish(newSnapshot);
  await repository.publish(newSnapshot);

  assert.deepEqual(await repository.readCurrent(), newSnapshot);
  assert.equal(database.snapshotCount, 2);
});

test("an older candidate can be stored but cannot move the current pointer backward", async () => {
  const current = {
    ...newSnapshot,
    generatedAt: "2026-08-01T22:30:00+08:00",
  };
  const database = createSnapshotDatabase(current);
  const repository = createIpoSnapshotRepository(database);
  const olderDataDate = {
    ...oldSnapshot,
    generatedAt: "2026-08-02T23:00:00+08:00",
  };
  const olderGeneratedAt = {
    ...current,
    generatedAt: "2026-08-01T21:30:00+08:00",
  };

  await repository.publish(olderDataDate);
  await repository.publish(olderGeneratedAt);

  assert.deepEqual(await repository.readCurrent(), current);
  assert.equal(database.snapshotCount, 3);
});

test("current snapshot reads fail closed on corrupt dates, manifest, records, and nested fields", async () => {
  const cases = [
    { name: "dataDate", mutate: (snapshot) => { snapshot.dataDate = "zzzz"; } },
    { name: "generatedAt", mutate: (snapshot) => { snapshot.generatedAt = "x"; } },
    { name: "empty manifest", mutate: (snapshot) => { snapshot.sourceManifest = []; } },
    { name: "missing manifest source", mutate: (snapshot) => { snapshot.sourceManifest.pop(); } },
    { name: "duplicate manifest source", mutate: (snapshot) => { snapshot.sourceManifest[4] = { ...snapshot.sourceManifest[0] }; } },
    { name: "manifest URL", mutate: (snapshot) => { snapshot.sourceManifest[0].sourceUrl = "https://third-party.test/11586.csv"; } },
    { name: "manifest hash", mutate: (snapshot) => { snapshot.sourceManifest[0].sha256 = "sha256:abc"; } },
    { name: "manifest bytes", mutate: (snapshot) => { snapshot.sourceManifest[0].rawBytes = 0; } },
    { name: "manifest rows", mutate: (snapshot) => { snapshot.sourceManifest[0].rowCount = 0; } },
    { name: "null record", mutate: (snapshot) => { snapshot.records = [null]; } },
    { name: "event enum", mutate: (snapshot) => { snapshot.records[0].events[0].kind = "invented"; } },
    { name: "nested auction", mutate: (snapshot) => { snapshot.records[0].auction = {}; } },
  ];

  for (const { name, mutate } of cases) {
    const corrupt = structuredClone(newSnapshot);
    mutate(corrupt);
    const repository = createIpoSnapshotRepository(createSnapshotDatabase(corrupt));
    await assert.rejects(repository.readCurrent(), /IPO_SNAPSHOT_READ_FAILED/, name);
  }
});

test("IPO refresh lease is exclusive and preserves a bounded failure cooldown", async () => {
  const database = createLeaseDatabase();
  const repository = createIpoSnapshotRepository(database);

  assert.equal(await repository.tryAcquireRefreshLease({
    ownerToken: "owner-a",
    now: new Date("2026-08-01T14:30:00.000Z"),
  }), true);
  assert.equal(await repository.tryAcquireRefreshLease({
    ownerToken: "owner-b",
    now: new Date("2026-08-01T14:30:01.000Z"),
  }), false);

  await repository.completeRefreshAttempt({
    ownerToken: "owner-a",
    completedAt: new Date("2026-08-01T14:30:20.000Z"),
    succeeded: false,
  });
  assert.equal(await repository.tryAcquireRefreshLease({
    ownerToken: "owner-b",
    now: new Date("2026-08-01T14:30:21.000Z"),
  }), false);
  assert.equal(await repository.tryAcquireRefreshLease({
    ownerToken: "owner-c",
    now: new Date("2026-08-01T14:30:36.000Z"),
  }), true);
});

function createLeaseDatabase() {
  let state = null;
  return {
    prepare(sql) {
      const statement = { sql, binds: [] };
      return {
        bind(...binds) { statement.binds = binds; return this; },
        async first() { return null; },
        async all() { return { success: true, results: [] }; },
        async run() {
          if (sql.startsWith("INSERT INTO ipo_event_refresh_state")) {
            const [ownerToken, leaseExpiresAt, lastAttemptAt, now, cooldownBefore] = statement.binds;
            const available = state === null
              || ((state.leaseOwner === null || state.leaseExpiresAt <= now) && state.lastAttemptAt <= cooldownBefore);
            if (available) state = { leaseOwner: ownerToken, leaseExpiresAt, lastAttemptAt, lastSuccessAt: state?.lastSuccessAt ?? null };
            return { success: true, meta: { changes: available ? 1 : 0 } };
          }
          if (sql.startsWith("UPDATE ipo_event_refresh_state")) {
            const [lastAttemptAt, succeeded, completedAt, ownerToken] = statement.binds;
            const owned = state?.leaseOwner === ownerToken;
            if (owned) state = {
              ...state,
              leaseOwner: null,
              leaseExpiresAt: null,
              lastAttemptAt,
              lastSuccessAt: succeeded === 1 ? completedAt : state.lastSuccessAt,
            };
            return { success: true, meta: { changes: owned ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
    async batch() { return []; },
  };
}
