import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Sites build packages the reviewed D1 migrations", async () => {
  const source = await readFile(new URL("../build/sites-vite-plugin.ts", import.meta.url), "utf8");
  assert.match(source, /migrationsSource = resolve\(root, "migrations"\)/);
  assert.match(source, /resolve\(outputDirectory, "migrations"\)/);
  const viteConfig = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(viteConfig, /migrations_dir/);
  assert.match(source, /resolve\(root, "dist", "\.openai"\)/);
});
