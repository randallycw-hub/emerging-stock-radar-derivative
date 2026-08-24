import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultIpoStage,
  matchesIpoStage,
  shouldWriteIpoStage,
} from "../static-showcase/assets/ipo-stage-filter.js";

test("IPO default stage shows A–D in-progress cases but keeps explicit all-history views", () => {
  assert.equal(defaultIpoStage(null), "active");
  assert.equal(defaultIpoStage("all"), "all");
  assert.equal(defaultIpoStage("D"), "D");
  assert.equal(defaultIpoStage("listed", { activeOnly: true }), "all");
  assert.equal(defaultIpoStage("unknown"), "all");

  const activeStages = ["A", "B", "C", "D"].filter((stage) => matchesIpoStage(stage, "active"));
  assert.deepEqual(activeStages, ["A", "B", "C", "D"]);
  assert.equal(matchesIpoStage("listed", "active"), false);
  assert.equal(matchesIpoStage("withdrawn", "active"), false);
  assert.equal(matchesIpoStage("A", "AB"), true);
  assert.equal(matchesIpoStage("C", "AB"), false);
  assert.equal(shouldWriteIpoStage("active"), false);
  assert.equal(shouldWriteIpoStage("all"), true);
});

test("market-event default prioritizes contract and trading stages", () => {
  assert.equal(defaultIpoStage(null, { marketFirst: true }), "market");
  assert.equal(matchesIpoStage("A", "market"), false);
  assert.equal(matchesIpoStage("B", "market"), false);
  assert.equal(matchesIpoStage("C", "market"), true);
  assert.equal(matchesIpoStage("D", "market"), true);
});
