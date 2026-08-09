import assert from "node:assert/strict";
import test from "node:test";

import { buildCbSupplementalSnapshot } from "../lib/market-data/bond-supplemental.ts";

const generatedAt = "2026-08-09T10:00:00.000Z";

test("merges one institution day and retains the newest 60 trading days", () => {
  const history = Array.from({ length: 60 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 5, 8 + index)).toISOString().slice(0, 10);
    return institutionTrade("54642", date);
  });
  const previous = previousSnapshot({
    institutionHistory: { "54642": history },
    institutionDataDate: "2026-08-07",
  });
  const institution = {
    tradingDate: "2026-08-07",
    tradingUnitFaceValueTwd: "100000",
    records: [institutionTrade("54642", "2026-08-07")],
  };

  const next = buildCbSupplementalSnapshot({ generatedAt, institution, previous });

  assert.equal(next.institutionHistory["54642"].length, 60);
  assert.equal(next.institutionHistory["54642"][0].tradingDate, "2026-06-09");
  assert.equal(next.institutionHistory["54642"].at(-1).tradingDate, "2026-08-07");
  assert.equal(next.sources.institution.state, "fresh");
  assert.equal(next.sources.institution.dataDate, "2026-08-07");
  assert.equal(next.sources.institution.periodYear, 2026);
});

test("de-duplicates an identical institution trade for the same bond and date", () => {
  const trade = institutionTrade("54642", "2026-08-07");
  const previous = previousSnapshot({
    institutionHistory: { "54642": [trade] },
    institutionDataDate: "2026-08-07",
  });
  const institution = {
    tradingDate: "2026-08-07",
    tradingUnitFaceValueTwd: "100000",
    records: [{ ...trade }],
  };

  const next = buildCbSupplementalSnapshot({ generatedAt, institution, previous });

  assert.equal(next.institutionHistory["54642"].length, 1);
  assert.equal(next.institutionHistory["54642"][0].tradingDate, "2026-08-07");
});

test("rejects an institution day older than retained institution evidence", async (t) => {
  await t.test("retained history", () => {
    const previous = previousSnapshot({
      institutionHistory: {
        "54642": [institutionTrade("54642", "2026-08-07")],
      },
      institutionDataDate: "2026-08-07",
    });
    const institution = {
      tradingDate: "2026-08-06",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("54642", "2026-08-06")],
    };

    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, institution, previous }),
      /institution tradingDate must not precede previous institution dataDate/,
    );
  });

  await t.test("newer previous source date after an empty day", () => {
    const previous = previousSnapshot({ institutionDataDate: "2026-08-07" });
    const institution = {
      tradingDate: "2026-08-06",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("54642", "2026-08-06")],
    };

    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, institution, previous }),
      /institution tradingDate must not precede previous institution dataDate/,
    );
  });
});

test("rejects conflicting institution duplicates and key or date mismatches", async (t) => {
  await t.test("conflicting duplicate", () => {
    const previous = previousSnapshot({
      institutionHistory: {
        "54642": [institutionTrade("54642", "2026-08-07", "1")],
      },
      institutionDataDate: "2026-08-07",
    });
    const institution = {
      tradingDate: "2026-08-07",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("54642", "2026-08-07", "2")],
    };

    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, institution, previous }),
      /conflicting institution trade: 54642:2026-08-07/,
    );
  });

  await t.test("history key mismatch", () => {
    const previous = previousSnapshot({
      institutionHistory: {
        "61876": [institutionTrade("54642", "2026-08-06")],
      },
      institutionDataDate: "2026-08-06",
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /institution history bond code mismatch/,
    );
  });

  await t.test("daily record date mismatch", () => {
    const institution = {
      tradingDate: "2026-08-07",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("54642", "2026-08-06")],
    };
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, institution }),
      /institution daily date mismatch/,
    );
  });
});

