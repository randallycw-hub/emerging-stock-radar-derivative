import assert from 'node:assert/strict';
import test from 'node:test';
import * as filing from '../../research/cb-sources/source-cb-filing.ts';

const headers = ['證券代號','公司型態','結案類型','公司名稱','承銷商','案件類別','金　　　　額','幣別','發行價格','收文日期','自動補正\n日　　期','停止生效\n日　　期','解除生效\n日　　期','生效日期','廢止/撤銷\n日　　期','自行撤回\n日　　期','退件日期','案件性質'];
const row = ['9000','上櫃','生效','測試公司','測試證券','轉換公司債(有擔保)',300000000,'台幣',null,'1150807',null,null,null,'1150825',null,null,null,'十二日制'];
const input = (rows = [row], sourceDate = '2026-09-15') => ({rows:[['申報案件辦理情形彙總表(新聞稿)'],[],headers,...rows],sourceDate});
function parse(value) {
  assert.equal(typeof filing.parseSfbCbFilingRows, 'function', 'official filing parser must exist');
  return filing.parseSfbCbFilingRows(value);
}

test('filing keeps official receipt dates and amounts without inventing a bond code or filing day', () => {
  const result = parse(input());
  assert.equal(result.records.length,1);
  const record = result.records[0];
  assert.equal(record.issuerCode,'9000');
  assert.equal(record.receivedDate,'2026-08-07');
  assert.equal(record.effectiveDate,'2026-08-25');
  assert.equal(record.issueAmount,300000000);
  assert.equal(record.currency,'TWD');
  assert.equal(record.status,'effective');
  assert.equal(record.bondCode,undefined);
  assert.equal(record.filingDate,undefined);
  assert.equal(record.sourceRow,4);
});

test('filing future or unclosed effective dates never become completed events', () => {
  const unclosed = [...row]; unclosed[2]=null; unclosed[13]='1150921';
  const item=parse(input([unclosed])).records[0];
  assert.equal(item.status,'pending');
  assert.equal(item.effectiveDate,null);
  assert.equal(item.expectedEffectiveDate,'2026-09-21');
  unclosed[13]='1150901';
  assert.equal(parse(input([unclosed])).records[0].effectiveDate,null);
  unclosed[2]='生效'; unclosed[13]='1150921';
  assert.throws(()=>parse(input([unclosed])),/future|未來/);
});

test('filing preserves terminated cases internally instead of counting them as pending', () => {
  for (const [closed,index,status] of [['自行撤回',15,'withdrawn'],['退件',16,'rejected'],['廢止',14,'revoked']]) {
    const item=[...row]; item[2]=closed; item[13]=null; item[index]='1150903';
    const record=parse(input([item])).records[0];
    assert.equal(record.status,status);
    assert.equal(record.terminalDate,'2026-09-03');
  }
});

test('filing multi-date corrections and suspension/resumption remain separate events', () => {
  const item=[...row]; item[2]=null; item[10]='1150808,1150810,1150812'; item[11]='1150813'; item[12]='1150814'; item[13]='1150921';
  const record=parse(input([item])).records[0];
  assert.deepEqual(record.correctionDates,['2026-08-08','2026-08-10','2026-08-12']);
  assert.deepEqual(record.suspensionDates,['2026-08-13']);
  assert.equal(record.status,'pending');
  item[12]=null;
  assert.equal(parse(input([item])).records[0].status,'suspended');
});

test('filing same-company and identical-looking cases are preserved and marked ambiguous', () => {
  const different=[...row]; different[6]=200000000; different[5]='轉換公司債(無擔保)';
  const result=parse(input([row,different,row]));
  assert.equal(result.records.length,3);
  assert.equal(new Set(result.records.map(x=>x.recordRef)).size,3);
  assert.equal(result.records[0].identityAmbiguous,true);
  assert.equal(result.records[1].identityAmbiguous,false);
  assert.equal(result.records[2].identityAmbiguous,true);
  assert.equal(parse(input([different,row])).records[1].matchKey,result.records[0].matchKey);
});

test('filing excludes overseas CB and equity cases without losing domestic cases', () => {
  const overseas=[...row]; overseas[5]='海外轉換公司債'; overseas[7]='美元';
  const stock=[...row]; stock[5]='現金增資';
  const result=parse(input([overseas,row,stock]));
  assert.equal(result.records.length,1);
  assert.equal(result.excludedCount,2);
});

test('filing rejects shifted headers, invalid dates, unit surprises and malformed domestic rows', () => {
  const wrong=input(); wrong.rows[2]=[...headers]; wrong.rows[2][9]='送件日';
  assert.throws(()=>parse(wrong),/header/);
  for (const [index,value] of [[0,'90001'],[6,-1],[6,'3億'],[7,'美元'],[9,'1150230'],[9,'1151001'],[13,'1150901,1150902'],[2,'未認識狀態']]) {
    const item=[...row]; item[index]=value;
    assert.throws(()=>parse(input([item])),undefined,`column ${index}: ${value}`);
  }
  assert.throws(()=>parse(input([], '2026-02-30')),/date/);
});

test('filing candidate matching never treats one possible match as verified or picks a first duplicate', () => {
  const record=parse(input()).records[0];
  assert.equal(typeof filing.reviewCbFilingMatches,'function');
  const bond={bondCode:'90001',issuerCode:'9000',issueAmount:300000000,securedStatus:'有擔保',issueDate:'2026-09-21'};
  const [single]=filing.reviewCbFilingMatches([record],[bond]);
  assert.equal(single.matchStatus,'candidate');
  assert.deepEqual(single.candidateBondCodes,['90001']);
  assert.equal(single.verifiedBondCode,null);
  const [ambiguous]=filing.reviewCbFilingMatches([record],[bond,{...bond,bondCode:'90002'}]);
  assert.equal(ambiguous.matchStatus,'ambiguous');
  assert.equal(ambiguous.verifiedBondCode,null);
  const [old]=filing.reviewCbFilingMatches([record],[{...bond,issueDate:'2025-09-01'}]);
  assert.equal(old.matchStatus,'unmatched');
});

test('filing refuses sparse headers instead of assigning a value under a missing label', () => {
  const value=input(); value.rows[2]=[...headers]; delete value.rows[2][9];
  assert.throws(()=>parse(value),/header/);
});

test('filing refuses completion during suspension and procedural events after closure', () => {
  const item=[...row]; item[11]='1150820'; item[12]='1150901';
  assert.throws(()=>parse(input([item])),/suspend|procedure/);
  const withdrawn=[...row]; withdrawn[2]='自行撤回'; withdrawn[13]=null; withdrawn[15]='1150810'; withdrawn[10]='1150811';
  assert.throws(()=>parse(input([withdrawn])),/closure|terminal/);
});

test('filing refuses a completed effect after withdrawal and unmatched resumption', () => {
  const item=[...row]; item[15]='1150810';
  assert.throws(()=>parse(input([item])),/contradict|terminal/);
  const resumed=[...row]; resumed[12]='1150814';
  assert.throws(()=>parse(input([resumed])),/resum|procedure/);
});
