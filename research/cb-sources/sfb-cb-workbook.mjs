import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import readXlsxFile, { readSheetNames } from 'read-excel-file/node';
import { isIsoDate } from '../../lib/domain/dates.ts';
import { parseSfbCbFilingRows } from './source-cb-filing.ts';

const MAX_BYTES = 2_000_000;
const SHEET = 'IMP0080A_Upload';
export const SFB_CB_INDEX_URL = 'https://www.sfb.gov.tw/ch/home.jsp?id=1016&parentpath=0,6,52';

export function validateSfbAttachmentProvenance({ sourceUrl, sourceDate }) {
  if (!isIsoDate(sourceDate)) throw new TypeError('invalid SFB source date');
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'www.fsc.gov.tw' || url.port || url.username || url.password || url.search || url.hash) throw new TypeError('invalid SFB attachment origin');
  const match = /^\/userfiles\/file\/(\d{3})(\d{2})(\d{2})申報案件彙總表(?:v\d+|\(\d+\))?\.xlsx$/.exec(decodeURIComponent(url.pathname));
  if (!match || `${Number(match[1]) + 1911}-${match[2]}-${match[3]}` !== sourceDate) throw new TypeError('SFB attachment filename/date mismatch');
  return url.href;
}

/** Bound the archive before the XLSX library decompresses it. No extraction to disk. */
export function validateSfbWorkbookBytes(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) throw new TypeError('invalid SFB workbook size');
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50) throw new TypeError('SFB attachment is not an xlsx ZIP');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? '') || expectedSha256 !== sha256) throw new TypeError('SFB workbook hash mismatch');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new TypeError('unsupported workbook ZIP directory');
  const count = bytes.readUInt16LE(end + 10);
  const start = bytes.readUInt32LE(end + 16);
  if (count < 1 || count > 100 || count !== bytes.readUInt16LE(end + 8) || start + bytes.readUInt32LE(end + 12) !== end) throw new TypeError('invalid workbook ZIP directory bounds');
  let position = start;
  let expandedBytes = 0;
  const names = new Set();
  for (let i = 0; i < count; i += 1) {
    if (position + 46 > end || bytes.readUInt32LE(position) !== 0x02014b50) throw new TypeError('invalid workbook ZIP entry');
    const flags = bytes.readUInt16LE(position + 8);
    const method = bytes.readUInt16LE(position + 10);
    const length = bytes.readUInt16LE(position + 28);
    const next = position + 46 + length + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
    if (next > end || flags & 1 || ![0, 8].includes(method)) throw new TypeError('unsupported workbook ZIP entry');
    const name = bytes.subarray(position + 46, position + 46 + length).toString('utf8');
    if (!name || name.startsWith('/') || /\\|(^|\/)\.\.(\/|$)|:|\0|vbaProject|externalLinks/i.test(name) || names.has(name)) throw new TypeError('unsafe workbook ZIP entry name');
    names.add(name);
    expandedBytes += bytes.readUInt32LE(position + 24);
    if (expandedBytes > 10_000_000) throw new TypeError('expanded workbook size exceeds limit');
    const local = bytes.readUInt32LE(position + 42);
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) throw new TypeError('invalid workbook ZIP local entry');
    const localNameLength = bytes.readUInt16LE(local + 26);
    const bodyStart = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    if (bodyStart > start || bodyStart + bytes.readUInt32LE(position + 20) > start
      || bytes.subarray(local + 30, local + 30 + localNameLength).toString('utf8') !== name
      || bytes.readUInt16LE(local + 6) !== flags || bytes.readUInt16LE(local + 8) !== method) throw new TypeError('inconsistent workbook ZIP local entry');
    position = next;
  }
  if (position !== end) throw new TypeError('trailing workbook ZIP directory content');
  return { sha256, rawBytes: bytes.length, expandedBytes };
}

export async function readSfbCbFilingWorkbook({ absolutePath, sourceUrl, sourceDate, expectedSha256 }) {
  const canonicalUrl = validateSfbAttachmentProvenance({ sourceUrl, sourceDate });
  const info = await stat(absolutePath);
  if (!info.isFile() || info.size > MAX_BYTES) throw new TypeError('invalid SFB workbook size');
  const bytes = await readFile(absolutePath);
  const integrity = validateSfbWorkbookBytes(bytes, expectedSha256);
  const names = await readSheetNames(bytes);
  if (names.length !== 1 || names[0] !== SHEET) throw new TypeError('unexpected SFB worksheet');
  const rows = await readXlsxFile(bytes, { sheet: SHEET });
  const parsed = parseSfbCbFilingRows({ rows, sourceDate });
  if (parsed.records.length === 0) throw new TypeError('SFB workbook contains no domestic CB filings');
  return { ...parsed, provenance: { sourceUrl: canonicalUrl, sourceIndexUrl: SFB_CB_INDEX_URL, worksheet: SHEET, ...integrity } };
}
