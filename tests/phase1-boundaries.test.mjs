import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["app", "lib", "worker", "db", "scripts"];
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".sql", ".json"]);
const prohibitedFields = [
  ["pri", "ce"].join(""),
  ["pric", "ing"].join(""),
  ["qu", "ote"].join(""),
  ["vol", "ume"].join(""),
  ["change", "Percent"].join(""),
  ["candle", "stick"].join(""),
];

async function filesUnder(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(child);
  }
  return files;
}

export async function assertNoProhibitedMarketFeatures(files) {
  const provider = ["Ya", "hoo"].join("");
  const identifierPattern = new RegExp(
    `\\b[A-Za-z_$][\\w$]*(?:${prohibitedFields.join("|")})[\\w$]*\\b`,
    "gi",
  );
  const violations = [];

  for (const relativePath of files) {
    const normalizedPath = relativePath.replaceAll("\\", "/");
    const source = (await readFile(path.join(root, relativePath), "utf8"))
      .replaceAll("paidInCapital", "");

    if (/\/api\/(?:market|yahoo)(?:\/|$)/i.test(normalizedPath)) {
      violations.push(`${normalizedPath}: prohibited route`);
    }
    if (/\/adapters\/[^/]*(?:market|quote|yahoo)/i.test(normalizedPath)) {
      violations.push(`${normalizedPath}: prohibited adapter`);
    }
    if (new RegExp(provider, "i").test(source)) {
      violations.push(`${normalizedPath}: prohibited provider`);
    }

    for (const match of source.matchAll(identifierPattern)) {
      violations.push(`${normalizedPath}: prohibited field ${match[0]}`);
    }
  }

  assert.deepEqual([...new Set(violations)], []);
}

test("formal code has no provider, route, adapter, or market-price field", async () => {
  const files = (await Promise.all(sourceRoots.map(filesUnder))).flat();
  await assertNoProhibitedMarketFeatures(files);
});
