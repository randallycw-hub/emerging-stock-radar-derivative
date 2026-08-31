import assert from "node:assert/strict";
import test from "node:test";

import {
  buildV56MarketData,
  displayFinancialValue,
} from "../static-showcase/assets/v56-market-data.js";

const manifest = Object.freeze({
  market: { dataDate: "2026-08-28", generatedAt: "2026-08-28T16:30:00+08:00" },
});

const masters = Object.freeze({
  companyMaster: [{
    stockCode: "2303",
    companyName: "聯電",
    market: "上市",
    industry: "半導體業",
    cbCodes: ["23032"],
    cbNames: ["聯電二"],
  }],
  cbMaster: [{
    bondCode: "23032",
    bondName: "聯電二",
    stockCode: "2303",
    companyName: "聯電",
    market: "上市",
  }],
  searchIndex: [{ id: "cb:23032", type: "cb", cbCode: "23032", stockCode: "2303" }],
});

const workbench = Object.freeze({ records: [{
  bondCode: "23032",
  status: "active",
  term: {
    bondCode: "23032",
    bondName: "聯電二",
    issuerCode: "2303",
    issuerName: "聯電",
    currentConversionPrice: null,
    issueDate: "2026-08-20",
    maturityDate: "2031-08-20",
  },
  view: { cbClose: "101.5", currentConversionPrice: null },
  events: [],
}] });

test("V5.6 model preserves missing values and emits a canonical stock-to-CB relation", () => {
  const model = buildV56MarketData({
    manifest,
    masters,
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
    previous: null,
  });

  assert.equal(model.schemaVersion, 3);
  assert.equal(model.dataDate, "2026-08-28");
  assert.equal(model.cbMaster.records[0].currentConversionPrice, null);
  assert.deepEqual(model.securityMaster.records[0].relatedCbCodes, ["23032"]);
  assert.equal(model.searchIndex.records[0].cbCode, "23032");
  assert.equal(displayFinancialValue(null, "undetermined"), "待定");
  assert.equal(displayFinancialValue(null, "no_trade"), "今日無成交");
  assert.equal(displayFinancialValue(0, "numeric"), "0");
});

test("V5.6 model rejects mismatched company and CB identities instead of joining by name", () => {
  assert.throws(() => buildV56MarketData({
    manifest,
    masters: { ...masters, cbMaster: [{ ...masters.cbMaster[0], stockCode: "3313" }] },
    history: [],
    workbench,
    emerging: { records: [] },
    ipo: { records: [] },
    rightsEvents: { events: [] },
    previous: null,
  }), /CB identity/i);
});
