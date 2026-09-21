import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import * as auction from '../../research/cb-sources/source-cb-auction.ts';

const sample=JSON.parse(await readFile(new URL('../../docs/source-verification/cb-auction-20260908-sample.json',import.meta.url),'utf8'));
const fields=sample.fields;
const row=['1','2026/09/10','測試一','90001','櫃檯買賣','有擔保轉換公司債','美國標','2026/09/04','2026/09/08','2,550','100','1','255','50','400','2026/09/21','測試承銷商','291743000','0.5','370','14490','112.12','2953','114.41','114.4100',''];
function parse(data=[row],sourceDate='2026-09-15') {
  assert.equal(typeof auction.parseCbAuctionReviewSource,'function');
  return auction.parseCbAuctionReviewSource({stat:'OK',fields,data},{sourceDate});
}

test('CB auction parses full bond identity and preserves every distinct price meaning',()=>{
  const result=parse(); const item=result.records[0];
  assert.equal(result.publishable,false);
  assert.equal(item.bondCode,'90001'); assert.equal(item.issuerCode,'9000');
  assert.equal(item.bidStartDate,'2026-09-04'); assert.equal(item.bidEndDate,'2026-09-08');
  assert.equal(item.minimumBidPrice,100); assert.equal(item.minimumWinningPrice,112.12);
  assert.equal(item.maximumWinningPrice,2953); assert.equal(item.finalUnderwritingPrice,114.41);
  const capped=[...row]; capped[21]='102.2'; capped[22]='105'; capped[23]='102.78'; capped[24]='102';
  const different=parse([capped]).records[0];
  assert.equal(different.weightedWinningPrice,102.78); assert.equal(different.finalUnderwritingPrice,102);
});

test('unopened and unannounced auction results are null rather than zero prices',()=>{
  const item=[...row]; for(const index of [17,19,20,21,22,23,24]) item[index]='0';
  const future=parse([item],'2026-09-08').records[0];
  assert.equal(future.resultStatus,'scheduled'); assert.equal(future.finalUnderwritingPrice,null);
  assert.equal(parse([item]).records[0].resultStatus,'awaiting_results');
  assert.throws(()=>parse([row],'2026-09-08'),/future/);
});

test('cancelled auctions retain the event but cannot supply winning or underwriting prices',()=>{
  const item=[...row]; item[25]='取消';
  const result=parse([item]).records[0];
  assert.equal(result.resultStatus,'cancelled');
  assert.equal(result.finalUnderwritingPrice,null);
  assert.equal(result.minimumWinningPrice,null);
});

test('CB auction excludes stock IPO rows, supports six-digit bonds and refuses malformed identities',()=>{
  const stock=[...row]; stock[3]='9000'; stock[5]='初上櫃';
  const six=[...row]; six[3]='900010';
  assert.deepEqual(parse([stock,six]).records.map(x=>x.bondCode),['900010']);
  for(const value of ['9000','9000A','<script>']) { const bad=[...row];bad[3]=value;assert.throws(()=>parse([bad]),/code/); }
});

test('CB auction rejects row/schema drift, duplicates and impossible date or numeric order',()=>{
  assert.throws(()=>parse([row,row]),/duplicate/);
  assert.throws(()=>parse([row.slice(0,25)]),/width/);
  for(const [index,value] of [[7,'2026/09/11'],[1,'2026/02/30'],[15,'2026/09/01'],[21,'-1'],[21,'3000'],[24,'NaN']]) {
    const bad=[...row];bad[index]=value;assert.throws(()=>parse([bad]));
  }
  const wrong=[...fields];wrong[24]='其他價格';
  assert.throws(()=>auction.parseCbAuctionReviewSource({stat:'OK',fields:wrong,data:[row]},{sourceDate:'2026-09-15'}),/fields/);
});