test("reuses each verified previous section as stale without retaining mutable aliases", () => {
  const previous = previousSnapshot();
  const institution = {
    tradingDate: "2026-08-07",
    tradingUnitFaceValueTwd: "100000",
    records: [institutionTrade("61876", "2026-08-07")],
  };

  const next = buildCbSupplementalSnapshot({ generatedAt, institution, previous });

  assert.deepEqual(next.sources, {
    institution: { state: "fresh", dataDate: "2026-08-07", periodYear: 2026 },
    redemption: { state: "stale", dataDate: "2026-08-04", periodYear: 2026 },
    underwriting: { state: "stale", dataDate: "2026/01/02", periodYear: 2026 },
  });
  assert.notStrictEqual(next.institutionHistory["54642"], previous.institutionHistory["54642"]);
  assert.notStrictEqual(next.redemptions, previous.redemptions);
  assert.notStrictEqual(next.redemptions[0], previous.redemptions[0]);
  assert.notStrictEqual(next.underwritingCases[0].placementMethods, previous.underwritingCases[0].placementMethods);
  previous.institutionHistory["54642"][0].bondName = "mutated";
  previous.redemptions[0].subject = "mutated";
  previous.underwritingCases[0].placementMethods[0] = "mutated";
  assert.equal(next.institutionHistory["54642"][0].bondName, "霖宏二");
  assert.equal(
    next.redemptions[0].subject,
    "公告弘塑股份有限公司國內轉換公司債(簡稱：弘塑二，代碼：31312)發行公司行使債券贖回權暨訂於115年09月21日終止櫃檯買賣等相關事宜。",
  );
  assert.equal(next.underwritingCases[0].placementMethods[0], "詢價圈購");
});

test("fresh redemption and underwriting replace their sections and use their maximum dates", () => {
  const previous = previousSnapshot();
  const redemptions = [
    redemptionEvent("2026-08-01", "31311"),
    redemptionEvent("2026-08-06", "31312"),
  ];
  const underwriting = {
    rocYear: 115,
    notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。",
    records: [
      underwritingCase("2026/01/02", "115012"),
      underwritingCase("2026/08/08", "115099"),
    ],
  };

  const next = buildCbSupplementalSnapshot({
    generatedAt,
    redemptions,
    redemptionYear: 2026,
    underwriting,
    previous,
  });

  assert.equal(next.redemptions.length, 2);
  assert.equal(next.underwritingCases.length, 2);
  assert.deepEqual(next.sources.redemption, { state: "fresh", dataDate: "2026-08-06", periodYear: 2026 });
  assert.deepEqual(next.sources.underwriting, { state: "fresh", dataDate: "2026/08/08", periodYear: 2026 });
  assert.equal(next.sources.institution.state, "stale");
});

test("enforces redemption period and data-date monotonicity", async (t) => {
  await t.test("every current result requires an explicit period", () => {
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [redemptionEvent("2026-08-01", "31311")],
      }),
      /redemptionYear is required/,
    );
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, redemptions: [] }),
      /redemptionYear is required/,
    );
  });

  await t.test("same-year rollback", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [redemptionEvent("2026-08-01", "31311")],
        redemptionYear: 2026,
        previous,
      }),
      /redemption dataDate must not move backward within a year/,
    );
  });

  await t.test("older year", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [redemptionEvent("2025-12-01", "31311")],
        redemptionYear: 2025,
        previous,
      }),
      /redemption year must not move backward/,
    );
  });

  await t.test("period must match nonempty records", () => {
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [redemptionEvent("2026-08-01", "31311")],
        redemptionYear: 2027,
      }),
      /redemptionYear does not match records/,
    );
  });

  await t.test("next-year rollover", () => {
    const previous = previousSnapshot();
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      redemptions: [redemptionEvent("2027-01-02", "31311", "2027-09-21")],
      redemptionYear: 2027,
      previous,
    });
    assert.deepEqual(next.sources.redemption, { state: "fresh", dataDate: "2027-01-02", periodYear: 2027 });
  });

  await t.test("empty result with prior records requires a period", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, redemptions: [], previous }),
      /redemptionYear is required/,
    );
  });

  await t.test("same-year empty result cannot erase newer evidence", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [],
        redemptionYear: 2026,
        previous,
      }),
      /empty redemption result must be a newer-year rollover/,
    );
  });

  await t.test("empty next-year rollover", () => {
    const previous = previousSnapshot();
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      redemptions: [],
      redemptionYear: 2027,
      previous,
    });
    assert.deepEqual(next.redemptions, []);
    assert.deepEqual(next.sources.redemption, { state: "fresh", dataDate: null, periodYear: 2027 });
  });

  await t.test("persisted empty 2027 rejects empty 2026", () => {
    const previous = previousSnapshot({
      redemptions: [],
      redemptionDataDate: null,
      redemptionPeriodYear: 2027,
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [],
        redemptionYear: 2026,
        previous,
      }),
      /redemption year must not move backward/,
    );
  });

  await t.test("persisted empty 2027 rejects nonempty 2026", () => {
    const previous = previousSnapshot({
      redemptions: [],
      redemptionDataDate: null,
      redemptionPeriodYear: 2027,
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        redemptions: [redemptionEvent("2026-08-01", "31311")],
        redemptionYear: 2026,
        previous,
      }),
      /redemption year must not move backward/,
    );
  });

  await t.test("persisted empty redemption accepts a forward empty rollover", () => {
    const previous = previousSnapshot({
      redemptions: [],
      redemptionDataDate: null,
      redemptionPeriodYear: 2026,
    });
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      redemptions: [],
      redemptionYear: 2027,
      previous,
    });
    assert.deepEqual(next.sources.redemption, { state: "fresh", dataDate: null, periodYear: 2027 });
  });
});

