import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { stageStaticShowcase } from "../scripts/stage-static-showcase.mjs";
import { buildBondWorkbenchSnapshot } from "../lib/market-data/bond-workbench.ts";
import { summarizeWorkbenchSourceStates } from "../scripts/build-bond-market-snapshot.mjs";

const execFileAsync = promisify(execFile);

test("Sites staging copies the complete static showcase including the active generation", async () => {
  const root = await mkdtemp(join(tmpdir(), "showcase-stage-"));
  const source = join(root, "source");
  const destination = join(root, "dist", "client", "market-site");
  await mkdir(join(source, "assets"), { recursive: true });
  await mkdir(join(source, "data", "generations", "abc123"), { recursive: true });
  await writeFile(join(source, "index.html"), "正式首頁", "utf8");
  await writeFile(join(source, "assets", "app.css"), "body{}", "utf8");
  await writeFile(
    join(source, "assets", "bond-technical-analysis.js"),
    "export const analysis = 'shared';\n",
    "utf8",
  );
  await writeFile(
    join(source, "data", "current.json"),
    '{"schemaVersion":1,"generation":"generations/abc123","runtimeUrl":"./data/generations/abc123/runtime.json"}\n',
    "utf8",
  );
  await writeFile(
    join(source, "data", "generations", "abc123", "manifest.json"),
    '{"market":{"status":"verified","dataDate":"2026-07-31"},"emergingMarketUrl":"./data/generations/abc123/emerging-market.json"}\n',
    "utf8",
  );
  await writeFile(
    join(source, "data", "generations", "abc123", "runtime.json"),
    '{"generation":"generations/abc123","manifestUrl":"./data/generations/abc123/manifest.json","emergingMarketUrl":"./data/generations/abc123/emerging-market.json","datasets":{"94025":"./data/generations/abc123/94025.json","11406":"./data/generations/abc123/11406.json","11586":"./data/generations/abc123/11586.json","bondMarket":"./data/generations/abc123/bond-market-view.json","conversionPrices":"./data/generations/abc123/conversion-prices.json","bondHistory":"./data/generations/abc123/bond-market-history.json"}}\n',
    "utf8",
  );
  for (const file of [
    "emerging-market.json",
    "94025.json",
    "11406.json",
    "11586.json",
    "bond-market-view.json",
    "conversion-prices.json",
    "bond-market-history.json",
  ]) {
    await writeFile(
      join(source, "data", "generations", "abc123", file),
      file === "emerging-market.json" ? '{"records":[]}\n' : "[]\n",
      "utf8",
    );
  }

  await execFileAsync(process.execPath, [
    "scripts/stage-static-showcase.mjs",
    source,
    destination,
  ]);

  assert.equal(await readFile(join(destination, "index.html"), "utf8"), "正式首頁");
  assert.equal(await readFile(join(destination, "assets", "app.css"), "utf8"), "body{}");
  assert.equal(
    await readFile(
      join(destination, "assets", "bond-technical-analysis.js"),
      "utf8",
    ),
    "export const analysis = 'shared';\n",
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(destination, "data", "current.json"), "utf8")),
    {
      schemaVersion: 1,
      generation: "generations/abc123",
      runtimeUrl: "./data/generations/abc123/runtime.json",
    },
  );
  assert.deepEqual(
    JSON.parse(await readFile(
      join(destination, "data", "generations", "abc123", "manifest.json"),
      "utf8",
    )),
    {
      market: { status: "verified", dataDate: "2026-07-31" },
      emergingMarketUrl: "./data/generations/abc123/emerging-market.json",
    },
  );
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
    /required dataset artifacts/i,
  );
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

test("Sites staging preserves allowed legacy root data and multiple hex generations", async () => {
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
  assert.equal(
    await readFile(join(destination, "data/generations/deadbeef/94025.json"), "utf8"),
    "[]\n",
  );
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
    await seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey: true });
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

  assert.deepEqual(
    JSON.parse(await readFile(
      join(destination, "data/generations/abc123/cb-issuer-research.json"),
      "utf8",
    )),
    emptyIssuerResearchSnapshot,
  );
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
    includeSupplemental = false,
    includeSupplementalRuntimeKey = includeSupplemental,
    includeWorkbench = false,
    includeWorkbenchRuntimeKey = includeWorkbench,
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
  const workbenchText = `${JSON.stringify(emptyWorkbenchSnapshot, null, 2)}\n`;
  const emptyArrayText = "[]\n";
  const workbenchSourceStateSummary = summarizeWorkbenchSourceStates(
    emptyWorkbenchSnapshot,
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
            recordCount: 0,
            schemaVersion: 1,
            sourceStateSummary: workbenchSourceStateSummary,
          }, {
            name: "bond-market-history.json",
            sha256: sha256Text(emptyArrayText),
            rawBytes: Buffer.byteLength(emptyArrayText),
            recordCount: 0,
          }, {
            name: "11406.json",
            sha256: sha256Text(emptyArrayText),
            rawBytes: Buffer.byteLength(emptyArrayText),
            recordCount: 0,
          }] : []),
        ],
        ...(includeSupplemental
          ? { supplementalSources: emptySupplementalSnapshot.sources }
          : {}),
        ...(includeWorkbench ? { workbenchSourceStateSummary } : {}),
      },
      emergingMarketUrl: "./data/generations/abc123/emerging-market.json",
    })}\n`,
    "utf8",
  );
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

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}
