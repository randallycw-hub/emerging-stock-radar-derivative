import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  prior11406TermsFromVerifiedSnapshot,
  verifyRosterDoesNotLeadMarketDate,
  verifyRosterCompleteness,
} from "../scripts/refresh-static-showcase-data.mjs";

const PRIOR_11406_ROW = {
  債券代碼: "15865",
  債券簡稱: "和勤一",
  機構代碼: "1586",
  機構名稱: "和勤",
  到期日期: "20260831",
  發行總額: "1000",
  目前餘額: "1000",
  賣回權日期: "",
};

test("uses the prior 11406 terms only when the official dataset manifest verifies them", () => {
  const terms = prior11406TermsFromVerifiedSnapshot(
    [PRIOR_11406_ROW],
    {
      datasets: [{
        datasetId: "11406",
        sourceUrl: OFFICIAL_SHOWCASE_SOURCES["11406"],
        downloadedAt: "2026-08-28",
        sha256: `sha256:${"a".repeat(64)}`,
        rawBytes: 128,
        rowCount: 1,
      }],
      market: { files: [] },
    },
  );

  assert.deepEqual(terms, [{
    bondCode: "15865",
    issuerCode: "1586",
    issuerName: "和勤",
    shortName: "和勤一",
    maturityDate: "2026-08-31",
    issueAmount: "1000",
    outstandingAmount: "1000",
    outstandingDataDate: null,
    putDates: [],
  }]);
});

test("rejects prior 11406 terms without a verified official dataset manifest entry", () => {
  assert.throws(
    () => prior11406TermsFromVerifiedSnapshot(
      [PRIOR_11406_ROW],
      { datasets: [], market: { files: [{ name: "11406.json" }] } },
    ),
    /prior 11406 manifest integrity is invalid/,
  );
});

test("rejects an official 11406 roster that is newer than the requested market date", () => {
  assert.throws(
    () => verifyRosterDoesNotLeadMarketDate(
      [{ ...PRIOR_11406_ROW, 資料日期: "20260901" }],
      "2026-08-31",
    ),
    /VALIDATION_FAILED:ROSTER_FUTURE_DATA_DATE:2026-09-01:2026-08-31/,
  );
});

test("accepts an official 11406 roster dated on the requested market date", () => {
  assert.doesNotThrow(() => {
    verifyRosterDoesNotLeadMarketDate(
      [{ ...PRIOR_11406_ROW, 資料日期: "20260831" }],
      "2026-08-31",
    );
  });
});

test("allows a census-only bond to leave the roster on its verified maturity date", () => {
  assert.doesNotThrow(() => {
    verifyRosterCompleteness(
      [],
      [{ bondCode: "15865" }],
      {
        expectedDataDate: "2026-08-31",
        priorBonds: [{ bondCode: "15865", maturityDate: "2026-08-31" }],
      },
    );
  });
});

test("continues blocking a census-only bond that has not reached its verified maturity date", () => {
  assert.throws(
    () => {
      verifyRosterCompleteness(
        [],
        [{ bondCode: "15865" }],
        {
          expectedDataDate: "2026-08-31",
          priorBonds: [{ bondCode: "15865", maturityDate: "2026-09-01" }],
        },
      );
    },
    /VALIDATION_FAILED:ROSTER_COMPLETENESS:MISSING_CENSUS_CODES:15865/,
  );
});

test("continues blocking a census-only bond without a verified prior maturity date", () => {
  assert.throws(
    () => {
      verifyRosterCompleteness(
        [],
        [{ bondCode: "15865" }],
        { expectedDataDate: "2026-08-31", priorBonds: [] },
      );
    },
    /VALIDATION_FAILED:ROSTER_COMPLETENESS:MISSING_CENSUS_CODES:15865/,
  );
});
