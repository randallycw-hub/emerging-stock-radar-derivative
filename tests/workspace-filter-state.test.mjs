import test from 'node:test';
import assert from 'node:assert/strict';
import { readCbFilterState, filterV53CbRecords, sortCbDatabase, cbFilterRecords, nextPublishedCbEvent } from '../static-showcase/assets/bond-filter-page.js';
import { numberValue } from '../static-showcase/assets/bond-public-data.js';

test('shared CB filter links restore search, quick filter and view',()=>{
  assert.deepEqual(readCbFilterState('?q=１２３４&quickFilter=lowPremium&view=terms&sort=premium&direction=desc'),
    {q:'1234',quickFilter:'lowPremium',view:'terms',sort:'premium',direction:'desc'});
  assert.equal(readCbFilterState('?view=bad&sort=bad').view,'quote');
});
test('numeric sorting preserves zero and keeps unavailable values last in both directions',()=>{
  const rows=[{cbCode:'1',quote:{premiumRate:null}},{cbCode:'2',quote:{premiumRate:0}},{cbCode:'3',quote:{premiumRate:-2}}];
  assert.deepEqual(sortCbDatabase(rows,'premium','asc').map(x=>x.cbCode),['3','2','1']);
  assert.deepEqual(sortCbDatabase(rows,'premium','desc').map(x=>x.cbCode),['2','3','1']);
});
test('expired and undated suspension periods are not presented as currently suspended',()=>{
  const row=(code,event)=>({cbCode:code,status:'active',events:[{type:'conversion_suspension',...event}]});
  const rows=[row('1',{date:'2026-08-01',endDate:'2026-08-31'}),row('2',{date:'2026-09-01',endDate:'2026-09-10'}),row('3',{date:'2026-09-01'})];
  assert.deepEqual(filterV53CbRecords(rows,{quickFilter:'conversionSuspended',dataDate:'2026-09-04'}).map(x=>x.cbCode),['2']);
});

test('database filters use the same enriched official rights events as the calendar',()=>{
  const model={records:[{cbCode:'12341',status:'active',events:[]}],events:[{cbCode:'12341',marketScope:'cb',eventType:'early_redemption',deadlineDate:'2026-09-09',endDate:'2026-09-09',title:'提前贖回',sourceUrl:'https://www.tpex.org.tw/'}]};
  assert.equal(filterV53CbRecords(cbFilterRecords(model),{quickFilter:'recentRedemption',dataDate:'2026-09-04'}).length,1);
  assert.equal(model.records[0].events.length,0);
  assert.equal(nextPublishedCbEvent({events:[{date:'2025-01-01'},{date:'2026-09-09'}]},'2026-09-04').date,'2026-09-09');
});

test('missing public numeric values never become fabricated zero',()=>{
  for (const value of [null,undefined,'', '  ',false]) assert.equal(numberValue(value),'—');
  assert.equal(numberValue(0),'0');
});
