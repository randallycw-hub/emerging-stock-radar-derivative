import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompanyOverview,renderCompanyOverviewHtml} from '../static-showcase/assets/company-overview.js';
import {buildCbMarketStats,renderCbMarketStats} from '../static-showcase/assets/cb-stats-page.js';
import {projectMarketEvents} from '../static-showcase/assets/market-event-model.js';

test('listed company overview reuses dated official stock close, never calls it an emerging average',()=>{
  const overview=buildCompanyOverview({code:'8473',companyMaster:[{stockCode:'8473',companyName:'山林水',market:'上市',dataDate:'2026-09-04'}],
    workbench:[{status:'active',stockCode:'8473',quote:{stockClose:45.7,stockPriceDate:'2026-09-04'}}]});
  const html=renderCompanyOverviewHtml(overview);
  assert.match(html,/股票收盤/); assert.match(html,/45\.7/);
  assert.match(html,/股價日期/); assert.doesNotMatch(html,/盤後均價/);
});

test('stats distinguishes issued roster from listings and discloses partial weekly observations',()=>{
  const html=renderCbMarketStats(buildCbMarketStats({summary:{activeCount:385,listedCount:381,upcomingCount:4,weekObservedDayCount:1,weekTurnoverAmount:10}}));
  assert.match(html,/已掛牌 CB/); assert.match(html,/381/); assert.match(html,/待掛牌/);
  assert.match(html,/當週已收錄成交額/); assert.match(html,/已收錄 1 日/);
  assert.doesNotMatch(html,/本週成交額/);
});

test('canonical basic CB events keep their factual type instead of generic public event',()=>{
  for(const type of ['put','maturity','listing']){
    const [event]=projectMarketEvents({asOfDate:'2026-09-04',canonicalEvents:{records:[{
      eventId:type,eventType:type,marketScope:'cb',cbCode:'84732',stockCode:'8473',companyName:'山林水',instrumentName:'山林水二',effectiveDate:'2026-09-07'
    }]}});
    assert.equal(event.eventType,type);
  }
});
