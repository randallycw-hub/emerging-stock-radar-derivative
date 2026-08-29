import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const source = fileURLToPath(new URL("../static-showcase", import.meta.url));

test("V5.2 staging publishes safe canonical company, CB and search datasets", async () => {
  const root = await mkdtemp(join(tmpdir(), "v52-canonical-stage-"));
  const destination = join(root, "market-site");
  try {
    await stageStaticShowcase({ source, destination });
    const pointer = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
    const base = join(destination, "data", ...pointer.generation.split("/"));
    const runtime = JSON.parse(await readFile(join(base, "runtime.json"), "utf8"));
    const [companyMaster, cbMaster, searchIndex] = await Promise.all([
      readFile(join(base, "company-master.json"), "utf8").then(JSON.parse),
      readFile(join(base, "cb-master.json"), "utf8").then(JSON.parse),
      readFile(join(base, "search-index.json"), "utf8").then(JSON.parse),
      readFile(join(destination, "assets", "canonical-identity.js"), "utf8"),
      readFile(join(destination, "assets", "public-data-state.js"), "utf8"),
    ]);

    assert.equal(runtime.companyMasterUrl, `./data/${pointer.generation}/company-master.json`);
    assert.equal(runtime.cbMasterUrl, `./data/${pointer.generation}/cb-master.json`);
    assert.equal(runtime.searchIndexUrl, `./data/${pointer.generation}/search-index.json`);
    assert.equal(companyMaster.meta.dataDate, searchIndex.meta.dataDate);
    assert.equal(cbMaster.records.every((entry) => /^\d{5,6}$/.test(entry.bondCode) && /^\d{4}$/.test(entry.stockCode)), true);
    assert.equal(searchIndex.records.every((entry) => Array.isArray(entry.aliases) && !Object.hasOwn(entry, "sourceId")), true);
    assert.equal(JSON.stringify({ companyMaster, cbMaster, searchIndex }).includes("missingReasons"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
