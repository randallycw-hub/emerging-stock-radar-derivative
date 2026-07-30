import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapLimit } from "../scripts/lib/map-limit.mjs";
import {
  fetchCurrentOfficialMarketData,
  fetchMopsDetail,
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

  const result = await fetchCurrentOfficialMarketData({
    bondCodes: ["35221"],
    issuerCodes: ["2330", "3522"],
    date: "2026-07-30",
    fetchImpl: fakeFetch,
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
});

function jsonResponse(text) {
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
