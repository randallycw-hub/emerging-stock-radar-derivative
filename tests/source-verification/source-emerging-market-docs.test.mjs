import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const documents = [
  "../../docs/data-source-registry.md",
  "../../docs/end-of-day-market-data.md",
  "../../docs/source-verification/review-checklist.md",
];

test("emerging market governance uses the approved estimated-amount name and formula", async () => {
  const texts = await Promise.all(documents.map(path => readFile(new URL(path, import.meta.url), "utf8")));
  for (const text of texts) {
    assert.match(
      text,
      /均價漲跌額、均價漲跌幅、上漲\/?下跌\/?平盤分類、估算成交金額（盤後）(?:、|與)同日排行/,
    );
    assert.match(text, /當日成交均價（盤後）×成交量/);
    assert.match(text, /估算值/);
    assert.doesNotMatch(text, /估算成交金額(?!（盤後）)/);
  }
});
