import assert from "node:assert/strict";
import test from "node:test";

import { searchCanonicalIndex } from "../static-showcase/assets/site-search.js";

const index = [{
  id: "company:2303", type: "company", stockCode: "2303", companyName: "聯電", cbCode: null, cbName: null,
  aliases: ["UMC"], cbCodes: ["23031"], cbNames: ["聯電一"], market: "上市", url: "./company.html?code=2303", dataDate: "2026-08-28",
}, {
  id: "cb:23031", type: "cb", stockCode: "2303", companyName: "聯電", cbCode: "23031", cbName: "聯電一",
  aliases: [], market: "上市", url: "./bonds.html?bond=23031", dataDate: "2026-08-28",
}, {
  id: "ipo:3595", type: "ipo", stockCode: "3595", companyName: "山太士", cbCode: null, cbName: null,
  aliases: ["SAN TAI"], market: "IPO", url: "./company.html?code=3595", dataDate: "2026-08-28",
}, {
  id: "company:3313", type: "company", stockCode: "3313", companyName: "斐成", cbCode: null, cbName: null,
  aliases: [], market: "上櫃", url: "./company.html?code=3313", dataDate: "2026-08-28",
}];

test("V5.7 freezes seven public search regressions across code, name, alias, CB, IPO, partial and no-result queries", () => {
  const cases = [
    ["　２３０３ ", ["company:2303", "cb:23031"]],
    ["23031", ["cb:23031", "company:2303"]],
    ["聯電", ["company:2303", "cb:23031"]],
    ["UMC", ["company:2303"]],
    ["3595", ["ipo:3595"]],
    ["斐", ["company:3313"]],
    ["999999", []],
  ];

  for (const [query, expected] of cases) {
    assert.deepEqual(searchCanonicalIndex(query, index).map((row) => row.id), expected, query);
  }
});
