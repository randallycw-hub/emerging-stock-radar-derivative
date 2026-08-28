import assert from "node:assert/strict";
import test from "node:test";

import { normalizePublicSearch, searchCanonicalIndex } from "../static-showcase/assets/site-search.js";

const index = [
  { id: "company:2303", type: "company", stockCode: "2303", companyName: "聯電", cbCode: null, cbName: null, market: "TWSE", aliases: [], url: "./company.html?code=2303", dataDate: "2026-08-26" },
  { id: "cb:23031", type: "cb", stockCode: "2303", companyName: "聯電", cbCode: "23031", cbName: "聯電一", market: "CB", aliases: [], url: "./bonds.html?bond=23031", dataDate: "2026-08-26" },
  { id: "ipo:3595", type: "ipo", stockCode: "3595", companyName: "山太士", cbCode: null, cbName: null, market: "IPO", aliases: [], url: "./company.html?code=3595&tab=ipo-cb", dataDate: "2026-08-26" },
];

test("V5.1 canonical search normalizes full-width digits and prioritizes exact CB codes", () => {
  assert.equal(normalizePublicSearch("　２３０３ "), "2303");
  assert.equal(searchCanonicalIndex("23031", index)[0].type, "cb");
  assert.equal(searchCanonicalIndex("聯電", index)[0].stockCode, "2303");
  assert.equal(searchCanonicalIndex("3595", index)[0].type, "ipo");
  assert.deepEqual(searchCanonicalIndex("999999", index), []);
});
