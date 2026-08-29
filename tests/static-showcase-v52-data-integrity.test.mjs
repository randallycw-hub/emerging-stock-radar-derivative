import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHomeSummary,
  publishedMarketDates,
} from "../static-showcase/assets/home-page.js";
import { countPublishedPositive, sumPublishedValues } from "../static-showcase/assets/public-data-state.js";

test("V5.2 never turns an unpublished turnover value into a public zero", () => {
  const missing = buildHomeSummary({
    emerging: {
      records: [{
        companyCode: "1234",
        transactionVolume: null,
        estimatedTransactionAmount: null,
      }],
    },
    ipo: { records: [] },
    bonds: { records: [] },
    asOfDate: "2026-08-28",
  });
  const verifiedZero = buildHomeSummary({
    emerging: {
      records: [{
        companyCode: "5678",
        transactionVolume: "0",
        estimatedTransactionAmount: "0",
      }],
    },
    ipo: { records: [] },
    bonds: { records: [] },
    asOfDate: "2026-08-28",
  });

  assert.equal(missing.emerging.totalTurnover, null);
  assert.equal(missing.emerging.tradedCount, null);
  assert.equal(verifiedZero.emerging.totalTurnover, 0);
  assert.equal(verifiedZero.emerging.tradedCount, 0);
});

test("V5.2 keeps the public data date separate from snapshot generation time", () => {
  assert.deepEqual(publishedMarketDates({
    generatedAt: "2026-08-28T10:00:00Z",
    market: { generatedAt: "2026-08-28T09:55:00Z" },
  }), {
    dataDate: null,
    updatedAt: "2026-08-28T09:55:00Z",
  });
  assert.deepEqual(publishedMarketDates({
    generatedAt: "2026-08-28T10:00:00Z",
    market: {
      dataDate: "2026-08-27",
      generatedAt: "2026-08-28T09:55:00Z",
    },
  }), {
    dataDate: "2026-08-27",
    updatedAt: "2026-08-28T09:55:00Z",
  });
});

test("V5.2 aggregate helpers distinguish real zero, unpublished values, and actual trades", () => {
  assert.equal(sumPublishedValues([{ value: "0" }, { value: "5" }], (row) => row.value), 5);
  assert.equal(sumPublishedValues([{ value: "5" }, { value: null }], (row) => row.value), null);
  assert.equal(countPublishedPositive([{ value: "0" }, { value: "5" }], (row) => row.value), 1);
  assert.equal(countPublishedPositive([{ value: "0" }, { value: undefined }], (row) => row.value), null);
});
