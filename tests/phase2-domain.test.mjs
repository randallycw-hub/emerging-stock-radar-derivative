import assert from "node:assert/strict";
import test from "node:test";

import {
  BondAlertWindowSchema,
  BondBalanceSnapshotSchema,
  BondEventSchema,
  BondIssueSchema,
  BondStatusSchema,
  BondIssuerProfileSchema,
  CompanyEventSchema,
  CompanyIdentifierSchema,
  CompanySchema,
  DataFreshnessSchema,
  DerivedEventSchema,
  DomainValidationError,
  EmergingCompanyProfileSchema,
  EmergingMarketViewSchema,
  EndOfDayMarketDataSchema,
  IngestionRunSchema,
  ListingApplicationSchema,
  ManualPlannedIssueSchema,
  MonthlyRevenueSchema,
  OfficialSourceSchema,
  RawSnapshotMetadataSchema,
  SourceAttributionSchema,
  SourceHealthSchema,
  findDuplicateBondCodes,
} from "../lib/domain/schema.ts";
import {
  compareIsoDates,
  daysUntil,
  isDataStale,
  isFutureDate,
  isIsoDate,
  isIsoDateTime,
  isYearMonth,
  toTaipeiDate,
} from "../lib/domain/dates.ts";
import { deriveCompanyId } from "../lib/domain/types.ts";

const officialAttribution = {
  sourceId: "tpex-company-basic",
  providerName: "金融監督管理委員會證券期貨局",
  datasetName: "興櫃公司基本資料",
  officialUrl: "https://data.gov.tw/dataset/28568",
  licenseName: "政府資料開放授權條款－第1版",
  sourceDataDate: "2026-07-19",
  sourcePublishedAt: "2026-07-19T18:00:00+08:00",
  fetchedAt: "2026-07-20T01:00:00Z",
  normalizedAt: "2026-07-20T01:01:00Z",
  schemaVersion: "2026-07-20",
  isFixture: false,
};

const fixtureAttribution = {
  ...officialAttribution,
  sourceId: "fixture:company-basic",
  officialUrl: "fixture://company-basic/valid",
  isFixture: true,
};

const companyIdentifier = {
  kind: "stock_code",
  value: "7777",
  authority: "TPEx",
  sourceAttribution: officialAttribution,
};

const company = {
  id: "company:stock_code:7777",
  identifiers: [companyIdentifier],
  name: "測試股份有限公司",
  market: "emerging",
  industryCode: "27",
  industryName: "電子工業",
  createdAt: "2026-07-20T01:00:00Z",
  updatedAt: "2026-07-20T01:01:00Z",
  sourceAttribution: officialAttribution,
};

test("ISO date helpers reject impossible or timezone-less values", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-7-1"), false);
  assert.equal(isIsoDateTime("2026-07-20T09:30:00+08:00"), true);
  assert.equal(isIsoDateTime("2026-07-20T01:30:00Z"), true);
  assert.equal(isIsoDateTime("2026-07-20T09:30:00"), false);
});

test("Asia/Taipei conversion and date comparison are deterministic", () => {
  assert.equal(toTaipeiDate("2026-07-19T16:30:00Z"), "2026-07-20");
  assert.equal(compareIsoDates("2026-07-19", "2026-07-20"), -1);
  assert.equal(compareIsoDates("2026-07-20", "2026-07-20"), 0);
  assert.equal(compareIsoDates("2026-07-21", "2026-07-20"), 1);
});

test("daysUntil, future checks, year-month, and staleness use calendar days", () => {
  const now = "2026-07-20T01:00:00Z";
  assert.equal(daysUntil("2026-07-23", now), 3);
  assert.equal(daysUntil("2026-07-19", now), -1);
  assert.equal(isFutureDate("2026-07-21", now), true);
  assert.equal(isFutureDate("2026-07-20", now), false);
  assert.equal(isYearMonth("2026-07"), true);
  assert.equal(isYearMonth("2026-13"), false);
  assert.equal(isDataStale("2026-07-17", now, 2), true);
  assert.equal(isDataStale("2026-07-18", now, 2), false);
});

