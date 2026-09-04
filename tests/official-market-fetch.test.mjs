import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapLimit } from "../scripts/lib/map-limit.mjs";
import {
  fetchCbMonthlyHistory,
  fetchCbSupplementalSources,
  fetchCurrentOfficialMarketData,
  fetchMopsConversionPrice,
  fetchMopsDetail,
  fetchTpexMonthlyStockHistory,
  fetchTwseMonthlyStockHistory,
} from "../scripts/lib/official-market-fetch.mjs";

const fixtureDirectory = new URL(
  "fixtures/source-verification/cb-market/",
  import.meta.url,
);

async function fixture(name) {
  return readFile(new URL(name, fixtureDirectory), "utf8");
}

test("mapLimit never exceeds two concurrent workers and preserves order", async () => {
  let active = 0;
  let peak = 0;
  const values = await mapLimit(["1", "2", "3", "4"], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return Number(value) * 2;
  });

  assert.equal(peak, 2);
  assert.deepEqual(values, [2, 4, 6, 8]);
});

test("fetchMopsDetail rejects an off-host URL before calling fetch", async () => {
  let called = false;
  const fakeFetch = async () => {
    called = true;
    throw new Error("must not fetch");
  };

  await assert.rejects(
    () => fetchMopsDetail("https://example.com/detail", fakeFetch),
    /URL_NOT_ALLOWED/,
  );
  assert.equal(called, false);
});

test("fetchMopsDetail retries the same official URL for retryable status only", async () => {
  const url =
    "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522";
  const calls = [];
  const fakeFetch = async (requestedUrl) => {
    calls.push(requestedUrl);
    return calls.length === 1
      ? new Response("busy", { status: 503 })
      : new Response("<html>ok</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
  };

  assert.equal(await fetchMopsDetail(url, fakeFetch), "<html>ok</html>");
  assert.deepEqual(calls, [url, url]);
});

test("fetchMopsDetail retries when the official response body is interrupted", async () => {
  const url =
    "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522";
  const calls = [];
  const fakeFetch = async (requestedUrl) => {
    calls.push(requestedUrl);
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => {
          throw new TypeError("terminated");
        },
      };
    }
    return new Response("<html>complete</html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  assert.equal(
    await fetchMopsDetail(url, fakeFetch),
    "<html>complete</html>",
  );
  assert.deepEqual(calls, [url, url]);
});

test("fetchMopsConversionPrice patiently retries temporary HTML pages without fields", async () => {
  const entry = {
    bondCode: "35221",
    issuerCode: "3522",
    officialDetailUrl:
      "https://mopsov.twse.com.tw/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
  };
  const detail = await fixture("mops-bond-detail.html");
  const calls = [];
  const delays = [];
  const result = await fetchMopsConversionPrice(
    entry,
    async (url) => {
      calls.push(String(url));
      return new Response(
        calls.length < 4 ? "<html>系統忙碌</html>" : detail,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        },
      );
    },
    async (milliseconds) => {
      delays.push(milliseconds);
    },
  );

  assert.equal(result.currentConversionPrice, "18.2");
  assert.deepEqual(calls, [
    entry.officialDetailUrl,
    entry.officialDetailUrl,
    entry.officialDetailUrl,
    entry.officialDetailUrl,
  ]);
  assert.deepEqual(delays, [2_000, 4_000, 8_000]);
});

