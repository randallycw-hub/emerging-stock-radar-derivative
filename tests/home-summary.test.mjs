import assert from "node:assert/strict";
import test from "node:test";

import { buildHomeSummary } from "../static-showcase/assets/home-page.js";

test("home summary keeps unavailable markets distinct from a verified zero", () => {
  assert.deepEqual(buildHomeSummary({
    emerging: [{ companyCode: "1260" }, { companyCode: "1261" }],
    ipo: { records: [{ companyCode: "1234" }] },
    bonds: { records: [{ status: "active" }, { status: "archived" }] },
  }), {
    emergingCount: 2,
    ipoCount: 1,
    activeBondCount: 1,
  });
  assert.deepEqual(buildHomeSummary({}), {
    emergingCount: null,
    ipoCount: null,
    activeBondCount: null,
  });
});
