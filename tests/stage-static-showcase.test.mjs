import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";
import { buildBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { summarizeWorkbenchSourceStates } from "../scripts/build-bond-market-snapshot.mjs";
import { isOfficialSourceUrl, selectV53QaSamples } from "../static-showcase/assets/cb-workbench-v53.js";

const execFileAsync = promisify(execFile);
const showcaseSource = fileURLToPath(new URL("../static-showcase/", import.meta.url));

test("V5.3 staging publishes one validated CB workbench projection through runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-v53-cb-"));
  const destination = join(root, "dist", "client", "market-site");

  await stageStaticShowcase({ source: showcaseSource, destination });

  const current = JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8"));
  const runtime = JSON.parse(await readFile(join(destination, current.runtimeUrl.replace(/^\.\//, "")), "utf8"));
  const model = JSON.parse(await readFile(
    join(destination, runtime.cbWorkbenchV53Url.replace(/^\.\//, "")),
    "utf8",
  ));

  assert.equal(model.schemaVersion, 1);
  assert.equal(model.dataDate, "2026-08-28");
  assert.ok(model.records.length > 300);
  assert.equal(model.records.filter((row) => row.status === "active").length, new Set(model.records.filter((row) => row.status === "active").map((row) => row.cbCode)).size);
  assert.ok(model.events.every((event) => isOfficialSourceUrl(event.sourceUrl)));
  const qa = selectV53QaSamples(model);
  assert.equal(qa.active.length, 20);
  assert.equal(qa.issuance.length, 5);
  assert.equal(qa.events.length, 5);
});

test("Sites staging copies the complete static showcase including the active generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-"));
  const source = join(root, "source");
  const destination = join(root, "dist", "client", "market-site");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(join(source, "index.html"), "正式首頁", "utf8");
  await writeFile(join(source, "company.html"), "正式公司整合頁", "utf8");
  await writeFile(join(source, "ipo-offering.html"), "正式競拍申購頁", "utf8");
  await writeFile(join(source, "assets", "app.css"), "body{}", "utf8");
  await writeFile(
    join(source, "assets", "bond-technical-analysis.js"),
    "export const analysis = 'shared';\n",
    "utf8",
  );
  await writeFile(
    join(source, "assets", "ipo-stage-filter.js"),
    "export const active = true;\n",
    "utf8",
  );
  await writeFile(
    join(source, "assets", "public-event-digest.js"),
    "export const digest = true;\n",
    "utf8",
  );
  await writeFile(
    join(source, "assets", "emerging-market-display.js"),
    "export const dailyAverage = true;\n",
    "utf8",
  );
  for (const file of [
    "bond-list-page.js",
    "bond-detail-page.js",
    "klinechart-adapter.js",
    "company-overview.js",
    "ipo-offering-page.js",
  ]) {
    await writeFile(
      join(source, "assets", file),
      `export const staged = "${file}";\n`,
      "utf8",
    );
  }
  await execFileAsync(process.execPath, [
    "scripts/stage-static-showcase.mjs",
    source,
    destination,
  ]);

  assert.equal(await readFile(join(destination, "index.html"), "utf8"), "正式首頁");
  assert.equal(await readFile(join(destination, "company.html"), "utf8"), "正式公司整合頁");
  assert.equal(await readFile(join(destination, "ipo-offering.html"), "utf8"), "正式競拍申購頁");
  assert.equal(await readFile(join(destination, "assets", "app.css"), "utf8"), "body{}");
  assert.equal(
    await readFile(
      join(destination, "assets", "bond-technical-analysis.js"),
      "utf8",
    ),
    "export const analysis = 'shared';\n",
  );
  assert.equal(
    await readFile(join(destination, "assets", "ipo-stage-filter.js"), "utf8"),
    "export const active = true;\n",
  );
  assert.equal(
    await readFile(join(destination, "assets", "public-event-digest.js"), "utf8"),
    "export const digest = true;\n",
  );
  assert.equal(
    await readFile(join(destination, "assets", "emerging-market-display.js"), "utf8"),
    "export const dailyAverage = true;\n",
  );
  for (const file of [
    "bond-list-page.js",
    "bond-detail-page.js",
    "klinechart-adapter.js",
    "company-overview.js",
    "ipo-offering-page.js",
  ]) {
    assert.equal(
      await readFile(join(destination, "assets", file), "utf8"),
      `export const staged = "${file}";\n`,
    );
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8")),
    {
      schemaVersion: 1,
      generation: "generations/abc123",
      runtimeUrl: "./data/generations/abc123/runtime.json",
    },
  );
  const manifest = JSON.parse(await readFile(
    join(destination, "data", "generations", "abc123", "manifest.json"),
    "utf8",
  ));
  assert.equal(manifest.market.status, "verified");
  assert.ok(manifest.market.files.some((entry) => entry.name === "bond-workbench.json"));
  assert.ok(manifest.market.files.some((entry) => entry.name === "ipo-events.json"));
});

test("Sites staging writes a public Data Center status artifact and safe HTML bootstrap", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-data-center-v3-"));
  const source = join(root, "source");
  const destination = join(root, "dist", "client", "market-site");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  await writeFile(
    join(source, "data-center.html"),
    '<main><section id="data-center-system"><div id="data-center-static-summary"><!-- DATA_CENTER_STATIC_SUMMARY --></div><script id="data-center-bootstrap" type="application/json"><!-- DATA_CENTER_BOOTSTRAP --></script></section></main>',
    "utf8",
  );

  await stageStaticShowcase({ source, destination });

  const status = JSON.parse(await readFile(
    join(destination, "data", "generations", "abc123", "data-status.json"),
    "utf8",
  ));
  const html = await readFile(join(destination, "data-center.html"), "utf8");
  assert.equal(status.snapshotId, "abc123");
  assert.match(html, /id="data-center-bootstrap"/);
  assert.match(html, /系統資料狀態/);
  assert.doesNotMatch(html, /sourceId|missingReasons|更新資訊讀取中/);
});

