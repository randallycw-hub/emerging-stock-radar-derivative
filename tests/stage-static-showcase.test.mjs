import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
    '{"market":{"status":"verified","dataDate":"2026-07-31"}}\n',
    "utf8",
  );
  await writeFile(
    join(source, "data", "generations", "abc123", "runtime.json"),
    '{"generation":"generations/abc123","manifestUrl":"./data/generations/abc123/manifest.json"}\n',
    "utf8",
  );

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
    { market: { status: "verified", dataDate: "2026-07-31" } },
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
