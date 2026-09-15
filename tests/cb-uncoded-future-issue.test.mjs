import assert from 'node:assert/strict';
import test from 'node:test';
import { bondTermSummariesFrom11406Rows } from '../scripts/lib/bond-inputs-from-11406.mjs';
import { buildCbWorkbenchV53 } from '../static-showcase/assets/cb-workbench-v53.js';
import { verifyRosterDoesNotLeadMarketDate } from '../scripts/refresh-static-showcase-data.mjs';

const future = {
  資料日期: '20260914', 機構代碼: '2646', 機構名稱: '星宇航空',
  債券代碼: '', 債券簡稱: '', 債券種類: '5', 募集方式: '7', 上市櫃否: '2',
  發行日期: '20260930', 掛牌日期: '20260930', 到期日期: '20310930',
  發行總額: '1500000000', 目前餘額: '1500000000',
};

function project(rows, dataDate = '2026-09-14') {
  return buildCbWorkbenchV53({ workbench: { dataDate, records: [] }, issuanceRows: rows });
}

test('future unassigned issues retain raw source fields without inventing a public CB identity', () => {
  const rows = [structuredClone(future)];
  assert.deepEqual(bondTermSummariesFrom11406Rows(rows), []);
  const result = project(rows);
  assert.deepEqual(result.records, []);
  assert.deepEqual(result.issuance, []);
  assert.deepEqual(rows, [future], 'source rows remain intact for later assignment and audit');
  assert.doesNotThrow(() => verifyRosterDoesNotLeadMarketDate(rows, '2026-09-14'));
});

test('missing identity still blocks issued, undated, malformed, or non-CB public rows', () => {
  for (const change of [
    { 發行日期: '20260914', 掛牌日期: '20260914' },
    { 發行日期: '20260901' },
    { 掛牌日期: '' },
    { 掛牌日期: '20260931' },
    { 到期日期: '20260929' },
    { 資料日期: '' },
    { 機構代碼: '' },
    { 機構代碼: 2646 },
    { 債券種類: '9' },
    { 債券代碼: 'BAD-CODE' },
  ]) {
    const rows = [{ ...future, ...change }];
    assert.throws(() => bondTermSummariesFrom11406Rows(rows), /bond code/);
    assert.throws(() => project(rows), /bond code/);
  }
});

test('the unassigned-code exception expires on issue day even when source rows stay unchanged', () => {
  const rows = [future];
  assert.deepEqual(bondTermSummariesFrom11406Rows(rows, '2026-09-29'), []);
  assert.doesNotThrow(() => verifyRosterDoesNotLeadMarketDate(rows, '2026-09-29'));
  assert.doesNotThrow(() => project(rows, '2026-09-29'));
  for (const asOfDate of ['2026-09-30', '2026-10-01']) {
    assert.throws(() => bondTermSummariesFrom11406Rows(rows, asOfDate), /bond code/);
    assert.throws(() => verifyRosterDoesNotLeadMarketDate(rows, asOfDate), /bond code/);
    assert.throws(() => project(rows, asOfDate), /bond code/);
  }
  assert.doesNotThrow(() => project(rows), 'historical snapshots remain reproducible after the issue date');
});

test('an unassigned future issue cannot hide a roster published after the execution date', () => {
  assert.throws(() => verifyRosterDoesNotLeadMarketDate([{ ...future, 資料日期: '20260915' }], '2026-09-14'),
    /ROSTER_FUTURE_DATA_DATE:2026-09-15:2026-09-14/);
});
