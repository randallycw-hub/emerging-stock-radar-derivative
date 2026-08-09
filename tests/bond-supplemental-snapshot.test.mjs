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
    institution: { state: "fresh", dataDate: "2026-08-07" },
    redemption: { state: "stale", dataDate: "2026-08-04" },
    underwriting: { state: "stale", dataDate: "2026/01/02" },
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
    underwriting,
    previous,
  });

  assert.equal(next.redemptions.length, 2);
  assert.equal(next.underwritingCases.length, 2);
  assert.deepEqual(next.sources.redemption, { state: "fresh", dataDate: "2026-08-06" });
  assert.deepEqual(next.sources.underwriting, { state: "fresh", dataDate: "2026/08/08" });
  assert.equal(next.sources.institution.state, "stale");
});

test("legal fresh empty sections have null data dates and become stale empty sections later", () => {
  const fresh = buildCbSupplementalSnapshot({
    generatedAt,
    redemptions: [],
    underwriting: {
      rocYear: 115,
      notice: "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。",
      records: [],
    },
  });
  assert.deepEqual(fresh.sources.redemption, { state: "fresh", dataDate: null });
  assert.deepEqual(fresh.sources.underwriting, { state: "fresh", dataDate: null });

  const stale = buildCbSupplementalSnapshot({
    generatedAt: "2026-08-10T10:00:00.000Z",
    previous: fresh,
  });
  assert.deepEqual(stale.sources.redemption, { state: "stale", dataDate: null });
  assert.deepEqual(stale.sources.underwriting, { state: "stale", dataDate: null });
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
    institution: { state: "unavailable", dataDate: null },
    redemption: { state: "unavailable", dataDate: null },
    underwriting: { state: "unavailable", dataDate: null },
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

test("validates the complete previous snapshot before reusing any section", async (t) => {
  const current = {
    institution: {
      tradingDate: "2026-08-07",
      tradingUnitFaceValueTwd: "100000",
      records: [institutionTrade("61876", "2026-08-07")],
    },
    redemptions: [],
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
    redemptions: [redemptionEvent("2026-08-04", "31312")],
    underwritingCases: [underwritingCase("2026/01/02", "115012")],
    sources: {
      institution: {
        state: "fresh",
        dataDate: overrides.institutionDataDate ?? "2026-08-06",
      },
      redemption: { state: "fresh", dataDate: "2026-08-04" },
      underwriting: { state: "fresh", dataDate: "2026/01/02" },
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

function redemptionEvent(announcementDate, bondCode) {
  const bondName = bondCode === "31311" ? "弘塑一" : "弘塑二";
  return {
    issuerCode: "3131",
    issuerName: "弘塑",
    bondCode,
    bondName,
    announcementDate,
    delistingDate: "2026-09-21",
    subject: `公告弘塑股份有限公司國內轉換公司債(簡稱：${bondName}，代碼：${bondCode})發行公司行使債券贖回權暨訂於115年09月21日終止櫃檯買賣等相關事宜。`,
    detailUrl: `https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3131&date1=${announcementDate.replaceAll("-", "")}&seq_no=1&pub_class=0&firstin=1`,
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