test("Sites staging still rejects an unknown presentation asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-unknown-asset-"));
  const source = join(root, "source");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(
    join(source, "assets", "unapproved-analysis.js"),
    "export const unapproved = true;\n",
    "utf8",
  );

  await assert.rejects(
    stageStaticShowcase({ source, destination: join(root, "destination") }),
    /source path is not approved: assets\/unapproved-analysis\.js/i,
  );
});

test("Sites staging rejects a runtime that omits required dataset artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-incomplete-"));
  const source = join(root, "source");
  const generation = join(source, "data", "generations", "abc123");
  await mkdir(generation, { recursive: true });
  await writeFile(
    join(source, "data", "current.json"),
    '{"schemaVersion":1,"generation":"generations/abc123","runtimeUrl":"./data/generations/abc123/runtime.json"}\n',
    "utf8",
  );
  await writeFile(
    join(generation, "runtime.json"),
    '{"generation":"generations/abc123","manifestUrl":"./data/generations/abc123/manifest.json","datasets":{}}\n',
    "utf8",
  );
  await writeFile(
    join(generation, "manifest.json"),
    '{"market":{"status":"verified","dataDate":"2026-07-31"}}\n',
    "utf8",
  );

  await assert.rejects(
    execFileAsync(process.execPath, [
      "scripts/stage-static-showcase.mjs",
      source,
      join(root, "destination"),
    ]),
    /workbench|required dataset artifacts/i,
  );
});

test("Sites staging fails closed when IPO event evidence lacks source record, date, or identity", async (context) => {
  const cases = [
    {
      name: "source record",
      mutate(snapshot) {
        snapshot.records[0].events[0].sourceRecordIds = [];
      },
      expected: /IPO event.*source/i,
    },
    {
      name: "date",
      mutate(snapshot) {
        snapshot.records[0].events[0].date = "not-a-date";
      },
      expected: /IPO event.*date/i,
    },
    {
      name: "identity",
      mutate(snapshot) {
        snapshot.records.push({
          ...snapshot.records[0],
          events: [{ ...snapshot.records[0].events[0] }],
        });
      },
      expected: /IPO event.*identity/i,
    },
  ];

  for (const testCase of cases) {
    await context.test(testCase.name, async () => {
      const { source, destination, generation, snapshot } = await seededGenerationWithIpoEvents();
      testCase.mutate(snapshot);
      await writeIpoArtifact({ source, generation, snapshot });

      await assert.rejects(stageStaticShowcase({ source, destination }), testCase.expected);
      await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
    });
  }
});

