import { createHash } from "node:crypto";
import { isIsoDate } from "../../lib/domain/dates.ts";

const HEADERS = ["證券代號", "公司型態", "結案類型", "公司名稱", "承銷商", "案件類別", "金額", "幣別", "發行價格", "收文日期", "自動補正日期", "停止生效日期", "解除生效日期", "生效日期", "廢止/撤銷日期", "自行撤回日期", "退件日期", "案件性質"];
const KINDS: Readonly<Record<string, "有擔保" | "無擔保">> = { "轉換公司債(有擔保)": "有擔保", "轉換公司債(無擔保)": "無擔保" };
type FilingStatus = "pending" | "effective" | "suspended" | "withdrawn" | "rejected" | "revoked";
export interface CbFilingCase {
  recordRef: string;
  matchKey: string;
  identityAmbiguous: boolean;
  sourceRow: number;
  sourceDate: string;
  issuerCode: string;
  issuerName: string;
  issuerMarket: string;
  underwriter: string | null;
  securedStatus: "有擔保" | "無擔保";
  issueAmount: number;
  currency: "TWD";
  receivedDate: string;
  correctionDates: string[];
  suspensionDates: string[];
  resumptionDates: string[];
  effectiveDate: string | null;
  expectedEffectiveDate: string | null;
  declaredEffectiveDate: string | null;
  terminalDate: string | null;
  closureType: string | null;
  status: FilingStatus;
}

/** Strict source parser. A filing case is NOT a verified CB identity. */
export function parseSfbCbFilingRows({ rows, sourceDate }: { rows: unknown; sourceDate: string }) {
  if (!isIsoDate(sourceDate)) throw new TypeError("invalid filing source date");
  if (!Array.isArray(rows) || rows.length < 3 || rows.length > 10_000) throw new TypeError("invalid filing rows");
  if (text(rows[0]?.[0]) !== "申報案件辦理情形彙總表(新聞稿)") throw new TypeError("invalid filing title");
  if (!Array.isArray(rows[2]) || rows[2].length !== HEADERS.length || !HEADERS.every((header, i) => text(rows[2][i]).replace(/\s/g, "") === header)) throw new TypeError("invalid filing headers");
  const records: CbFilingCase[] = [];
  let excludedCount = 0;
  for (let i = 3; i < rows.length; i += 1) {
    const cells = rows[i];
    if (!Array.isArray(cells)) throw new TypeError(`invalid filing row ${i + 1}`);
    if (cells.every((value: unknown) => text(value) === "")) continue;
    if (cells.length !== HEADERS.length) throw new TypeError(`invalid filing row width ${i + 1}`);
    const kind = text(cells[5]);
    if (!Object.hasOwn(KINDS, kind)) { excludedCount += 1; continue; }
    const issuerCode = text(cells[0]);
    if (!/^\d{4}$/.test(issuerCode)) throw new TypeError(`invalid filing issuer at row ${i + 1}`);
    const issueAmount = cells[6];
    if (typeof issueAmount !== "number" || !Number.isSafeInteger(issueAmount) || issueAmount <= 0) throw new TypeError(`invalid filing amount at row ${i + 1}`);
    if (text(cells[7]) !== "台幣") throw new TypeError(`invalid filing currency at row ${i + 1}`);
    const receivedDate = singleDate(cells[9]);
    if (!receivedDate || receivedDate > sourceDate) throw new TypeError(`invalid filing receipt date at row ${i + 1}`);
    const correctionDates = dates(cells[10]);
    const suspensionDates = dates(cells[11]);
    const resumptionDates = dates(cells[12]);
    const declaredEffectiveDate = singleDate(cells[13]);
    const revokedDate = singleDate(cells[14]);
    const withdrawnDate = singleDate(cells[15]);
    const rejectedDate = singleDate(cells[16]);
    for (const date of [...correctionDates, ...suspensionDates, ...resumptionDates, revokedDate, withdrawnDate, rejectedDate].filter((date): date is string => date !== null)) {
      if (date < receivedDate || date > sourceDate) throw new TypeError(`invalid filing event date at row ${i + 1}`);
    }
    if (declaredEffectiveDate && declaredEffectiveDate < receivedDate) throw new TypeError("filing effective date precedes receipt");
    const closureType = text(cells[2]);
    if (!["", "生效", "自行撤回", "退件", "廢止", "撤銷", "廢止/撤銷"].includes(closureType)) throw new TypeError("unknown filing closure type");
    if (closureType === "生效" && (!declaredEffectiveDate || declaredEffectiveDate > sourceDate)) throw new TypeError("missing or future completed effective date");
    if ((closureType === "自行撤回" && !withdrawnDate) || (closureType === "退件" && !rejectedDate) || (["廢止", "撤銷", "廢止/撤銷"].includes(closureType) && !revokedDate)) throw new TypeError("missing terminal filing date");
    const terminals = [
      { date: revokedDate, status: "revoked" as const },
      { date: withdrawnDate, status: "withdrawn" as const },
      { date: rejectedDate, status: "rejected" as const },
    ].filter((entry): entry is {date: string; status: "revoked" | "withdrawn" | "rejected"} => entry.date !== null).sort((a, b) => b.date.localeCompare(a.date));
    const terminal = terminals[0];
    if (terminals.length > 1) throw new TypeError("conflicting filing termination dates");
    if (terminal && closureType === "生效" && (terminal.status !== "revoked" || !declaredEffectiveDate || terminal.date < declaredEffectiveDate)) throw new TypeError("contradictory effective and terminal filing events");
    const completionDate = closureType === "生效" ? declaredEffectiveDate : null;
    const procedureEnd = completionDate ?? terminal?.date ?? sourceDate;
    for (const date of [...correctionDates, ...suspensionDates, ...resumptionDates]) {
      if (date > procedureEnd) throw new TypeError("filing procedure event after closure/terminal date");
    }
    let suspended = false;
    const procedure = [...suspensionDates.map((date) => ({ date, kind: "suspend" })), ...resumptionDates.map((date) => ({ date, kind: "resume" }))].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
    for (const event of procedure) {
      if ((event.kind === "suspend" && suspended) || (event.kind === "resume" && !suspended)) throw new TypeError("invalid suspension/resumption procedure sequence");
      suspended = event.kind === "suspend";
    }
    const stillSuspended = (suspensionDates.at(-1) ?? "") > (resumptionDates.at(-1) ?? "");
    if (!terminal && closureType === "生效" && stillSuspended) throw new TypeError("effective filing is still suspended");
    const status: FilingStatus = terminal?.status ?? (closureType === "生效" ? "effective" : stillSuspended ? "suspended" : "pending");
    const effectiveDate = closureType === "生效" ? declaredEffectiveDate : null;
    const issuerName = text(cells[3]);
    if (!issuerName) throw new TypeError("missing filing issuer name");
    const matchKey = hash([issuerCode, issueAmount, KINDS[kind], receivedDate, text(cells[4])]);
    records.push({
      // Snapshot-scoped locator. Never use sourceRow as a cross-day case ID.
      recordRef: `sfb:${sourceDate}:${i + 1}:${hash(cells)}`,
      matchKey, identityAmbiguous: false, sourceRow: i + 1, sourceDate,
      issuerCode, issuerName, issuerMarket: text(cells[1]), underwriter: text(cells[4]) || null,
      securedStatus: KINDS[kind], issueAmount, currency: "TWD", receivedDate,
      correctionDates, suspensionDates, resumptionDates, effectiveDate,
      expectedEffectiveDate: !terminal && !effectiveDate ? declaredEffectiveDate : null,
      declaredEffectiveDate, terminalDate: terminal?.date ?? null, closureType: closureType || null, status,
    });
  }
  const counts = new Map<string, number>();
  for (const record of records) counts.set(record.matchKey, (counts.get(record.matchKey) ?? 0) + 1);
  for (const record of records) record.identityAmbiguous = (counts.get(record.matchKey) ?? 0) > 1;
  return { sourceDate, records, excludedCount };
}

