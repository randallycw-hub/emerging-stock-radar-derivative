import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validateV56MarketData} from '../static-showcase/assets/v56-market-data.js';
import {isActiveIpoRecord} from '../static-showcase/assets/ipo-stage-filter.js';

const root='static-showcase/data';
const read=async name=>JSON.parse(await readFile(name,'utf8'));
const pointer=await read(join(root,'current.json'));
if (!/^generations\/[a-f0-9]+$/.test(pointer.generation)) throw Error('Invalid generation');
const base=join(root,pointer.generation);
const [cb,market,emerging,ipo,stocks]=await Promise.all(['cb-workbench-v55','v56-market-data','emerging-market','ipo-events','stock-closes'].map(name=>read(join(base,`${name}.json`))));
validateV56MarketData(market);
const failures=[];
const check=(condition,message)=>{if(!condition) failures.push(message);};
const active=cb.records.filter(row=>row.status==='active');
const listed=active.filter(row=>(row.terms.listingDate??row.terms.issueDate??'')<=cb.dataDate);
const stockMap=new Map(stocks.map(row=>[row.companyCode,row]));
const canonicalCb=new Map(market.cbMaster.records.map(row=>[row.cbCode,row]));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
check(cb.dataDate===market.dataDate&&emerging.tradingDate===market.dataDate,'Cross-market trading dates differ');
check(new Set(active.map(row=>row.cbCode)).size===active.length,'Duplicate active CB code');
check(cb.summary.listedCount===listed.length,'Listed count mismatch');
for(const row of active){
  const q=row.quote, code=row.cbCode, master=canonicalCb.get(code);
  check(master?.stockCode===row.stockCode,`${code}: company identity mismatch`);
  check(q.stockClose===null||Number(stockMap.get(row.stockCode)?.close)===q.stockClose,`${code}: stock close differs from official row`);
  if(finite(q.stockConversionValue)){
    check(q.stockConversionValueDate===q.stockPriceDate&&q.stockPriceDate<=cb.dataDate,`${code}: undated conversion value`);
    check(q.conversionPriceEffectiveDate<=q.stockPriceDate,`${code}: future conversion price applied`);
    check(Math.abs(q.stockConversionValue-q.stockClose/q.conversionPrice*100)<=0.011,`${code}: conversion formula mismatch`);
  }
  if(finite(q.premiumRate)){
    check(q.dataDate===q.stockPriceDate,`${code}: mixed-date premium`);
    check(Math.abs(q.premiumRate-(q.cbClose/(q.stockClose/q.conversionPrice*100)-1)*100)<0.08,`${code}: premium formula mismatch`);
  }
  if(q.tradeState==='NO_TRADE_TODAY')check(q.volume===0,`${code}: no-trade label without zero observation`);
}
for(const row of listed)check(row.quote.tradeState!=='DATA_ERROR',`${row.cbCode}: missing official market observation`);
for(const row of emerging.records){
  check(row.tradingDate===market.dataDate,`${row.companyCode}: stale emerging date`);
  const canonical=market.emerging.records.find(item=>item.stockCode===row.companyCode);
  check(canonical?.dailyAveragePrice===(Number(row.dailyAveragePrice)>0?Number(row.dailyAveragePrice):null),`${row.companyCode}: emerging average mismatch`);
  if(canonical?.dailyAveragePrice===null)check(canonical.averageChangePercent===null,`${row.companyCode}: no-trade row has a price return`);
}
const activeIpo=market.ipoPipeline.records.filter(row=>isActiveIpoRecord(row,market.dataDate));
check(activeIpo.every(row=>!row.exceptionStatus),'Terminal IPO entered active list');
for(const row of market.performance.records){
  for(const [period,metric] of Object.entries(row.metrics??{})){
    if(!metric)continue;
    check(Math.abs(metric.value-(metric.numerator/metric.denominator-1))<0.00000002,`${row.entityType}:${row.entityId}:${period}: formula mismatch`);
    if(period==='1D')check((Date.parse(metric.sourceDates[1])-Date.parse(metric.sourceDates[0]))/86400000<=4,`${row.entityId}: stretched daily return`);
    if(period==='YTD')check(metric.sourceDates[0].slice(0,4)!==metric.sourceDates[1].slice(0,4),`${row.entityId}: partial-year baseline masquerades as YTD`);
  }
}
const coverage=Object.fromEntries(['cbClose','stockClose','conversionPrice','stockConversionValue','premiumRate','volume'].map(key=>[key,{available:active.filter(row=>finite(row.quote[key])).length,total:active.length}]));
const termCoverage=Object.fromEntries(['issueDate','listingDate','maturityDate','issueAmount','outstandingAmount','underwriter','trustee','conversionStartDate','conversionEndDate','putPrice'].map(key=>[key,{available:active.filter(row=>row.terms[key]!=null&&row.terms[key]!=='').length,total:active.length}]));
const report={checkedAt:new Date().toISOString(),generation:pointer.generation,tradingDate:market.dataDate,ipoSourceDate:ipo.dataDate,previousComparisonDate:market.previousDataDate,counts:{activeCb:active.length,listedCb:listed.length,upcomingCb:active.length-listed.length,emerging:emerging.records.length,activeIpo:activeIpo.length,rightsEvents:cb.events.length},tradeStates:Object.fromEntries(Object.entries(Object.groupBy(active,row=>row.quote.tradeState)).map(([key,rows])=>[key,rows.length])),coverage,termCoverage,weeklyObservationDates:cb.summary.weekObservationDates,failures};
await mkdir('.cache/workspace-review',{recursive:true});
await writeFile('.cache/workspace-review/data-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(failures.length)process.exitCode=1;
