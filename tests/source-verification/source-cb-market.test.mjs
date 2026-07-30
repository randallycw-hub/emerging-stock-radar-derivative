import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  normalizeCbQuoteRow,
  normalizeTpexStockClose,
  normalizeTwseStockClose,
  parseConversionIndex,
  parseMopsConversionPrice,
} from "../../lib/source-verification/source-cb-market.ts";

const fixtureDirectory = new URL(
  "../fixtures/source-verification/cb-market/",
  import.meta.url,
);

async function jsonFixture(name) {
  return JSON.parse(await readFile(new URL(name, fixtureDirectory), "utf8"));
}

async function textFixture(name) {
  return readFile(new URL(name, fixtureDirectory), "utf8");
}

test("normalizes an equivalent-trading CB quote", async () => {
  const payload = await jsonFixture("tpex-cb-quote.json");
  const quote = normalizeCbQuoteRow("35221", payload.tables[0].data[0]);

  assert.deepEqual(quote, {
    bondCode: "35221",
    tradingDate: "2026-07-29",
    tradingMode: "equivalent",
    close: "103.5",
    change: "1.5",
    open: "103.5",
    high: "103.5",
    low: "103.5",
    tradeCount: "2",
    tradingUnits: "10",
    turnover: "1035000",
    average: "103.5",
  });
});

test("normalizes a no-trade negotiated row without inventing prices", async () => {
  const payload = await jsonFixture("tpex-cb-quote.json");
  const quote = normalizeCbQuoteRow("35221", payload.tables[0].data[1]);

  assert.equal(quote.tradingMode, "negotiated");
  assert.equal(quote.close, null);
  assert.equal(quote.change, null);
  assert.equal(quote.tradeCount, "0");
  assert.equal(quote.tradingUnits, "0");
  assert.equal(quote.turnover, "0");
});

test("normalizes official TWSE and TPEx stock closes", async () => {
  const [twse] = await jsonFixture("twse-stock-close.json");
  const [tpex] = await jsonFixture("tpex-stock-close.json");

  assert.deepEqual(normalizeTwseStockClose(twse), {
    companyCode: "2330",
    market: "listed",
    tradingDate: "2026-07-29",
    close: "2200",
    change: "-80",
    volume: "68139691",
    turnover: "151551634905",
  });
  assert.deepEqual(normalizeTpexStockClose(tpex), {
    companyCode: "3522",
    market: "otc",
    tradingDate: "2026-07-29",
    close: "11.65",
    change: "-0.6",
    volume: "346776",
    turnover: "4119795",
  });
});

test("extracts exact bond and issuer codes from the approved MOPS URL", async () => {
  const payload = await jsonFixture("tpex-conversion-index.json");
  const [entry] = parseConversionIndex(payload);

  assert.equal(entry.bondCode, "35221");
  assert.equal(entry.issuerCode, "3522");
  assert.match(entry.officialDetailUrl, /^https:\/\/mopsov\.twse\.com\.tw\/mops\/web\/t120sg01\?/);
});

test("normalizes the MOPS latest conversion price and effective date", async () => {
  const payload = await jsonFixture("tpex-conversion-index.json");
  const [entry] = parseConversionIndex(payload);
  const value = parseMopsConversionPrice(
    await textFixture("mops-bond-detail.html"),
    entry.officialDetailUrl,
  );

  assert.deepEqual(value, {
    bondCode: "35221",
    issuerCode: "3522",
    initialConversionPrice: "19.5",
    currentConversionPrice: "18.2",
    effectiveDate: "2026-01-30",
    officialDetailUrl: entry.officialDetailUrl,
  });
});

test("rejects malformed rows, dates, duplicate codes and unapproved detail URLs", async () => {
  const payload = await jsonFixture("tpex-conversion-index.json");
  const detailHtml = await textFixture("mops-bond-detail.html");
  const duplicate = structuredClone(payload);
  duplicate.tables[0].data.push(structuredClone(duplicate.tables[0].data[0]));

  assert.throws(
    () => normalizeCbQuoteRow("3522", payload.tables[0].data[0]),
    /invalid bond code/,
  );
  assert.throws(
    () => normalizeCbQuoteRow("35221", ["1150230", "等價", "100"]),
    /11 fields/,
  );
  assert.throws(
    () => normalizeCbQuoteRow("35221", [
      "1150230", "等價", "100", "0", "100", "100",
      "100", "1", "1", "100000", "100",
    ]),
    /invalid official date/,
  );
  assert.throws(() => parseConversionIndex(duplicate), /duplicate bond code/);
  assert.throws(
    () => parseMopsConversionPrice(
      detailHtml,
      "https://example.com/mops/web/t120sg01?bond_id=35221&issuer_stock_code=3522",
    ),
    /unapproved MOPS detail URL/,
  );
});

test("rejects MOPS HTML when any required latest-price label is absent", async () => {
  const payload = await jsonFixture("tpex-conversion-index.json");
  const [entry] = parseConversionIndex(payload);
  const html = (await textFixture("mops-bond-detail.html"))
    .replace("最近轉(交)換價格生效日期", "未驗證日期欄位");

  assert.throws(
    () => parseMopsConversionPrice(html, entry.officialDetailUrl),
    /missing MOPS conversion field/,
  );
});
