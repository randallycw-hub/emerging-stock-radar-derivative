import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { validateSnapshotIdentity } from "./contracts.mjs";

export function defaultPrivateStoreRoot(env = process.env) {
  if (typeof env.LOCALAPPDATA !== "string" || env.LOCALAPPDATA.trim() === "") {
    throw new Error("LOCALAPPDATA is required for the private store");
  }
  return join(env.LOCALAPPDATA, "MarketSitePrivateData", "cb-import");
}

export function createPrivateStore({ root = defaultPrivateStoreRoot() } = {}) {
  if (typeof root !== "string" || !isAbsolute(root)) throw new TypeError("private store root must be absolute");
  const storeRoot = resolve(root);
  return Object.freeze({
    saveSnapshot: (snapshot) => saveSnapshot(storeRoot, snapshot),
    readSnapshot: (kind, sha256) => readSnapshot(storeRoot, kind, sha256),
    readLatest: (kind) => readLatest(storeRoot, kind),
    listSnapshots: (kind) => listSnapshots(storeRoot, kind),
  });
}

async function saveSnapshot(root, snapshot) {
  validateSnapshotIdentity(snapshot);
  const path = snapshotPath(root, snapshot.kind, snapshot.sha256);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, `${JSON.stringify(snapshot)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("private snapshot is immutable and already exists");
    throw error;
  }
  return Object.freeze({ id: snapshot.sha256, path });
}

async function readSnapshot(root, kind, sha256) {
  const path = snapshotPath(root, kind, sha256);
  return parseSnapshot(await readFile(path, "utf8"));
}

async function listSnapshots(root, kind) {
  const directory = join(root, "snapshots", kind);
  let names;
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const snapshots = await Promise.all(names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map(async (name) => (
    parseSnapshot(await readFile(join(directory, name), "utf8"))
  )));
  return snapshots.sort((left, right) => right.sourceDate.localeCompare(left.sourceDate) || right.sha256.localeCompare(left.sha256));
}

async function readLatest(root, kind) {
  return (await listSnapshots(root, kind))[0] ?? null;
}

function snapshotPath(root, kind, sha256) {
  const digest = /^sha256:([0-9a-f]{64})$/.exec(sha256 ?? "")?.[1];
  if (!digest) throw new TypeError("snapshot hash is invalid");
  return join(root, "snapshots", kind, `${digest}.json`);
}

function parseSnapshot(text) {
  let snapshot;
  try {
    snapshot = JSON.parse(text);
  } catch {
    throw new Error("private snapshot is invalid JSON");
  }
  return validateSnapshotIdentity(snapshot);
}
