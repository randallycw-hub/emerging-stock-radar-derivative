// A future public issue may appear in 11406 before an exchange code is assigned.
// Keep its raw row, but never invent a code or include it in traded-CB records.
export function unassignedFutureCbIssue(row, asOfDate) {
  if (typeof row?.['債券代碼'] !== 'string' || row['債券代碼'].trim() !== ''
    || typeof row?.['機構代碼'] !== 'string' || !/^\d{4}$/.test(row['機構代碼'].trim())
    || String(row?.['債券種類'] ?? '').trim() !== '5') return null;
  const sourceDate = officialDate(row['資料日期']);
  const issueDate = officialDate(row['發行日期']);
  const listingDate = officialDate(row['掛牌日期']);
  const maturityDate = officialDate(row['到期日期']);
  // A historical projection uses its snapshot day; refresh uses the execution
  // day. An unchanged source row must not retain this exemption after issuance.
  const referenceDate = asOfDate === undefined ? sourceDate
    : (/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? officialDate(asOfDate.replaceAll('-', '')) : null);
  if (!sourceDate || !issueDate || !listingDate || !maturityDate
    || !referenceDate || issueDate <= referenceDate
    || issueDate <= sourceDate || listingDate < issueDate || maturityDate <= listingDate) return null;
  return { sourceDate, issueDate, listingDate, issuerCode: row['機構代碼'].trim() };
}

function officialDate(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{8}$/.test(text)) return null;
  const iso = text.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}