test("collects only requested official CB, stock and conversion records", async () => {
  const values = {
    quote: await fixture("tpex-cb-quote.json"),
    twse: await fixture("twse-stock-close.json"),
    tpex: await fixture("tpex-stock-close.json"),
    conversion: await fixture("tpex-conversion-index.json"),
    detail: await fixture("mops-bond-detail.html"),
  };
  const requests = [];
  const fakeFetch = async (url, init = {}) => {
    const request = {
      url: String(url),
      method: init.method ?? "GET",
      body: init.body?.toString() ?? "",
    };
    requests.push(request);

    if (request.url.endsWith("/bond/cbDayQry")) {
      return jsonResponse(values.quote);
    }
    if (request.url.endsWith("/exchangeReport/STOCK_DAY_ALL")) {
      return jsonResponse(values.twse);
    }
    if (request.url.endsWith("/tpex_mainboard_daily_close_quotes")) {
      return jsonResponse(values.tpex);
    }
    if (request.url.endsWith("/bond/convSearch")) {
      return jsonResponse(values.conversion);
    }
    if (request.url.startsWith("https://mopsov.twse.com.tw/mops/web/t120sg01?")) {
      return new Response(values.detail, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected request: ${request.url}`);
  };
  const delays = [];
  const checkpoint = {
    cbQuotesByBondCode: {},
    conversionPricesByBondCode: {},
  };
  const onCheckpoint = async ({ kind, key, value }) => {
    checkpoint[kind][key] = value;
  };

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async (milliseconds) => {
      delays.push(milliseconds);
    },
    perRequestDelayMs: 350,
    checkpoint,
    onCheckpoint,
  });

  assert.equal(result.cbQuotes.length, 2);
  assert.deepEqual(
    result.stockCloses.map((value) => value.companyCode).sort(),
    ["2330", "3522"],
  );
  assert.equal(result.conversionPrices.length, 1);
  assert.equal(result.conversionPrices[0].currentConversionPrice, "18.2");
  assert.equal(requests.length, 5);
  assert.ok(requests.some((request) =>
    request.body === "date=2026%2F07%2F29&code=35221&response=json"
  ));
  assert.ok(requests.some((request) =>
    request.body === "name=bondIssuer&searchNo=&response=json"
  ));
  assert.deepEqual(delays, [350, 350]);
  assert.equal(checkpoint.cbQuotesByBondCode["35221"].length, 2);
  assert.equal(
    checkpoint.conversionPricesByBondCode["35221"].currentConversionPrice,
    "18.2",
  );

  requests.length = 0;
  delays.length = 0;
  checkpoint.cbQuotesByBondCode["35221"] = result.cbQuotes.map((quote, index) => ({
    ...quote,
    tradingDate: index === 0 ? "2026-07-30" : quote.tradingDate,
  }));
  await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async (milliseconds) => {
      delays.push(milliseconds);
    },
    perRequestDelayMs: 350,
    checkpoint,
    onCheckpoint,
  });
  assert.equal(requests.length, 3);
  assert.equal(
    requests.some((request) =>
      request.url.endsWith("/bond/cbDayQry")
      || request.url.startsWith("https://mopsov.twse.com.tw/")
    ),
    false,
  );
  assert.deepEqual(delays, []);

  checkpoint.cbQuotesByBondCode["35221"] = result.cbQuotes.map((quote) => ({
    ...quote,
    tradingDate: "2026-07-28",
  }));
  requests.length = 0;
  await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async () => {},
    perRequestDelayMs: 0,
    checkpoint,
    onCheckpoint,
  });
  assert.equal(
    requests.filter((request) => request.url.endsWith("/bond/cbDayQry")).length,
    1,
  );
});

test("retains an exact prior conversion price when one MOPS detail request times out", async () => {
  const values = {
    quote: await fixture("tpex-cb-quote.json"),
    twse: await fixture("twse-stock-close.json"),
    tpex: await fixture("tpex-stock-close.json"),
    conversion: await fixture("tpex-conversion-index.json"),
  };
  const prior = {
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "19.5",
    currentConversionPrice: "18.2",
    effectiveDate: "2026-01-30",
    officialDetailUrl: "https://mopsov.twse.com.tw/mops/web/t120sg01?TYPEK=&bond_id=35221&bond_kind=5&bond_subn=%24M00000001&bond_yrn=1&come=2&encodeURIComponent=1&firstin=ture&issuer_stock_code=3522&monyr_reg=202606&pg=&step=0&tg=",
  };
  let detailRequests = 0;
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/bond/cbDayQry")) return jsonResponse(values.quote);
    if (target.endsWith("/exchangeReport/STOCK_DAY_ALL")) return jsonResponse(values.twse);
    if (target.endsWith("/tpex_mainboard_daily_close_quotes")) return jsonResponse(values.tpex);
    if (target.endsWith("/bond/convSearch")) return jsonResponse(values.conversion);
    if (target.startsWith("https://mopsov.twse.com.tw/mops/web/t120sg01?")) {
      detailRequests += 1;
      throw new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async () => {},
    perRequestDelayMs: 0,
    previousConversionPrices: [prior],
  });

  assert.deepEqual(result.conversionPrices, [prior]);
  assert.equal(detailRequests, 3);
});

test("collects CB quotes only for the requested trading date when TPEx returns a monthly table", async () => {
  const quote = JSON.parse(await fixture("tpex-cb-quote.json"));
  quote.tables[0].data.push([
    "1150728", "等價", "100.0000", "0.0000", "100.0000", "100.0000",
    "100.0000", "1", "1", "100,000", "100.00",
  ]);
  const values = {
    quote: JSON.stringify(quote),
    twse: await fixture("twse-stock-close.json"),
    tpex: await fixture("tpex-stock-close.json"),
    conversion: await fixture("tpex-conversion-index.json"),
    detail: await fixture("mops-bond-detail.html"),
  };
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/bond/cbDayQry")) return jsonResponse(values.quote);
    if (target.endsWith("/exchangeReport/STOCK_DAY_ALL")) return jsonResponse(values.twse);
    if (target.endsWith("/tpex_mainboard_daily_close_quotes")) return jsonResponse(values.tpex);
    if (target.endsWith("/bond/convSearch")) return jsonResponse(values.conversion);
    if (target.startsWith("https://mopsov.twse.com.tw/mops/web/t120sg01?")) {
      return new Response(values.detail, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async () => {},
    perRequestDelayMs: 0,
  });

  assert.deepEqual(
    [...new Set(result.cbQuotes.map((quoteRow) => quoteRow.tradingDate))],
    ["2026-07-29"],
  );
});

test("filters prior-date CB quotes before returning a checkpoint cache hit", async () => {
  const values = {
    twse: await fixture("twse-stock-close.json"),
    tpex: await fixture("tpex-stock-close.json"),
    conversion: await fixture("tpex-conversion-index.json"),
    detail: await fixture("mops-bond-detail.html"),
  };
  let cbQuoteRequests = 0;
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/bond/cbDayQry")) {
      cbQuoteRequests += 1;
      throw new Error("checkpoint should avoid a quote request");
    }
    if (target.endsWith("/exchangeReport/STOCK_DAY_ALL")) return jsonResponse(values.twse);
    if (target.endsWith("/tpex_mainboard_daily_close_quotes")) return jsonResponse(values.tpex);
    if (target.endsWith("/bond/convSearch")) return jsonResponse(values.conversion);
    if (target.startsWith("https://mopsov.twse.com.tw/mops/web/t120sg01?")) {
      return new Response(values.detail, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async () => {},
    perRequestDelayMs: 0,
    checkpoint: {
      cbQuotesByBondCode: {
        "35221": [
          { bondCode: "35221", tradingDate: "2026-07-29" },
          { bondCode: "35221", tradingDate: "2026-07-28" },
        ],
      },
      conversionPricesByBondCode: {},
    },
  });

  assert.equal(cbQuoteRequests, 0);
  assert.deepEqual(result.cbQuotes, [{
    bondCode: "35221",
    tradingDate: "2026-07-29",
  }]);
});

test("omits requested TWSE and TPEx issuers when official rows have no closing value", async () => {
  const values = {
    quote: await fixture("tpex-cb-quote.json"),
    twse: JSON.stringify([
      ...JSON.parse(await fixture("twse-stock-close.json")),
      {
        Date: "1150821",
        Code: "4190",
        Name: "佐登-KY",
        TradeVolume: "263",
        TradeValue: "6679",
        OpeningPrice: "",
        HighestPrice: "",
        LowestPrice: "",
        ClosingPrice: "",
        Change: "0.0000",
        Transaction: "1",
      },
    ]),
    tpex: JSON.stringify([
      ...JSON.parse(await fixture("tpex-stock-close.json")),
      {
        Date: "1150731",
        SecuritiesCompanyCode: "3587",
        CompanyName: "閎康",
        Close: " ---",
        Change: "--- ",
        Open: "---",
        High: "---",
        Low: "---",
        Average: "---",
        TradingShares: "0",
        TransactionAmount: "0",
        TransactionNumber: "0",
        LatestBidPrice: "---",
        LatesAskPrice: "---",
        Capitals: "0",
        NextReferencePrice: "---",
        NextLimitUp: "---",
        NextLimitDown: "---",
      },
    ]),
    conversion: await fixture("tpex-conversion-index.json"),
    detail: await fixture("mops-bond-detail.html"),
  };
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/bond/cbDayQry")) return jsonResponse(values.quote);
    if (target.endsWith("/exchangeReport/STOCK_DAY_ALL")) return jsonResponse(values.twse);
    if (target.endsWith("/tpex_mainboard_daily_close_quotes")) return jsonResponse(values.tpex);
    if (target.endsWith("/bond/convSearch")) return jsonResponse(values.conversion);
    if (target.startsWith("https://mopsov.twse.com.tw/mops/web/t120sg01?")) {
      return new Response(values.detail, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522", "3587", "4190"],
    date: "2026-07-29",
    fetchImpl: fakeFetch,
    sleepImpl: async () => {},
    perRequestDelayMs: 0,
  });

  assert.deepEqual(result.stockCloses.map((row) => row.companyCode).sort(), ["2330", "3522"]);
});

test("normalizes the three verified monthly history contracts", async () => {
  const quote = await fixture("tpex-cb-quote.json");
  const requests = [];
  const fakeFetch = async (url, init = {}) => {
    const request = {
      url: String(url),
      body: init.body?.toString() ?? "",
    };
    requests.push(request);
    if (request.url.endsWith("/bond/cbDayQry")) return jsonResponse(quote);
    if (request.url.includes("/exchangeReport/STOCK_DAY?")) {
      return jsonResponse(JSON.stringify({
        stat: "OK",
        fields: [
          "日期", "成交股數", "成交金額", "開盤價", "最高價",
          "最低價", "收盤價", "漲跌價差", "成交筆數", "註記",
        ],
        data: [[
          "115/07/30", "44,328,000", "98,479,995,000", "2,205.00",
          "2,260.00", "2,190.00", "2,205.00", "+5.00", "22,290", "",
        ]],
      }));
    }
    if (request.url.endsWith("/afterTrading/tradingStock")) {
      return jsonResponse(JSON.stringify({
        tables: [{
          fields: [
            "日 期", "成交張數", "成交仟元", "開盤",
            "最高", "最低", "收盤", "漲跌", "筆數",
          ],
          data: [[
            "115/07/29", "347", "4,120", "12.20",
            "12.20", "11.65", "11.65", "-0.60", "147",
          ]],
        }],
      }));
    }
    throw new Error(`unexpected request: ${request.url}`);
  };

  const [cb, twse, tpex] = await Promise.all([
    fetchCbMonthlyHistory({
      bondCode: "35221",
      month: "2026-07",
      fetchImpl: fakeFetch,
    }),
    fetchTwseMonthlyStockHistory({
      issuerCode: "2330",
      month: "2026-07",
      fetchImpl: fakeFetch,
    }),
    fetchTpexMonthlyStockHistory({
      issuerCode: "3522",
      month: "2026-07",
      fetchImpl: fakeFetch,
    }),
  ]);

  assert.equal(cb.at(-1).tradingDate, "2026-07-29");
  assert.deepEqual(twse[0], {
    companyCode: "2330",
    market: "listed",
    tradingDate: "2026-07-30",
    close: "2205",
    change: "5",
    volume: "44328000",
    turnover: "98479995000",
  });
  assert.deepEqual(tpex[0], {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "11.65",
    change: "-0.6",
    volume: "347000",
    turnover: "4120000",
  });
  assert.ok(requests.some((request) =>
    request.url.includes("date=20260701&stockNo=2330")
  ));
  assert.ok(requests.some((request) =>
    request.body === "code=3522&date=2026%2F07%2F01&response=json"
  ));
});

test("supplemental fetches only the three exact resources and parses their verified contracts", async () => {
  const institution = await fixtureFromSource("cb-institution/daily-minimal.json");
  const redemption = await fixtureFromSource("cb-redemption/year-minimal.json");
  const underwriting = await fixtureFromSource("cb-underwriting/current-year-minimal.html");
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({
      url: String(url),
      method: init.method ?? "GET",
      accept: init.headers?.accept,
      contentType: init.headers?.["content-type"],
      body: init.body?.toString() ?? null,
      redirect: init.redirect,
    });
    if (String(url) === "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade") {
      return jsonResponse(institution);
    }
    if (String(url) === "https://www.tpex.org.tw/www/zh-tw/bond/redeem") {
      return jsonResponse(redemption);
    }
    if (String(url) === "https://web.twsa.org.tw/edoc2/default.aspx") {
      return new Response(underwriting, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (String(url).startsWith("https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?")) {
      return new Response(mopsRedemptionDetail(String(url)), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };

  const result = await fetchCbSupplementalSources({
    date: "2026-08-07",
    fetchImpl,
  });

  assert.deepEqual(requests.slice(0, 3), [
    {
      url: "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
      method: "POST",
      accept: "application/json",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      body: "date=2026%2F08%2F07&type=Daily&id=&response=json",
      redirect: "error",
    },
    {
      url: "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
      method: "POST",
      accept: "application/json",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      body: "date=2026&id=&response=json",
      redirect: "error",
    },
    {
      url: "https://web.twsa.org.tw/edoc2/default.aspx",
      method: "GET",
      accept: "text/html,application/xhtml+xml",
      contentType: undefined,
      body: null,
      redirect: "error",
    },
  ]);
  assert.equal(requests.length, 5);
  assert.ok(requests.slice(3).every((request) => (
    request.url.startsWith("https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?")
    && request.method === "GET"
    && request.accept === "text/html,application/xhtml+xml"
    && request.redirect === "error"
  )));
  assert.equal(result.institution.status, "fulfilled");
  assert.equal(result.institution.value.tradingDate, "2026-08-07");
  assert.equal(result.institution.value.records[1].bondCode, "54642");
  assert.equal(result.redemption.status, "fulfilled");
  assert.equal(result.redemption.value[0].announcementDate, "2026-08-04");
  assert.equal(result.underwriting.status, "fulfilled");
  assert.equal(result.underwriting.value.records[0].guaranteeType, "unsecured");
  assert.equal(result.redemptionDetails.status, "fulfilled");
  assert.equal(result.redemptionDetails.value.length, 2);
});

test("supplemental binds each parsed response to the requested collection period", async (t) => {
  const institution2026 = await fixtureFromSource("cb-institution/daily-minimal.json");
  const redemption2026 = await fixtureFromSource("cb-redemption/year-minimal.json");
  const underwriting2026 = await fixtureFromSource("cb-underwriting/current-year-minimal.html");
  const redemption2026Empty = emptyRedemptionFixture(redemption2026, 2026);

  await t.test("institution date mismatch rejects only institution", async () => {
    const result = await fetchCbSupplementalSources({
      date: "2026-08-08",
      fetchImpl: supplementalFixtureFetch({
        institution: institution2026,
        redemption: redemption2026,
        underwriting: underwriting2026,
      }),
    });

    assert.equal(result.institution.status, "rejected");
    assert.match(result.institution.reason.message, /SUPPLEMENTAL_INSTITUTION_DATE_MISMATCH/);
    assert.equal(result.redemption.status, "fulfilled");
    assert.equal(result.underwriting.status, "fulfilled");
  });

  await t.test("empty redemption root year mismatch rejects only redemption", async () => {
    const result = await fetchCbSupplementalSources({
      date: "2026-08-07",
      fetchImpl: supplementalFixtureFetch({
        institution: institution2026,
        redemption: emptyRedemptionFixture(redemption2026, 2025),
        underwriting: underwriting2026,
      }),
    });

    assert.equal(result.institution.status, "fulfilled");
    assert.equal(result.redemption.status, "rejected");
    assert.match(result.redemption.reason.message, /SUPPLEMENTAL_REDEMPTION_YEAR_MISMATCH/);
    assert.equal(result.underwriting.status, "fulfilled");
  });

  await t.test("underwriting page year mismatch rejects only underwriting", async () => {
    const result = await fetchCbSupplementalSources({
      date: "2025-08-07",
      fetchImpl: supplementalFixtureFetch({
        institution: institutionFixtureForDate(institution2026, "2025-08-07"),
        redemption: emptyRedemptionFixture(redemption2026, 2025),
        underwriting: underwriting2026,
      }),
    });

    assert.equal(result.institution.status, "fulfilled");
    assert.equal(result.redemption.status, "fulfilled");
    assert.equal(result.underwriting.status, "rejected");
    assert.match(result.underwriting.reason.message, /SUPPLEMENTAL_UNDERWRITING_YEAR_MISMATCH/);
  });

  await t.test("internally valid 2026 sources all reject for a 2027 request", async () => {
    const result = await fetchCbSupplementalSources({
      date: "2027-08-07",
      fetchImpl: supplementalFixtureFetch({
        institution: institution2026,
        redemption: redemption2026Empty,
        underwriting: underwriting2026,
      }),
    });

    assert.equal(result.institution.status, "rejected");
    assert.equal(result.redemption.status, "rejected");
    assert.equal(result.underwriting.status, "rejected");
  });
});

test("supplemental sources settle independently when underwriting remains unavailable", async () => {
  const institution = await fixtureFromSource("cb-institution/daily-minimal.json");
  const redemption = await fixtureFromSource("cb-redemption/year-minimal.json");
  const calls = [];
  let releaseJson;
  const jsonGate = new Promise((resolve) => {
    releaseJson = resolve;
  });
  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.endsWith("/newCb3itrade")) {
      await jsonGate;
      return jsonResponse(institution);
    }
    if (target.endsWith("/redeem")) {
      await jsonGate;
      return jsonResponse(redemption);
    }
    if (target === "https://web.twsa.org.tw/edoc2/default.aspx") {
      return new Response("busy", { status: 503 });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  const pending = fetchCbSupplementalSources({ date: "2026-08-07", fetchImpl });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), [
    "https://www.tpex.org.tw/www/zh-tw/bond/newCb3itrade",
    "https://www.tpex.org.tw/www/zh-tw/bond/redeem",
    "https://web.twsa.org.tw/edoc2/default.aspx",
  ]);
  releaseJson();
  const result = await pending;

  assert.equal(result.institution.status, "fulfilled");
  assert.equal(result.redemption.status, "fulfilled");
  assert.equal(result.underwriting.status, "rejected");
  assert.match(result.underwriting.reason.message, /^HTTP_503:/);
  assert.equal(
    calls.filter((url) => url === "https://web.twsa.org.tw/edoc2/default.aspx").length,
    3,
  );
  assert.equal(new Set(calls).size, 4);
});

test("supplemental redirect, content-type and schema failures reject only their named sources", async () => {
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.endsWith("/newCb3itrade")) {
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (target.endsWith("/redeem")) {
      return {
        ok: true,
        status: 200,
        redirected: true,
        headers: new Headers({ "content-type": "application/json" }),
        body: new Response("{}").body,
      };
    }
    return new Response("<html>wrong schema</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const result = await fetchCbSupplementalSources({ date: "2026-08-07", fetchImpl });

  assert.equal(result.institution.status, "rejected");
  assert.match(result.institution.reason.message, /^UNEXPECTED_CONTENT_TYPE:/);
  assert.equal(result.redemption.status, "rejected");
  assert.match(result.redemption.reason.message, /^REDIRECT_NOT_ALLOWED:/);
  assert.equal(result.underwriting.status, "rejected");
  assert.match(result.underwriting.reason.message, /page title is missing/);
});

test("supplemental rejects a media type that only contains the accepted Content-Type as a parameter", async () => {
  const institution = await fixtureFromSource("cb-institution/daily-minimal.json");
  const redemption = await fixtureFromSource("cb-redemption/year-minimal.json");
  const underwriting = await fixtureFromSource("cb-underwriting/current-year-minimal.html");
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.endsWith("/newCb3itrade")) {
      return new Response(institution, {
        status: 200,
        headers: { "content-type": "text/plain; profile=application/json" },
      });
    }
    if (target.endsWith("/redeem")) return jsonResponse(redemption);
    return new Response(underwriting, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  const result = await fetchCbSupplementalSources({ date: "2026-08-07", fetchImpl });

  assert.equal(result.institution.status, "rejected");
  assert.match(result.institution.reason.message, /^UNEXPECTED_CONTENT_TYPE:/);
  assert.equal(result.redemption.status, "fulfilled");
  assert.equal(result.underwriting.status, "fulfilled");
});

test("supplemental response caps count actual UTF-8 bytes per source", async (t) => {
  const institution = await fixtureFromSource("cb-institution/daily-minimal.json");
  const redemption = await fixtureFromSource("cb-redemption/year-minimal.json");
  const underwriting = await fixtureFromSource("cb-underwriting/current-year-minimal.html");
  const cases = [
    {
      name: "institution JSON",
      oversizeUrl: "/newCb3itrade",
      oversizeBody: `{"padding":"${"界".repeat(166_667)}"}`,
      contentType: "application/json",
      source: "institution",
      cap: 500_000,
    },
    {
      name: "redemption JSON",
      oversizeUrl: "/redeem",
      oversizeBody: `{"padding":"${"界".repeat(166_667)}"}`,
      contentType: "application/json",
      source: "redemption",
      cap: 500_000,
    },
    {
      name: "underwriting HTML",
      oversizeUrl: "web.twsa.org.tw",
      oversizeBody: "界".repeat(333_334),
      contentType: "text/html",
      source: "underwriting",
      cap: 1_000_000,
    },
  ];

  for (const value of cases) {
    await t.test(value.name, async () => {
      const fetchImpl = async (url) => {
        const target = String(url);
        if (target.includes(value.oversizeUrl)) {
          return new Response(value.oversizeBody, {
            status: 200,
            headers: { "content-type": value.contentType },
          });
        }
        if (target.endsWith("/newCb3itrade")) return jsonResponse(institution);
        if (target.endsWith("/redeem")) return jsonResponse(redemption);
        return new Response(underwriting, {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      };

      const result = await fetchCbSupplementalSources({ date: "2026-08-07", fetchImpl });

      assert.equal(result[value.source].status, "rejected");
      assert.match(result[value.source].reason.message, new RegExp(`RESPONSE_TOO_LARGE:.*:${value.cap}`));
      for (const source of ["institution", "redemption", "underwriting"]) {
        if (source !== value.source) assert.equal(result[source].status, "fulfilled");
      }
    });
  }
});

function jsonResponse(text) {
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function fixtureFromSource(name) {
  return readFile(new URL(`fixtures/source-verification/${name}`, import.meta.url), "utf8");
}

function supplementalFixtureFetch({ institution, redemption, underwriting }) {
  return async (url) => {
    const target = String(url);
    if (target.endsWith("/newCb3itrade")) return jsonResponse(institution);
    if (target.endsWith("/redeem")) return jsonResponse(redemption);
    if (target === "https://web.twsa.org.tw/edoc2/default.aspx") {
      return new Response(underwriting, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (target.startsWith("https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?")) {
      return new Response(mopsRedemptionDetail(target), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    throw new Error(`unexpected request: ${target}`);
  };
}

function mopsRedemptionDetail(url) {
  const sequence = new URL(url).searchParams.get("seq_no");
  const bondCode = sequence === "1" ? "31311" : "31312";
  const bondName = sequence === "1" ? "弘塑一" : "弘塑二";
  return `
    公司代號：3131 公司簡稱：弘塑 債券代碼：${bondCode} 債券簡稱：${bondName}
    依據：依發行及轉換辦法第十八條規定辦理。
    發行公司於115/08/05至115/09/20行使債券贖回權，贖回權價格為債券面額之100.0000%。
    通知及受理轉換公司債收回期間：115年8月5日起至115年9月20日止
    證券商受理期間：115年8月4日起至115年9月19日止
    轉換公司債收回基準日：115年9月20日
    轉換公司債終止櫃檯買賣日期：115年9月21日
    每張債券收回價格：新台幣100,000元整。
    請求轉換之最後期限應於115年9月22日前提出申請。
  `;
}

function emptyRedemptionFixture(text, year) {
  const payload = JSON.parse(text);
  payload.date = `${year}0101`;
  payload.tables[0].data = [];
  payload.tables[0].totalCount = 0;
  return JSON.stringify(payload);
}

function institutionFixtureForDate(text, date) {
  const payload = JSON.parse(text);
  const rocYear = Number(date.slice(0, 4)) - 1911;
  payload.date = date.replaceAll("-", "");
  payload.tables[0].date = `${rocYear}/${date.slice(5, 7)}/${date.slice(8, 10)}`;
  return JSON.stringify(payload);
}
