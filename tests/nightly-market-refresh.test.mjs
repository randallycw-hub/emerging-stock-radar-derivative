import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { applyBondMarketHistoryCorrection } from "../scripts/backfill-bond-market-history.mjs";
import {
  nightlyRefreshTimestamp,
  parseNightlyMarketRefreshArgs,
  runIsolatedNightlyMarketRefreshTestHarness,
} from "../scripts/run-nightly-market-refresh.mjs";

function historyPoint(patch = {}) {
  return {
    bondCode: "35221",
    date: "2026-07-29",
    cbOpen: "103.5",
    cbHigh: "103.5",
    cbLow: "103.5",
    cbClose: "103.5",
    cbAverage: "103.5",
    cbChange: "1.5",
    cbTradingUnits: "10",
    cbTurnover: "1035000",
    stockClose: "11.65",
    effectiveConversionPrice: "18.2",
    conversionValue: "64.01",
    premiumRate: "61.69",
    ...patch,
  };
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function pointHash(point) {
  return sha256(JSON.stringify(point));
}

function correctionManifest(before, after, patch = {}) {
  const core = {
    bondCode: before.bondCode,
    date: before.date,
    sourceId: "tpex-cb-day-query",
    retrievedAt: "2026-08-20T14:30:00.000Z",
    beforeHash: pointHash(before),
    afterHash: pointHash(after),
    ...patch,
  };
  return {
    bondCode: core.bondCode,
    date: core.date,
    sourceId: core.sourceId,
    retrievedAt: core.retrievedAt,
    sha256: sha256(JSON.stringify([
      core.bondCode,
      core.date,
      core.sourceId,
      core.retrievedAt,
      core.beforeHash,
      core.afterHash,
    ])),
    beforeHash: core.beforeHash,
    afterHash: core.afterHash,
  };
}

test("nightly CLI accepts only an exact data date and maps it to 22:30 Asia/Taipei", () => {
  assert.deepEqual(
    parseNightlyMarketRefreshArgs(["--date", "2026-07-30"]),
    { date: "2026-07-30" },
  );
  assert.equal(
    nightlyRefreshTimestamp("2026-07-30").toISOString(),
    "2026-07-30T14:30:00.000Z",
  );
  for (const args of [
    [],
    ["--date"],
    ["--date", "2026-7-30"],
    ["--date", "2026-07-30", "--force"],
    ["--correction", "evidence.json", "--date", "2026-07-30"],
  ]) {
    assert.throws(
      () => parseNightlyMarketRefreshArgs(args),
      /usage:.*--date YYYY-MM-DD/i,
    );
  }
});

test("nightly full roster adds, updates, archives, and keeps a zero-trade bond active", async () => {
  const outcome = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-30",
    scenario: "success",
  });

  assert.equal(outcome.status, "fulfilled");
  assert.equal(outcome.scheduledAt, "2026-07-30T14:30:00.000Z");
  assert.deepEqual(outcome.deploymentEffects, []);
  assert.deepEqual(outcome.decisions, {
    added: ["11011"],
    updated: ["35221"],
    archived: ["99999"],
  });
  const records = JSON.parse(
    outcome.artifacts.active["bond-workbench.json"],
  ).records;
  const noTrade = records.find((record) => record.bondCode === "11011");
  assert.equal(noTrade.status, "active");
  assert.equal(noTrade.view.cbTradeUnits, "0");
  assert.equal(noTrade.view.cbClose, null);
  assert.equal(noTrade.fieldStates.price, "missing");
});

test("nightly required-source failure preserves pointer, workbench, and history byte-for-byte", async () => {
  const outcome = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-30",
    scenario: "required-failure",
  });

  assert.equal(outcome.status, "rejected");
  assert.match(outcome.error.message, /11406.*HTTP_503/);
  assert.equal(outcome.artifacts.after.pointerText, outcome.artifacts.before.pointerText);
  assert.equal(
    outcome.artifacts.after.priorWorkbenchText,
    outcome.artifacts.before.priorWorkbenchText,
  );
  assert.equal(typeof outcome.artifacts.before.priorHistoryText, "string");
  assert.equal(
    outcome.artifacts.after.priorHistoryText,
    outcome.artifacts.before.priorHistoryText,
  );
  assert.equal(outcome.artifacts.after.cacheText, outcome.artifacts.before.cacheText);
});

