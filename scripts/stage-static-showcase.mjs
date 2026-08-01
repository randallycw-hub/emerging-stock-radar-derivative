import { cp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function stageStaticShowcase({
  source = "static-showcase",
  destination = "dist/client/market-site",
} = {}) {
  await rm(destination, { recursive: true, force: true });
  await cp(source, destination, { recursive: true, force: true });
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
