import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
const sql = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8");
const allMigrations = async () => {
  const migrations = await Promise.all([
    sql("0001_pipeline_core.sql"),
    sql("0002_pipeline_dataset_records.sql"),
    sql("0003_company_profile_completeness.sql"),
    sql("0004_listing_application_completeness.sql"),
    sql("0005_bond_contract_completeness.sql"),
    sql("0005_ipo_event_snapshots.sql"),
    sql("0006_ipo_event_refresh_state.sql"),
  ]);
  return migrations.join("\n").toLowerCase();
};

test("D1 migrations are additive and contain required tables, constraints and indexes", async () => { const all = await allMigrations(); for (const table of ["ingestion_runs","source_snapshots","published_snapshot_pointers","source_health","emerging_monthly_revenue","public_company_profiles","bond_issuances","bond_put_rights","listing_applications","listing_application_underwriters"]) assert.match(all, new RegExp(`create table ${table}`)); assert.match(all, /foreign key|references/); assert.match(all, /primary key/); assert.match(all, /unique/); assert.match(all, /check/); assert.match(all, /create index/); assert.doesNotMatch(all, /drop table|delete from|truncate|insert into/); });
test("forward-only profile migration persists every required 28567 normalized field", async () => {
  const three = await sql("0003_company_profile_completeness.sql");
  assert.match(three, /ALTER TABLE public_company_profiles ADD COLUMN paid_in_capital TEXT;/);
  assert.match(three, /ALTER TABLE public_company_profiles ADD COLUMN chairperson TEXT;/);
  assert.match(three, /ALTER TABLE public_company_profiles ADD COLUMN general_manager TEXT;/);
});
test("forward-only listing migration persists chairman identity without rewriting earlier migrations", async () => {
  const migrationNames = await readdir(new URL("../../migrations/", import.meta.url));
  assert.ok(migrationNames.includes("0004_listing_application_completeness.sql"));
  const four = await sql("0004_listing_application_completeness.sql");
  assert.match(four, /ALTER TABLE listing_applications ADD COLUMN chairman_name TEXT NOT NULL DEFAULT '';/);
});
test("forward-only bond migration persists the complete normalized 11406 contract", async () => {
  const migrationNames = await readdir(new URL("../../migrations/", import.meta.url));
  assert.ok(migrationNames.includes("0005_bond_contract_completeness.sql"));
  const five = await sql("0005_bond_contract_completeness.sql");
  assert.match(five, /ALTER TABLE bond_issuances ADD COLUMN source_bond_type_code TEXT;/);
  assert.match(five, /ALTER TABLE bond_issuances ADD COLUMN series_number TEXT;/);
  assert.match(five, /ALTER TABLE bond_issuances ADD COLUMN tranche_number TEXT;/);
  assert.match(five, /ALTER TABLE bond_issuances ADD COLUMN security_description TEXT;/);
});
test("IPO snapshot migration stores the verified snapshot and its atomic pointer", async () => {
  const migration = await sql("0005_ipo_event_snapshots.sql");
  assert.match(migration, /CREATE TABLE ipo_event_snapshots/);
  assert.match(migration, /CREATE TABLE ipo_event_snapshot_pointer/);
  assert.match(migration, /FOREIGN KEY.*ipo_event_snapshots/is);
  assert.match(migration, /CREATE INDEX idx_ipo_event_snapshots_data_date/);
});
test("forward-only IPO refresh migration stores the global lease and cooldown state", async () => {
  const migrationNames = await readdir(new URL("../../migrations/", import.meta.url));
  assert.ok(migrationNames.includes("0006_ipo_event_refresh_state.sql"));
  const migration = await sql("0006_ipo_event_refresh_state.sql");
  assert.match(migration, /CREATE TABLE ipo_event_refresh_state/);
  assert.match(migration, /lease_owner TEXT/);
  assert.match(migration, /lease_expires_at TEXT/);
  assert.match(migration, /last_attempt_at TEXT/);
  assert.match(migration, /last_success_at TEXT/);
});
test("schema excludes prohibited market and generic payload surfaces", async () => { const all = await allMigrations(); for (const word of ["stock_price","bid_price","ask_price","volume","premium_discount","conversion_value","theoretical_price","arbitrage","recommendation","generic_records"]) assert.doesNotMatch(all, new RegExp(word)); });
