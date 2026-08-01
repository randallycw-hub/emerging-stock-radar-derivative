import assert from "node:assert/strict";
import test from "node:test";

import { sortRows } from "../static-showcase/assets/table-sort.js";

const rows = [
  { bondCode: "10003", cbClose: null, bondName: "缺值" },
  { bondCode: "10002", cbClose: "101.5", bondName: "乙" },
  { bondCode: "10001", cbClose: "101.5", bondName: "甲" },
  { bondCode: "10004", cbClose: "-", bondName: "無效" },
  { bondCode: "10005", cbClose: "99.25", bondName: "丙" },
];

test("numeric sorting is reversible, stable, and always leaves missing values last", () => {
  assert.deepEqual(
    sortRows(rows, { key: "cbClose", direction: "desc", type: "number" })
      .map((row) => row.bondCode),
    ["10001", "10002", "10005", "10003", "10004"],
  );
  assert.deepEqual(
    sortRows(rows, { key: "cbClose", direction: "asc", type: "number" })
      .map((row) => row.bondCode),
    ["10005", "10001", "10002", "10003", "10004"],
  );
});

test("text sorting uses bond code as the stable tie breaker without mutating input", () => {
  const input = [
    { bondCode: "10002", bondName: "同名" },
    { bondCode: "10001", bondName: "同名" },
  ];
  const result = sortRows(input, {
    key: "bondName",
    direction: "asc",
    type: "text",
  });
  assert.deepEqual(result.map((row) => row.bondCode), ["10001", "10002"]);
  assert.deepEqual(input.map((row) => row.bondCode), ["10002", "10001"]);
});
