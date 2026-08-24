import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateImportFile } from "../../lib/private-cb-import/contracts.mjs";
import { createPrivateStore } from "../../lib/private-cb-import/storage.mjs";

test("private snapshots are immutable and never use the site root", async () => {
  const root = await mkdtemp(join(tmpdir(), "cb-private-store-"));
  const store = createPrivateStore({ root });
  const snapshot = {
    kind: "cbas",
    sourceDate: "2026-08-24",
    sourceRights: "licensed-private",
    sha256: `sha256:${"a".repeat(64)}`,
    records: [],
    diagnostics: [],
  };

  const saved = await store.saveSnapshot(snapshot);
  assert.match(saved.path, /cb-private-store-/);
  assert.deepEqual(JSON.parse(await readFile(saved.path, "utf8")), snapshot);
  await assert.rejects(
    () => store.saveSnapshot({ ...snapshot, records: [{ bondCode: "17172" }] }),
    /immutable/i,
  );
  assert.equal((await store.readLatest("cbas")).sha256, snapshot.sha256);
});

test("input validation rejects macros, oversize files, relative paths and non-ZIP bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cb-private-input-"));
  const xlsxPath = join(root, "input.xlsx");
  const textPath = join(root, "input.xlsx.txt");
  const fakeXlsxPath = join(root, "input.xlsx");
  await writeFile(fakeXlsxPath, "not a zip", "utf8");
  await writeFile(textPath, "not a zip", "utf8");

  await assert.rejects(() => validateImportFile({ filePath: join(root, "input.xlsm") }), /\.xlsx/i);
  await assert.rejects(() => validateImportFile({ filePath: "input.xlsx" }), /absolute/i);
  await assert.rejects(() => validateImportFile({ filePath: textPath }), /\.xlsx/i);
  await assert.rejects(() => validateImportFile({ filePath: fakeXlsxPath }), /ZIP signature/i);
  await writeFile(xlsxPath, Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]));
  await assert.rejects(() => validateImportFile({ filePath: xlsxPath, maxBytes: 8 }), /size/i);
});