test("Sites staging fails closed when IPO event artifact integrity or generation path is invalid", async (context) => {
  await context.test("hash mutation", async () => {
    const { source, destination, generation } = await seededGenerationWithIpoEvents();
    await writeFile(
      join(source, "data", generation, "ipo-events.json"),
      "{\"tampered\":true}\n",
      "utf8",
    );

    await assert.rejects(stageStaticShowcase({ source, destination }), /IPO event.*hash|bytes|integrity/i);
    await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
  });

  await context.test("wrong generation path", async () => {
    const { source, destination, generation } = await seededGenerationWithIpoEvents();
    const runtimePath = join(source, "data", generation, "runtime.json");
    const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
    runtime.ipoEventsUrl = "./data/generations/deadbeef/ipo-events.json";
    await writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, "utf8");

    await assert.rejects(stageStaticShowcase({ source, destination }), /runtime datasets|IPO event/i);
    await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
  });
});

test("Sites staging rejects IPO event source records without one approved source manifest match", async () => {
  const { source, destination, generation, snapshot } = await seededGenerationWithIpoEvents();
  snapshot.records[0].events[0].sourceRecordIds = ["UNAPPROVED:1234:2026-08-25"];
  await writeIpoArtifact({ source, generation, snapshot });

  await assert.rejects(stageStaticShowcase({ source, destination }), /IPO event.*source/i);
  await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
});

test("Sites staging rejects a formal generation without a declared workbench", async () => {
  const { source, destination } = await seededGenerationWithIpoEvents({ includeWorkbench: false });

  await assert.rejects(
    stageStaticShowcase({ source, destination }),
    /workbench|required dataset artifacts/i,
  );
  await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
});

test("Sites staging rejects a formal generation without declared IPO event inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-required-ipo-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeWorkbench: true,
    includeIpo: false,
  });

  await assert.rejects(
    stageStaticShowcase({ source, destination }),
    /IPO event|required dataset artifacts/i,
  );
  await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
});

test("Sites staging rejects an extra runtime dataset and raw CSV before touching destination", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-runtime-extra-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  const runtimePath = join(source, "data/generations/abc123/runtime.json");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  runtime.datasets.rawMonthlyRevenue =
    "./data/generations/abc123/raw-monthly-revenue.csv";
  await writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, "utf8");
  await writeFile(
    join(source, "data/generations/abc123/raw-monthly-revenue.csv"),
    "備註,source URL,rejection\nprivate,https://example.invalid,failed\n",
    "utf8",
  );
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "sentinel.txt"), "prior destination", "utf8");

  await assert.rejects(
    stageStaticShowcase({ source, destination }),
    /runtime datasets|source path/i,
  );
  assert.equal(
    await readFile(join(destination, "sentinel.txt"), "utf8"),
    "prior destination",
  );
});

test("Sites staging rejects every unknown generation evidence file", async (context) => {
  for (const name of [
    "raw.csv",
    "research-notes.txt",
    "source-url.json",
    "rejections.json",
    "unknown-artifact.json",
  ]) {
    await context.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "showcase-stage-unknown-file-"));
      const source = join(root, "source");
      await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
      await writeFile(
        join(source, "data/generations/abc123", name),
        "private evidence",
        "utf8",
      );
      await assert.rejects(
        stageStaticShowcase({ source, destination: join(root, "destination") }),
        /source path/i,
      );
    });
  }
});

test("Sites staging preserves allowed legacy root data without publishing inactive generations", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-legacy-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  await writeFile(join(source, "data/94025.json"), "[]\n", "utf8");
  await mkdir(join(source, "data/generations/deadbeef"), { recursive: true });
  await writeFile(
    join(source, "data/generations/deadbeef/94025.json"),
    "[]\n",
    "utf8",
  );

  await stageStaticShowcase({ source, destination });

  assert.equal(await readFile(join(destination, "data/94025.json"), "utf8"), "[]\n");
  await assert.rejects(
    readFile(join(destination, "data/generations/deadbeef/94025.json"), "utf8"),
    { code: "ENOENT" },
  );
});

test("Sites staging projects legacy root JSON through the same public metadata boundary", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-root-boundary-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
  await writeFile(
    join(source, "data", "bond-market-view.json"),
    `${JSON.stringify([{ bondCode: "90001", missingReasons: ["INTERNAL"], sourceId: "private-source" }])}\n`,
    "utf8",
  );

  await stageStaticShowcase({ source, destination });

  const projected = JSON.parse(await readFile(
    join(destination, "data", "bond-market-view.json"),
    "utf8",
  ));
  assert.deepEqual(projected, [{ bondCode: "90001" }]);
});

