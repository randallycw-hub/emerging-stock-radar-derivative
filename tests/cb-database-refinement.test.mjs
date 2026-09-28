import assert from 'node:assert/strict';
import test from 'node:test';
import { CB_VIEW_COLUMNS, filterV53CbRecords, readCbFilterState, renderCbDatabaseTable } from '../static-showcase/assets/bond-filter-page.js';
import * as detail from '../static-showcase/assets/cb-detail-v53.js';
const { renderCbDetailV53 } = detail;

const record = {
  cbCode: '90001', cbName: '測試一', stockCode: '9000', companyName: '測試公司', status: 'active',
  quote: { cbClose: 112, lastPrice: 112, dataDate: '2026-09-02', lastTradeDate: '2026-09-02',
    snapshotDataDate: '2026-09-04', isLatestSnapshot: false, stockClose: 60, stockPriceDate: '2026-09-04',
    conversionPrice: 50, conversionPriceEffectiveDate: '2026-08-20', stockConversionValue: 120,
    stockConversionValueDate: '2026-09-04', premiumRate: null, valuationDate: null,
    volume: 0, turnoverAmount: 0, tradeState: 'NO_TRADE_TODAY' },
  terms: { issueDate: '2026-06-01', listingDate: '2026-06-01', maturityDate: '2029-06-01',
    issueAmount: 500000000, outstandingAmount: 400000000, remainingRatio: 80,
    outstandingDataDate: '2026-08-31', conversionStartDate: '2026-09-02', conversionEndDate: '2029-06-01',
    trustee: '測試受託人', putDates: [], putPrice: null },
  events: [], liquidity: {},
};

test('range filters compose with search and exclude missing values only for the selected field', () => {
  const rows = [record, { ...record, cbCode: '90002', quote: { cbClose: 130 } },
    { ...record, cbCode: '90003', quote: { cbClose: null } }];
  assert.deepEqual(filterV53CbRecords(rows, { query: '9000', ranges: { priceMin: '110', priceMax: '120' } }).map(row => row.cbCode), ['90001']);
  assert.equal(filterV53CbRecords(rows).length, 3);
  assert.equal(filterV53CbRecords(rows, { ranges: { premiumMax: '10' } }).length, 0);
});

test('range filters preserve zero and restore valid URL values without accepting invalid numbers', () => {
  const zero = { ...record, quote: { ...record.quote, premiumRate: 0 } };
  assert.equal(filterV53CbRecords([zero, record], { ranges: { premiumMax: '0' } }).length, 1);
  const state = readCbFilterState('?view=period&priceMin=100&premiumMax=0&remainingMin=bad');
  assert.equal(state.view, 'period');
  assert.equal(state.priceMin, '100');
  assert.equal(state.premiumMax, '0');
  assert.equal(state.remainingMin, undefined);
});

test('all views retain the issuer identity and a period view exposes existing balance and conversion dates', () => {
  assert.ok(CB_VIEW_COLUMNS.period, 'period and balance view is available');
  for (const [view, columns] of Object.entries(CB_VIEW_COLUMNS)) {
    const identity = view === 'overview' ? columns[0][1](record) : columns[1][1](record);
    if (view === 'overview') {
      assert.match(identity, /90001 測試一/);
      assert.match(identity, /9000 測試公司/);
    } else {
      assert.equal(identity, '9000 測試公司');
    }
  }
  const values = CB_VIEW_COLUMNS.period.map(([, value]) => value(record, '2026-09-04'));
  assert.ok(values.includes('2026/08/31'));
  assert.ok(values.includes('2026/09/02'));
  assert.ok(values.includes('80%'));
});

test('detail shows core dated facts before tabs without manufacturing a cross-date premium', () => {
  const html = renderCbDetailV53(record);
  const summary = /<dl class="cb-detail-summary"[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1];
  assert.ok(summary, 'core values are visible outside tab panels');
  assert.match(summary, /最近成交價[\s\S]*112 元[\s\S]*2026\/09\/02/);
  assert.match(summary, /標的股收盤[\s\S]*60 元[\s\S]*2026\/09\/04/);
  assert.match(summary, /轉換價值[\s\S]*120 元/);
  assert.match(summary, /轉換溢價率<\/dt><dd>—<\/dd>/);
  assert.ok(html.indexOf('cb-detail-summary') < html.indexOf('role="tablist"'));
  assert.doesNotMatch(summary, /0\.00%/);
});

