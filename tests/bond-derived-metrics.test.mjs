import assert from "node:assert/strict";
import test from "node:test";

import { deriveBondRemainingMetrics } from "../lib/market-data/bond-derived-metrics.ts";

function fixture(overrides = {}) {
  return {
    issueAmount: "150000000",
    outstandingAmount: "123100000",
    outstandingDataDate: "2026-08-07",
    faceValueTwd: "100000",
    cbTradeUnits: "2462",
    cbTradeDate: "2026-08-07",
    ...overrides,
  };
}

test("derives exact remaining units, remaining ratio and daily turnover", () => {
  assert.deepEqual(deriveBondRemainingMetrics(fixture()), {
    remainingUnits: "1231",
    remainingRatio: "82.07",
    dailyTurnoverRate: "200",
    missingReasons: [],
  });
});

test("uses BigInt arithmetic beyond the safe integer range", () => {
  assert.deepEqual(deriveBondRemainingMetrics(fixture({
    issueAmount: "100000000000000000000000",
    outstandingAmount: "75000000000000000000000",
    faceValueTwd: "100000",
    cbTradeUnits: "187500000000000000",
  })), {
    remainingUnits: "750000000000000000",
    remainingRatio: "75",
    dailyTurnoverRate: "25",
    missingReasons: [],
  });
});

test("never rounds a non-divisible balance into remaining units", () => {
  const result = deriveBondRemainingMetrics(fixture({
    outstandingAmount: "123100001",
    cbTradeUnits: "1",
  }));

  assert.equal(result.remainingUnits, null);
  assert.equal(result.remainingRatio, "82.07");
  assert.equal(result.dailyTurnoverRate, null);
  assert.deepEqual(result.missingReasons, ["OUTSTANDING_NOT_DIVISIBLE"]);
});

test("does not compute turnover across different data dates", () => {
  const result = deriveBondRemainingMetrics(fixture({
    outstandingDataDate: "2026-08-06",
    cbTradeUnits: "10",
  }));

  assert.equal(result.remainingUnits, "1231");
  assert.equal(result.dailyTurnoverRate, null);
  assert.deepEqual(result.missingReasons, ["BALANCE_TRADE_DATE_MISMATCH"]);
});

test("reports a missing verified face value without hiding a valid ratio", () => {
  const result = deriveBondRemainingMetrics(fixture({ faceValueTwd: null }));

  assert.equal(result.remainingUnits, null);
  assert.equal(result.remainingRatio, "82.07");
  assert.equal(result.dailyTurnoverRate, null);
  assert.deepEqual(result.missingReasons, ["NO_VERIFIED_FACE_VALUE"]);
});

test("rejects non-positive or non-canonical face values as contract violations", async (context) => {
  for (const faceValueTwd of ["0", "00", "01", "-1", "+1", "1.0", ""]) {
    await context.test(JSON.stringify(faceValueTwd), () => {
      assert.throws(
        () => deriveBondRemainingMetrics(fixture({ faceValueTwd })),
        TypeError,
      );
    });
  }
});

test("reports absent or non-integer outstanding amounts without guessing units", async (context) => {
  for (const outstandingAmount of [null, "", "01", "1.0", "-1", "+1"] ) {
    await context.test(String(outstandingAmount), () => {
      const result = deriveBondRemainingMetrics(fixture({ outstandingAmount }));
      assert.equal(result.remainingUnits, null);
      assert.equal(result.remainingRatio, null);
      assert.equal(result.dailyTurnoverRate, null);
      assert.deepEqual(result.missingReasons, ["OUTSTANDING_NOT_INTEGER"]);
    });
  }
});

test("rejects non-string amount values that violate the input contract", async (context) => {
  for (const patch of [
    { outstandingAmount: undefined },
    { outstandingAmount: 123100000 },
    { issueAmount: undefined },
    { issueAmount: 150000000 },
  ]) {
    await context.test(JSON.stringify(patch), () => {
      assert.throws(() => deriveBondRemainingMetrics(fixture(patch)), TypeError);
    });
  }
});

