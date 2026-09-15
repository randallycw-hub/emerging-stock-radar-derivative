import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as issuance from '../static-showcase/assets/bond-issuance-page.js';

const date = '2026-09-04';
const row = {
  cbCode:'90001', cbName:'測試一', stockCode:'9000', companyName:'測試', category:'upcoming',
  terms:{issueDate:'2026-09-10', maturityDate:'2029-09-10', issueAmount:500000000, securedStatus:'有擔保', underwriter:'承銷商', trustee:'受託機構'},
  stages:{announcementDate:'2026-06-01', filingDate:'2026-06-10', effectiveDate:'2026-07-01', auctionOrBookbuildingDate:'2026-08-20', pricingDate:'2026-08-28', listingDate:'2026-09-10'},
  sourceUrl:'https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv',
};

test('issuance comparison table gives each confirmed stage a separate column without fictional prices', () => {
  assert.equal(typeof issuance.renderIssuanceTable, 'function');
  const {head,body} = issuance.renderIssuanceTable([row]);
  for (const label of ['公告日','送件日','生效日','詢圈／競拍日','定價日','掛牌日','發行總額','承銷商','受託機構']) assert.ok(head.includes(label), label);
  for (const stamp of Object.values(row.stages)) assert.ok(body.includes(stamp.replaceAll('-','/')));
  assert.doesNotMatch(body, /class="cb-pipeline"|TCRI|CBAS|待確認|來源 ID/);
  assert.match(body, /bonds\.html\?bond=90001/);
  assert.match(body, /5 億/);
});

test('issuance table exact-code joins dated conversion terms and escapes source data', () => {
  assert.equal(typeof issuance.renderIssuanceTable, 'function');
  const records = [{cbCode:'90001', stockCode:'9000', terms:{initialConversionPrice:50,officialDataDate:'2026-09-06'}, quote:{conversionPrice:45, conversionPriceEffectiveDate:'2026-08-28'}}];
  const {body} = issuance.renderIssuanceTable([{...row,cbName:'<img src=x>',sourceUrl:'javascript:alert(1)'}], records);
  assert.match(body, /50 元/);
  assert.match(body, /45 元/);
  assert.match(body, /2026\/08\/28/);
  assert.match(body, /&lt;img src=x&gt;/);
  assert.doesNotMatch(body, /javascript:|<img/);
  assert.match(issuance.renderIssuanceTable([row], records).body, /條款 2026\/09\/06/);
  assert.doesNotMatch(issuance.renderIssuanceTable([row],[{...records[0],stockCode:'9999'}]).body, /45 元/);
  assert.doesNotMatch(issuance.renderIssuanceTable([row],[records[0],records[0],records[0]]).body, /45 元|50 元/);
});

test('issuance scope does not silently truncate eligible cases and includes today as listed', () => {
  const records = Array.from({length:45},(_,i)=>({...row,cbCode:String(90001+i)}));
  assert.equal(issuance.selectV57IssuanceRecords(records,{},date).length,45);
  assert.equal(issuance.selectV57IssuanceRecords([{...row,stages:{listingDate:date}}],{},date)[0].category,'recent_listing');
});

test('issuance summary counts unfiltered scope and empty tables retain column alignment', () => {
  assert.equal(typeof issuance.buildIssuanceSummary, 'function');
  assert.deepEqual(issuance.buildIssuanceSummary([row,{...row,cbCode:'90002',stages:{listingDate:date}}],date),{total:2,in_progress:0,upcoming:1,recent_listing:1});
  const {head,body} = issuance.renderIssuanceTable([]);
  assert.equal(Number(/colspan="(\d+)"/.exec(body)[1]),(head.match(/<th scope="col">/g)||[]).length);
});

test('issuance table resets obsolete ten-column percentage layout', async () => {
  const css = await readFile(new URL('../static-showcase/assets/workspace.css',import.meta.url),'utf8');
  assert.match(css, /\.cb-issuance-page \.public-data-table\s*\{[^}]*table-layout:\s*auto/);
  assert.match(css, /\.cb-issuance-page \.public-data-table th:nth-child\(n\)\s*\{[^}]*width:\s*auto/);
});