test("enforces underwriting period and data-date monotonicity", async (t) => {
  await t.test("carry-over-only ROC115 rejects an empty ROC115 result", () => {
    const previous = previousSnapshot({
      underwritingCases: [underwritingCase("2025/12/26", "115003")],
      underwritingDataDate: "2025/12/26",
      underwritingPeriodYear: 2026,
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(115, []),
        previous,
      }),
      /empty underwriting result must not erase records within a period/,
    );
  });

  await t.test("carry-over-only ROC115 rejects a regressed ROC115 date", () => {
    const previous = previousSnapshot({
      underwritingCases: [underwritingCase("2025/12/26", "115003")],
      underwritingDataDate: "2025/12/26",
      underwritingPeriodYear: 2026,
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(115, [underwritingCase("2025/12/25", "115002")]),
        previous,
      }),
      /underwriting dataDate must not move backward within a period/,
    );
  });

  await t.test("persisted empty ROC116 rejects empty ROC115", () => {
    const previous = previousSnapshot({
      underwritingCases: [],
      underwritingDataDate: null,
      underwritingPeriodYear: 2027,
    });
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(115, []),
        previous,
      }),
      /underwriting period must not move backward/,
    );
  });

  await t.test("persisted empty ROC115 accepts empty ROC116", () => {
    const previous = previousSnapshot({
      underwritingCases: [],
      underwritingDataDate: null,
      underwritingPeriodYear: 2026,
    });
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      underwriting: underwritingSnapshot(116, []),
      previous,
    });
    assert.deepEqual(next.sources.underwriting, { state: "fresh", dataDate: null, periodYear: 2027 });
  });

  await t.test("same-period rollback", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(115, [underwritingCase("2025/12/26", "115003")]),
        previous,
      }),
      /underwriting dataDate must not move backward within a period/,
    );
  });

  await t.test("older period", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(114, [underwritingCase("2025/12/31", "114099")]),
        previous,
      }),
      /underwriting period must not move backward/,
    );
  });

  await t.test("next-period rollover", () => {
    const previous = previousSnapshot();
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      underwriting: underwritingSnapshot(116, [underwritingCase("2026/01/01", "116001")]),
      previous,
    });
    assert.deepEqual(next.sources.underwriting, { state: "fresh", dataDate: "2026/01/01", periodYear: 2027 });
  });

  await t.test("same-period empty result cannot erase newer evidence", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt,
        underwriting: underwritingSnapshot(115, []),
        previous,
      }),
      /empty underwriting result must not erase records within a period/,
    );
  });

  await t.test("empty next-period rollover", () => {
    const previous = previousSnapshot();
    const next = buildCbSupplementalSnapshot({
      generatedAt,
      underwriting: underwritingSnapshot(116, []),
      previous,
    });
    assert.deepEqual(next.underwritingCases, []);
    assert.deepEqual(next.sources.underwriting, { state: "fresh", dataDate: null, periodYear: 2027 });
  });
});

test("legal fresh empty sections have null data dates and become stale empty sections later", () => {
  const fresh = buildCbSupplementalSnapshot({
    generatedAt,
    redemptions: [],
    redemptionYear: 2026,
    underwriting: {
      rocYear: 115,
      notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。",
      records: [],
    },
  });
  assert.deepEqual(fresh.sources.redemption, { state: "fresh", dataDate: null, periodYear: 2026 });
  assert.deepEqual(fresh.sources.underwriting, { state: "fresh", dataDate: null, periodYear: 2026 });

  const stale = buildCbSupplementalSnapshot({
    generatedAt: "2026-08-10T10:00:00.000Z",
    previous: fresh,
  });
  assert.deepEqual(stale.sources.redemption, { state: "stale", dataDate: null, periodYear: 2026 });
  assert.deepEqual(stale.sources.underwriting, { state: "stale", dataDate: null, periodYear: 2026 });
  assert.deepEqual(stale.redemptions, []);
  assert.deepEqual(stale.underwritingCases, []);
});

