import { env } from "cloudflare:workers";
import type { MarketPayload } from "@/lib/market";

let initialized = false;

async function ensureSchema() {
  if (initialized || !env.DB) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS market_snapshots (
      id TEXT PRIMARY KEY, trade_date TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL,
      industry TEXT NOT NULL, average REAL, latest REAL, change REAL, volume INTEGER NOT NULL,
      turnover INTEGER NOT NULL, market_rank INTEGER, captured_at TEXT NOT NULL
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS market_snapshots_date_idx ON market_snapshots(trade_date, market_rank)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS company_profiles (
      code TEXT PRIMARY KEY, main_business TEXT NOT NULL DEFAULT '', concepts TEXT NOT NULL DEFAULT '[]',
      parent_group TEXT NOT NULL DEFAULT '未查得明確母公司', source_url TEXT NOT NULL DEFAULT '', checked_at TEXT NOT NULL
    )`)
  ]);
  initialized = true;
}

export async function saveClosingSnapshot(payload: MarketPayload) {
  if (!env.DB || payload.stale || !payload.quoteDate) return;
  const hour = Number(payload.generatedAt.slice(11, 13));
  if (hour < 15) return;
  await ensureSchema();
  const ranked = payload.rows.filter(x => x.qualified).sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  const ranks = new Map(ranked.map((x, index) => [x.code, index + 1]));
  for (let i = 0; i < payload.rows.length; i += 80) {
    const statements = payload.rows.slice(i, i + 80).map(row => env.DB.prepare(`
      INSERT INTO market_snapshots
        (id, trade_date, code, name, industry, average, latest, change, volume, turnover, market_rank, captured_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET average=excluded.average, latest=excluded.latest, change=excluded.change,
        volume=excluded.volume, turnover=excluded.turnover, market_rank=excluded.market_rank, captured_at=excluded.captured_at
    `).bind(`${payload.quoteDate}:${row.code}`, payload.quoteDate, row.code, row.name, row.industry, row.average, row.latest, row.change, row.volume, row.turnover, ranks.get(row.code) || null, payload.generatedAt));
    await env.DB.batch(statements);
  }
}

export async function readProfile(code: string) {
  if (!env.DB) return null;
  await ensureSchema();
  return env.DB.prepare("SELECT * FROM company_profiles WHERE code = ?").bind(code).first();
}

export async function saveProfile(profile: { code: string; mainBusiness: string; concepts: string[]; sourceUrl: string; checkedAt: string }) {
  if (!env.DB) return;
  await ensureSchema();
  await env.DB.prepare(`INSERT INTO company_profiles (code, main_business, concepts, source_url, checked_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET main_business=excluded.main_business,
    concepts=excluded.concepts, source_url=excluded.source_url, checked_at=excluded.checked_at`)
    .bind(profile.code, profile.mainBusiness, JSON.stringify(profile.concepts), profile.sourceUrl, profile.checkedAt).run();
}
