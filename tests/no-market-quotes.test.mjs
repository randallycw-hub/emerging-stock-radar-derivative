import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoots = ["app", "lib", "worker", "db", "public", "scripts"];
const rootFiles = [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "vite.config.ts",
  "drizzle.config.ts",
  ".openai/hosting.json",
];

async function filesUnder(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else files.push(child);
  }
  return files;
}

async function formalFiles() {
  const nested = (await Promise.all(sourceRoots.map(filesUnder))).flat();
  const existingRootFiles = [];
  for (const relativePath of rootFiles) {
    await readFile(path.join(root, relativePath)).then(() => existingRootFiles.push(relativePath)).catch(() => undefined);
  }
  return [...nested, ...existingRootFiles].filter(file => !/\.(?:png|jpg|jpeg|gif|ico)$/i.test(file));
}

test("formal project has no prohibited quote provider or market-price feature", async () => {
  const provider = ["Ya", "hoo"].join("");
  const patterns = [
    new RegExp(provider, "i"),
    /query[12]\.finance/i,
    /tw\.stock\./i,
    new RegExp(`/api/${provider}`, "i"),
    /即時行情|延遲行情|即時股價|延遲股價|第三方行情/,
  ];
  const violations = [];
  for (const relativePath of await formalFiles()) {
    const source = (await readFile(path.join(root, relativePath), "utf8"))
      .replaceAll("官方資料來源建置中，目前不提供即時或延遲行情。", "");
    for (const pattern of patterns) {
      if (pattern.test(source)) violations.push(`${relativePath}: ${pattern}`);
    }
  }
  assert.deepEqual(violations, []);
  await assert.rejects(readFile(path.join(root, "lib", `${provider.toLowerCase()}.ts`)));
  await assert.rejects(readFile(path.join(root, "lib", "adapters", `${provider.toLowerCase()}.ts`)));
  await assert.rejects(readFile(path.join(root, "lib", "adapters", "market.ts")));
  await assert.rejects(readFile(path.join(root, "lib", "adapters", "quote.ts")));
  await assert.rejects(readFile(path.join(root, "app", "api", provider.toLowerCase(), "route.ts")));
  await assert.rejects(readFile(path.join(root, "app", "api", "market", "route.ts")));
  const dashboard = await readFile(path.join(root, "app", "Dashboard.tsx"), "utf8");
  assert.match(dashboard, /興櫃收盤價市場表/);
  assert.match(dashboard, /不提供買價、賣價或盤中更新/);
});

test("formal brand and fixed subtitle are consistent", async () => {
  const requiredFiles = ["app/layout.tsx", "app/Dashboard.tsx", "README.md", "package.json"];
  const oldBrand = ["興櫃", "雷達｜獨立衍生版"].join("");
  for (const relativePath of requiredFiles) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    assert.match(source, /興債觀測網/, relativePath);
    assert.match(source, /興櫃公司、可轉債與上市櫃進度資訊/, relativePath);
    assert.doesNotMatch(source, new RegExp(oldBrand), relativePath);
  }
});
