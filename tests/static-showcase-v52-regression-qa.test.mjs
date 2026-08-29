import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { applyCanonicalBondIdentity, applyCanonicalCompanyIdentity, indexCanonicalBonds, indexCanonicalCompanies } from "../static-showcase/assets/canonical-identity.js";
import { buildCompanyOverview } from "../static-showcase/assets/company-overview.js";
import { searchCanonicalIndex } from "../static-showcase/assets/site-search.js";
import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const source = fileURLToPath(new URL("../static-showcase", import.meta.url));

function takeDistinct(values, predicates, count) {
  const selected = [];
  const add = (value) => {
    if (!selected.includes(value)) selected.push(value);
  };
  for (const predicate of predicates) {
    const value = values.find(predicate);
    if (value) add(value);
  }
  for (const value of values) {
    if (selected.length >= count) break;
    add(value);
  }
  return selected.slice(0, count);
}

test("V5.2 QA samples 20 companies, 20 CBs, and 10 missing identities from one staged canonical snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "v52-regression-qa-"));
  const destination = join(root, "market-site");
  try {
    await stageStaticShowcase({ source, destination });
    const pointer = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
    const base = join(destination, "data", ...pointer.generation.split("/"));
    const runtime = JSON.parse(await readFile(join(base, "runtime.json"), "utf8"));
    const [companyMaster, cbMaster, searchIndex, workbench] = await Promise.all([
      readFile(join(base, "company-master.json"), "utf8").then(JSON.parse),
      readFile(join(base, "cb-master.json"), "utf8").then(JSON.parse),
      readFile(join(base, "search-index.json"), "utf8").then(JSON.parse),
      readFile(join(destination, runtime.datasets.bondWorkbench.replace(/^\.\//, "")), "utf8").then(JSON.parse),
    ]);
    const companies = indexCanonicalCompanies(companyMaster);
    const bonds = indexCanonicalBonds(cbMaster);
    const companySamples = takeDistinct(companyMaster.records, [
      (entry) => entry.market === "上市",
      (entry) => entry.market === "上櫃",
      (entry) => entry.market === "興櫃",
      (entry) => entry.cbCodes.length > 0,
      (entry) => entry.cbCodes.length === 0,
      (entry) => entry.ipoStage !== null,
    ], 20);
    const bondSamples = cbMaster.records.slice(0, 20);

    assert.equal(companySamples.length, 20);
    assert.equal(bondSamples.length, 20);
    for (const company of companySamples) {
      const found = searchCanonicalIndex(` ${company.stockCode} `, searchIndex)
        .find((entry) => entry.type === "company" && entry.stockCode === company.stockCode);
      assert.deepEqual(found && {
        stockCode: found.stockCode,
        companyName: found.companyName,
        market: found.market,
      }, {
        stockCode: company.stockCode,
        companyName: company.companyName,
        market: company.market,
      });
      assert.equal(applyCanonicalCompanyIdentity({ companyCode: company.stockCode }, companies)?.companyName, company.companyName);
    }
    for (const bond of bondSamples) {
      const found = searchCanonicalIndex(bond.bondCode, searchIndex)[0];
      assert.equal(found?.type, "cb");
      assert.equal(found?.cbCode, bond.bondCode);
      assert.equal(found?.stockCode, bond.stockCode);
      assert.deepEqual(applyCanonicalBondIdentity({ bondCode: bond.bondCode }, bonds), {
        bondCode: bond.bondCode,
        bondName: bond.bondName,
        issuerCode: bond.stockCode,
        issuerName: bond.companyName,
        market: bond.market,
        bondDataDate: bond.dataDate,
      });
      assert.equal(companyMaster.records.find((company) => company.stockCode === bond.stockCode)?.cbCodes.includes(bond.bondCode), true);
      assert.equal(workbench.records.some((record) => record.bondCode === bond.bondCode
        && record.term?.issuerCode === bond.stockCode), true);
    }
    const missingCodes = Array.from({ length: 10 }, (_, index) => `000${index}`)
      .filter((code) => !companies.has(code));
    assert.equal(missingCodes.length, 10);
    for (const code of missingCodes) {
      assert.equal(applyCanonicalCompanyIdentity({ companyCode: code }, companies), null);
      assert.deepEqual(searchCanonicalIndex(code, searchIndex), []);
      assert.equal(buildCompanyOverview({ code, companyMaster: companyMaster.records }), null);
    }
    assert.equal(companyMaster.meta.dataDate, cbMaster.meta.dataDate);
    assert.equal(companyMaster.meta.dataDate, searchIndex.meta.dataDate);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
