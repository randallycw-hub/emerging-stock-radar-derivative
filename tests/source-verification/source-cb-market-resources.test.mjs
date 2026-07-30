import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CB market decisions approve only the verified price resources", async () => {
  const text = await readFile(
    new URL("../../docs/source-verification/cb-market-resource-decision.md", import.meta.url),
    "utf8",
  );

  assert.match(text, /bond\/cbDayQry[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /STOCK_DAY_ALL[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /tpex_mainboard_daily_close_quotes[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /bond\/convSearch[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /t120sg01[\s\S]+VERIFIED_FOR_IMPLEMENTATION/);
  assert.match(text, /bond_cb_daily[\s\S]+SUSPENDED/);
});
