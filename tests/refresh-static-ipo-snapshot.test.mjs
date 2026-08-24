import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildIpoEventSnapshot } from "../lib/ipo-events/snapshot.ts";
import { buildBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { publishStaticIpoSnapshot } from "../scripts/refresh-static-ipo-snapshot.mjs";
import { summarizeWorkbenchSourceStates } from "../scripts/build-bond-market-snapshot.mjs";

const downloadedAt = "2026-08-23T22:30:00+08:00";
const sha256 = `sha256:${"0".repeat(64)}`;
const sourceManifest = [
  { sourceId: "twse-applications", sourceUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "tpex-applications", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "tpex-ipo-listings", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "twse-auctions", sourceUrl: "https://www.twse.com.tw/announcement/auction?response=json&yy=2026", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
  { sourceId: "twse-public-offerings", sourceUrl: "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026", downloadedAt, sha256, rawBytes: 1, rowCount: 1 },
];

function freshSnapshot() {
  return buildIpoEventSnapshot({
    twseApplications: [],
    tpexApplications: [{
      companyCode: "7819", companyName: "測試公司", market: "上櫃",
      applicationDate: "2026-08-20", reviewDate: null, boardDate: null,
      contractDate: null, listingDate: null, underwriter: "測試承銷商",
      note: "", sourceRecordId: "TPEx:7819:2026-08-20",
    }],
    tpexListings: [], auctions: [], publicOfferings: [],
    generatedAt: "2026-08-23T22:30:00+08:00",
    dataDate: "2026-08-23", sourceManifest,
  });
}

test("IPO-only publication switches to a new self-contained generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "static-ipo-publication-"));
  const dataDirectory = join(root, "data");
  const priorGeneration = join(dataDirectory, "generations", "abcdef");
  const priorPointer = {
    schemaVersion: 1,
    generation: "generations/abcdef",
    runtimeUrl: "./data/generations/abcdef/runtime.json",
  };
  await mkdir(priorGeneration, { recursive: true });
  await writeFile(join(dataDirectory, "current.json"), `${JSON.stringify(priorPointer)}\n`);
  await writeFile(join(priorGeneration, "ipo-events.json"), "{\"prior\":true}\n");
  await writeFile(join(priorGeneration, "94025.json"), "[]\n");
  const workbench = buildBondWorkbenchSnapshot({
    generatedAt: "2026-08-23T14:00:00.000Z",
    dataDate: "2026-08-23",
    asOfDate: "2026-08-23",
    currentTerms: [],
    currentViews: [],
    currentEvents: [],
  });
  const workbenchText = `${JSON.stringify(workbench, null, 2)}\n`;
  await writeFile(join(priorGeneration, "bond-workbench.json"), workbenchText);
  await writeFile(join(priorGeneration, "manifest.json"), `${JSON.stringify({
    market: { files: [{
      name: "bond-workbench.json",
      sha256: `sha256:${createHash("sha256").update(workbenchText, "utf8").digest("hex")}`,
      rawBytes: Buffer.byteLength(workbenchText, "utf8"),
      recordCount: 0,
      schemaVersion: 1,
      sourceStateSummary: summarizeWorkbenchSourceStates(workbench),
    }] },
    emergingMarketUrl: "./data/generations/abcdef/emerging-market.json",
  })}\n`);
  await writeFile(join(priorGeneration, "runtime.json"), "{}\n");

  try {
    const result = await publishStaticIpoSnapshot({
      dataDirectory,
      snapshot: freshSnapshot(),
      now: new Date("2026-08-23T14:31:00.000Z"),
    });
    const pointer = JSON.parse(await readFile(join(dataDirectory, "current.json"), "utf8"));
    const generationRoot = join(dataDirectory, pointer.generation);
    const runtime = JSON.parse(await readFile(join(generationRoot, "runtime.json"), "utf8"));
    const manifest = JSON.parse(await readFile(join(generationRoot, "manifest.json"), "utf8"));
    const snapshotText = await readFile(join(generationRoot, "ipo-events.json"), "utf8");
    const snapshot = JSON.parse(snapshotText);

    assert.notEqual(pointer.generation, priorPointer.generation);
    assert.equal(result.generation, pointer.generation);
    assert.equal(snapshot.dataDate, "2026-08-23");
    assert.equal(snapshot.records[0].companyCode, "7819");
    assert.equal(runtime.ipoEventsUrl, `./data/${pointer.generation}/ipo-events.json`);
    assert.equal(runtime.manifestUrl, `./data/${pointer.generation}/manifest.json`);
    assert.equal(manifest.emergingMarketUrl, `./data/${pointer.generation}/emerging-market.json`);
    assert.deepEqual(
      manifest.market.files.filter((entry) => entry.name === "ipo-events.json"),
      [{
        name: "ipo-events.json",
        sha256: `sha256:${createHash("sha256").update(snapshotText, "utf8").digest("hex")}`,
        rawBytes: Buffer.byteLength(snapshotText, "utf8"),
        recordCount: snapshot.records.length,
      }],
    );
    assert.equal(await readFile(join(priorGeneration, "ipo-events.json"), "utf8"), "{\"prior\":true}\n");
    assert.equal(await readFile(join(generationRoot, "94025.json"), "utf8"), "[]\n");
    assert.equal(await readFile(join(generationRoot, "bond-workbench.json"), "utf8"), workbenchText);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
