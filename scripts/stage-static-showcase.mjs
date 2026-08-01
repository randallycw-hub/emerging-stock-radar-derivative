import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export async function stageStaticShowcase({
  source = "static-showcase",
  destination = "dist/client/market-site",
} = {}) {
  const pointer = await readJson(
    join(source, "data", "current.json"),
    "active generation pointer is missing or invalid",
  );
  if (!/^generations\/[a-f0-9]+$/i.test(pointer?.generation ?? "")) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const expectedRuntimeUrl = `./data/${pointer.generation}/runtime.json`;
  if (pointer.runtimeUrl !== expectedRuntimeUrl) {
    throw new Error("active generation pointer is missing or invalid");
  }
  const runtime = await readJson(
    join(source, pointer.runtimeUrl.replace(/^\.\//, "")),
    "active generation runtime is missing or invalid",
  );
  if (
    runtime?.generation !== pointer.generation
    || runtime?.manifestUrl !== `./data/${pointer.generation}/manifest.json`
  ) {
    throw new Error("active generation runtime is missing or invalid");
  }
  const manifest = await readJson(
    join(source, runtime.manifestUrl.replace(/^\.\//, "")),
    "active generation manifest is missing or invalid",
  );
  if (manifest?.market?.status !== "verified" || !manifest?.market?.dataDate) {
    throw new Error("active generation manifest is missing or invalid");
  }
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
}

async function readJson(path, message) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(message);
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;
if (entryUrl === import.meta.url) {
  await stageStaticShowcase({
    source: process.argv[2],
    destination: process.argv[3],
  });
}