test("official sources use HTTPS and explicit approval status", () => {
  const parsed = OfficialSourceSchema.parse({
    sourceId: "tpex-company-basic",
    providerName: "金融監督管理委員會證券期貨局",
    datasetName: "興櫃公司基本資料",
    endpoint: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R",
    licenseName: "政府資料開放授權條款－第1版",
    schemaVersion: "2026-07-20",
    approvalStatus: "APPROVED",
    updatedAt: "2026-07-20T01:00:00Z",
  });
  assert.equal(parsed.sourceId, "tpex-company-basic");
  assert.throws(
    () => OfficialSourceSchema.parse({ ...parsed, endpoint: "http://example.test/data" }),
    DomainValidationError,
  );
});

test("source attribution distinguishes official data from explicit fixtures", () => {
  assert.equal(SourceAttributionSchema.parse(officialAttribution).isFixture, false);
  assert.equal(SourceAttributionSchema.parse(fixtureAttribution).isFixture, true);
  assert.throws(
    () => SourceAttributionSchema.parse({ ...officialAttribution, officialUrl: "fixture://wrong" }),
    DomainValidationError,
  );
  assert.throws(
    () => SourceAttributionSchema.parse({ ...fixtureAttribution, sourceId: "company-basic" }),
    DomainValidationError,
  );
});

test("source data date cannot be later than the fetched Asia/Taipei date", () => {
  assert.throws(
    () => SourceAttributionSchema.parse({
      ...officialAttribution,
      sourceDataDate: "2026-07-21",
    }),
    /sourceDataDate/,
  );
});

test("source attribution timestamps preserve published, fetched, normalized order", () => {
  assert.throws(
    () => SourceAttributionSchema.parse({
      ...officialAttribution,
      sourceDataDate: "2026-07-20",
      sourcePublishedAt: "2026-07-19T23:00:00+08:00",
    }),
    /sourceDataDate/,
  );
  assert.throws(
    () => SourceAttributionSchema.parse({
      ...officialAttribution,
      sourcePublishedAt: "2026-07-20T10:00:00+08:00",
      fetchedAt: "2026-07-20T01:00:00Z",
    }),
    /sourcePublishedAt/,
  );
  assert.throws(
    () => SourceAttributionSchema.parse({
      ...officialAttribution,
      fetchedAt: "2026-07-20T02:00:00Z",
      normalizedAt: "2026-07-20T01:01:00Z",
    }),
    /normalizedAt/,
  );
});

test("source attribution rejects unknown keys", () => {
  assert.throws(
    () => SourceAttributionSchema.parse({ ...officialAttribution, unauthorizedFallback: true }),
    /unknown key/,
  );
});

test("company identifiers follow tax id, LEI, stock code, official id priority", () => {
  const identifiers = [
    { kind: "other_official", value: "OTHER-1" },
    { kind: "stock_code", value: "7777" },
    { kind: "lei", value: "LEI-TEST" },
    { kind: "tax_id", value: "12345678" },
  ];
  assert.equal(deriveCompanyId(identifiers), "company:tax_id:12345678");
});

test("company identity is deterministic across identifier permutations and same-kind ties", () => {
  const identifiers = [
    { kind: "stock_code", value: " 8888 " },
    { kind: "stock_code", value: "7777" },
    { kind: "other_official", value: "ABC" },
  ];
  const reversed = [...identifiers].reverse();
  assert.equal(deriveCompanyId(identifiers), "company:stock_code:7777");
  assert.equal(deriveCompanyId(reversed), "company:stock_code:7777");
});

test("company identity does not change when the company name changes", () => {
  const original = CompanySchema.parse(company);
  const renamed = CompanySchema.parse({ ...company, name: "測試新名稱股份有限公司" });
  assert.equal(original.id, renamed.id);
});

test("company schema rejects an id that disagrees with stable identifiers", () => {
  assert.throws(
    () => CompanySchema.parse({ ...company, id: "company:stock_code:9999" }),
    /derived company id/,
  );
});

test("company identifier validates dates and rejects unknown fields", () => {
  assert.equal(CompanyIdentifierSchema.parse({
    ...companyIdentifier,
    validFrom: "2026-01-01",
  }).value, "7777");
  assert.throws(
    () => CompanyIdentifierSchema.parse({ ...companyIdentifier, displayName: "測試公司" }),
    /unknown key/,
  );
});

