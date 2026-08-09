import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

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

async function seedDeclaredIssuerResearchGeneration(source, { includeRuntimeKey }) {
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
  await writeFile(join(generation, "cb-issuer-research.json"), researchText, "utf8");
  await writeFile(join(generation, "bond-market-view.json"), viewsText, "utf8");
  await writeFile(
    join(generation, "manifest.json"),
    `${JSON.stringify({
      market: {
        status: "verified",
        dataDate: "2026-07-31",
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
        ],
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
