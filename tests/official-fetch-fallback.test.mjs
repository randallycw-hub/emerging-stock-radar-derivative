import assert from "node:assert/strict";
import test from "node:test";

import { withTpex520Fallback } from "../scripts/lib/official-fetch-fallback.mjs";

test("uses the controlled transport only for an official TPEx 520 response", async () => {
  const fallbackCalls = [];
  const fetchImpl = withTpex520Fallback({
    fetchImpl: async () => new Response("temporary upstream error", { status: 520 }),
    fallbackFetchImpl: async (url, init) => {
      fallbackCalls.push({ url, init });
      return new Response('{"tables":[]}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    },
  });

  const response = await fetchImpl(
    "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    { method: "POST", body: new URLSearchParams({ code: "11011" }) },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(fallbackCalls, [{
    url: "https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry",
    init: { method: "POST", body: new URLSearchParams({ code: "11011" }) },
  }]);
});

test("does not send unapproved hosts or non-520 responses through the fallback", async () => {
  let fallbackCalls = 0;
  const fallbackFetchImpl = async () => {
    fallbackCalls += 1;
    return new Response("unexpected", { status: 200 });
  };
  const unavailable = withTpex520Fallback({
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
    fallbackFetchImpl,
  });
  const unrelated = withTpex520Fallback({
    fetchImpl: async () => new Response("temporary upstream error", { status: 520 }),
    fallbackFetchImpl,
  });

  assert.equal((await unavailable("https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry")).status, 503);
  assert.equal((await unrelated("https://example.com/anything")).status, 520);
  assert.equal(fallbackCalls, 0);
});

test("retries only a transient 520 returned by the controlled transport", async () => {
  const statuses = [520, 200];
  const pauses = [];
  const fetchImpl = withTpex520Fallback({
    fetchImpl: async () => new Response("temporary upstream error", { status: 520 }),
    fallbackFetchImpl: async () => new Response("recovered", { status: statuses.shift() }),
    sleepImpl: async (milliseconds) => { pauses.push(milliseconds); },
  });

  const response = await fetchImpl("https://www.tpex.org.tw/www/zh-tw/bond/cbDayQry");

  assert.equal(response.status, 200);
  assert.deepEqual(pauses, [1_000]);
});
