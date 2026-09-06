import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPublishedTradingDate } from '../scripts/run-latest-market-refresh.mjs';
import { requiredQuotedBonds } from '../scripts/lib/bond-inputs-from-11406.mjs';

test('delayed midnight/weekend refresh uses the actual published trading date', () => {
  assert.equal(selectPublishedTradingDate([{ tradingDate: '2026-09-04' }], '2026-09-05'), '2026-09-04');
  assert.equal(selectPublishedTradingDate([{ tradingDate: '2026-09-04' }], '2026-09-07'), '2026-09-04');
  for (const rows of [[], [{tradingDate:'2026-09-06'}], [{tradingDate:'2026-09-03'}, {tradingDate:'2026-09-04'}]]) {
    assert.throws(() => selectPublishedTradingDate(rows, '2026-09-05'));
  }
});

test('only officially future-listed bonds are exempt from the same-day quote gate', () => {
  const bonds = [
    {bondCode:'22211',listingDate:'2026-09-11',issueDate:'2026-09-11'},
    {bondCode:'12341',listingDate:'2026-09-04'},
    {bondCode:'12342',listingDate:null,issueDate:'2026-09-10'},
    {bondCode:'12343',listingDate:null,issueDate:null},
  ];
  assert.deepEqual(requiredQuotedBonds(bonds,'2026-09-04').map(x=>x.bondCode), ['12341','12343']);
  assert.equal(bonds.length,4); // Issuance records are not removed from the source.
});
