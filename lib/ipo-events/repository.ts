import { RepositoryError } from "../pipeline/repositories/errors.ts";
import type { D1Database } from "../pipeline/repositories/d1.ts";
import { assertIpoEventSnapshot, type IpoEventSnapshot } from "./snapshot.ts";

export interface IpoSnapshotRepository {
  readCurrent(): Promise<IpoEventSnapshot | null>;
  publish(snapshot: IpoEventSnapshot): Promise<void>;
  tryAcquireRefreshLease(options: { ownerToken: string; now: Date }): Promise<boolean>;
  completeRefreshAttempt(options: { ownerToken: string; completedAt: Date; succeeded: boolean }): Promise<void>;
}

const CURRENT_SNAPSHOT_SQL = "SELECT snapshots.payload_json as payloadJson FROM ipo_event_snapshot_pointer AS pointer JOIN ipo_event_snapshots AS snapshots ON snapshots.snapshot_id = pointer.snapshot_id WHERE pointer.singleton = 1";
const SNAPSHOT_INSERT_SQL = "INSERT OR IGNORE INTO ipo_event_snapshots (snapshot_id,data_date,generated_at,payload_json,source_manifest_json,created_at) VALUES (?,?,?,?,?,?)";
const POINTER_UPSERT_SQL = "INSERT INTO ipo_event_snapshot_pointer (singleton,snapshot_id,published_at) VALUES (1,?,?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id,published_at=excluded.published_at WHERE ((SELECT data_date FROM ipo_event_snapshots WHERE snapshot_id=excluded.snapshot_id) > (SELECT data_date FROM ipo_event_snapshots WHERE snapshot_id=ipo_event_snapshot_pointer.snapshot_id)) OR ((SELECT data_date FROM ipo_event_snapshots WHERE snapshot_id=excluded.snapshot_id) = (SELECT data_date FROM ipo_event_snapshots WHERE snapshot_id=ipo_event_snapshot_pointer.snapshot_id) AND (SELECT generated_at FROM ipo_event_snapshots WHERE snapshot_id=excluded.snapshot_id) > (SELECT generated_at FROM ipo_event_snapshots WHERE snapshot_id=ipo_event_snapshot_pointer.snapshot_id))";
const REFRESH_LEASE_DURATION_MS = 10 * 60 * 1_000;
const REFRESH_COOLDOWN_MS = 15 * 1_000;
const REFRESH_LEASE_ACQUIRE_SQL = "INSERT INTO ipo_event_refresh_state (singleton,lease_owner,lease_expires_at,last_attempt_at,last_success_at) VALUES (1,?,?,?,NULL) ON CONFLICT(singleton) DO UPDATE SET lease_owner=excluded.lease_owner,lease_expires_at=excluded.lease_expires_at,last_attempt_at=excluded.last_attempt_at WHERE (ipo_event_refresh_state.lease_owner IS NULL OR ipo_event_refresh_state.lease_expires_at <= ?) AND ipo_event_refresh_state.last_attempt_at <= ?";
const REFRESH_LEASE_COMPLETE_SQL = "UPDATE ipo_event_refresh_state SET lease_owner=NULL,lease_expires_at=NULL,last_attempt_at=?,last_success_at=CASE WHEN ?=1 THEN ? ELSE last_success_at END WHERE singleton=1 AND lease_owner=?";

export function createIpoSnapshotRepository(db: D1Database): IpoSnapshotRepository {
  return {
    async readCurrent() {
      const row = await db.prepare(CURRENT_SNAPSHOT_SQL).first<{ payloadJson?: unknown }>();
      if (!row) return null;
      if (typeof row.payloadJson !== "string") throw new RepositoryError("IPO_SNAPSHOT_READ_FAILED");
      try {
        const snapshot: unknown = JSON.parse(row.payloadJson);
        assertIpoEventSnapshot(snapshot);
        return snapshot;
      } catch {
        throw new RepositoryError("IPO_SNAPSHOT_READ_FAILED");
      }
    },
    async publish(snapshot) {
      try {
        assertIpoEventSnapshot(snapshot);
      } catch {
        throw new RepositoryError("IPO_SNAPSHOT_INVALID");
      }
      const snapshotId = `ipo:${snapshot.dataDate}:${await sha256Json(snapshot)}`;
      const results = await db.batch([
        db.prepare(SNAPSHOT_INSERT_SQL).bind(
          snapshotId,
          snapshot.dataDate,
          snapshot.generatedAt,
          JSON.stringify(snapshot),
          JSON.stringify(snapshot.sourceManifest),
          snapshot.generatedAt,
        ),
        db.prepare(POINTER_UPSERT_SQL).bind(snapshotId, snapshot.generatedAt),
      ]);
      if (results.length !== 2 || results.some((result) => result.success !== true)) {
        throw new RepositoryError("IPO_SNAPSHOT_PUBLISH_FAILED");
      }
    },
    async tryAcquireRefreshLease({ ownerToken, now }) {
      if (ownerToken.trim() === "" || Number.isNaN(now.getTime())) throw new RepositoryError("IPO_REFRESH_LEASE_INVALID");
      const leaseExpiresAt = new Date(now.getTime() + REFRESH_LEASE_DURATION_MS).toISOString();
      const cooldownBefore = new Date(now.getTime() - REFRESH_COOLDOWN_MS).toISOString();
      const nowIso = now.toISOString();
      const result = await db.prepare(REFRESH_LEASE_ACQUIRE_SQL)
        .bind(ownerToken, leaseExpiresAt, nowIso, nowIso, cooldownBefore)
        .run();
      if (result.success === false) throw new RepositoryError("IPO_REFRESH_LEASE_FAILED");
      return ((result.meta as { changes?: unknown } | undefined)?.changes ?? 0) === 1;
    },
    async completeRefreshAttempt({ ownerToken, completedAt, succeeded }) {
      if (ownerToken.trim() === "" || Number.isNaN(completedAt.getTime())) throw new RepositoryError("IPO_REFRESH_LEASE_INVALID");
      const completedAtIso = completedAt.toISOString();
      const result = await db.prepare(REFRESH_LEASE_COMPLETE_SQL)
        .bind(completedAtIso, succeeded ? 1 : 0, completedAtIso, ownerToken)
        .run();
      if (result.success === false) throw new RepositoryError("IPO_REFRESH_LEASE_FAILED");
    },
  };
}

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
