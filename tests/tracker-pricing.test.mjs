import assert from "node:assert/strict";
import test from "node:test";
import { __trackerTest } from "../lib/tracker.mjs";

const applicantRow = [
  "", "7689", "大鵬科CLMX", "115/04/14", "張再發", "531643",
  "115/05/20", "115/06/16", "115/06/18", "", "富邦", "", "科技事業"
];

const publicOfferingRow = actualPrice => [
  "1", "115/07/22", "大鵬科", "7689", "初上市", "115/07/16", "115/07/20",
  "1,588,000", "1,588,000", "188", actualPrice, "115/07/28", "富邦", "1,000",
  actualPrice === "未訂出" ? "未訂出" : "1", "0", "0", ""
];

const auction = {
  bidStart: new Date(2026, 6, 13),
  bidEnd: new Date(2026, 6, 15),
  openDate: new Date(2026, 6, 17),
  actualPrice: "",
  underwriter: "富邦"
};

test("keeps a future listing date separate from an undetermined offer price", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow("未訂出")]);
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 15)
  );

  assert.equal(item.pricingStatus, "暫定價／待定價");
  assert.equal(item.provisionalPrice, 188);
  assert.equal(item.actualPrice, "");
  assert.equal(item.listingDate.getTime(), new Date(2026, 6, 28).getTime());
  assert.equal(__trackerTest.strategyStage(item, new Date(2026, 6, 15)), "D.競拍進程");

  const exit = __trackerTest.mainExitEvent(item, new Date(2026, 6, 15));
  assert.equal(exit.name, "開標／定價確認");
  assert.equal(exit.date.getTime(), new Date(2026, 6, 17).getTime());
});

test("only marks the strategy as priced after the actual offer price exists", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow("177")]);
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 17)
  );

  assert.equal(item.pricingStatus, "已定價");
  assert.equal(item.actualPrice, 177);
  assert.equal(__trackerTest.strategyStage(item, new Date(2026, 6, 17)), "D.定價完成");
});

test("published tracker rows contain announcement events but no market quote fields", () => {
  const publicMap = __trackerTest.buildPublicOfferingMap([publicOfferingRow("177")]);
  const item = __trackerTest.newApplicant(
    "上市",
    applicantRow,
    new Map([["7689", auction]]),
    publicMap,
    new Date(2026, 6, 17)
  );
  const [row] = __trackerTest.buildRadar([item], new Date(2026, 6, 17));

  assert.equal(row.actualPrice, "177");
  assert.equal("currentPrice" in row, false);
  assert.equal("lastWeekClose" in row, false);
  assert.equal("weeklyChange" in row, false);
  assert.equal("premium" in row, false);
  assert.equal("chartUrl" in row, false);
});