test("Sites staging copies a declared validated CB supplemental artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-supplemental-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
  });

  await stageStaticShowcase({ source, destination });

  assert.deepEqual(
    JSON.parse(await readFile(
      join(destination, "data/generations/abc123/bond-supplemental.json"),
      "utf8",
    )),
    emptySupplementalSnapshot,
  );
  const runtime = JSON.parse(await readFile(
    join(destination, "data/generations/abc123/runtime.json"),
    "utf8",
  ));
  assert.equal(
    runtime.datasets.bondSupplemental,
    "./data/generations/abc123/bond-supplemental.json",
  );
});

test("Sites staging rejects declared CB supplemental without its exact runtime dataset key", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-supplemental-runtime-"));
  const source = join(root, "source");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeSupplementalRuntimeKey: false,
  });

  await assert.rejects(
    stageStaticShowcase({ source, destination: join(root, "destination") }),
    /supplemental|required dataset artifacts|runtime datasets/i,
  );
});

test("Sites staging copies only a manifest-declared validated bond workbench", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-workbench-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeWorkbench: true,
  });

  await stageStaticShowcase({ source, destination });

  const runtime = JSON.parse(await readFile(
    join(destination, "data/generations/abc123/runtime.json"),
    "utf8",
  ));
  assert.equal(
    runtime.datasets.bondWorkbench,
    "./data/generations/abc123/bond-workbench.json",
  );
  assert.deepEqual(
    JSON.parse(await readFile(
      join(destination, "data/generations/abc123/bond-workbench.json"),
      "utf8",
    )),
    emptyWorkbenchSnapshot,
  );
});

test("Sites staging rejects a workbench event with an arbitrary source URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-workbench-source-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  const workbenchSnapshot = buildBondWorkbenchSnapshot({
    generatedAt: "2026-07-31T06:00:00.000Z",
    dataDate: "2026-07-31",
    asOfDate: "2026-07-31",
    currentTerms: [stageTerm()],
    currentViews: [stageView()],
    currentEvents: [{
      bondCode: "90001",
      eventId: "listing-1",
      type: "listing",
      date: "2026-07-31",
      title: "掛牌",
      sourceId: "11406",
      sourceUrl: "https://unapproved.example.test/workbench-event",
    }],
  });
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeWorkbench: true,
    workbenchSnapshot,
  });

  await assert.rejects(
    stageStaticShowcase({ source, destination }),
    /workbench event approved source URL/i,
  );
  await assert.rejects(readFile(join(destination, "data/current.json"), "utf8"));
});

test("Sites staging verifies history and 11406 bytes against their manifest entries", async (context) => {
  for (const name of ["bond-market-history.json", "11406.json"]) {
    await context.test(name, async () => {
      const root = await mkdtemp(join(tmpdir(), "showcase-stage-market-integrity-"));
      const source = join(root, "source");
      const destination = join(root, "destination");
      await seedDeclaredIssuerResearchGeneration(source, {
        includeRuntimeKey: true,
        includeSupplemental: true,
        includeWorkbench: true,
      });
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "sentinel.txt"), "prior", "utf8");
      await writeFile(
        join(source, "data/generations/abc123", name),
        "[] \n",
        "utf8",
      );

      await assert.rejects(
        stageStaticShowcase({ source, destination }),
        /history|11406|hash|bytes|manifest/i,
      );
      assert.equal(await readFile(join(destination, "sentinel.txt"), "utf8"), "prior");
    });
  }
});

test("Sites staging requires canonical normalized 11406 integrity without a legacy file entry", async (context) => {
  await context.test("verified normalized input", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcase-stage-normalized-11406-"));
    const source = join(root, "source");
    const destination = join(root, "destination");
    await seedDeclaredIssuerResearchGeneration(source, {
      includeRuntimeKey: true,
      includeSupplemental: true,
      includeWorkbench: true,
      includeLegacyIssuanceEntry: false,
    });
    await stageStaticShowcase({ source, destination });
    assert.equal(
      await readFile(join(destination, "data/generations/abc123/11406.json"), "utf8"),
      "[]\n",
    );
  });

  await context.test("same-row-count byte mutation", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcase-stage-normalized-11406-mutation-"));
    const source = join(root, "source");
    await seedDeclaredIssuerResearchGeneration(source, {
      includeRuntimeKey: true,
      includeSupplemental: true,
      includeWorkbench: true,
      includeLegacyIssuanceEntry: false,
    });
    await writeFile(
      join(source, "data/generations/abc123/11406.json"),
      "[ ]\n",
      "utf8",
    );
    await assert.rejects(
      stageStaticShowcase({ source, destination: join(root, "destination") }),
      /normalized 11406|integrity|hash|bytes/i,
    );
  });
});

