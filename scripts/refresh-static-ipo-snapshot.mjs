import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { refreshOfficialIpoSnapshot } from "../lib/ipo-events/refresh.ts";
import { assertIpoEventSnapshot } from "../lib/ipo-events/snapshot.ts";
import { buildGenerationRuntime } from "./refresh-static-showcase-data.mjs";

const defaultDataDirectory = "static-showcase/data";

export async function publishStaticIpoSnapshot({
  dataDirectory = defaultDataDirectory,
  snapshot,
  fetchImpl = globalThis.fetch,
  now = new Date(),
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("IPO publication now must be a valid Date");
  }
  const resolvedDataDirectory = resolve(dataDirectory);
  const active = await readActiveGeneration(resolvedDataDirectory);
  const nextSnapshot = snapshot ?? await refreshOfficialIpoSnapshot({
    fetchImpl,
    now,
    excludeCompleted: true,
  });
  assertIpoEventSnapshot(nextSnapshot);

  const generation = `generations/${createHash("sha256")
    .update(JSON.stringify({ prior: active.pointer.generation, snapshot: nextSnapshot, now: now.toISOString() }))
    .digest("hex")
    .slice(0, 16)}`;
  const targetRoot = join(resolvedDataDirectory, generation);
  const stagingRoot = await mkdtemp(join(dirname(resolvedDataDirectory), ".ipo-publication-"));
  const stagedGenerationRoot = join(stagingRoot, generation.split("/")[1]);

  try {
    await cp(active.root, stagedGenerationRoot, { recursive: true, errorOnExist: true });
    const manifest = JSON.parse(await readFile(join(stagedGenerationRoot, "manifest.json"), "utf8"));
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("INVALID_ACTIVE_GENERATION_MANIFEST");
    }
    const snapshotText = `${JSON.stringify(nextSnapshot, null, 2)}\n`;
    if (!Array.isArray(manifest.market?.files)) {
      throw new Error("INVALID_ACTIVE_GENERATION_MANIFEST");
    }
    manifest.market.files = [
      ...manifest.market.files.filter((entry) => entry?.name !== "ipo-events.json"),
      {
        name: "ipo-events.json",
        sha256: sha256Text(snapshotText),
        rawBytes: Buffer.byteLength(snapshotText, "utf8"),
        recordCount: nextSnapshot.records.length,
      },
    ];
    manifest.emergingMarketUrl = `./data/${generation}/emerging-market.json`;
    await writeFile(join(stagedGenerationRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(join(stagedGenerationRoot, "ipo-events.json"), snapshotText, "utf8");
    await writeFile(
      join(stagedGenerationRoot, "runtime.json"),
      `${JSON.stringify(buildGenerationRuntime(generation, manifest), null, 2)}\n`,
      "utf8",
    );
    await assertStagedIpoGeneration({ root: stagedGenerationRoot, generation });

    await mkdir(join(resolvedDataDirectory, "generations"), { recursive: true });
    await rename(stagedGenerationRoot, targetRoot);
    const pointer = {
      schemaVersion: 1,
      generation,
      runtimeUrl: `./data/${generation}/runtime.json`,
    };
    const pointerStage = join(stagingRoot, "current.json");
    await writeFile(pointerStage, `${JSON.stringify(pointer)}\n`, "utf8");
    await rename(pointerStage, join(resolvedDataDirectory, "current.json"));
    return { generation, dataDate: nextSnapshot.dataDate, records: nextSnapshot.records.length };
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

function sha256Text(text) {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

async function readActiveGeneration(dataDirectory) {
  const pointer = JSON.parse(await readFile(join(dataDirectory, "current.json"), "utf8"));
  const generation = pointer?.generation;
  if (
    pointer === null
    || typeof pointer !== "object"
    || Array.isArray(pointer)
    || pointer.schemaVersion !== 1
    || !/^generations\/[a-f0-9]+$/i.test(generation ?? "")
    || pointer.runtimeUrl !== `./data/${generation}/runtime.json`
  ) {
    throw new Error("INVALID_CURRENT_GENERATION_POINTER");
  }
  const root = join(dataDirectory, generation);
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (
    manifest === null
    || typeof manifest !== "object"
    || Array.isArray(manifest)
    || manifest.market === null
    || typeof manifest.market !== "object"
    || Array.isArray(manifest.market)
    || !Array.isArray(manifest.market.files)
  ) {
    throw new Error("INVALID_ACTIVE_GENERATION_MANIFEST");
  }
  return { pointer, root };
}

async function assertStagedIpoGeneration({ root, generation }) {
  const [snapshotText, runtimeText, manifestText] = await Promise.all([
    readFile(join(root, "ipo-events.json"), "utf8"),
    readFile(join(root, "runtime.json"), "utf8"),
    readFile(join(root, "manifest.json"), "utf8"),
  ]);
  const snapshot = JSON.parse(snapshotText);
  const runtime = JSON.parse(runtimeText);
  const manifest = JSON.parse(manifestText);
  assertIpoEventSnapshot(snapshot);
  if (
    runtime?.generation !== generation
    || runtime.ipoEventsUrl !== `./data/${generation}/ipo-events.json`
    || runtime.manifestUrl !== `./data/${generation}/manifest.json`
    || manifest?.emergingMarketUrl !== `./data/${generation}/emerging-market.json`
  ) {
    throw new Error("INVALID_STAGED_IPO_GENERATION");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await publishStaticIpoSnapshot();
  console.log(JSON.stringify(result));
}