test("monthly current revenue accepts signed plain decimal strings", () => {
  const base = {
    companyId: company.id,
    yearMonth: "2026-06",
    currentMonthRevenue: "1200000.50",
    sourceAttribution: officialAttribution,
  };
  assert.equal(MonthlyRevenueSchema.parse(base).currentMonthRevenue, "1200000.50");
  assert.equal(MonthlyRevenueSchema.parse({ ...base, currentMonthRevenue: "-0.5" }).currentMonthRevenue, "-0.5");
  assert.equal(
    MonthlyRevenueSchema.parse({ ...base, currentMonthRevenue: "-1200000.5" })
      .currentMonthRevenue,
    "-1200000.5",
  );
  for (const invalid of [1200000.5, Number.NaN, "1e6", "Infinity", "+5", "-0", "-0.0", "-0.00", "01", "-01"]) {
    assert.throws(
      () => MonthlyRevenueSchema.parse({ ...base, currentMonthRevenue: invalid }),
      DomainValidationError,
    );
  }
});

test("monthly current revenue is signed while comparative and cumulative amounts remain non-negative", () => {
  const parsed = MonthlyRevenueSchema.parse({
    companyId: company.id,
    yearMonth: "2026-06",
    currentMonthRevenue: "-1200000",
    monthOverMonthPercent: "-12.5",
    yearOverYearPercent: "+3.25",
    cumulativeYearOverYearPercent: "-0.5",
    sourceAttribution: officialAttribution,
  });
  assert.equal(parsed.monthOverMonthPercent, "-12.5");
  assert.equal(parsed.yearOverYearPercent, "+3.25");
  assert.equal(parsed.currentMonthRevenue, "-1200000");
  for (const field of [
    "previousMonthRevenue",
    "priorYearMonthRevenue",
    "cumulativeRevenue",
  ]) {
    assert.throws(
      () => MonthlyRevenueSchema.parse({ ...parsed, [field]: "-1" }),
      /non-negative/,
    );
  }
});

test("approved end-of-day and contractual decimal field names are accepted", () => {
  const endOfDay = EndOfDayMarketDataSchema.parse({
    market: "emerging",
    tradingDate: "2026-07-19",
    priceSemantics: "emerging_daily_average",
    dailyAveragePrice: "42.5",
    previousDailyAveragePrice: "41.5",
    dayHigh: "43",
    dayLow: "41",
    dailyVolume: "100000",
    dailyTurnover: "4250000",
    sourceAttribution: officialAttribution,
  });
  assert.equal(endOfDay.dailyAveragePrice, "42.5");

  const bond = BondIssueSchema.parse({
    id: "bond:77771",
    bondCode: "77771",
    issuerCompanyId: company.id,
    bondType: "convertible",
    shortName: "測試一",
    issueDate: "2026-01-01",
    listingDate: "2026-01-03",
    maturityDate: "2031-01-01",
    secured: false,
    faceValue: "100000",
    initialConversionPrice: "50",
    conversionStartDate: "2026-02-01",
    conversionEndDate: "2030-12-31",
    putPrice: "102.5",
    putDates: ["2029-01-01"],
    officialDataDate: "2026-07-19",
    fetchedAt: "2026-07-20T01:00:00Z",
    sourceAttribution: officialAttribution,
  });
  assert.equal(bond.initialConversionPrice, "50");
  assert.equal(bond.putPrice, "102.5");
});

test("emerging market views validate public fields and unavailable derivations", () => {
  const base = {
    tradingDate: "2026-07-30",
    companyCode: "1260",
    companyName: "台灣虎航",
    industryName: "航運業",
    lastTradedPrice: "25.2",
    dailyAveragePrice: "25.45",
    previousAveragePrice: "25.29",
    dailyHighPrice: "26.5",
    dailyLowPrice: "25.2",
    averageChange: "0.16",
    averageChangePercent: "0.63",
    direction: "up",
    transactionVolume: "22001",
    estimatedTransactionAmount: "559925.45",
    applyingDate: null,
    applyingStatus: null,
  };
  assert.equal(EmergingMarketViewSchema.parse(base).direction, "up");
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, tradingDate: "2026-02-30" }),
    /tradingDate/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, companyCode: "" }),
    /companyCode/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, lastTradedPrice: "2.52e1" }),
    /lastTradedPrice/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, dailyAveragePrice: "2.5e1" }),
    /dailyAveragePrice/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, direction: "sideways" }),
    /direction/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({ ...base, transactionVolume: "-1" }),
    /transactionVolume/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({
      ...base,
      dailyAveragePrice: null,
      averageChange: "0.16",
    }),
    /averageChange/,
  );
  assert.throws(
    () => EmergingMarketViewSchema.parse({
      ...base,
      dailyAveragePrice: null,
      averageChange: null,
      averageChangePercent: "0.63",
      direction: "unavailable",
    }),
    /averageChangePercent/,
  );
});

