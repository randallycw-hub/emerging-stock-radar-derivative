import assert from "node:assert/strict";
import test from "node:test";

import { marketDetailHref } from "../static-showcase/assets/site-shell.js";
import { publicIpoTimelineHref } from "../static-showcase/assets/ipo-stage-filter.js";

test("V5.2 routes emerging rows to the canonical company page", () => {
  assert.equal(marketDetailHref("1260"), "./company.html?code=1260");
});

test("V2 keeps the existing IPO timeline route when opening an IPO row", () => {
  assert.equal(publicIpoTimelineHref("1260"), "./ipo.html?q=1260");
});