test("no current or verified previous data produces unavailable empty sections", () => {
  const next = buildCbSupplementalSnapshot({ generatedAt });

  assert.equal(next.unitFaceValueTwd, null);
  assert.deepEqual(next.institutionHistory, {});
  assert.deepEqual(next.redemptions, []);
  assert.deepEqual(next.underwritingCases, []);
  assert.deepEqual(next.sources, {
    institution: { state: "unavailable", dataDate: null, periodYear: null },
    redemption: { state: "unavailable", dataDate: null, periodYear: null },
    underwriting: { state: "unavailable", dataDate: null, periodYear: null },
  });
});

test("requires generatedAt to advance beyond the previous snapshot", async (t) => {
  await t.test("equal instant", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt: "2026-08-08T18:00:00.000+08:00",
        previous,
      }),
      /generatedAt must be later than previous generatedAt/,
    );
  });

  await t.test("older instant", () => {
    const previous = previousSnapshot();
    assert.throws(
      () => buildCbSupplementalSnapshot({
        generatedAt: "2026-08-08T09:59:59.999Z",
        previous,
      }),
      /generatedAt must be later than previous generatedAt/,
    );
  });
});

test("rejects off-contract redemption URLs in a previous snapshot", async (t) => {
  const cases = [
    ["fragment", (url) => { url.hash = "review"; }],
    ["TYPEK", (url) => { url.searchParams.set("TYPEK", "listed"); }],
    ["zero seq_no", (url) => { url.searchParams.set("seq_no", "0"); }],
    ["non-integer seq_no", (url) => { url.searchParams.set("seq_no", "2.5"); }],
    ["pub_class", (url) => { url.searchParams.set("pub_class", "1"); }],
    ["firstin", (url) => { url.searchParams.set("firstin", "0"); }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const previous = previousSnapshot();
      const url = new URL(previous.redemptions[0].detailUrl);
      mutate(url);
      previous.redemptions[0].detailUrl = url.toString();
      assert.throws(
        () => buildCbSupplementalSnapshot({ generatedAt, previous }),
        /redemption detailUrl/,
      );
    });
  }
});

test("binds previous redemption issuer identity to bond and subject", async (t) => {
  await t.test("coordinated issuer and co_id mutation", () => {
    const previous = previousSnapshot();
    previous.redemptions[0].issuerCode = "9999";
    const url = new URL(previous.redemptions[0].detailUrl);
    url.searchParams.set("co_id", "9999");
    previous.redemptions[0].detailUrl = url.toString();
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /redemption issuerCode.*bondCode/,
    );
  });

  await t.test("issuer name missing from announcement prefix", () => {
    const previous = previousSnapshot();
    previous.redemptions[0].issuerName = "錯誤公司";
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /redemption subject.*issuerName/,
    );
  });
});

test("validates persisted source period identity before reuse", async (t) => {
  await t.test("periodYear is an exact required source-status key", () => {
    const previous = previousSnapshot();
    delete previous.sources.redemption.periodYear;
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /previous redemption source keys/,
    );
  });

  await t.test("institution period matches its source date", () => {
    const previous = previousSnapshot({ institutionPeriodYear: 2025 });
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /previous institution periodYear/,
    );
  });

  await t.test("redemption records match their persisted period", () => {
    const previous = previousSnapshot({ redemptionPeriodYear: 2025 });
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /previous redemption periodYear/,
    );
  });

  await t.test("underwriting rows remain inside their persisted page window", () => {
    const previous = previousSnapshot({ underwritingPeriodYear: 2025 });
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /previous underwriting periodYear/,
    );
  });

  await t.test("unavailable status has a null period", () => {
    const previous = previousSnapshot();
    previous.redemptions = [];
    previous.sources.redemption = { state: "unavailable", dataDate: null, periodYear: 2026 };
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, previous }),
      /previous unavailable redemption section must be empty/,
    );
  });
});