test("emerging end-of-day data requires daily-average semantics", () => {
  const base = {
    market: "emerging",
    tradingDate: "2026-07-19",
    priceSemantics: "emerging_daily_average",
    dailyAveragePrice: "42.5",
    previousDailyAveragePrice: "41.5",
    dayHigh: "43",
    dayLow: "41",
    dailyVolume: "100000",
    dailyTurnover: "4250000",
    sourceAttribution: officialAttribution,
  };
  assert.equal(EndOfDayMarketDataSchema.parse(base).priceSemantics, "emerging_daily_average");
  assert.throws(
    () => EndOfDayMarketDataSchema.parse({
      ...base,
      priceSemantics: "official_end_of_day_close",
    }),
    /emerging_daily_average/,
  );
  assert.throws(
    () => EndOfDayMarketDataSchema.parse({
      ...base,
      previousDailyAveragePrice: undefined,
    }),
    /previousDailyAveragePrice/,
  );
  for (const extraKey of ["id", "companyId", "sourceTime"]) {
    assert.throws(
      () => EndOfDayMarketDataSchema.parse({ ...base, [extraKey]: "not-approved" }),
      /unknown key/,
      extraKey,
    );
  }
});

test("strict schemas reject prohibited market, analysis, and prediction keys", () => {
  const base = {
    market: "emerging",
    tradingDate: "2026-07-19",
    priceSemantics: "emerging_daily_average",
    dailyAveragePrice: "42.5",
    previousDailyAveragePrice: "41.5",
    dayHigh: "43",
    dayLow: "41",
    dailyVolume: "100000",
    dailyTurnover: "4250000",
    sourceAttribution: officialAttribution,
  };
  const prohibitedKeys = [
    "live",
    "realtime",
    "streaming",
    "bid",
    "ask",
    "orderBook",
    "intraday",
    "conversionValue",
    "premiumDiscount",
    "theoretical",
    "arbitrage",
    "target",
    "expectedReturn",
    "closePrice",
    "closingPrice",
    "settlementPrice",
  ];
  for (const key of prohibitedKeys) {
    assert.throws(
      () => EndOfDayMarketDataSchema.parse({ ...base, [key]: "1" }),
      /unknown key/,
      key,
    );
  }
});

test("bond issues require bondCode, stable id, positive prices, and valid put dates", () => {
  const base = {
    id: "bond:77771",
    bondCode: "77771",
    issuerCompanyId: company.id,
    bondType: "convertible",
    shortName: "測試一",
    issueDate: "2026-01-01",
    listingDate: "2026-01-03",
    maturityDate: "2031-01-01",
    secured: true,
    securityDescription: "銀行保證",
    initialConversionPrice: "50",
    conversionStartDate: "2026-02-01",
    conversionEndDate: "2030-12-31",
    putDates: ["2029-01-01"],
    officialDataDate: "2026-07-19",
    fetchedAt: "2026-07-20T01:00:00Z",
    sourceAttribution: officialAttribution,
  };
  assert.equal(BondIssueSchema.parse(base).id, "bond:77771");
  assert.throws(() => BondIssueSchema.parse({ ...base, bondCode: "" }), /bondCode/);
  assert.throws(() => BondIssueSchema.parse({ ...base, id: "bond:wrong" }), /bond id/);
  assert.throws(
    () => BondIssueSchema.parse({ ...base, initialConversionPrice: "0" }),
    /positive/,
  );
  assert.throws(
    () => BondIssueSchema.parse({ ...base, putDates: ["2029-02-30"] }),
    /putDates/,
  );
});

