import assert from "node:assert/strict";
import test from "node:test";
import { createD1PipelineRepository } from "../../lib/pipeline/repositories/d1.ts";
test("D1 repository uses prepared statements and never global fetch", async () => { const calls = []; const db = { prepare(sql) { calls.push(sql); return { bind(...v) { calls.push(v); return this; }, async run() { return { success: true }; }, async first() { return undefined; }, async all() { return { results: [] }; } }; } }; const repo = createD1PipelineRepository(db, { clock: () => "2026-07-26T00:00:00.000Z" }); await repo.getIngestionRun("missing"); assert.equal(calls.some((sql) => String(sql).includes("SELECT *")), false); assert.equal(calls.every((sql) => !String(sql).includes("INSERT OR REPLACE")), true); });
