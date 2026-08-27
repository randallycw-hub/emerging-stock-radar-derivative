import assert from "node:assert/strict";
import test from "node:test";

import { marketDetailHref } from "../static-showcase/assets/site-shell.js";
import { publicIpoTimelineHref } from "../static-showcase/assets/ipo-stage-filter.js";

test("V2 keeps the existing emerging detail route when opening a market row", () => {
  assert.equal(marketDetailHref("1260"), "./market.html?code=1260");
});

test("V2 keeps the existing IPO timeline route when opening an IPO row", () => {
  assert.equal(publicIpoTimelineHref("1260"), "./ipo.html?q=1260");
});