test("Sites staging fails closed for declared-missing and undeclared-extra workbench files", async (context) => {
  await context.test("declared missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcase-stage-workbench-missing-"));
    const source = join(root, "source");
    await seedDeclaredIssuerResearchGeneration(source, {
      includeRuntimeKey: true,
      includeSupplemental: true,
      includeWorkbench: true,
    });
    await rm(join(source, "data/generations/abc123/bond-workbench.json"));
    await assert.rejects(
      stageStaticShowcase({ source, destination: join(root, "destination") }),
      /workbench|required dataset artifacts|source path/i,
    );
  });

  await context.test("undeclared extra", async () => {
    const root = await mkdtemp(join(tmpdir(), "showcase-stage-workbench-extra-"));
    const source = join(root, "source");
    await seedDeclaredIssuerResearchGeneration(source, {
      includeRuntimeKey: true,
      includeSupplemental: false,
      includeWorkbench: false,
    });
    await writeFile(
      join(source, "data/generations/abc123/bond-workbench.json"),
      `${JSON.stringify(emptyWorkbenchSnapshot)}\n`,
      "utf8",
    );
    await assert.rejects(
      stageStaticShowcase({ source, destination: join(root, "destination") }),
      /workbench|source path/i,
    );
  });
});

test("Sites staging rejects a wrong bond workbench runtime path", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-workbench-runtime-"));
  const source = join(root, "source");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeWorkbench: true,
  });
  const runtimePath = join(source, "data/generations/abc123/runtime.json");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  runtime.datasets.bondWorkbench = "./data/generations/deadbeef/bond-workbench.json";
  await writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, "utf8");

  await assert.rejects(
    stageStaticShowcase({ source, destination: join(root, "destination") }),
    /workbench|required dataset artifacts|runtime datasets/i,
  );
});

test("Sites staging verifies declared workbench artifacts in inactive generations", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-inactive-workbench-"));
  const source = join(root, "source");
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: true,
    includeWorkbench: true,
  });
  const generations = join(source, "data/generations");
  await cp(join(generations, "abc123"), join(generations, "deadbeef"), { recursive: true });
  const inactiveRuntimePath = join(generations, "deadbeef/runtime.json");
  const inactiveRuntime = JSON.parse(await readFile(inactiveRuntimePath, "utf8"));
  const rewrittenRuntime = JSON.parse(
    JSON.stringify(inactiveRuntime).replaceAll("abc123", "deadbeef"),
  );
  await writeFile(inactiveRuntimePath, `${JSON.stringify(rewrittenRuntime)}\n`, "utf8");
  const inactiveManifestPath = join(generations, "deadbeef/manifest.json");
  const inactiveManifest = JSON.parse(await readFile(inactiveManifestPath, "utf8"));
  inactiveManifest.emergingMarketUrl = inactiveManifest.emergingMarketUrl.replace(
    "abc123",
    "deadbeef",
  );
  await writeFile(inactiveManifestPath, `${JSON.stringify(inactiveManifest)}\n`, "utf8");
  await writeFile(
    join(generations, "deadbeef/bond-workbench.json"),
    `${JSON.stringify({ ...emptyWorkbenchSnapshot, schemaVersion: 2 })}\n`,
    "utf8",
  );

  await assert.rejects(
    stageStaticShowcase({ source, destination: join(root, "destination") }),
    /workbench|schemaVersion|hash/i,
  );
});

test("Sites staging copies a manifest-declared issuer research artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-research-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });

  await execFileAsync(process.execPath, [
    "scripts/stage-static-showcase.mjs",
    source,
    destination,
  ]);

  const publishedResearch = JSON.parse(await readFile(
    join(destination, "data/generations/abc123/cb-issuer-research.json"),
    "utf8",
  ));
  assert.deepEqual(publishedResearch, {
    ...Object.fromEntries(Object.entries(emptyIssuerResearchSnapshot).filter(([key]) => key !== "diagnostics")),
  });
  assert.equal(Object.hasOwn(publishedResearch, "diagnostics"), false);
});

