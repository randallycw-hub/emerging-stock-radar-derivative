import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCanonicalBondIdentity,
  applyCanonicalCompanyIdentity,
  indexCanonicalBonds,
  indexCanonicalCompanies,
} from "../static-showcase/assets/canonical-identity.js";

const companyMaster = [{
  stockCode: "3313",
  companyName: "斐成",
  market: "上櫃",
  industry: "電子零組件業",
  dataDate: "2026-08-28",
}];
const cbMaster = [{
  bondCode: "33131",
  bondName: "斐成一",
  stockCode: "3313",
  companyName: "斐成",
  market: "上櫃",
  dataDate: "2026-08-28",
}];

test("V5.2 downstream display identity only comes from the canonical company master", () => {
  const companies = indexCanonicalCompanies(companyMaster);
  assert.deepEqual(applyCanonicalCompanyIdentity({
    companyCode: "3313",
    companyName: "斐成-KY",
    market: "興櫃",
  }, companies), {
    companyCode: "3313",
    companyName: "斐成",
    market: "上櫃",
    industryName: "電子零組件業",
    companyDataDate: "2026-08-28",
  });
  assert.equal(applyCanonicalCompanyIdentity({ companyCode: "3314", companyName: "斐成" }, companies), null);
});

test("V5.2 CB display identity is joined only by its exact CB code", () => {
  const bonds = indexCanonicalBonds(cbMaster);
  assert.deepEqual(applyCanonicalBondIdentity({
    bondCode: "33131",
    bondName: "斐成特",
    issuerCode: "9999",
    issuerName: "錯誤公司",
  }, bonds), {
    bondCode: "33131",
    bondName: "斐成一",
    issuerCode: "3313",
    issuerName: "斐成",
    market: "上櫃",
    bondDataDate: "2026-08-28",
  });
  assert.equal(applyCanonicalBondIdentity({ bondCode: "33132", issuerName: "斐成" }, bonds), null);
});
