import assert from 'node:assert/strict';
import test from 'node:test';
import {applyCanonicalIpoIdentity,indexCanonicalCompanies} from '../static-showcase/assets/canonical-identity.js';
import {auctionStatus} from '../static-showcase/assets/ipo-page.js';
test('IPO destination market is retained when issuer currently trades on emerging board',()=>{
  const companies=indexCanonicalCompanies([{stockCode:'2938',companyName:'床的世界',market:'興櫃'}]);
  assert.equal(applyCanonicalIpoIdentity({companyCode:'2938',market:'上櫃'},companies).market,'上櫃');
  assert.equal(applyCanonicalIpoIdentity({companyCode:'2938'},companies).market,'—');
});
test('announced auction date is not proof that an auction has completed',()=>{
  const label=auctionStatus({auctionVerified:true,auction:{auctionOpenDate:'2026-09-07'}});
  assert.match(label,/開標日/);
  assert.doesNotMatch(label,/已開標/);
});