test("validates the complete previous snapshot before reusing any section", async (t) => {
  const current = {
    institution: {
      tradingDate: "2026-08-07",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("61876", "2026-08-07")],
    },
    redemptions: [],
    redemptionYear: 2026,
    underwriting: {
      rocYear: 115,
      notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。",
      records: [],
    },
  };

  await t.test("underwriting dataDate", () => {
    const previous = previousSnapshot();
    previous.sources.underwriting.dataDate = "2026/02/30";
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, ...current, previous }),
      /previous underwriting dataDate/,
    );
  });

  await t.test("institution dataDate cannot precede retained history", () => {
    const previous = previousSnapshot();
    previous.sources.institution.dataDate = "2026-08-05";
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, ...current, previous }),
      /previous institution dataDate/,
    );
  });

  await t.test("redemption subject must bind its normalized fields", () => {
    const previous = previousSnapshot();
    previous.redemptions[0].subject = previous.redemptions[0].subject.replace("代碼：31312", "代碼：31311");
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, ...current, previous }),
      /redemption subject/,
    );
  });

  await t.test("redemption detail URL retains the exact verified query", () => {
    const previous = previousSnapshot();
    previous.redemptions[0].detailUrl += "&fallback=https://example.com";
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, ...current, previous }),
      /redemption detailUrl/,
    );
  });

  await t.test("generatedAt is an ISO timestamp", () => {
    const previous = previousSnapshot();
    previous.generatedAt = "2026-08-08";
    assert.throws(
      () => buildCbSupplementalSnapshot({ generatedAt, ...current, previous }),
      /generatedAt/,
    );
  });
});

function previousSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-08T10:00:00.000Z",
    unitFaceValueTwd: "100000",
    institutionHistory: overrides.institutionHistory ?? {
      "54642": [institutionTrade("54642", "2026-08-06")],
    },
    redemptions: overrides.redemptions ?? [redemptionEvent("2026-08-04", "31312")],
    underwritingCases: overrides.underwritingCases ?? [underwritingCase("2026/01/02", "115012")],
    sources: {
      institution: {
        state: "fresh",
        dataDate: overrides.institutionDataDate ?? "2026-08-06",
        periodYear: overrides.institutionPeriodYear ?? 2026,
      },
      redemption: {
        state: "fresh",
        dataDate: overrides.redemptionDataDate === undefined
          ? "2026-08-04"
          : overrides.redemptionDataDate,
        periodYear: overrides.redemptionPeriodYear ?? 2026,
      },
      underwriting: {
        state: "fresh",
        dataDate: overrides.underwritingDataDate === undefined
          ? "2026/01/02"
          : overrides.underwritingDataDate,
        periodYear: overrides.underwritingPeriodYear ?? 2026,
      },
    },
  };
}

function institutionTrade(bondCode, tradingDate, dealerBuyUnits = "4") {
  return {
    bondCode,
    bondName: "霖宏二",
    tradingDate,
    foreignBuyUnits: "65",
    foreignSellUnits: "0",
    foreignNetUnits: "65",
    trustBuyUnits: "0",
    trustSellUnits: "0",
    trustNetUnits: "0",
    dealerBuyUnits,
    dealerSellUnits: "0",
    dealerNetUnits: dealerBuyUnits,
    totalNetUnits: (65n + BigInt(dealerBuyUnits)).toString(),
  };
}

function redemptionEvent(announcementDate, bondCode, delistingDate = "2026-09-21") {
  const bondName = bondCode === "31311" ? "弘塑一" : "弘塑二";
  const delistingRocYear = Number(delistingDate.slice(0, 4)) - 1911;
  return {
    issuerCode: "3131",
    issuerName: "弘塑",
    bondCode,
    bondName,
    announcementDate,
    delistingDate,
    subject: `公告弘塑股份有限公司國內轉換公司債(簡稱：${bondName}，代碼：${bondCode})發行公司行使債券贖回權暨訂於${delistingRocYear}年${delistingDate.slice(5, 7)}月${delistingDate.slice(8, 10)}日終止櫃檯買賣等相關事宜。`,
    detailUrl: `https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3131&date1=${announcementDate.replaceAll("-", "")}&seq_no=1&pub_class=0&firstin=1`,
  };
}

function underwritingSnapshot(rocYear, records) {
  return {
    rocYear,
    notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。",
    records,
  };
}

function underwritingCase(filedDate, referenceNumber) {
  return {
    referenceNumber,
    filedDate,
    leadUnderwriter: "永豐金證券股份有限公司",
    issuerName: "十銓科技股份有限公司",
    guaranteeType: "secured",
    placementMethods: ["詢價圈購"],
    caseStatus: "正常",
  };
}