test("Sites staging rejects declared issuer research without its runtime dataset key", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-research-runtime-"));
  const source = join(root, "source");
  await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: false });

  await assert.rejects(
    execFileAsync(process.execPath, [
      "scripts/stage-static-showcase.mjs",
      source,
      join(root, "destination"),
    ]),
    /issuer research|required dataset artifacts/i,
  );
});

test("Sites staging rejects a source without an active verified generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-missing-"));
  const source = join(root, "source");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "index.html"), "不完整", "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [
      "scripts/stage-static-showcase.mjs",
      source,
      join(root, "destination"),
    ]),
    /active generation pointer/i,
  );
});

const emptyIssuerResearchSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-31T06:00:00.000Z",
  records: [],
  sources: {
    listed: { status: "unavailable", dataDate: null, fetchedAt: null },
    otc: { status: "unavailable", dataDate: null, fetchedAt: null },
  },
  diagnostics: [],
};

const emptySupplementalSnapshot = {
  schemaVersion: 1,
  generatedAt: "2026-07-31T06:00:00.000Z",
  unitFaceValueTwd: null,
  institutionHistory: {},
  redemptions: [],
  underwritingCases: [],
  sources: {
    institution: { state: "unavailable", dataDate: null, periodYear: null },
    redemption: { state: "unavailable", dataDate: null, periodYear: null },
    underwriting: { state: "unavailable", dataDate: null, periodYear: null },
  },
};

const emptyWorkbenchSnapshot = buildBondWorkbenchSnapshot({
  generatedAt: "2026-07-31T06:00:00.000Z",
  dataDate: "2026-07-31",
  asOfDate: "2026-07-31",
  currentTerms: [],
  currentViews: [],
  currentEvents: [],
});

