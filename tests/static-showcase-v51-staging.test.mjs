import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";

const source = fileURLToPath(new URL("../static-showcase", import.meta.url));

test("V5.2 staging extends the public research model with canonical search pointers", async () => {
  const root = await mkdtemp(join(tmpdir(), "v51-research-stage-"));
  const destination = join(root, "market-site");
  try {
    await stageStaticShowcase({ source, destination });
    const pointer = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
    const runtime = JSON.parse(await readFile(join(destination, "data", ...pointer.generation.split("/"), "runtime.json"), "utf8"));
    const research = JSON.parse(await readFile(join(destination, "data", ...pointer.generation.split("/"), "market-research.json"), "utf8"));
    const home = await readFile(join(destination, "index.html"), "utf8");

    assert.equal(Object.hasOwn(runtime, "marketResearchUrl"), false);
    assert.equal(runtime.searchIndexUrl, `./data/${pointer.generation}/search-index.json`);
    assert.equal(runtime.companyMasterUrl, `./data/${pointer.generation}/company-master.json`);
    assert.equal(runtime.cbMasterUrl, `./data/${pointer.generation}/cb-master.json`);
    assert.equal(research.meta.status, "ok");
    assert.match(research.meta.dataDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(research.searchIndex.length > 0, true);
    assert.equal(Array.isArray(research.meta.sourceUrls), true);
    assert.equal(research.meta.sourceUrls.every((url) => /^https:\/\//.test(url)), true);
    assert.equal(JSON.stringify(research).includes("sourceId"), false);
    assert.equal(JSON.stringify(research).includes("missingReasons"), false);
    assert.match(home, /今天從這裡開始/);
    assert.match(home, /可轉債標的股漲幅/);
    assert.match(home, /CB 成交排行/);
    assert.doesNotMatch(home, /HOME_V51_|資料完整|風險與缺漏提醒/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
