import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapLimit } from "../scripts/lib/map-limit.mjs";
import {
  fetchCbMonthlyHistory,
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
    date: "2026-07-30",
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
    request.body === "date=2026%2F07%2F30&code=35221&response=json"
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
  await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-30",
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
});

test("omits a requested TPEx issuer when the official row has no closing value", async () => {
  const values = {
    quote: await fixture("tpex-cb-quote.json"),
    twse: await fixture("twse-stock-close.json"),
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
    issuerCodes: ["2330", "3522", "3587"],
    date: "2026-07-31",
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

function jsonResponse(text) {
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
