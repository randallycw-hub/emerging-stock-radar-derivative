import assert from "node:assert/strict";
import test from "node:test";

import {
  filterBondRecords,
  normalizeBondQuery,
  paginateBondRecords,
  sortBondRecords,
} from "../static-showcase/assets/bond-list-page.js";

const rows = [
  { bondCode: "10003", cbClose: null, bondName: "缺值" },
  { bondCode: "10002", cbClose: "101.5", bondName: "乙" },
  { bondCode: "10001", cbClose: "101.5", bondName: "甲" },
  { bondCode: "10004", cbClose: "-", bondName: "無效" },
  { bondCode: "10005", cbClose: "99.25", bondName: "丙" },
];

const bondRecords = [
  { bondCode: "90001", bondName: "甲特", issuerName: "台灣發行", cbClose: 101, archived: false },
  { bondCode: "90002", bondName: "乙特", issuerName: "台灣發行", cbClose: 101, archived: false },
  { bondCode: "90003", bondName: "丙特", issuerName: "其他發行", cbClose: null, archived: false },
  { bondCode: "90004", bondName: "舊債", issuerName: "台灣發行", cbClose: 99, archived: true },
];

test("normalizes Unicode, whitespace, and ASCII code case", () => {
  assert.equal(normalizeBondQuery("  a\u0301bc  "), "áBC");
});

test("filters by code, partial bond name, and issuer while excluding archived records by default", () => {
  assert.deepEqual(filterBondRecords(bondRecords, { query: "90001" }).map((row) => row.bondCode), ["90001"]);
  assert.deepEqual(filterBondRecords(bondRecords, { query: "乙" }).map((row) => row.bondCode), ["90002"]);
  assert.deepEqual(filterBondRecords(bondRecords, { query: "台灣發行" }).map((row) => row.bondCode), ["90001", "90002"]);
  assert.deepEqual(filterBondRecords(bondRecords, { query: "台灣發行", archived: true }).map((row) => row.bondCode), ["90001", "90002", "90004"]);
});

test("numeric sorting is reversible, stable, and always leaves missing values last", () => {
  assert.deepEqual(
    sortBondRecords(rows, { key: "cbClose", direction: "desc" })
      .map((row) => row.bondCode),
    ["10002", "10001", "10005", "10003", "10004"],
  );
  assert.deepEqual(
    sortBondRecords(rows, { key: "cbClose", direction: "asc" })
      .map((row) => row.bondCode),
    ["10005", "10002", "10001", "10003", "10004"],
  );
});

test("sorting keeps stable ties without mutating input", () => {
  const input = [
    { bondCode: "10002", bondName: "同名" },
    { bondCode: "10001", bondName: "同名" },
  ];
  const result = sortBondRecords(input, { key: "bondName", direction: "asc" });
  assert.deepEqual(result.map((row) => row.bondCode), ["10002", "10001"]);
  assert.deepEqual(input.map((row) => row.bondCode), ["10002", "10001"]);
});

test("paginates in fixed groups of fifty and clamps out-of-range pages", () => {
  const records = Array.from({ length: 51 }, (_, index) => ({ bondCode: String(index + 1) }));
  const result = paginateBondRecords(records, 9);
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.records.length, 1);
});
