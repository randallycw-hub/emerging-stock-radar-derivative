import test from 'node:test';
import assert from 'node:assert/strict';
import { collectUnpricedStockObservations, confirmedUnpricedStockCodes } from '../scripts/lib/official-stock-availability.mjs';
const source='https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes';
test('official blank close is evidence of unavailable price, never a made-up price or zero volume',()=>{
  const rows=[{Date:'1150904',SecuritiesCompanyCode:'6904',Close:' ---',Change:'--- ',TradingShares:'66'}];
  const result=collectUnpricedStockObservations(rows,source,new Set(['6904']));
  assert.equal(result[0].tradingDate,'2026-09-04');
  assert.equal(result[0].reportedClose,'---');
  assert.deepEqual([...confirmedUnpricedStockCodes(result,'2026-09-04')],['6904']);
  assert.equal(confirmedUnpricedStockCodes(result,'2026-09-05').size,0);
  assert.equal(confirmedUnpricedStockCodes([{...result[0],sourceUrl:'https://example.com'}],'2026-09-04').size,0);
  assert.equal(collectUnpricedStockObservations([],source,new Set(['6904'])).length,0);
  assert.equal(collectUnpricedStockObservations([{...rows[0],Close:'123'}],source,new Set(['6904'])).length,0);
});
