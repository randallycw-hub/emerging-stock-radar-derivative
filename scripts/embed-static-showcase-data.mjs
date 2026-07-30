import { readFile, writeFile } from "node:fs/promises";

const runtimePath = "static-showcase/data/runtime.js";
const manifest = JSON.parse(await readFile("static-showcase/data/manifest.json", "utf8"));
const embeddedData = {};
for (const dataset of manifest.datasets) {
  embeddedData[dataset.datasetId] = JSON.parse(await readFile(`static-showcase/data/${dataset.datasetId}.json`, "utf8"));
}
if (manifest.emergingMarketUrl) {
  embeddedData.emergingMarket = JSON.parse(
    await readFile("static-showcase/data/emerging-market.json", "utf8"),
  );
}

let runtime = await readFile(runtimePath, "utf8");
const start = runtime.indexOf("try {\n  const manifest = await fetch");
const endMarker = ");\n  const [revenue, bonds, ipo] = await Promise.all(manifest.datasets.map((dataset) => fetch(`./data/${dataset.datasetId}.json`).then((response) => response.json())));";
const end = runtime.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error("runtime fetch block not found");
const replacement = `const manifest = ${JSON.stringify(manifest)};\nconst embeddedData = ${JSON.stringify(embeddedData)};\nconst revenue = embeddedData["94025"];\nconst bonds = embeddedData["11406"];\nconst ipo = embeddedData["11586"];\nconst emergingMarket = embeddedData.emergingMarket;\ntry {`;
runtime = replacement + runtime.slice(end + endMarker.length);
await writeFile(runtimePath, runtime, "utf8");
console.log(Object.fromEntries(Object.entries(embeddedData).map(([id, rows]) => [id, rows.length])));