test("wrong candidate date rolls back and optional failures retain only their own stale snapshots", async () => {
  const wrongDate = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-29",
    scenario: "success",
  });
  assert.equal(wrongDate.status, "rejected");
  assert.match(wrongDate.error.message, /DATA_DATE_MISMATCH/i);
  assert.equal(
    wrongDate.artifacts.after.pointerText,
    wrongDate.artifacts.before.pointerText,
  );

  const stale = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-30",
    scenario: "optional-stale",
  });
  assert.equal(stale.status, "fulfilled");
  const research = JSON.parse(
    stale.artifacts.active["cb-issuer-research.json"],
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(research.sources).map(
      ([market, state]) => [market, state.status],
    )),
    { listed: "stale", otc: "unavailable" },
  );
  const supplemental = JSON.parse(
    stale.artifacts.active["bond-supplemental.json"],
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(supplemental.sources).map(
      ([source, state]) => [source, state.state],
    )),
    { institution: "stale", redemption: "stale", underwriting: "stale" },
  );
  assert.deepEqual(stale.deploymentEffects, []);
});

test("history correction requires exact official evidence and traces prior and new generations", () => {
  const before = historyPoint();
  const unchanged = historyPoint({
    bondCode: "11011",
    date: "2026-07-28",
    cbOpen: null,
    cbHigh: null,
    cbLow: null,
    cbClose: null,
    cbAverage: null,
    cbChange: null,
    cbTradingUnits: "0",
    cbTurnover: "0",
    stockClose: null,
    effectiveConversionPrice: null,
    conversionValue: null,
    premiumRate: null,
  });
  const after = historyPoint({
    cbOpen: "104",
    cbHigh: "104",
    cbLow: "104",
    cbClose: "104",
    cbAverage: "104",
    cbChange: "2",
    cbTurnover: "1040000",
    conversionValue: "64.01",
    premiumRate: "62.47",
  });
  const previous = [unchanged, before];
  const candidate = [unchanged, after];
  const manifest = correctionManifest(before, after);

  const result = applyBondMarketHistoryCorrection({
    previous,
    candidate,
    correction: manifest,
  });
  assert.deepEqual(result.history, candidate);
  assert.deepEqual(result.trace.correction, manifest);
  assert.equal(result.trace.previousGeneration, sha256(JSON.stringify(previous)));
  assert.equal(result.trace.nextGeneration, sha256(JSON.stringify(candidate)));

  const cases = [
    ["absent evidence", undefined],
    ["wrong evidence hash", { ...manifest, sha256: `sha256:${"0".repeat(64)}` }],
    ["wrong before hash", { ...manifest, beforeHash: `sha256:${"0".repeat(64)}` }],
    ["unapproved source", correctionManifest(before, after, { sourceId: "other-source" })],
    ["extra field", { ...manifest, path: "correction.json" }],
  ];
  for (const [name, correction] of cases) {
    assert.throws(
      () => applyBondMarketHistoryCorrection({ previous, candidate, correction }),
      /correction evidence/i,
      name,
    );
  }

  assert.throws(
    () => applyBondMarketHistoryCorrection({
      previous,
      candidate: [
        { ...unchanged, cbTradingUnits: "1", cbTurnover: "100000" },
        after,
      ],
      correction: manifest,
    }),
    /only the targeted history point/i,
  );

  let getterCalls = 0;
  const accessorEvidence = { ...manifest };
  Object.defineProperty(accessorEvidence, "sha256", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return manifest.sha256;
    },
  });
  assert.throws(
    () => applyBondMarketHistoryCorrection({
      previous,
      candidate,
      correction: accessorEvidence,
    }),
    /data-only correction evidence/i,
  );
  assert.equal(getterCalls, 0);
});
