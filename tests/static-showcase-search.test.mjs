import assert from "node:assert/strict";
import test from "node:test";

import { searchPublicRecords } from "../static-showcase/assets/site-search.js";

test("public site search prioritizes exact codes and projects only safe fields", () => {
  const results = searchPublicRecords("3522", {
    bonds: [{ bondCode: "35221", bondName: "公開債", issuerCode: "3522", issuerName: "公開發行人", sourceId: "internal" }],
    emerging: [{ companyCode: "3522", companyName: "公開公司", privateNote: "do-not-leak" }],
    ipo: [{ companyCode: "3522", companyName: "公開公司", events: [] }],
  });
  assert.deepEqual(results, [
    { kind: "興櫃", code: "3522", label: "公開公司", href: "./market.html?code=3522" },
    { kind: "IPO", code: "3522", label: "公開公司", href: "./ipo-radar.html?q=3522" },
    { kind: "可轉債", code: "35221", label: "公開債／公開發行人", href: "./bonds.html?bond=35221" },
  ]);
  assert.equal(JSON.stringify(results).includes("sourceId"), false);
  assert.deepEqual(searchPublicRecords("", { bonds: [] }), []);
});
