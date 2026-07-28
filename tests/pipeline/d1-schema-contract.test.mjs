import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const sql = (name) => readFile(new URL(`../../migrations/${name}`, import.meta.url), "utf8");
const allMigrations = async () => {
  const migrations = await Promise.all([
    sql("0001_pipeline_core.sql"),
    sql("0002_pipeline_dataset_records.sql"),
    sql("0003_company_profile_completeness.sql"),
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
test("schema excludes prohibited market and generic payload surfaces", async () => { const all = await allMigrations(); for (const word of ["stock_price","bid_price","ask_price","volume","premium_discount","conversion_value","theoretical_price","arbitrage","recommendation","generic_records","payload_json"]) assert.doesNotMatch(all, new RegExp(word)); });