interface BondCandidate { bondCode: string; issuerCode: string; issueAmount: number | null; securedStatus: string | null; issueDate: string | null }

/** Suggestions for internal review only; no automatic publication or term overwrite. */
export function reviewCbFilingMatches(cases: readonly CbFilingCase[], bonds: readonly BondCandidate[]) {
  return cases.map((record) => {
    const candidates = bonds.filter((bond) => /^\d{5,6}$/.test(bond.bondCode) && bond.bondCode.startsWith(record.issuerCode)
      && bond.issuerCode === record.issuerCode && bond.issueAmount === record.issueAmount
      && bond.securedStatus === record.securedStatus && isIsoDate(bond.issueDate)
      && bond.issueDate >= (record.effectiveDate ?? record.receivedDate));
    const candidateBondCodes = [...new Set(candidates.map((bond) => bond.bondCode))].sort();
    const matchStatus = record.terminalDate ? "terminated" : record.identityAmbiguous || candidates.length > 1 ? "ambiguous" : candidates.length === 1 ? "candidate" : "unmatched";
    return { recordRef: record.recordRef, candidateBondCodes, matchStatus, verifiedBondCode: null };
  });
}

function text(value: unknown): string { return value === null || value === undefined ? "" : String(value).trim(); }
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function dates(value: unknown): string[] {
  if (!text(value)) return [];
  const result = text(value).split(",").map((part) => {
    const match = /^(\d{3})(\d{2})(\d{2})$/.exec(part.trim());
    if (!match) throw new TypeError("invalid ROC filing date");
    const date = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
    if (!isIsoDate(date)) throw new TypeError("invalid ROC filing date");
    return date;
  });
  return [...new Set(result)].sort();
}
function singleDate(value: unknown): string | null {
  const result = dates(value);
  if (result.length > 1) throw new TypeError("multiple dates in a single filing date field");
  return result[0] ?? null;
}
