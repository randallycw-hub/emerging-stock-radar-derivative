import test from 'node:test';
import assert from 'node:assert/strict';
import * as overview from '../static-showcase/assets/bond-filter-page.js';
import { cbDatabaseReturnUrl } from '../static-showcase/assets/cb-detail-v53.js';

const row = (code, terms = {}, quote = {}) => ({
  status: 'active', cbCode: code, cbName: '測試' + code, stockCode: code.slice(0, 4), companyName: '測試公司',
  terms: { issueDate: '2026-09-01', maturityDate: '2027-01-01', remainingRatio: 30, ...terms },
  quote: { cbClose: 106, stockConversionValue: 130, dataDate: '2026-09-18', ...quote },
});
const filtered = (rows, key, date = '2026-09-20', extra = {}) => overview.filterV53CbRecords(rows, {
  dataDate: date, ranges: { ...overview.cbPresetRanges(key, date), ...extra },
}).map(r => r.cbCode);

test('overview is default but explicit price-view and return state are retained', () => {
  assert.equal(overview.readCbFilterState('').view, 'overview');
  assert.equal(overview.readCbFilterState('?view=quote').view, 'quote');
  assert.equal(cbDatabaseReturnUrl('?from=database&list=view%3Dquote%26priceMax%3D106'), './bonds-filter.html?view=quote&priceMax=106');
});

test('six presets have inclusive labeled boundaries and exclude missing values', () => {
  const rows = [row('10001'), row('10002', { remainingRatio: 80 }, { cbClose: 106.01, stockConversionValue: 129.99 }),
    row('10003', { remainingRatio: null }, { cbClose: null, stockConversionValue: null })];
  assert.deepEqual(filtered(rows, 'remainingLow'), ['10001']);
  assert.deepEqual(filtered(rows, 'remainingHigh'), ['10002']);
  assert.deepEqual(filtered(rows, 'price106'), ['10001']);
  assert.deepEqual(filtered(rows, 'value130'), ['10001']);
  assert.equal(overview.cbPresetRanges('unknown', '2026-09-20'), null);
});

test('date presets include day 0 and 90 but reject expired and future issue dates', () => {
  const rows = [row('10001', { issueDate: '2026-06-22', maturityDate: '2026-12-19' }),
    row('10002', { issueDate: '2026-09-20', maturityDate: '2026-09-20' }),
    row('10003', { issueDate: '2026-09-21', maturityDate: '2026-09-19' }),
    row('10004', { issueDate: '2026-06-21', maturityDate: '2026-12-20' })];
  assert.deepEqual(filtered(rows, 'issue90'), ['10001', '10002']);
  assert.deepEqual(filtered(rows, 'maturity90'), ['10001', '10002']);
  assert.equal(overview.cbPresetRanges('issue90', 'bad'), null);
  assert.equal(overview.cbPresetRanges('maturity90', null), null);
  assert.deepEqual(filtered(rows, 'issue90', '2026-09-20', { priceMax: '100' }), []);
});

test('summary counts unique active issuers and clamps six calendar months at month end', () => {
  const rows = [row('10001', { maturityDate: '2027-02-28' }), row('10002', { maturityDate: '2027-03-01' }),
    row('20001', { maturityDate: '2026-08-30' }), row('30001', { maturityDate: null }),
    { ...row('40001'), status: 'terminated' }];
  assert.deepEqual(overview.cbOverviewSummary(rows, '2026-08-31'), { bonds: 4, issuers: 3, maturity6Months: 1 });
  assert.equal(overview.cbOverviewSummary(rows, 'bad').maturity6Months, null);
});

test('compact overview keeps market essentials, the selected bond identity and full expandable facts', () => {
  const rows = [row('10001'), {
    ...row('10002', { maturityDate: '2029-06-30', remainingRatio: 45 }),
    cbName: '測試二', stockCode: '1234', companyName: '標的公司',
    quote: { cbClose: 108, stockClose: 52, conversionPrice: 44, stockConversionValue: 118, premiumRate: -8, dataDate: '2026-09-18', stockPriceDate: '2026-09-18', conversionPriceEffectiveDate: '2026-09-10', stockConversionValueDate: '2026-09-18', valuationDate: '2026-09-18' },
    events: [{ label: '賣回起日', date: '2027-01-15' }],
  }];
  const output = overview.renderCbDatabaseTable(rows, { expandedCode: '10002' });
  assert.equal((output.head.match(/<th /g) ?? []).length, 10);
  assert.match(output.head, /CB／標的/);
  assert.match(output.head, /CB 收盤／最近成交/);
  assert.match(output.head, /轉換溢價率/);
  assert.match(output.head, /下一權利事件/);
  assert.match(output.body, /aria-expanded="false"[^>]*data-cb-expand="10001"/);
  assert.match(output.body, /aria-expanded="true"[^>]*data-cb-expand="10002"/);
  assert.equal((output.body.match(/class="cb-inline-row"/g) ?? []).length, 1);
  assert.match(output.body, /colspan="10"/);
  assert.match(output.body, /10002 測試二 · 1234 標的公司/);
  assert.match(output.body, /賣回起日 2027\/01\/15/);
  assert.match(output.body, /發行日/);
  assert.match(output.body, /到期日/);
});

test('compact details escape identity, distinguish dates and preserve list state', () => {
  const html = overview.renderCbOverviewFacts({ ...row('10002', {
    issueDate: '2026-09-03', listingDate: '2026-09-04', conversionStartDate: '2026-12-04',
    outstandingDataDate: '2026-09-09', underwriter: '<script>bad</script>',
  }), cbName: '<img src=x>' }, '?view=quote&priceMax=106');
  assert.match(html, /發行日/);
  assert.match(html, /2026\/09\/03/);
  assert.match(html, /掛牌日/);
  assert.match(html, /2026\/09\/04/);
  assert.match(html, /轉換開始日/);
  assert.match(html, /2026\/12\/04/);
  assert.match(html, /2026\/09\/09/);
  assert.doesNotMatch(html, /<script>|<img /);
  assert.match(html, /bond=10002/);
  assert.match(html, /view%3Dquote%26priceMax%3D106/);
});

test('mobile overview exposes dated values and unavailable listing price without fabricated zeros', () => {
  const html = overview.renderCbDatabaseCards([row('10001'), row('10002', {}, { cbClose: null, tradeState: 'NOT_YET_LISTED' })]);
  assert.equal((html.match(/<details /g) ?? []).length, 2);
  assert.match(html, /2026\/09\/18/);
  assert.match(html, /尚未掛牌/);
  assert.match(html, /剩餘比率/);
  assert.match(overview.renderCbDatabaseCards([]), /目前沒有符合條件/);
});
