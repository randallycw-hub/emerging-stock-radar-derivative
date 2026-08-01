import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staticRoot = new URL("../static-showcase/", import.meta.url);

test("public navigation does not list methodology while direct pages remain", async () => {
  const staticFiles = [
    "index.html",
    "bonds.html",
    "emerging.html",
    "ipo.html",
    "methodology.html",
  ];
  const staticSources = await Promise.all(
    staticFiles.map((file) => readFile(new URL(file, staticRoot), "utf8")),
  );
  const [homepage, dashboard, legalPage, sitemap, nextMethodology] = await Promise.all([
    readFile(new URL("../app/Homepage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/Dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/LegalPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/methodology/page.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of staticSources) {
    assert.doesNotMatch(source, /href="\.\/methodology\.html"/);
  }
  for (const source of [homepage, dashboard, legalPage]) {
    assert.doesNotMatch(source, /href="\/methodology"/);
  }
  assert.doesNotMatch(sitemap, /`\$\{BASE_URL\}\/methodology`/);

  assert.equal(
    [...staticSources[0].matchAll(/<a class="market-module(?:\s|")/g)].length,
    3,
  );
  assert.match(staticSources[4], /DATA METHODOLOGY/);
  assert.match(staticSources[4], /04 \/ VALUATION/);
  assert.match(nextMethodology, /METHODOLOGY/);
  assert.match(nextMethodology, /LegalPage/);
});