async function seedDeclaredIssuerResearchGeneration(
  source,
  {
    includeRuntimeKey,
    includeSupplemental = true,
    includeSupplementalRuntimeKey = includeSupplemental,
    includeWorkbench = true,
    includeWorkbenchRuntimeKey = includeWorkbench,
    includeLegacyIssuanceEntry = true,
    includeIpo = true,
    workbenchSnapshot = emptyWorkbenchSnapshot,
  },
) {
  const generation = join(source, "data", "generations", "abc123");
  await mkdir(generation, { recursive: true });
  await writeFile(join(source, "index.html"), "正式首頁", "utf8");
  await writeFile(
    join(source, "data", "current.json"),
    '{"schemaVersion":1,"generation":"generations/abc123","runtimeUrl":"./data/generations/abc123/runtime.json"}\n',
    "utf8",
  );
  const researchText = `${JSON.stringify(emptyIssuerResearchSnapshot, null, 2)}\n`;
  const viewsText = "[]\n";
  const supplementalText = `${JSON.stringify(emptySupplementalSnapshot, null, 2)}\n`;
  const workbenchText = `${JSON.stringify(workbenchSnapshot, null, 2)}\n`;
  const emptyArrayText = "[]\n";
  const workbenchSourceStateSummary = summarizeWorkbenchSourceStates(
    workbenchSnapshot,
  );
  await writeFile(join(generation, "cb-issuer-research.json"), researchText, "utf8");
  await writeFile(join(generation, "bond-market-view.json"), viewsText, "utf8");
  if (includeSupplemental) {
    await writeFile(
      join(generation, "bond-supplemental.json"),
      supplementalText,
      "utf8",
    );
  }
  if (includeWorkbench) {
    await writeFile(
      join(generation, "bond-workbench.json"),
      workbenchText,
      "utf8",
    );
  }
  await writeFile(
    join(generation, "manifest.json"),
    `${JSON.stringify({
      market: {
        status: "verified",
        dataDate: "2026-07-31",
        ...(includeSupplemental ? { requestedDate: "2026-07-31" } : {}),
        files: [
          {
            name: "cb-issuer-research.json",
            sha256: sha256Text(researchText),
            recordCount: 0,
          },
          {
            name: "bond-market-view.json",
            sha256: sha256Text(viewsText),
            recordCount: 0,
          },
          ...(includeSupplemental ? [{
            name: "bond-supplemental.json",
            sha256: sha256Text(supplementalText),
            recordCount: 0,
          }] : []),
          ...(includeWorkbench ? [{
            name: "bond-workbench.json",
            sha256: sha256Text(workbenchText),
            rawBytes: Buffer.byteLength(workbenchText),
            recordCount: workbenchSnapshot.records.length,
            schemaVersion: 1,
            sourceStateSummary: workbenchSourceStateSummary,
          }, {
            name: "bond-market-history.json",
            sha256: sha256Text(emptyArrayText),
            rawBytes: Buffer.byteLength(emptyArrayText),
            recordCount: 0,
          }, ...(includeLegacyIssuanceEntry ? [{
            name: "11406.json",
            sha256: sha256Text(emptyArrayText),
            rawBytes: Buffer.byteLength(emptyArrayText),
            recordCount: 0,
          }] : [])] : []),
        ],
        ...(includeSupplemental
          ? { supplementalSources: emptySupplementalSnapshot.sources }
          : {}),
        ...(includeWorkbench ? {
          workbenchSourceStateSummary,
          normalizedInputs: [{
            name: "11406.json",
            sha256: sha256Text(emptyArrayText),
            rawBytes: Buffer.byteLength(emptyArrayText),
            recordCount: 0,
          }],
        } : {}),
      },
      ...(includeWorkbench ? { datasets: [{
        datasetId: "11406",
        sourceUrl: "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
        downloadedAt: "2026-07-31",
        sha256: `sha256:${"a".repeat(64)}`,
        rawBytes: 100,
        rowCount: 0,
      }] } : {}),
      emergingMarketUrl: "./data/generations/abc123/emerging-market.json",
    })}\n`,
    "utf8",
  );
  if (includeIpo) {
    await writeIpoArtifact({
      source,
      generation: "generations/abc123",
      snapshot: validIpoSnapshot(),
    });
  }
  const datasets = {
    "94025": "./data/generations/abc123/94025.json",
    "11406": "./data/generations/abc123/11406.json",
    "11586": "./data/generations/abc123/11586.json",
    bondMarket: "./data/generations/abc123/bond-market-view.json",
    conversionPrices: "./data/generations/abc123/conversion-prices.json",
    bondHistory: "./data/generations/abc123/bond-market-history.json",
    ...(includeRuntimeKey
      ? { cbIssuerResearch: "./data/generations/abc123/cb-issuer-research.json" }
      : {}),
    ...(includeSupplementalRuntimeKey
      ? { bondSupplemental: "./data/generations/abc123/bond-supplemental.json" }
      : {}),
    ...(includeWorkbenchRuntimeKey
      ? { bondWorkbench: "./data/generations/abc123/bond-workbench.json" }
      : {}),
  };
  await writeFile(
    join(generation, "runtime.json"),
    `${JSON.stringify({
      generation: "generations/abc123",
      manifestUrl: "./data/generations/abc123/manifest.json",
      emergingMarketUrl: "./data/generations/abc123/emerging-market.json",
      ...(includeIpo
        ? { ipoEventsUrl: "./data/generations/abc123/ipo-events.json" }
        : {}),
      datasets,
    })}\n`,
    "utf8",
  );
  for (const file of [
    "emerging-market.json",
    "94025.json",
    "11406.json",
    "11586.json",
    "conversion-prices.json",
    "bond-market-history.json",
  ]) {
    await writeFile(
      join(generation, file),
      file === "emerging-market.json" ? '{"records":[]}\n' : "[]\n",
      "utf8",
    );
  }
}

