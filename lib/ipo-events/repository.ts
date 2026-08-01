import { RepositoryError } from "../pipeline/repositories/errors.ts";
import type { D1Database } from "../pipeline/repositories/d1.ts";
import type { IpoEventSnapshot } from "./snapshot.ts";

export interface IpoSnapshotRepository {
  readCurrent(): Promise<IpoEventSnapshot | null>;
  publish(snapshot: IpoEventSnapshot): Promise<void>;
}

const CURRENT_SNAPSHOT_SQL = "SELECT snapshots.payload_json as payloadJson FROM ipo_event_snapshot_pointer AS pointer JOIN ipo_event_snapshots AS snapshots ON snapshots.snapshot_id = pointer.snapshot_id WHERE pointer.singleton = 1";
const SNAPSHOT_INSERT_SQL = "INSERT INTO ipo_event_snapshots (snapshot_id,data_date,generated_at,payload_json,source_manifest_json,created_at) VALUES (?,?,?,?,?,?)";
const POINTER_UPSERT_SQL = "INSERT INTO ipo_event_snapshot_pointer (singleton,snapshot_id,published_at) VALUES (1,?,?) ON CONFLICT(singleton) DO UPDATE SET snapshot_id=excluded.snapshot_id,published_at=excluded.published_at";

export function createIpoSnapshotRepository(db: D1Database): IpoSnapshotRepository {
  return {
    async readCurrent() {
      const row = await db.prepare(CURRENT_SNAPSHOT_SQL).first<{ payloadJson?: unknown }>();
      if (!row) return null;
      if (typeof row.payloadJson !== "string") throw new RepositoryError("IPO_SNAPSHOT_READ_FAILED");
      try {
        const snapshot: unknown = JSON.parse(row.payloadJson);
        if (!isIpoEventSnapshot(snapshot)) throw new TypeError("invalid IPO snapshot payload");
        return snapshot;
      } catch {
        throw new RepositoryError("IPO_SNAPSHOT_READ_FAILED");
      }
    },
    async publish(snapshot) {
      if (!isIpoEventSnapshot(snapshot)) throw new RepositoryError("IPO_SNAPSHOT_INVALID");
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
  };
}

async function sha256Json(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isIpoEventSnapshot(value: unknown): value is IpoEventSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Partial<IpoEventSnapshot>;
  return snapshot.schemaVersion === 1
    && typeof snapshot.dataDate === "string" && snapshot.dataDate.length > 0
    && typeof snapshot.generatedAt === "string" && snapshot.generatedAt.length > 0
    && Array.isArray(snapshot.sourceManifest)
    && Array.isArray(snapshot.records);
}