test("bond lifecycle dates must remain ordered and inside the issue lifetime", () => {
  const base = {
    id: "bond:77771",
    bondCode: "77771",
    issuerCompanyId: company.id,
    bondType: "convertible",
    shortName: "測試一",
    issueDate: "2026-01-01",
    listingDate: "2026-01-03",
    maturityDate: "2031-01-01",
    secured: false,
    conversionStartDate: "2026-02-01",
    conversionEndDate: "2030-12-31",
    putDates: ["2029-01-01"],
    officialDataDate: "2026-07-19",
    fetchedAt: "2026-07-20T01:00:00Z",
    sourceAttribution: officialAttribution,
  };
  assert.equal(BondIssueSchema.parse(base).listingDate, "2026-01-03");
  assert.throws(
    () => BondIssueSchema.parse({ ...base, listingDate: "2025-12-31" }),
    /listingDate/,
  );
  assert.throws(
    () => BondIssueSchema.parse({
      ...base,
      conversionStartDate: "2030-01-01",
      conversionEndDate: "2029-01-01",
    }),
    /conversion/,
  );
  assert.throws(
    () => BondIssueSchema.parse({ ...base, conversionStartDate: "2025-12-31" }),
    /conversionStartDate/,
  );
  assert.throws(
    () => BondIssueSchema.parse({ ...base, putDates: ["2032-01-01"] }),
    /putDates/,
  );
});

test("duplicate bond codes are reported deterministically", () => {
  assert.deepEqual(
    findDuplicateBondCodes([
      { bondCode: "77771" },
      { bondCode: "77772" },
      { bondCode: "77771" },
      { bondCode: "77772" },
      { bondCode: "77772" },
    ]),
    ["77771", "77772"],
  );
});

test("event, current status, and alert-window schemas remain separate", () => {
  const companyEvent = CompanyEventSchema.parse({
    id: "company-event:1",
    companyId: company.id,
    kind: "listing_application_submitted",
    occurredOn: "2026-07-19",
    title: "測試公司申請上櫃",
    sourceAttributions: [officialAttribution],
  });
  assert.equal(companyEvent.kind, "listing_application_submitted");

  const bondEvent = BondEventSchema.parse({
    id: "bond-event:1",
    bondId: "bond:77771",
    kind: "listed",
    occurredOn: "2026-07-19",
    title: "測試一掛牌",
    sourceAttributions: [officialAttribution],
  });
  assert.equal(bondEvent.kind, "listed");

  const bondStatus = BondStatusSchema.parse({
    bondId: "bond:77771",
    status: "conversion_active",
    effectiveOn: "2026-02-01",
    sourceAttribution: officialAttribution,
    updatedAt: "2026-07-20T01:01:00Z",
  });
  assert.equal(bondStatus.status, "conversion_active");
  assert.equal(BondAlertWindowSchema.parse({
    id: "alert:bond:77771:maturity-within-30-days",
    bondId: "bond:77771",
    kind: "maturity_within_30_days",
    startsOn: "2030-12-02",
    endsOn: "2031-01-01",
    calculatedAt: "2026-07-20T01:00:00Z",
    sourceAttribution: officialAttribution,
  }).kind, "maturity_within_30_days");

  assert.throws(
    () => CompanyEventSchema.parse({ ...companyEvent, status: "conversion_active" }),
    /unknown key/,
  );
  assert.throws(
    () => BondStatusSchema.parse({ ...bondStatus, kind: "listed" }),
    /unknown key/,
  );
});