test('compact detail omits chart and history presentation while retaining terms and company links', () => {
  const html = renderCbDetailV53(record, { history: [
    { bondCode: '90001', date: '2026-09-02', cbOpen: '110', cbHigh: '113', cbLow: '109', cbClose: '112', cbTradingUnits: '6', cbTurnover: '672000' },
  ] });
  assert.match(html, /data-cb-detail-panel="company"/);
  assert.doesNotMatch(html, /歷史成交明細|cb-lightweight-chart|樣本期間|均量採/);
  assert.match(html, /測試受託人/);
  assert.match(html, /company\.html\?code=9000/);
  assert.doesNotMatch(renderCbDetailV53(record), /class="cb-lightweight-chart"/);
  assert.doesNotMatch(html, /來源 ID|缺漏原因|資料完整|待確認/);
});

test('removed sample metadata never renders even when complete history and liquidity are supplied', () => {
  const html = renderCbDetailV53({...record, liquidity: {
    average5: 12, average20: 10, weekVolume: 60, tradedDays20: 18,
    sampleStartDate: '2026-08-01', sampleEndDate: '2026-09-04',
  }}, {history: [{bondCode: '90001', date:'2026-09-04', cbOpen:110, cbHigh:113, cbLow:109, cbClose:112, cbTradingUnits:6}]});
  assert.doesNotMatch(html, /CB 價格與成交量|data-cb-lightweight-chart|歷史成交明細|樣本期間|均量採|未補齊/);
  assert.match(html, /交易概況/);
  assert.match(html, /12 張/);
  assert.match(html, /最後成交日/);
});

test('liquidity comparison preserves dated trading values without sample diagnostics', () => {
  const {head,body} = renderCbDatabaseTable([record], {view:'liquidity'});
  assert.doesNotMatch(head+body, /樣本期間/);
  assert.match(head, /成交量/);
  assert.match(body, /90001/);
});

test('terms render zero coupon and initial conversion price as separate official facts', () => {
  const html = renderCbDetailV53({...record, terms:{...record.terms,
    initialConversionPrice:55, couponRate:'0.000000', securityDescription:'擔保條款 <來源>',
    officialDataDate:'2026-09-04', offeringMethod:null,
  }});
  assert.match(html, /票面利率<\/dt><dd>0%/);
  assert.match(html, /發行時轉換價<\/dt><dd>55 元/);
  assert.match(html, /擔保條款 &lt;來源&gt;/);
  assert.match(html, /條款資料日<\/dt><dd>2026\/09\/04/);
  assert.doesNotMatch(html, /募集方式<\/dt><dd>1/);
});

test('database detail navigation retains comparison filters and permits only the local database return path', () => {
  const { body } = renderCbDatabaseTable([record], { filterSearch: '?q=9000&view=period&premiumMax=0' });
  const href = /href="([^"]+)"/.exec(body)?.[1].replaceAll('&amp;', '&');
  const link = new URL(href, 'https://example.test/market-site/');
  assert.equal(link.searchParams.get('from'), 'database');
  assert.equal(typeof detail.cbDatabaseReturnUrl, 'function');
  assert.equal(detail.cbDatabaseReturnUrl(link.search), './bonds-filter.html?q=9000&view=period&premiumMax=0');
  assert.equal(detail.cbDatabaseReturnUrl('?from=https://evil.test'), null);
  assert.equal(detail.cbDatabaseReturnUrl('?from=database&list=redirect%3Dhttps%3A%2F%2Fevil.test'), './bonds-filter.html');
});

test('rendered comparison table associates dates with the correct values and escapes identity text', () => {
  const { head, body } = renderCbDatabaseTable([{ ...record, cbName: '<script>alert(1)</script>' }], { view: 'quote', sort: 'close', direction: 'desc' });
  assert.match(head, /aria-sort="descending"/);
  assert.match(body, /112<time datetime="2026-09-02">2026\/09\/02/);
  assert.match(body, /60<time datetime="2026-09-04">2026\/09\/04/);
  assert.match(body, /&lt;script&gt;/);
  assert.doesNotMatch(body, /<script>/);
  assert.match(body, /data-label="轉換溢價率">—<\/td>/);
});