async function seededGenerationWithIpoEvents({ includeWorkbench = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-ipo-events-"));
  const source = join(root, "source");
  const destination = join(root, "destination");
  const generation = "generations/abc123";
  const snapshot = validIpoSnapshot();
  await seedDeclaredIssuerResearchGeneration(source, {
    includeRuntimeKey: true,
    includeSupplemental: includeWorkbench,
    includeWorkbench,
  });
  await writeIpoArtifact({ source, generation, snapshot });
  const runtimePath = join(source, "data", generation, "runtime.json");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
  runtime.ipoEventsUrl = `./data/${generation}/ipo-events.json`;
  await writeFile(runtimePath, `${JSON.stringify(runtime)}\n`, "utf8");
  return { source, destination, generation, snapshot };
}

async function writeIpoArtifact({ source, generation, snapshot }) {
  const path = join(source, "data", generation, "ipo-events.json");
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  await writeFile(path, text, "utf8");
  const manifestPath = join(source, "data", generation, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.market.files = manifest.market.files.filter(
    (entry) => entry.name !== "ipo-events.json",
  );
  manifest.market.files.push({
    name: "ipo-events.json",
    sha256: sha256Text(text),
    rawBytes: Buffer.byteLength(text, "utf8"),
    recordCount: snapshot.records.length,
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
}

function validIpoSnapshot() {
  return {
    schemaVersion: 1,
    dataDate: "2026-08-24",
    generatedAt: "2026-08-24T09:00:00.000Z",
    sourceManifest: [
      {
        sourceId: "twse-applications",
        sourceUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
        downloadedAt: "2026-08-24T09:00:00.000Z",
        sha256: `sha256:${"1".repeat(64)}`,
        rawBytes: 1,
        rowCount: 1,
      },
      {
        sourceId: "tpex-applications",
        sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
        downloadedAt: "2026-08-24T09:00:00.000Z",
        sha256: `sha256:${"2".repeat(64)}`,
        rawBytes: 1,
        rowCount: 1,
      },
      {
        sourceId: "tpex-ipo-listings",
        sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit",
        downloadedAt: "2026-08-24T09:00:00.000Z",
        sha256: `sha256:${"3".repeat(64)}`,
        rawBytes: 1,
        rowCount: 1,
      },
      {
        sourceId: "twse-auctions",
        sourceUrl: "https://www.twse.com.tw/announcement/auction?response=json&yy=2026",
        downloadedAt: "2026-08-24T09:00:00.000Z",
        sha256: `sha256:${"4".repeat(64)}`,
        rawBytes: 1,
        rowCount: 1,
      },
      {
        sourceId: "twse-public-offerings",
        sourceUrl: "https://www.twse.com.tw/announcement/publicForm?response=json&yy=2026",
        downloadedAt: "2026-08-24T09:00:00.000Z",
        sha256: `sha256:${"5".repeat(64)}`,
        rawBytes: 1,
        rowCount: 1,
      },
    ],
    records: [{
      companyCode: "1234",
      companyName: "測試公司",
      market: "上市",
      stage: "A",
      exceptionStatus: null,
      applicationDate: "2026-08-25",
      reviewDate: null,
      boardDate: null,
      contractDate: null,
      listingDate: null,
      auction: null,
      publicOffering: null,
      provisionalUnderwritingPrice: null,
      finalUnderwritingPrice: null,
      underwriter: "",
      events: [{
        companyCode: "1234",
        market: "上市",
        kind: "application_submitted",
        date: "2026-08-25",
        label: "申請送件",
        sourceRecordIds: ["TWSE:1234:1150825"],
      }],
    }],
  };
}

function stageTerm() {
  return {
    bondCode: "90001", issuerCode: "9000", bondName: "公開樣本一", issuerName: "公開發行人甲",
    issueDate: "2024-01-01", listingDate: "2024-01-02", maturityDate: "2028-01-01",
    issueAmount: "100000000", outstandingAmount: "80000000", outstandingDataDate: "2026-07-31",
    initialConversionPrice: "40", conversionStartDate: "2024-02-01", conversionEndDate: "2027-12-31",
    putDates: [], putPrice: null, securedStatus: "無擔保", underwriter: null, trustee: null,
    unitFaceValueTwd: null,
  };
}

function stageView() {
  return {
    bondCode: "90001", issuerCode: "9000", bondName: "公開樣本一", issuerResearch: null,
    cbClose: "101", cbPriceDate: "2026-07-31", cbTradeUnits: "0",
    stockClose: "40", stockPriceDate: "2026-07-31",
    currentConversionPrice: "40", conversionPriceEffectiveDate: "2026-01-01",
    valuationDate: "2026-07-31", valuationCbClose: "101", valuationStockClose: "40",
    conversionValue: "100", premiumRate: "1", outstandingAmount: "80000000",
    outstandingDataDate: "2026-07-31", outstandingReductionRate: "20", remainingUnits: null,
    remainingRatio: "80", dailyTurnoverRate: null, institutionDataDate: null,
    institutionNetUnits: null, institutionNet5dUnits: null, institutionNet20dUnits: null,
    redemptionEvent: null, maturityDate: "2028-01-01", daysToMaturity: 519,
    nextPutDate: null, daysToNextPut: null, nextEventType: "maturity",
    nextEventDate: "2028-01-01", daysToNextEvent: 519, marketStatus: "NO_TRADE", dataQuality: "complete",
    staleCbPrice: false, missingReasons: [],
  };
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}
