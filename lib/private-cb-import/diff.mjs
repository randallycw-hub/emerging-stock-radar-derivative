export function diffSnapshots(previous, candidate) {
  const before = index(previous?.records ?? [], "previous");
  const after = index(candidate?.records ?? [], "candidate");
  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];
  for (const [bondCode, record] of after) {
    const prior = before.get(bondCode);
    if (!prior) added.push(record);
    else {
      const fields = differingFields(prior, record);
      (fields.length ? changed : unchanged).push(fields.length ? { bondCode, fields, before: prior, after: record } : record);
    }
  }
  for (const [bondCode, record] of before) if (!after.has(bondCode)) removed.push(record);
  const byCode = (left, right) => left.bondCode.localeCompare(right.bondCode);
  return Object.freeze({ added: added.sort(byCode), changed: changed.sort(byCode), removed: removed.sort(byCode), unchanged: unchanged.sort(byCode), invalid: [] });
}

function index(records, label) {
  const indexed = new Map();
  for (const record of records) {
    if (!record || !/^\d{5,6}$/.test(record.bondCode ?? "")) throw new TypeError(`${label} snapshot has invalid bond code`);
    if (indexed.has(record.bondCode)) throw new TypeError(`${label} snapshot has duplicate bond code: ${record.bondCode}`);
    indexed.set(record.bondCode, record);
  }
  return indexed;
}

function differingFields(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => field !== "bondCode" && JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)).sort();
}
