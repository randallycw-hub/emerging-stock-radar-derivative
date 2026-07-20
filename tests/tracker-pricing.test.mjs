import assert from "node:assert/strict";
import test from "node:test";
import { __trackerTest } from "../lib/tracker.mjs";

const applicantRow = [
  "", "7689", "大鵬科CLMX", "115/04/14", "張再發", "531643",
  "115/05/20", "115/06/16", "115/06/18", "", "富邦", "", "科技事業"
];

const publicOfferingRow = () => [
  "1", "115/07/22", "大鵬科", "7689", "初上市", "115/07/16", "115/07/20",
  "1,588,000", "1,588,000", "188", "177", "115/07/28", "富邦", "1,000",
  "1", "0", "0", ""
];

const auction = {
  bidStart: new Date(2026, 6, 13),
  bidEnd: new Date(2026, 6, 15),
  openDate: new Date(2026, 6, 17),
  underwriter: "富邦"
};

test("keeps non-price IPO dates while discarding source price columns", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow()]);
  const publicEvent = publicMap.get("7689");
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 15)
  );

  assert.equal("provisionalPrice" in publicEvent, false);
  assert.equal("actualPrice" in publicEvent, false);
  assert.equal("offerPrice" in item, false);
  assert.equal("pricingStatus" in item, false);
  assert.equal(item.listingDate.getTime(), new Date(2026, 6, 28).getTime());
  assert.equal(__trackerTest.strategyStage(item, new Date(2026, 6, 15)), "D.競拍進程");

  const exit = __trackerTest.mainExitEvent(item, new Date(2026, 6, 15));
  assert.equal(exit.name, "開標");
  assert.equal(exit.date.getTime(), new Date(2026, 6, 17).getTime());
});

test("classifies an opened auction without deriving a price state", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow()]);
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 17)
  );

  assert.equal(__trackerTest.strategyStage(item, new Date(2026, 6, 17)), "D.競拍已開標");
});

test("published tracker rows contain announcement events but no price or quote fields", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow()]);
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 17)
  );
  const [row] = __trackerTest.buildRadar([item], new Date(2026, 6, 17));

  for (const field of [
    "price", "provisionalPrice", "actualPrice", "pricingStatus",
    "currentPrice", "lastWeekClose", "weeklyChange", "changePercent",
    "quote", "volume", "candlestick", "premium", "chartUrl",
  ]) {
    assert.equal(field in row, false, field);
  }
});