test("reports an invalid issue amount while preserving independently derivable metrics", async (context) => {
  for (const issueAmount of [null, "", "0", "01", "1.5", "-1", "+1"]) {
    await context.test(String(issueAmount), () => {
      const input = fixture({
        issueAmount,
        outstandingAmount: "0",
        cbTradeUnits: "0",
      });
      const result = deriveBondRemainingMetrics(input);
      assert.equal(result.remainingUnits, "0");
      assert.equal(result.remainingRatio, null);
      assert.equal(result.dailyTurnoverRate, null);
      assert.deepEqual(result.missingReasons, [
        "INVALID_ISSUE_AMOUNT",
        "ZERO_REMAINING_UNITS",
      ]);
    });
  }
});

test("rejects an outstanding balance greater than a valid issue amount", () => {
  assert.throws(
    () => deriveBondRemainingMetrics(fixture({
      issueAmount: "123099999",
      outstandingAmount: "123100000",
    })),
    TypeError,
  );
});

test("returns zero units and ratio without dividing turnover by zero", () => {
  assert.deepEqual(deriveBondRemainingMetrics(fixture({
    outstandingAmount: "0",
    cbTradeUnits: "0",
  })), {
    remainingUnits: "0",
    remainingRatio: "0",
    dailyTurnoverRate: null,
    missingReasons: ["ZERO_REMAINING_UNITS"],
  });
});

test("accepts zero trade units but rejects every non-canonical trade-unit value", async (context) => {
  assert.equal(
    deriveBondRemainingMetrics(fixture({ cbTradeUnits: "0" })).dailyTurnoverRate,
    "0",
  );

  for (const cbTradeUnits of ["", "01", "1.0", "-1", "+1"] ) {
    await context.test(JSON.stringify(cbTradeUnits), () => {
      assert.throws(
        () => deriveBondRemainingMetrics(fixture({ cbTradeUnits })),
        TypeError,
      );
    });
  }
});

test("treats missing balance or trade dates as unable to prove a same-date turnover", async (context) => {
  for (const dates of [
    { outstandingDataDate: null, cbTradeDate: "2026-08-07" },
    { outstandingDataDate: "2026-08-07", cbTradeDate: null },
    { outstandingDataDate: null, cbTradeDate: null },
  ]) {
    await context.test(JSON.stringify(dates), () => {
      const result = deriveBondRemainingMetrics(fixture(dates));
      assert.equal(result.dailyTurnoverRate, null);
      assert.deepEqual(result.missingReasons, ["BALANCE_TRADE_DATE_MISMATCH"]);
    });
  }
});

test("rejects malformed non-null data dates", async (context) => {
  for (const patch of [
    { outstandingDataDate: "2026-02-30" },
    { cbTradeDate: "20260807" },
  ]) {
    await context.test(JSON.stringify(patch), () => {
      assert.throws(() => deriveBondRemainingMetrics(fixture(patch)), TypeError);
    });
  }
});

test("keeps missing reasons in deterministic contract order", () => {
  const result = deriveBondRemainingMetrics(fixture({
    issueAmount: null,
    outstandingAmount: "1.0",
    outstandingDataDate: null,
    faceValueTwd: null,
    cbTradeDate: null,
  }));

  assert.deepEqual(result.missingReasons, [
    "NO_VERIFIED_FACE_VALUE",
    "OUTSTANDING_NOT_INTEGER",
    "INVALID_ISSUE_AMOUNT",
    "BALANCE_TRADE_DATE_MISMATCH",
  ]);
});

test("returns a deeply frozen defensive result without retaining mutable input", () => {
  const input = fixture();
  const result = deriveBondRemainingMetrics(input);
  input.outstandingAmount = "0";

  assert.equal(result.remainingUnits, "1231");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.missingReasons), true);
  assert.throws(() => result.missingReasons.push("INVALID_ISSUE_AMOUNT"), TypeError);
  assert.throws(() => { result.remainingUnits = "0"; }, TypeError);
  assert.deepEqual(deriveBondRemainingMetrics(fixture()), result);
  assert.notStrictEqual(deriveBondRemainingMetrics(fixture()), result);
});
