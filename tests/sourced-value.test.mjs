import assert from "node:assert/strict";
import test from "node:test";

import {
  createSourcedValue,
  toPublicProvenance,
} from "../lib/domain/sourced-value.ts";

const source = {
  providerName: "櫃買中心",
  datasetName: "可轉債每日成交資訊",
  officialUrl: "https://www.tpex.org.tw/zh-tw/bond/trade/cb.html",
};

test("creates an immutable sourced value with concise public provenance", () => {
  const value = createSourcedValue({
    value: "101.25",
    asOfDate: "2026-08-24",
    source,
    fetchedAt: "2026-08-24T17:45:00+08:00",
    status: "ok",
  });

  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.source), true);
  assert.deepEqual(toPublicProvenance(value), {
    label: "櫃買中心｜可轉債每日成交資訊",
    asOfDate: "2026-08-24",
    fetchedAt: "2026-08-24T17:45:00+08:00",
    sourceUrl: "https://www.tpex.org.tw/zh-tw/bond/trade/cb.html",
  });
});

test("rejects values that claim to be missing or conflicting", () => {
  for (const status of ["missing", "conflict"]) {
    assert.throws(() => createSourcedValue({
      value: "101.25",
      asOfDate: "2026-08-24",
      source,
      fetchedAt: "2026-08-24T17:45:00+08:00",
      status,
    }), /cannot contain a value/i);
  }
});

test("rejects missing source dates and future as-of dates for published values", () => {
  assert.throws(() => createSourcedValue({
    value: "101.25",
    asOfDate: null,
    source,
    fetchedAt: "2026-08-24T17:45:00+08:00",
    status: "ok",
  }), /asOfDate/i);

  assert.throws(() => createSourcedValue({
    value: "101.25",
    asOfDate: "2026-08-25",
    source,
    fetchedAt: "2026-08-24T17:45:00+08:00",
    status: "ok",
  }), /cannot be later/i);
});

test("keeps missing values free of source details", () => {
  const value = createSourcedValue({
    value: null,
    asOfDate: null,
    source: null,
    fetchedAt: null,
    status: "missing",
  });

  assert.equal(toPublicProvenance(value), null);
});
