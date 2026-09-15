import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCbWorkbenchV53, validateCbWorkbenchV53 } from '../static-showcase/assets/cb-workbench-v53.js';
import { buildV55CanonicalData } from '../static-showcase/assets/v55-canonical-data.js';
import { renderCbDetailV53 } from '../static-showcase/assets/cb-detail-v53.js';
import { CB_VIEW_COLUMNS } from '../static-showcase/assets/bond-filter-page.js';
import { buildIssuanceSummary, selectV57IssuanceRecords } from '../static-showcase/assets/bond-issuance-page.js';

const dataDate = '2026-09-08';
const sourceUrl = 'https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv';

function model({ listingDate = '2026-09-21', view = {}, history = [], status = 'active', builder = buildCbWorkbenchV53, conversionPrices = [] } = {}) {
  return builder({
    workbench: { dataDate, records: [{
      bondCode: '90001', status,
      term: { issueDate: listingDate, listingDate, initialConversionPrice: '68.8' },
      view: { stockClose: '92', stockPriceDate: dataDate, ...view },
      events: listingDate ? [{ type: 'listing', date: listingDate, sourceUrl }] : [],
    }] },
    cbMaster: [{ bondCode: '90001', stockCode: '9000', bondName: '測試一', companyName: '測試', market: '上櫃' }],
    companyMaster: [{ stockCode: '9000' }],
    history: history.map(point => ({ bondCode: '90001', ...point })),
    conversionPrices,
  });
}

test('future listing is not a missing quote, a zero-volume trading day, or a completed listing', () => {
  const result = model();
  const record = result.records[0];
  assert.equal(record.quote.tradeState, 'NOT_YET_LISTED');
  assert.equal(record.quote.cbClose, null);
  assert.equal(record.quote.volume, null);
  assert.equal(record.quote.stockClose, 92);
  assert.equal(record.quote.conversionPrice, null, 'initial price must not masquerade as an effective price');
  assert.equal(record.terms.initialConversionPrice, 68.8);
  assert.equal(record.issuance.currentStage, 'scheduled');
  assert.equal(record.issuance.stages.listingDate, '2026-09-21');
  assert.equal(result.summary.listedCount, 0);
  assert.equal(selectV57IssuanceRecords(result.issuance, {}, dataDate)[0].category, 'upcoming');
  assert.equal(validateCbWorkbenchV53(result), true);
});

test('detail and database explain the not-yet-listed state without exposing internal errors', () => {
  const record = model().records[0];
  const html = renderCbDetailV53(record);
  assert.match(html, /交易狀態<\/dt><dd>尚未掛牌<\/dd>/);
  assert.match(html, /預定掛牌日<\/dt><dd>2026\/09\/21<\/dd>/);
  assert.doesNotMatch(html, /資料暫時無法取得|當日無成交|最後成交日/);
  const close = CB_VIEW_COLUMNS.overview.find(column => column[2] === 'close');
  assert.equal(close[1](record), '尚未掛牌');
  const volume = CB_VIEW_COLUMNS.quote.find(column => column[2] === 'volume');
  assert.equal(volume[1](record), '尚未掛牌');
});

test('pre-listing placeholders never become traded volume or liquidity statistics', () => {
  const result = model({
    view: { cbPriceDate: dataDate, cbClose: '100', cbTradeUnits: '0' },
    history: [{ date: dataDate, cbClose: '100', cbTradingUnits: '0', cbTurnover: '0' }],
  });
  const record = result.records[0];
  assert.equal(record.quote.tradeState, 'NOT_YET_LISTED');
  for (const key of ['cbClose', 'dataDate', 'lastPrice', 'lastTradeDate', 'volume', 'lastVolume', 'turnoverAmount']) {
    assert.equal(record.quote[key], null, key);
  }
  assert.equal(record.liquidity.weekVolume, null);
  assert.equal(record.liquidity.tradedDays20, null);
  const liquidityCount = CB_VIEW_COLUMNS.liquidity.find(column => column[0] === '近 20 筆有成交天數');
  assert.equal(liquidityCount[1](record), '—');
  assert.equal(result.summary.tradedSampleCount, 0);
});

test('listing-day quotes distinguish missing, official zero, and positive volume', () => {
  for (const [units, state] of [[null, 'DATA_ERROR'], ['0', 'NO_TRADE_TODAY'], ['1', 'TRADED_TODAY']]) {
    const record = model({ listingDate: dataDate, view: {
      cbPriceDate: dataDate, cbClose: units === '1' ? '100' : null, cbTradeUnits: units,
    } }).records[0];
    assert.equal(record.quote.tradeState, state);
    assert.equal(record.issuance.currentStage, 'listingDate');
  }
  assert.equal(model({ listingDate: null }).records[0].quote.tradeState, 'DATA_ERROR');
});

