import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sites } from "../build/sites-vite-plugin.ts";

function closeBundleHandler(plugin) {
  return typeof plugin.closeBundle === "function"
    ? plugin.closeBundle
    : plugin.closeBundle.handler;
}

test("Sites packaging leaves the shared output untouched for a non-client environment", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sites-vite-plugin-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  await Promise.all([
    mkdir(join(root, ".openai"), { recursive: true }),
    mkdir(join(root, "drizzle"), { recursive: true }),
    mkdir(join(root, "migrations"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, ".openai", "hosting.json"), '{"site":"test"}\n'),
    writeFile(join(root, "drizzle", "schema.ts"), "export {};\n"),
    writeFile(join(root, "migrations", "0001.sql"), "SELECT 1;\n"),
  ]);

  const plugin = sites();
  plugin.configResolved({ root });
  const closeBundle = closeBundleHandler(plugin);

  await closeBundle.call({ environment: { name: "client" } });
  assert.equal(
    await readFile(join(root, "dist", ".openai", "hosting.json"), "utf8"),
    '{"site":"test"}\n',
  );
  assert.equal(
    await readFile(join(root, "dist", ".openai", "drizzle", "schema.ts"), "utf8"),
    "export {};\n",
  );
  assert.equal(
    await readFile(join(root, "dist", ".openai", "migrations", "0001.sql"), "utf8"),
    "SELECT 1;\n",
  );

  const sentinel = join(root, "dist", ".openai", "non-client-sentinel");
  await writeFile(sentinel, "keep\n");
  await closeBundle.call({ environment: { name: "ssr" } });

  assert.equal(await readFile(sentinel, "utf8"), "keep\n");
});
