import assert from "node:assert/strict";
import test from "node:test";

test("興櫃列只接受收盤價並保留資料日期", async () => {
  const { normalizeEmergingRow } = await import("../lib/preview/data.ts");
  const row = normalizeEmergingRow({
    code: "6543",
    name: "測試公司",
    closingPrice: 42.5,
    asOf: "2026-07-29",
  });
  assert.equal(row.closingPrice, 42.5);
  assert.equal(row.priceLabel, "收盤價");
  assert.equal(row.asOf, "2026-07-29");
  assert.equal("realtimePrice" in row, false);
});

test("格式化器對缺值使用破折號", async () => {
  const { formatPrice, formatPercent, formatAmount, formatDateOrDash } =
    await import("../lib/preview/format.ts");
  assert.equal(formatPrice(undefined), "—");
  assert.equal(formatPercent(undefined), "—");
  assert.equal(formatAmount(undefined), "—");
  assert.equal(formatDateOrDash(""), "—");
});