test('a future quote cannot leak into an earlier snapshot or its valuation', () => {
  const record = model({ listingDate: '2026-08-01', view: {
    cbPriceDate: '2026-09-09', cbClose: '120', cbTradeUnits: '5',
    stockPriceDate: '2026-09-09', stockClose: '100',
    currentConversionPrice: '100', conversionPriceEffectiveDate: '2026-08-01',
  } }).records[0];
  assert.equal(record.quote.tradeState, 'DATA_ERROR');
  assert.equal(record.quote.cbClose, null);
  assert.equal(record.quote.valuationDate, null);
  assert.equal(record.quote.premiumRate, null);
  assert.equal(record.quote.stockClose, null);
  assert.equal(record.quote.stockPriceDate, null);
});

test('a future conversion adjustment is not published as the currently effective conversion price', () => {
  const record = model({ listingDate: '2026-08-01', view: {
    cbPriceDate: dataDate, cbClose: '120', cbTradeUnits: '5',
    currentConversionPrice: '100', conversionPriceEffectiveDate: '2026-09-09',
  } }).records[0];
  assert.equal(record.quote.cbClose, 120);
  assert.equal(record.quote.stockClose, 92);
  assert.equal(record.quote.conversionPrice, null);
  assert.equal(record.quote.conversionPriceEffectiveDate, null);
  assert.equal(record.quote.stockConversionValue, null);
  assert.equal(record.quote.premiumRate, null);
  assert.equal(record.terms.initialConversionPrice, 68.8);
});

test('canonical enrichment cannot restore a future conversion snapshot as a currently effective history event', () => {
  const result = model({ builder: buildV55CanonicalData, listingDate: '2026-08-01', conversionPrices: [{
    bondCode: '90001', effectiveDate: '2026-09-09', initialConversionPrice: '100', currentConversionPrice: '80',
    officialDetailUrl: 'https://mops.twse.com.tw/mops/web/t120sg01',
  }] });
  assert.deepEqual(result.records[0].conversionPriceHistory, []);
  assert.equal(result.events.some(event => event.eventType === 'conversion_price_adjustment'), false);
  assert.equal(result.events.some(event => event.eventType === 'listing'), true, 'genuine dated listing events remain available');
});

test('an old trade without a current-day report must not claim no trading today', () => {
  const record = model({ listingDate: '2026-08-01', view: {
    cbPriceDate: '2026-09-07', cbClose: '110', cbTradeUnits: '2',
  } }).records[0];
  assert.equal(record.quote.tradeState, 'DATA_ERROR');
  assert.equal(record.quote.lastPrice, 110);
  assert.equal(record.quote.lastTradeDate, '2026-09-07');
  assert.equal(record.quote.volume, null);
  assert.doesNotMatch(renderCbDetailV53(record), /當日無成交/);
});

test('confirmed positive current volume never becomes no-trade when its closing price is unavailable', () => {
  const record = model({ listingDate: '2026-08-01', view: {
    cbPriceDate: '2026-09-07', cbClose: '110', cbTradeUnits: '2',
  }, history: [{ date: dataDate, cbClose: null, cbTradingUnits: '1', cbTurnover: '100000' }] }).records[0];
  assert.equal(record.quote.tradeState, 'TRADED_TODAY');
  assert.equal(record.quote.volume, 1);
  assert.equal(record.quote.turnoverAmount, 100000);
  assert.equal(record.quote.cbClose, 110);
  assert.equal(record.quote.dataDate, '2026-09-07');
  assert.equal(record.quote.isLatestSnapshot, false);
  const html = renderCbDetailV53(record);
  assert.match(html, /當日有成交/);
  assert.match(html, /最近成交價<\/dt><dd>110 元<\/dd><small>資料日 2026\/09\/07/);
  assert.doesNotMatch(html, /當日無成交/);
});

test('market totals count dated current-day activity independently of the last available closing price', () => {
  for (const [units, turnover, tradedCount] of [['0', '0', 0], ['1', '100000', 1]]) {
    const result = model({ listingDate: '2026-08-01', view: {
      cbPriceDate: '2026-09-07', cbClose: '110', cbTradeUnits: '2',
    }, history: [{ date: dataDate, cbClose: null, cbTradingUnits: units, cbTurnover: turnover }] });
    assert.equal(result.summary.tradedSampleCount, 1);
    assert.equal(result.summary.tradedCount, tradedCount);
    assert.equal(result.summary.turnoverSampleCount, 1);
    assert.equal(result.summary.turnoverAmount, Number(turnover));
  }
});

test('archived CBs remain in the archive but never inflate current issuance lists or counts', () => {
  const result = model({ listingDate: '2026-09-01', status: 'archived' });
  assert.equal(result.records[0].status, 'archived');
  assert.equal(result.issuance[0].status, 'archived');
  assert.deepEqual(selectV57IssuanceRecords(result.issuance, {}, dataDate), []);
  assert.deepEqual(buildIssuanceSummary(result.issuance, dataDate), {
    total: 0, in_progress: 0, upcoming: 0, recent_listing: 0,
  });
});
