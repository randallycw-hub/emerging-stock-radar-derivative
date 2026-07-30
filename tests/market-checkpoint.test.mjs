import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  openMarketCheckpoint,
} from "../scripts/refresh-static-showcase-data.mjs";

test("market checkpoint persists each verified bond and resumes by date", async () => {
  const directory = await mkdtemp(join(tmpdir(), "market-checkpoint-"));
  try {
    const first = await openMarketCheckpoint({
      date: "2026-07-30",
      directory,
    });
    await first.onCheckpoint({
      kind: "cbQuotesByBondCode",
      key: "35221",
      value: [{ bondCode: "35221", close: "101" }],
    });
    await first.onCheckpoint({
      kind: "conversionPricesByBondCode",
      key: "35221",
      value: { bondCode: "35221", currentConversionPrice: "18.2" },
    });

    const stored = (await readFile(first.path, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(stored[0], {
      schemaVersion: 1,
      date: "2026-07-30",
    });
    assert.equal(stored.length, 3);

    const resumed = await openMarketCheckpoint({
      date: "2026-07-30",
      directory,
    });
    assert.equal(
      resumed.checkpoint.cbQuotesByBondCode["35221"][0].close,
      "101",
    );
    assert.equal(
      resumed.checkpoint.conversionPricesByBondCode["35221"]
        .currentConversionPrice,
      "18.2",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
