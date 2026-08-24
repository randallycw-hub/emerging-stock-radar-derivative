export type SnapshotQualityInput = Readonly<{
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  fetchedAt: string;
}>;

export type QualityDecision = Readonly<{
  eligible: boolean;
  reasons: readonly string[];
}>;

export type IpoStageProgressRecord = Readonly<{
  companyCode: string;
  market: string;
  stage: string;
  exceptionStatus: string | null;
}>;

const minimumRetainedRowRatio = 0.75;
const terminalStages = new Set(["withdrawn", "cancelled", "listed"]);
const stageOrder = new Map([
  ["A", 1],
  ["B", 2],
  ["C", 3],
  ["D", 4],
  ["listed", 5],
]);

export function evaluateSnapshotCandidate(input: Readonly<{
  previous: SnapshotQualityInput | null;
  candidate: SnapshotQualityInput;
}>): QualityDecision {
  const reasons: string[] = [];
  if (!isPositiveInteger(input.candidate.acceptedRecordCount)) reasons.push("EMPTY_CANDIDATE");
  if (!isNonNegativeInteger(input.candidate.rejectedRecordCount) || input.candidate.rejectedRecordCount > 0) {
    reasons.push("REJECTED_RECORDS");
  }
  const candidateTime = parsedTime(input.candidate.fetchedAt);
  if (candidateTime === null) reasons.push("INVALID_FETCH_TIME");

  if (input.previous !== null) {
    const previousTime = parsedTime(input.previous.fetchedAt);
    if (previousTime !== null && candidateTime !== null && candidateTime < previousTime) {
      reasons.push("FETCH_TIME_REGRESSION");
    }
    if (
      isPositiveInteger(input.previous.acceptedRecordCount)
      && isPositiveInteger(input.candidate.acceptedRecordCount)
      && input.candidate.acceptedRecordCount < Math.ceil(input.previous.acceptedRecordCount * minimumRetainedRowRatio)
    ) {
      reasons.push("ROW_COUNT_COLLAPSE");
    }
  }
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function evaluateIpoStageProgress(
  previous: readonly IpoStageProgressRecord[],
  candidate: readonly IpoStageProgressRecord[],
): QualityDecision {
  const previousByIdentity = new Map(previous.map((record) => [identity(record), record]));
  const reasons: string[] = [];
  for (const next of candidate) {
    const prior = previousByIdentity.get(identity(next));
    if (!prior || isTerminal(next)) continue;
    const priorOrder = stageOrder.get(prior.stage);
    const nextOrder = stageOrder.get(next.stage);
    if (priorOrder !== undefined && nextOrder !== undefined && nextOrder < priorOrder) {
      reasons.push(`IPO_STAGE_REGRESSION:${next.companyCode}:${next.market}`);
    }
  }
  return Object.freeze({ eligible: reasons.length === 0, reasons: Object.freeze(reasons.sort()) });
}

function identity(value: Pick<IpoStageProgressRecord, "companyCode" | "market">): string {
  return `${value.companyCode}\u0000${value.market}`;
}

function isTerminal(value: IpoStageProgressRecord): boolean {
  return terminalStages.has(value.stage) || value.exceptionStatus === "withdrawn" || value.exceptionStatus === "cancelled";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parsedTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
