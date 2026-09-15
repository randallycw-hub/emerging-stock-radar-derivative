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

test("retries a Node leaf-chain verification failure through the verified system transport at the same approved URL", async () => {
  const url = "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics";
  const init = { signal: AbortSignal.timeout(30000), redirect: "error" };
  const fetchImpl = withTpex520Fallback({
    fetchImpl: async () => { throw new TypeError("fetch failed", { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } }); },
    fallbackFetchImpl: async (target, options) => {
      assert.equal(target, url);
      assert.equal(options, init);
      return new Response('[{"Date":"1150914"}]', { status: 200 });
    },
  });
  assert.deepEqual(await (await fetchImpl(url, init)).json(), [{ Date: "1150914" }]);
});

test("transport errors outside the approved certificate-chain case remain failures", async () => {
  for (const code of ["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "ECONNRESET", "ABORT_ERR"]) {
    const error = new TypeError("fetch failed", { cause: { code } });
    const fetchImpl = withTpex520Fallback({
      fetchImpl: async () => { throw error; },
      fallbackFetchImpl: async () => assert.fail("unrelated errors must not select another transport"),
    });
    await assert.rejects(fetchImpl("https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics"), error);
  }
});

test("fallback never accepts alternate ports, embedded credentials, fragments or unapproved endpoints", async () => {
  for (const url of [
    "https://www.tpex.org.tw:8443/openapi/v1/tpex_esb_latest_statistics",
    "https://user:password@www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics",
    "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics#fragment",
    "https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics?redirect=1",
    "https://example.com/openapi/v1/tpex_esb_latest_statistics",
    "https://www.tpex.org.tw/unapproved",
  ]) {
    const fetchImpl = withTpex520Fallback({
      fetchImpl: async () => new Response("upstream", { status: 520 }),
      fallbackFetchImpl: async () => assert.fail("unapproved URL must not reach system transport"),
    });
    assert.equal((await fetchImpl(url)).status, 520);
  }
});

test("a system certificate validation failure is propagated without retrying or accepting data", async () => {
  const leafError = new TypeError("fetch failed", { cause: { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" } });
  const systemError = Object.assign(new Error("certificate verification failed"), { code: 60 });
  const fetchImpl = withTpex520Fallback({
    fetchImpl: async () => { throw leafError; },
    fallbackFetchImpl: async () => { throw systemError; },
  });
  await assert.rejects(fetchImpl("https://www.tpex.org.tw/openapi/v1/tpex_esb_latest_statistics"), systemError);
});

test("an absent primary response never authorizes a transport fallback", async () => {
  const fetchImpl = withTpex520Fallback({
    fetchImpl: async () => undefined,
    fallbackFetchImpl: async () => assert.fail("missing response is not a verified fallback trigger"),
  });
  assert.equal(await fetchImpl("https://example.com/anything"), undefined);
});
