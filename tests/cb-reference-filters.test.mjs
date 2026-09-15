import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { filterV53CbRecords, readCbFilterState, renderCbDatabaseTable } from '../static-showcase/assets/bond-filter-page.js';
import { cbDatabaseReturnUrl } from '../static-showcase/assets/cb-detail-v53.js';

const a = {status:'active', cbCode:'90001', stockCode:'9000', cbName:'測試一', companyName:'測試',
  quote:{cbClose:106, dataDate:'2026-09-04', conversionPrice:30, conversionPriceEffectiveDate:'2026-09-01', stockClose:39, stockPriceDate:'2026-09-04', stockConversionValue:130, stockConversionValueDate:'2026-09-04', premiumRate:-2, valuationDate:'2026-09-04'},
  terms:{outstandingAmount:80000000, remainingRatio:80, securedStatus:'有擔保', issueDate:'2026-09-01', maturityDate:'2027-09-04', underwriter:'測試承銷'}};
const b = {...a, cbCode:'90002', terms:{...a.terms, securedStatus:'無擔保'}};

test('combined inclusive numeric and exact secured filters select the intended issue', () => {
  assert.deepEqual(filterV53CbRecords([a,b], {dataDate:'2026-09-04', secured:'secured', ranges:{priceMax:'106', conversionPriceMax:'30', conversionValueMin:'130', remainingMin:'80', maturityDaysMin:'365', maturityDaysMax:'365'}}).map(r=>r.cbCode), ['90001']);
  assert.deepEqual(filterV53CbRecords([a,b,{...a,cbCode:'90003',terms:{...a.terms,securedStatus:'未註明'}}], {secured:'unsecured'}).map(r=>r.cbCode), ['90002']);
});

test('selected ranges exclude only missing fields while empty and invalid bounds do not filter', () => {
  const missing = {...a,cbCode:'90003',quote:{...a.quote,conversionPrice:null}};
  assert.deepEqual(filterV53CbRecords([a,missing], {ranges:{conversionPriceMin:'30'}}).map(r=>r.cbCode), ['90001']);
  assert.equal(filterV53CbRecords([a,missing], {ranges:{}}).length, 2);
  assert.equal(filterV53CbRecords([a,missing], {ranges:{conversionPriceMin:'bad'}}).length, 2);
});

test('premium zero and negative ranges work and reversed valid ranges match no rows', () => {
  const zero = {...a,cbCode:'90003',quote:{...a.quote,premiumRate:0}};
  assert.deepEqual(filterV53CbRecords([a,zero], {ranges:{premiumMin:'-2',premiumMax:'0'}}).map(r=>r.cbCode), ['90001','90003']);
  assert.equal(filterV53CbRecords([a], {ranges:{premiumMin:'0',premiumMax:'-2'}}).length, 0);
});

test('strict inclusive calendar filters ignore invalid dates and require valid snapshot for maturity days', () => {
  assert.deepEqual(filterV53CbRecords([a], {ranges:{issueFrom:'2026-09-01',issueTo:'2026-09-01',maturityFrom:'2027-09-04',maturityTo:'2027-09-04'}}).map(r=>r.cbCode), ['90001']);
  assert.equal(filterV53CbRecords([a], {ranges:{issueFrom:'2026-02-30'}}).length, 1);
  assert.equal(filterV53CbRecords([a], {dataDate:'bad',ranges:{maturityDaysMin:'1'}}).length, 0);
  assert.equal(filterV53CbRecords([a], {dataDate:'2026-09-04',ranges:{maturityDaysMin:'365'}}).length, 1);
});

test('URL state restores only validated new conditions and detail return keeps them safely', () => {
  const search = '?view=overview&secured=secured&premiumMin=-2&remainingMax=80&conversionPriceMin=30&conversionValueMax=130&stockPriceMin=39&maturityDaysMax=365&issueFrom=2026-09-01&maturityTo=2027-09-04';
  const state = readCbFilterState(search);
  assert.equal(state.view, 'overview');
  assert.equal(state.secured, 'secured');
  assert.equal(state.premiumMin, '-2');
  assert.equal(cbDatabaseReturnUrl(`?from=database&list=${encodeURIComponent(search.slice(1))}`), `./bonds-filter.html${search}`);
  const invalid = readCbFilterState('?secured=other&remainingMax=101&priceMin=-1&issueFrom=2026-02-30&maturityDaysMax=-1');
  assert.equal(invalid.secured, 'all');
  assert.equal(invalid.remainingMax, undefined);
  assert.equal(invalid.priceMin, undefined);
  assert.equal(invalid.issueFrom, undefined);
  assert.equal(invalid.maturityDaysMax, undefined);
});

test('overview renders thirteen aligned cells, dated values, terms and escaped identity', () => {
  const {head,body}=renderCbDatabaseTable([{...a,cbName:'<測試>'}], {view:'overview',filterSearch:'?view=overview&secured=secured'});
  assert.equal((head.match(/<th/g)??[]).length,13);
  assert.equal((body.match(/<td/g)??[]).length,13);
  assert.match(body,/106<time datetime="2026-09-04">2026\/09\/04/);
  assert.match(body,/2026\/09\/01/);
  assert.match(body,/2027\/09\/04/);
  assert.match(body,/80%/);
  assert.match(body,/&lt;測試&gt;/);
  assert.doesNotMatch(body,/<測試>/);
});

test('malformed numeric URL notation never silently becomes a filtering threshold', () => {
  const state = readCbFilterState('?priceMin=0xFF&conversionPriceMax=Infinity&premiumMin=-2.5&priceMax=1.2e2');
  assert.equal(state.priceMin, undefined);
  assert.equal(state.conversionPriceMax, undefined);
  assert.equal(state.premiumMin, '-2.5');
  assert.equal(state.priceMax, '120');
  assert.equal(filterV53CbRecords([a], {ranges:{priceMin:'0xFF'}}).length, 1);
  assert.equal(cbDatabaseReturnUrl('?from=database&list=priceMin%3D0xFF'), './bonds-filter.html');
});

test('numeric state uses canonical HTML-compatible values through detail return and form restore', () => {
  const search = 'conversionPriceMin=%2B30&stockPriceMax=39.&premiumMin=-0';
  const state = readCbFilterState(`?${search}`);
  assert.equal(state.conversionPriceMin, '30');
  assert.equal(state.stockPriceMax, '39');
  assert.equal(state.premiumMin, '0');
  const back = cbDatabaseReturnUrl(`?from=database&list=${encodeURIComponent(search)}`);
  assert.equal(back, './bonds-filter.html?premiumMin=0&conversionPriceMin=30&stockPriceMax=39');
  assert.deepEqual(readCbFilterState(back.slice(back.indexOf('?'))), state);
});

test('static publishing allowlist includes the shared filter module imported by both CB pages', async () => {
  const staging = await readFile(new URL('../scripts/stage-static-showcase.mjs', import.meta.url), 'utf8');
  const allowlist = staging.match(/const ASSET_FILES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
  assert.ok(allowlist.includes('"cb-filter-state.js"'), 'shared module must be packaged with its consumers');
});
