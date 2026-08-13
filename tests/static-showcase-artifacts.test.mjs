import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const showcaseRoot = new URL("../static-showcase/", import.meta.url);
const dataRoot = new URL("data/", showcaseRoot);

test("published showcase artifacts include IPO events and last traded prices", async () => {
  const pointer = JSON.parse(await readFile(new URL("current.json", dataRoot), "utf8"));
  const runtime = JSON.parse(await readFile(new URL(pointer.runtimeUrl, showcaseRoot), "utf8"));
  const manifest = JSON.parse(await readFile(new URL(runtime.manifestUrl, showcaseRoot), "utf8"));
  const ipo = JSON.parse(await readFile(new URL(runtime.ipoEventsUrl, showcaseRoot), "utf8"));
  const emerging = JSON.parse(await readFile(new URL(runtime.emergingMarketUrl, showcaseRoot), "utf8"));

  assert.ok(ipo.records.length > 0);
  assert.ok(ipo.records.some((row) => row.market === "上市"));
  assert.ok(ipo.records.some((row) => row.market === "上櫃"));
  assert.ok(emerging.records.length > 0);
  assert.ok(emerging.records.some((row) => typeof row.lastTradedPrice === "string" && row.lastTradedPrice.trim() !== ""));
  const declaresWorkbench = manifest.market?.files?.some(
    (file) => file?.name === "bond-workbench.json",
  ) === true;
  if (declaresWorkbench) {
    assert.equal(
      runtime.datasets.bondWorkbench,
      `./data/${pointer.generation}/bond-workbench.json`,
    );
    const workbench = JSON.parse(await readFile(
      new URL(runtime.datasets.bondWorkbench, showcaseRoot),
      "utf8",
    ));
    assert.equal(workbench.schemaVersion, 1);
    assert.ok(Array.isArray(workbench.records));
  } else {
    assert.equal(Object.hasOwn(runtime.datasets, "bondWorkbench"), false);
  }
});
