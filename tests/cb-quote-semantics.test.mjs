import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCbWorkbenchV53, validateCbWorkbenchV53 } from '../static-showcase/assets/cb-workbench-v53.js';

function model({ history = [], view = {}, term = {} } = {}) {
  return buildCbWorkbenchV53({
    workbench: {dataDate:'2026-09-04', records:[{bondCode:'13166',term,events:[],view:{
      stockPriceDate:'2026-09-04',stockClose:'10.6',currentConversionPrice:'17.8',conversionPriceEffectiveDate:'2024-12-27',...view,
    }}]},
    cbMaster:[{bondCode:'13166',stockCode:'1316',bondName:'上曜六',companyName:'上曜',market:'上市'}],
    companyMaster:[{stockCode:'1316'}],history,
  });
}

test('official zero-volume observation is not a data error even without a closing price',()=>{
  const m=model({history:[{bondCode:'13166',date:'2026-09-04',cbTradingUnits:'0',cbTurnover:'0'}]});
  const q=m.records[0].quote;
  assert.equal(q.tradeState,'NO_TRADE_TODAY');
  assert.equal(q.volume,0);
  assert.equal(q.cbClose,null);
  assert.equal(q.stockConversionValue,59.55);
  assert.equal(q.stockConversionValueDate,'2026-09-04');
  assert.equal(q.premiumRate,null);
  assert.equal(validateCbWorkbenchV53(m),true);
});

test('last known official CB close retains its own date and is not paired with a newer stock close',()=>{
  const q=model({history:[
    {bondCode:'13166',date:'2026-08-28',cbClose:'110',cbTradingUnits:'2',cbTurnover:'220000'},
    {bondCode:'13166',date:'2026-09-04',cbClose:null,cbTradingUnits:'0',cbTurnover:'0'},
  ]}).records[0].quote;
  assert.equal(q.cbClose,110);
  assert.equal(q.lastTradeDate,'2026-08-28');
  assert.equal(q.tradeState,'NO_TRADE_TODAY');
  assert.equal(q.isLatestSnapshot,false);
  assert.equal(q.premiumRate,null);
});

test('absent official observation stays unknown; future terms cannot produce a valuation',()=>{
  const q=model({view:{conversionPriceEffectiveDate:'2026-09-07'}}).records[0].quote;
  assert.equal(q.tradeState,'DATA_ERROR');
  assert.equal(q.volume,null);
  assert.equal(q.stockConversionValue,null);
});

test('future listing remains discoverable but is separate from listed-market counts',()=>{
  const m=model({term:{listingDate:'2026-09-07'}});
  assert.equal(m.summary.activeCount,1);
  assert.equal(m.summary.listedCount,0);
  assert.equal(m.summary.upcomingCount,1);
});

test('weekly totals retain actual observation dates rather than asserting a complete week',()=>{
  const m=model({history:[{bondCode:'13166',date:'2026-09-04',cbTradingUnits:'2',cbTurnover:'220000'}]});
  assert.deepEqual(m.records[0].liquidity.weekObservationDates,['2026-09-04']);
  assert.equal(m.summary.weekObservedDayCount,1);
});

test('issuance projection retains the same official trustee as detail terms',()=>{
  const m=model({term:{trustee:'官方受託銀行'}});
  assert.equal(m.records[0].issuance.terms.trustee,'官方受託銀行');
});
