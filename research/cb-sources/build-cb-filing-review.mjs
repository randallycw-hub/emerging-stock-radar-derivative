import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isIsoDate } from '../../lib/domain/dates.ts';
import { reviewCbFilingMatches } from './source-cb-filing.ts';
import { readSfbCbFilingWorkbook } from './sfb-cb-workbook.mjs';

export function buildCbFilingReview({ filings, canonical }) {
  if (!isIsoDate(filings?.sourceDate) || !isIsoDate(canonical?.dataDate)) throw new TypeError('filing/canonical data date is required');
  if (!Array.isArray(filings.records) || !Array.isArray(canonical.records)) throw new TypeError('filing/canonical records are required');
  const bonds = canonical.records.map((record) => ({
    bondCode: record.cbCode, issuerCode: record.stockCode,
    issueAmount: record.terms?.issueAmount ?? null, securedStatus: record.terms?.securedStatus ?? null,
    issueDate: record.terms?.issueDate ?? null,
  }));
  const matches = reviewCbFilingMatches(filings.records, bonds);
  const byBond = new Map();
  for (const match of matches.filter((entry) => entry.matchStatus !== 'terminated')) {
    for (const code of match.candidateBondCodes) {
      if (!byBond.has(code)) byBond.set(code, new Set());
      byBond.get(code).add(match.recordRef);
    }
  }
  const summary = { total: filings.records.length, effective: 0, pending: 0, suspended: 0, withdrawn: 0, rejected: 0, revoked: 0 };
  const records = filings.records.map((record, index) => {
    if (!Object.hasOwn(summary, record.status) || record.status === 'total') throw new TypeError('invalid filing status');
    summary[record.status] += 1;
    const match = matches[index];
    const competingCaseRefs = match.matchStatus === 'terminated' ? [] : [...new Set(match.candidateBondCodes.flatMap((code) => [...byBond.get(code)]))].filter((ref) => ref !== record.recordRef).sort();
    return { ...record, match: { ...match, matchStatus: competingCaseRefs.length ? 'ambiguous' : match.matchStatus, competingCaseRefs } };
  });
  return {
    schemaVersion: 1, purpose: 'internal_candidate_review', publishable: false,
    sourceDate: filings.sourceDate, canonicalDataDate: canonical.dataDate,
    provenance: filings.provenance, summary, records,
  };
}

async function main(args) {
  if (args.length !== 8) throw new TypeError('usage: --file PATH --source-url URL --source-date YYYY-MM-DD --sha256 HASH');
  const values = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--file', '--source-url', '--source-date', '--sha256'].includes(args[i]) || Object.hasOwn(values, args[i])) throw new TypeError('invalid filing review argument');
    values[args[i]] = args[i + 1];
  }
  const filings = await readSfbCbFilingWorkbook({ absolutePath: resolve(values['--file']), sourceUrl: values['--source-url'], sourceDate: values['--source-date'], expectedSha256: values['--sha256'] });
  const root = new URL('../../dist/client/market-site/data/', import.meta.url);
  const pointer = JSON.parse(await readFile(new URL('current.json', root), 'utf8'));
  if (!/^generations\/[a-f0-9]{16}$/.test(pointer.generation ?? '')) throw new TypeError('invalid local canonical generation');
  const canonical = JSON.parse(await readFile(new URL(`${pointer.generation}/cb-workbench-v55.json`, root), 'utf8'));
  const result = buildCbFilingReview({ filings, canonical });
  result.canonicalGeneration = pointer.generation;
  const outputDir = new URL(`../../.cache/cb-filing-review/${filings.sourceDate}/`, import.meta.url);
  await mkdir(outputDir, { recursive: true });
  const output = new URL(`${filings.provenance.sha256}.json`, outputDir);
  const content = `${JSON.stringify(result, null, 2)}\n`;
  try { await writeFile(output, content, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST' || await readFile(output, 'utf8') !== content) throw error;
  }
  console.log(JSON.stringify({ summary: result.summary, candidateCounts: Object.fromEntries(['candidate', 'ambiguous', 'unmatched', 'terminated'].map((status) => [status, result.records.filter((record) => record.match.matchStatus === status).length])), sourceDate: result.sourceDate, canonicalDataDate: result.canonicalDataDate, publishable: false, output: output.pathname }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