test("event and alert taxonomies accept only the reviewed exact values", () => {
  const companyKinds = [
    "became_emerging",
    "market_identity_changed",
    "listing_application_submitted",
    "otc_application_submitted",
    "review_status_changed",
    "listed",
    "otc_listed",
  ];
  for (const kind of companyKinds) {
    assert.equal(CompanyEventSchema.parse({
      id: `company-event:${kind}`,
      companyId: company.id,
      kind,
      occurredOn: "2026-07-19",
      title: kind,
      sourceAttributions: [officialAttribution],
    }).kind, kind);
  }

  const bondKinds = [
    "listed",
    "conversion_started",
    "conversion_ended",
    "put_date_reached",
    "balance_changed",
    "matured",
  ];
  for (const kind of bondKinds) {
    assert.equal(BondEventSchema.parse({
      id: `bond-event:${kind}`,
      bondId: "bond:77771",
      kind,
      occurredOn: "2026-07-19",
      title: kind,
      sourceAttributions: [officialAttribution],
    }).kind, kind);
  }

  const statusCodes = [
    "not_yet_convertible",
    "conversion_active",
    "conversion_ended",
    "approaching_maturity",
    "matured",
    "missing_from_latest_snapshot",
    "awaiting_official_confirmation",
  ];
  for (const status of statusCodes) {
    assert.equal(BondStatusSchema.parse({
      bondId: "bond:77771",
      status,
      effectiveOn: "2026-07-19",
      sourceAttribution: officialAttribution,
      updatedAt: "2026-07-20T01:01:00Z",
    }).status, status);
  }

  const alertKinds = [
    "conversion_start_within_30_days",
    "conversion_end_within_30_days",
    "maturity_within_30_days",
    "maturity_within_60_days",
    "maturity_within_90_days",
    "put_date_within_30_days",
  ];
  for (const kind of alertKinds) {
    assert.equal(BondAlertWindowSchema.parse({
      id: `alert:${kind}`,
      bondId: "bond:77771",
      kind,
      startsOn: "2026-07-01",
      endsOn: "2026-07-30",
      calculatedAt: "2026-07-20T01:00:00Z",
      sourceAttribution: officialAttribution,
    }).kind, kind);
  }
});

test("derived events require provenance and the fixed notice", () => {
  const fixedNotice = "本事件由興債觀測網依官方日期欄位自動整理。";
  const base = {
    id: "derived-event:1",
    entityId: "bond:77771",
    occurredOn: "2030-12-02",
    title: "測試一距到期三十日",
    derivedFrom: ["bond:77771:maturityDate"],
    ruleId: "bond-maturity-window",
    ruleVersion: "1",
    calculatedAt: "2030-12-02T00:00:00+08:00",
    sourceAttribution: officialAttribution,
    noticeText: fixedNotice,
  };
  assert.equal(DerivedEventSchema.parse(base).noticeText, fixedNotice);
  assert.throws(
    () => DerivedEventSchema.parse({ ...base, noticeText: "自動整理" }),
    /noticeText/,
  );
  assert.throws(
    () => DerivedEventSchema.parse({ ...base, derivedFrom: [] }),
    /derivedFrom/,
  );
});

test("all publishable records require source attribution", () => {
  const profile = {
    companyId: company.id,
    industry: "電子工業",
    registeredOn: "2026-01-01",
    sourceAttribution: officialAttribution,
  };
  assert.equal(EmergingCompanyProfileSchema.parse(profile).companyId, company.id);
  const missingAttribution = { ...profile };
  delete missingAttribution.sourceAttribution;
  assert.throws(() => EmergingCompanyProfileSchema.parse(missingAttribution), /sourceAttribution/);
});

test("bond issuer profiles validate and reject missing attribution", () => {
  const profile = {
    companyId: company.id,
    issuerCode: "7777",
    market: "emerging",
    sourceAttribution: officialAttribution,
  };
  assert.equal(BondIssuerProfileSchema.parse(profile).issuerCode, "7777");
  const missingAttribution = { ...profile };
  delete missingAttribution.sourceAttribution;
  assert.throws(() => BondIssuerProfileSchema.parse(missingAttribution), /sourceAttribution/);
});

