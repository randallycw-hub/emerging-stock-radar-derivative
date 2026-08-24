import { createHash } from "node:crypto";
import { lstat, open, readFile } from "node:fs/promises";
import { extname, isAbsolute, resolve } from "node:path";

export const PRIVATE_SOURCE_RIGHTS = new Set(["licensed-private", "licensed-public"]);
export const PRIVATE_DATASET_KINDS = new Set(["cbas", "issuance"]);

export async function validateImportFile({ filePath, maxBytes = 15 * 1024 * 1024 } = {}) {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) {
    throw new TypeError("input file path must be absolute");
  }
  if (extname(filePath).toLowerCase() !== ".xlsx") {
    throw new TypeError("only .xlsx files are accepted");
  }
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError("maximum file size must be a positive integer");
  }
  const absolutePath = resolve(filePath);
  const stat = await lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes) {
    throw new RangeError("input file size or type is invalid");
  }
  const handle = await open(absolutePath, "r");
  try {
    const signature = Buffer.alloc(4);
    const { bytesRead } = await handle.read(signature, 0, 4, 0);
    if (bytesRead !== 4 || !signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new TypeError("input is missing XLSX ZIP signature");
    }
  } finally {
    await handle.close();
  }
  return Object.freeze({
    absolutePath,
    bytes: stat.size,
    sha256: `sha256:${createHash("sha256").update(await readFile(absolutePath)).digest("hex")}`,
  });
}

export function validateSnapshotIdentity(snapshot) {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("snapshot must be an object");
  }
  if (!PRIVATE_DATASET_KINDS.has(snapshot.kind)) throw new TypeError("snapshot kind is invalid");
  if (!isIsoDate(snapshot.sourceDate)) throw new TypeError("snapshot source date is invalid");
  if (!PRIVATE_SOURCE_RIGHTS.has(snapshot.sourceRights)) throw new TypeError("snapshot source rights are invalid");
  if (!/^sha256:[0-9a-f]{64}$/.test(snapshot.sha256 ?? "")) throw new TypeError("snapshot hash is invalid");
  if (!Array.isArray(snapshot.records) || !Array.isArray(snapshot.diagnostics)) {
    throw new TypeError("snapshot records and diagnostics must be arrays");
  }
  return snapshot;
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
