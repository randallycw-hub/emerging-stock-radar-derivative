import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPublicPageSnapshots } from '../scripts/lib/public-page-snapshots.mjs';
import { cbFilterRecords, filterV53CbRecords } from '../static-showcase/assets/bond-filter-page.js';
import { buildV56HomeBrief, buildV57HomeSections } from '../static-showcase/assets/home-page.js';
import { mapV57EmergingResearchRows } from '../static-showcase/assets/v56-page-data.js';
import { safeJsonFetch } from '../static-showcase/assets/site-shell.js';

const pointer = JSON.parse(await readFile(new URL('../static-showcase/data/current.json', import.meta.url), 'utf8'));
const read = async name => JSON.parse(await readFile(new URL(`../static-showcase/data/${pointer.generation}/${name}`, import.meta.url), 'utf8'));
const cb = await read('cb-workbench-v55.json');
const market = await read('v56-market-data.json');

test('page projections reject mismatched market dates', () => {
  assert.throws(() => buildPublicPageSnapshots({ cb, market: { ...market, dataDate: '2000-01-01' } }), /DATE_MISMATCH/);
});

test('compact search preserves all canonical records without market history', () => {
  const compact = buildPublicPageSnapshots({ cb, market }).quickSearch;
  assert.deepEqual(compact.records, market.searchIndex.records);
  assert.equal(compact.dataDate, market.dataDate);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < 1000000);
});

test('public JSON requests revalidate cached bytes and never reuse a failed response', async () => {
  let options;
  const result = await safeJsonFetch('https://example.invalid/data.json', { fetchImpl: async (_url, init) => {
    options = init;
    return { ok: true, json: async () => ({ dataDate: cb.dataDate }) };
  } });
  assert.equal(options.cache, 'no-cache');
  assert.equal(result.dataDate, cb.dataDate);
  assert.equal(await safeJsonFetch('https://example.invalid/data.json', { fetchImpl: async () => { throw new Error('offline'); } }), null);
});

test('compact CB overview preserves active rows and every existing quick-filter result', () => {
  const compact = buildPublicPageSnapshots({ cb, market }).cbOverview;
  const expected = cbFilterRecords(cb).filter(row => row.status === 'active');
  assert.deepEqual(cbFilterRecords(compact), expected);
  assert.equal(compact.dataDate, cb.dataDate);
  for (const quickFilter of ['', 'newIssue', 'lowPremium', 'nearConversion', 'rights90', 'maturity365', 'recentPut', 'recentRedemption', 'conversionSuspended']) {
    const options = { quickFilter, dataDate: cb.dataDate };
    assert.deepEqual(filterV53CbRecords(cbFilterRecords(compact), options), filterV53CbRecords(cbFilterRecords(cb), options));
  }
  assert.ok(JSON.stringify(compact).length < JSON.stringify(cb).length * 0.35);
});

test('homepage precomputation preserves displayed sections and IPO milestones without downloading history', () => {
  const compact = buildPublicPageSnapshots({ cb, market }).homeSummary;
  assert.deepEqual(compact.sections, buildV57HomeSections(market));
  assert.deepEqual(compact.brief.ipoMilestones, buildV56HomeBrief(market).ipoMilestones);
  assert.equal(compact.dataDate, market.dataDate);
  assert.equal(compact.priceHistory, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < 50000);
});

test('emerging projection preserves all research rows, dates, returns and missing values', () => {
  const compact = buildPublicPageSnapshots({ cb, market }).emergingOverview;
  assert.deepEqual(mapV57EmergingResearchRows(compact), mapV57EmergingResearchRows(market));
  assert.equal(compact.dataDate, market.dataDate);
  assert.equal(compact.priceHistory, undefined);
  assert.equal(compact.cbMaster, undefined);
  assert.ok(JSON.stringify(compact).length < JSON.stringify(market).length * 0.2);
});
