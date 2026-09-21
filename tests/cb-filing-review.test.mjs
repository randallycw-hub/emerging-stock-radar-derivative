import assert from 'node:assert/strict';
import test from 'node:test';
import * as review from '../research/cb-sources/build-cb-filing-review.mjs';

const base={recordRef:'sfb:one',matchKey:'same',identityAmbiguous:false,sourceDate:'2026-09-15',issuerCode:'9000',issueAmount:300000000,securedStatus:'有擔保',receivedDate:'2026-08-07',effectiveDate:'2026-08-25',terminalDate:null,status:'effective'};
const filings={sourceDate:'2026-09-15',records:[base,{...base,recordRef:'sfb:two',terminalDate:'2026-09-01',status:'withdrawn'}],provenance:{sha256:'a'.repeat(64)}};
const canonical={dataDate:'2026-09-08',records:[{cbCode:'90001',stockCode:'9000',terms:{issueAmount:300000000,securedStatus:'有擔保',issueDate:'2026-09-21'}}]};

test('filing review remains internal and dates a candidate match without altering canonical data',()=>{
  assert.equal(typeof review.buildCbFilingReview,'function');
  const before=JSON.stringify(canonical);
  const result=review.buildCbFilingReview({filings,canonical});
  assert.equal(result.purpose,'internal_candidate_review');
  assert.equal(result.publishable,false);
  assert.equal(result.sourceDate,'2026-09-15');
  assert.equal(result.canonicalDataDate,'2026-09-08');
  assert.deepEqual(result.summary,{total:2,effective:1,pending:0,suspended:0,withdrawn:1,rejected:0,revoked:0});
  assert.equal(result.records[0].match.verifiedBondCode,null);
  assert.equal(result.records[1].match.matchStatus,'terminated');
  assert.equal(JSON.stringify(canonical),before);
});

test('filing review exposes two distinct cases competing for the same bond code',()=>{
  assert.equal(typeof review.buildCbFilingReview,'function');
  const result=review.buildCbFilingReview({filings:{...filings,records:[base,{...base,recordRef:'sfb:other',receivedDate:'2026-08-08'}]},canonical});
  assert.deepEqual(result.records.map(x=>x.match.matchStatus),['ambiguous','ambiguous']);
  assert.deepEqual(result.records[0].match.competingCaseRefs,['sfb:other']);
});

test('filing review rejects a missing canonical date instead of labelling it current',()=>{
  assert.equal(typeof review.buildCbFilingReview,'function');
  assert.throws(()=>review.buildCbFilingReview({filings,canonical:{records:canonical.records}}),/date/);
});
