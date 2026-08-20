import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyBondMarketHistoryCorrection } from "../scripts/backfill-bond-market-history.mjs";
import {
  nightlyRefreshTimestamp,
  parseNightlyMarketRefreshArgs,
  runIsolatedNightlyMarketRefreshTestHarness,
} from "../scripts/run-nightly-market-refresh.mjs";

const RAW_CB_QUOTE_EVIDENCE = await readFile(new URL(
  "./fixtures/source-verification/cb-market/tpex-cb-quote.json",
  import.meta.url,
), "utf8");

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

function correctionBundle(before, after, manifestPatch = {}, evidencePatch = {}) {
  const payload = RAW_CB_QUOTE_EVIDENCE;
  const officialEvidence = {
    sourceId: "tpex-cb-day-query",
    resourceUrl: "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    retrievedAt: "2026-08-20T14:30:00.000Z",
    sha256: sha256(payload),
    payload,
    ...evidencePatch,
  };
  const manifest = {
    bondCode: before.bondCode,
    date: before.date,
    sourceId: officialEvidence.sourceId,
    retrievedAt: officialEvidence.retrievedAt,
    sha256: officialEvidence.sha256,
    beforeHash: pointHash(before),
    afterHash: pointHash(after),
    ...manifestPatch,
  };
  return { manifest, officialEvidence };
}

function assertAtomicRollback(outcome) {
  assert.equal(outcome.status, "rejected");
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
    date: "2026-07-29",
    scenario: "success",
  });

  assert.equal(outcome.status, "fulfilled");
  assert.equal(outcome.scheduledAt, "2026-07-29T14:30:00.000Z");
  assert.deepEqual(outcome.deploymentEffects, []);
  for (const url of [
    "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    "https://www.tpex.org.tw/www/zh-tw/bond/convSearch",
    "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
  ]) {
    assert.ok(outcome.observations.requestedUrls.includes(url), url);
  }
  assert.equal(outcome.observations.marketBuilderMode, "production");
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

test("a partial but valid 11406 HTTP 200 fails the independent roster census", async () => {
  const outcome = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-29",
    scenario: "partial-roster",
  });
  assertAtomicRollback(outcome);
  assert.match(outcome.error.message, /ROSTER_COMPLETENESS/);
});

test("every required source failure preserves pointer, workbench, and history bytes", async () => {
  for (const [scenario, error] of [
    ["roster-http-failure", /11406.*HTTP_503/],
    ["core-terms-failure", /outstanding|term|11406/i],
    ["core-quote-failure", /cbDayQry|HTTP_503|CB quote/i],
  ]) {
    const outcome = await runIsolatedNightlyMarketRefreshTestHarness({
      date: "2026-07-29",
      scenario,
    });
    assertAtomicRollback(outcome);
    assert.match(outcome.error.message, error, scenario);
  }
});

test("a mismatched or missing required core market date cannot switch the pointer", async () => {
  for (const scenario of ["core-date-mismatch", "core-stock-date-mismatch"]) {
    const wrongDate = await runIsolatedNightlyMarketRefreshTestHarness({
      date: "2026-07-29",
      scenario,
    });
    assertAtomicRollback(wrongDate);
    assert.match(wrongDate.error.message, /CORE_MARKET_DATE_MISMATCH/, scenario);
  }
});

test("optional failures retain only their own stale snapshots", async () => {
  const stale = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-29",
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

test("a revoked optional resource is gated before the candidate-local request boundary", async () => {
  const outcome = await runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-29",
    scenario: "optional-unapproved",
  });

  assert.equal(outcome.status, "fulfilled");
  assert.equal(
    outcome.observations.requestedUrls.includes(
      "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv",
    ),
    false,
  );
  assert.equal(
    outcome.observations.requestedUrls.includes(
      "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv",
    ),
    true,
  );
  const research = JSON.parse(outcome.artifacts.active["cb-issuer-research.json"]);
  assert.equal(research.sources.listed.status, "stale");
});

test("nightly approved fetch dependency cannot intercept unrelated concurrent fetches", async () => {
  let refreshSettled = false;
  const refresh = runIsolatedNightlyMarketRefreshTestHarness({
    date: "2026-07-29",
    scenario: "success",
  }).finally(() => {
    refreshSettled = true;
  });
  const unrelatedErrors = [];
  let unrelatedAttempts = 0;
  while (!refreshSettled && unrelatedErrors.length === 0) {
    try {
      const response = await fetch(
        "data:application/json,%7B%22scope%22%3A%22unrelated%22%7D",
      );
      assert.deepEqual(await response.json(), { scope: "unrelated" });
      unrelatedAttempts += 1;
    } catch (error) {
      unrelatedErrors.push(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const outcome = await refresh;

  assert.equal(outcome.status, "fulfilled");
  assert.ok(unrelatedAttempts > 0);
  assert.deepEqual(unrelatedErrors, []);
});

test("history correction requires raw parsed official evidence and traces generations", async () => {
  const before = historyPoint({
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
  const after = historyPoint();
  const previous = [unchanged, before];
  const candidate = [unchanged, after];
  const { manifest, officialEvidence } = correctionBundle(before, after);

  const result = await applyBondMarketHistoryCorrection({
    previous,
    candidate,
    correction: manifest,
    officialEvidence,
  });
  assert.deepEqual(result.history, candidate);
  assert.deepEqual(result.trace.correction, manifest);
  assert.equal(result.trace.previousGeneration, sha256(JSON.stringify(previous)));
  assert.equal(result.trace.nextGeneration, sha256(JSON.stringify(candidate)));

  const cases = [
    ["absent evidence", manifest, undefined],
    ["wrong evidence hash", manifest, {
      ...officialEvidence,
      sha256: `sha256:${"0".repeat(64)}`,
    }],
    ["wrong manifest hash", {
      ...manifest,
      sha256: `sha256:${"0".repeat(64)}`,
    }, officialEvidence],
    ["wrong before hash", {
      ...manifest,
      beforeHash: `sha256:${"0".repeat(64)}`,
    }, officialEvidence],
    ["unapproved source", {
      ...manifest,
      sourceId: "other-source",
    }, officialEvidence],
    ["extra manifest field", { ...manifest, path: "correction.json" }, officialEvidence],
    ["extra evidence field", manifest, { ...officialEvidence, path: "capture.json" }],
  ];
  for (const [name, correction, evidence] of cases) {
    await assert.rejects(
      async () => applyBondMarketHistoryCorrection({
        previous,
        candidate,
        correction,
        officialEvidence: evidence,
      }),
      /correction evidence/i,
      name,
    );
  }

  await assert.rejects(
    async () => applyBondMarketHistoryCorrection({
      previous,
      candidate: [
        { ...unchanged, cbTradingUnits: "1", cbTurnover: "100000" },
        after,
      ],
      correction: manifest,
      officialEvidence,
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
  await assert.rejects(
    async () => applyBondMarketHistoryCorrection({
      previous,
      candidate,
      correction: accessorEvidence,
      officialEvidence,
    }),
    /data-only correction evidence/i,
  );
  assert.equal(getterCalls, 0);

  const selfSigned = correctionBundle(before, after, {}, {
    payload: JSON.stringify(after),
    sha256: sha256(JSON.stringify(after)),
  });
  selfSigned.manifest.sha256 = selfSigned.officialEvidence.sha256;
  await assert.rejects(
    async () => applyBondMarketHistoryCorrection({
      previous,
      candidate,
      correction: selfSigned.manifest,
      officialEvidence: selfSigned.officialEvidence,
    }),
    /official correction evidence/i,
  );
});