test("publishable schema manifest rejects every missing attribution", () => {
  const cases = [
    {
      name: "CompanyIdentifier",
      schema: CompanyIdentifierSchema,
      value: companyIdentifier,
      attributionKey: "sourceAttribution",
    },
    {
      name: "Company",
      schema: CompanySchema,
      value: company,
      attributionKey: "sourceAttribution",
    },
    {
      name: "EmergingCompanyProfile",
      schema: EmergingCompanyProfileSchema,
      value: {
        companyId: company.id,
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "BondIssuerProfile",
      schema: BondIssuerProfileSchema,
      value: {
        companyId: company.id,
        issuerCode: "7777",
        market: "emerging",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "MonthlyRevenue",
      schema: MonthlyRevenueSchema,
      value: {
        companyId: company.id,
        yearMonth: "2026-06",
        currentMonthRevenue: "1",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "EndOfDayMarketData",
      schema: EndOfDayMarketDataSchema,
      value: {
        market: "emerging",
        tradingDate: "2026-07-19",
        priceSemantics: "emerging_daily_average",
        dailyAveragePrice: "42.5",
        previousDailyAveragePrice: "41.5",
        dayHigh: "43",
        dayLow: "41",
        dailyVolume: "100000",
        dailyTurnover: "4250000",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "BondIssue",
      schema: BondIssueSchema,
      value: {
        id: "bond:77771",
        bondCode: "77771",
        issuerCompanyId: company.id,
        bondType: "convertible",
        shortName: "測試一",
        issueDate: "2026-01-01",
        maturityDate: "2031-01-01",
        secured: false,
        putDates: [],
        officialDataDate: "2026-07-19",
        fetchedAt: "2026-07-20T01:00:00Z",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "BondBalanceSnapshot",
      schema: BondBalanceSnapshotSchema,
      value: {
        bondId: "bond:77771",
        effectiveDate: "2026-07-19",
        outstandingAmount: "90000000",
        changeAmount: "-1000000",
        changeReason: "轉換",
        fetchedAt: "2026-07-20T01:00:00Z",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "ListingApplication",
      schema: ListingApplicationSchema,
      value: {
        id: "listing:7777:tpex",
        companyId: company.id,
        targetMarket: "otc",
        appliedOn: "2026-07-19",
        status: "submitted",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "CompanyEvent",
      schema: CompanyEventSchema,
      value: {
        id: "company-event:1",
        companyId: company.id,
        kind: "became_emerging",
        occurredOn: "2026-07-19",
        title: "成為興櫃公司",
        sourceAttributions: [officialAttribution],
      },
      attributionKey: "sourceAttributions",
    },
    {
      name: "BondEvent",
      schema: BondEventSchema,
      value: {
        id: "bond-event:1",
        bondId: "bond:77771",
        kind: "listed",
        occurredOn: "2026-07-19",
        title: "債券掛牌",
        sourceAttributions: [officialAttribution],
      },
      attributionKey: "sourceAttributions",
    },
    {
      name: "BondStatus",
      schema: BondStatusSchema,
      value: {
        bondId: "bond:77771",
        status: "conversion_active",
        effectiveOn: "2026-07-19",
        sourceAttribution: officialAttribution,
        updatedAt: "2026-07-20T01:01:00Z",
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "BondAlertWindow",
      schema: BondAlertWindowSchema,
      value: {
        id: "alert:1",
        bondId: "bond:77771",
        kind: "maturity_within_30_days",
        startsOn: "2026-07-01",
        endsOn: "2026-07-30",
        calculatedAt: "2026-07-20T01:00:00Z",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "DerivedEvent",
      schema: DerivedEventSchema,
      value: {
        id: "derived-event:1",
        entityId: "bond:77771",
        occurredOn: "2026-07-19",
        title: "提醒",
        derivedFrom: ["bond:77771:maturityDate"],
        ruleId: "maturity",
        ruleVersion: "1",
        calculatedAt: "2026-07-20T01:00:00Z",
        sourceAttribution: officialAttribution,
        noticeText: "本事件由興債觀測網依官方日期欄位自動整理。",
      },
      attributionKey: "sourceAttribution",
    },
    {
      name: "ManualPlannedIssue",
      schema: ManualPlannedIssueSchema,
      value: {
        id: "planned:1",
        issuerName: "測試公司",
        issuerCode: "7777",
        status: "filed",
        officialPublishedOn: "2026-07-19",
        createdOn: "2026-07-19",
        lastReviewedOn: "2026-07-20",
        sourceAttribution: officialAttribution,
      },
      attributionKey: "sourceAttribution",
    },
  ];

  for (const item of cases) {
    assert.doesNotThrow(() => item.schema.parse(item.value), item.name);
    const missing = { ...item.value };
    delete missing[item.attributionKey];
    assert.throws(() => item.schema.parse(missing), /Attribution|attribution/, item.name);
  }
});

test("listing, balance, and revenue records preserve attribution and reject extras", () => {
  assert.equal(ListingApplicationSchema.parse({
    id: "listing:7777:tpex",
    companyId: company.id,
    targetMarket: "otc",
    appliedOn: "2026-07-19",
    status: "submitted",
    sourceAttribution: officialAttribution,
  }).targetMarket, "otc");

  assert.equal(BondBalanceSnapshotSchema.parse({
    bondId: "bond:77771",
    effectiveDate: "2026-07-19",
    outstandingAmount: "90000000",
    changeAmount: "-1000000",
    changeReason: "債券持有人轉換",
    fetchedAt: "2026-07-20T01:00:00Z",
    sourceAttribution: officialAttribution,
  }).changeAmount, "-1000000");
});

test("manual planned issues require reviewed official provenance", () => {
  const planned = ManualPlannedIssueSchema.parse({
    id: "planned:7777:2026-07-19",
    issuerName: "測試股份有限公司",
    issuerCode: "7777",
    status: "filed",
    officialPublishedOn: "2026-07-19",
    createdOn: "2026-07-19",
    lastReviewedOn: "2026-07-20",
    sourceAttribution: officialAttribution,
  });
  assert.equal(planned.status, "filed");
  assert.throws(
    () => ManualPlannedIssueSchema.parse({ ...planned, lastReviewedOn: undefined }),
    /lastReviewedOn/,
  );
});

test("ingestion metadata validates counts, health, freshness, and raw snapshot shape", () => {
  const health = SourceHealthSchema.parse({
    sourceId: "tpex-company-basic",
    status: "partial",
    checkedAt: "2026-07-20T01:01:00Z",
    lastSuccessfulAt: "2026-07-19T01:00:00Z",
    expectedUpdateAt: "2026-07-21T01:00:00Z",
  });
  assert.equal(health.status, "partial");
  const freshness = DataFreshnessSchema.parse({
    sourceId: "tpex-company-basic",
    level: "stale",
    assessedAt: "2026-07-20T01:01:00Z",
    sourceDataDate: "2026-07-15",
    lastSuccessfulAt: "2026-07-16T01:00:00Z",
    expectedUpdateAt: "2026-07-17T01:00:00Z",
  });
  assert.equal(freshness.level, "stale");
  assert.throws(() => SourceHealthSchema.parse("partial"), DomainValidationError);

  const run = IngestionRunSchema.parse({
    id: "ingestion:tpex-company-basic:20260720",
    sourceId: "tpex-company-basic",
    startedAt: "2026-07-20T01:00:00Z",
    finishedAt: "2026-07-20T01:01:00Z",
    outcome: "success",
    receivedCount: 10,
    acceptedCount: 10,
    rejectedCount: 0,
    sourceHealthStatus: "healthy",
    dataFreshnessLevel: "current",
  });
  assert.equal(run.acceptedCount, 10);
  assert.throws(
    () => IngestionRunSchema.parse({ ...run, acceptedCount: 11 }),
    /count/,
  );

  const snapshot = RawSnapshotMetadataSchema.parse({
    id: "snapshot:tpex-company-basic:20260720",
    sourceId: "tpex-company-basic",
    officialUrl: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_R",
    fetchedAt: "2026-07-20T01:00:00Z",
    httpStatus: 200,
    sourceDataDate: "2026-07-19",
    responseHash: "sha256:abcdef",
    recordCount: 10,
    schemaVersion: "2026-07-20",
    completeSuccess: true,
    isFixture: false,
  });
  assert.equal(snapshot.completeSuccess, true);
  assert.throws(
    () => RawSnapshotMetadataSchema.parse({
      ...snapshot,
      httpStatus: 500,
      completeSuccess: true,
    }),
    /2xx/,
  );
  assert.doesNotThrow(
    () => RawSnapshotMetadataSchema.parse({
      ...snapshot,
      httpStatus: 304,
      completeSuccess: false,
    }),
  );
});

test("safeParse returns structured validation failure without throwing", () => {
  const result = SourceAttributionSchema.safeParse({
    ...officialAttribution,
    sourceDataDate: "not-a-date",
  });
  assert.equal(result.success, false);
  if (!result.success) assert.ok(result.error instanceof DomainValidationError);
});
