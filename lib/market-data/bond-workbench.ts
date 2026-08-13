import { isIsoDate, isIsoDateTime, isYearMonth } from "../domain/dates.ts";
import { parseCbRedemptionEvent } from "./bond-supplemental.ts";
import type {
  BondArchiveReason,
  BondAssessment,
  BondFieldState,
  BondLifecycleStatus,
  BondMarketView,
  BondTermSummary,
  BondWorkbenchEvent,
  BondWorkbenchFieldStates,
  BondWorkbenchRecord,
  BondWorkbenchSnapshot,
} from "./types.ts";
import { evaluateBondAssessment } from "./bond-strategy-assessment.ts";

const SNAPSHOT_KEYS = ["schemaVersion", "generatedAt", "dataDate", "records"];
const RECORD_KEYS = ["bondCode", "status", "archiveReason", "archivedAt", "term", "view", "events", "fieldStates", "assessment"];
const TERM_KEYS = ["bondCode", "issuerCode", "bondName", "issuerName", "issueDate", "listingDate", "maturityDate", "issueAmount", "outstandingAmount", "outstandingDataDate", "initialConversionPrice", "conversionStartDate", "conversionEndDate", "putDates", "putPrice", "securedStatus", "underwriter", "trustee", "unitFaceValueTwd"];
const EVENT_KEYS = ["bondCode", "eventId", "type", "date", "title", "sourceId", "sourceUrl"];
const FIELD_STATE_KEYS = ["price", "valuation", "outstanding", "institutions", "company", "events", "history"];
const VIEW_KEYS = ["bondCode", "issuerCode", "bondName", "issuerResearch", "cbClose", "cbPriceDate", "cbTradeUnits", "stockClose", "stockPriceDate", "currentConversionPrice", "conversionPriceEffectiveDate", "valuationDate", "valuationCbClose", "valuationStockClose", "conversionValue", "premiumRate", "outstandingAmount", "outstandingDataDate", "outstandingReductionRate", "remainingUnits", "remainingRatio", "dailyTurnoverRate", "institutionDataDate", "institutionNetUnits", "institutionNet5dUnits", "institutionNet20dUnits", "redemptionEvent", "maturityDate", "daysToMaturity", "nextPutDate", "daysToNextPut", "nextEventType", "nextEventDate", "daysToNextEvent", "dataQuality", "staleCbPrice", "missingReasons"];
const ISSUER_RESEARCH_KEYS = ["market", "industryName", "revenueMonth", "sourcePublishedOn", "revenueUnit", "currentMonthRevenue", "monthOverMonthPercent", "yearOverYearPercent", "cumulativeRevenue", "cumulativeYearOverYearPercent"];
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const SIGNED_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9]\d*)$/;
const SIGNED_INTEGER = /^-?(?:0|[1-9]\d*)$/;
const EVENT_TYPES = new Set<BondWorkbenchEvent["type"]>(["conversion_adjustment", "conversion_suspension", "ex_dividend", "put", "redemption", "maturity", "listing", "delisting"]);
const FIELD_STATES = new Set<BondFieldState>(["complete", "stale", "date_mismatch", "missing", "accumulating"]);
const ARCHIVE_REASONS = new Set<BondArchiveReason>(["matured", "redeemed", "balance_exhausted", "removed_from_official_roster"]);

export function parseBondWorkbenchSnapshot(value: unknown): BondWorkbenchSnapshot {
  const snapshot = requireRecord(value, "bond workbench snapshot");
  assertExactKeys(snapshot, SNAPSHOT_KEYS, "bond workbench snapshot");
  if (snapshot.schemaVersion !== 1) throw new TypeError("bond workbench snapshot schemaVersion must be 1");
  assertTimestamp(snapshot.generatedAt, "bond workbench snapshot generatedAt");
  assertDate(snapshot.dataDate, "bond workbench snapshot dataDate");
  const records = parseRecords(snapshot.records);
  return deepFreeze({ schemaVersion: 1, generatedAt: snapshot.generatedAt, dataDate: snapshot.dataDate, records });
}

export function buildBondWorkbenchSnapshot(input: {
  generatedAt: string;
  dataDate: string;
  asOfDate: string;
  currentTerms: readonly BondTermSummary[];
  currentViews: readonly BondMarketView[];
  currentEvents: readonly BondWorkbenchEvent[];
  currentAssessments?: readonly { bondCode: string; assessment: BondAssessment }[];
  previous?: BondWorkbenchSnapshot;
}): BondWorkbenchSnapshot {
  const options = requireRecord(input, "bond workbench input");
  assertExactKeys(options, ["generatedAt", "dataDate", "asOfDate", "currentTerms", "currentViews", "currentEvents", "currentAssessments", "previous"].filter((key) => key in options), "bond workbench input");
  assertTimestamp(input.generatedAt, "generatedAt");
  assertDate(input.dataDate, "dataDate");
  assertDate(input.asOfDate, "asOfDate");
  const previous = input.previous === undefined ? undefined : parseBondWorkbenchSnapshot(input.previous);
  const terms = parseTerms(input.currentTerms);
  const views = parseViews(input.currentViews);
  const events = parseEvents(input.currentEvents);
  const assessments = parseAssessments(input.currentAssessments ?? [], "current assessments");
  const termsByCode = indexByCode(terms, "current terms");
  const viewsByCode = indexByCode(views, "current views");
  const assessmentsByCode = indexByCode(assessments, "current assessments");
  if ([...assessmentsByCode.keys()].some((code) => !viewsByCode.has(code))) throw new TypeError("assessment has unknown bond code");
  if (termsByCode.size !== viewsByCode.size || [...termsByCode.keys()].some((code) => !viewsByCode.has(code))) {
    throw new TypeError("current terms and views must have matching bond codes");
  }
  const eventsByCode = new Map<string, BondWorkbenchEvent[]>();
  for (const event of events) {
    if (!termsByCode.has(event.bondCode)) {
      throw new TypeError(`event has unknown bond code: ${event.bondCode}`);
    }
    const entries = eventsByCode.get(event.bondCode) ?? [];
    entries.push(event);
    eventsByCode.set(event.bondCode, entries);
  }
  const previousByCode = new Map(previous?.records.map((record) => [record.bondCode, record]) ?? []);
  const records: BondWorkbenchRecord[] = [];
  for (const [bondCode, currentTerm] of termsByCode) {
    const prior = previousByCode.get(bondCode);
    if (prior?.status === "archived") {
      records.push(cloneRecord(prior));
      continue;
    }
    const currentView = viewsByCode.get(bondCode)!;
    const archiveReason = archiveReasonFor(currentTerm, currentView, input.asOfDate);
    records.push({
      bondCode,
      status: archiveReason === null ? "active" : "archived",
      archiveReason,
      archivedAt: archiveReason === null ? null : input.asOfDate,
      term: currentTerm,
      view: currentView,
      events: (eventsByCode.get(bondCode) ?? []).map(cloneEvent),
      fieldStates: buildFieldStates(currentView, input.dataDate, eventsByCode.get(bondCode) ?? []),
      assessment: assessmentsByCode.get(bondCode)?.assessment ?? defaultAssessment(currentView),
    });
  }
  for (const prior of previous?.records ?? []) {
    if (termsByCode.has(prior.bondCode)) continue;
    records.push(prior.status === "archived" ? cloneRecord(prior) : {
      ...cloneRecord(prior),
      status: "archived",
      archiveReason: "removed_from_official_roster",
      archivedAt: input.asOfDate,
    });
  }
  records.sort((left, right) => left.bondCode.localeCompare(right.bondCode));
  return deepFreeze({ schemaVersion: 1, generatedAt: input.generatedAt, dataDate: input.dataDate, records });
}

function archiveReasonFor(term: BondTermSummary, view: BondMarketView, asOfDate: string): BondArchiveReason | null {
  const delistingDate = redemptionDelistingDate(view.redemptionEvent);
  if (delistingDate !== null && delistingDate <= asOfDate) return "redeemed";
  if (term.maturityDate < asOfDate) return "matured";
  if (isZeroDecimal(term.outstandingAmount) || isZeroDecimal(view.outstandingAmount)) {
    return "balance_exhausted";
  }
  return null;
}

function buildFieldStates(view: BondMarketView, dataDate: string, events: readonly BondWorkbenchEvent[]): BondWorkbenchFieldStates {
  const dated = (value: string | null): BondFieldState => value === null ? "missing" : value === dataDate ? "complete" : "stale";
  return {
    price: view.cbClose === null ? "missing" : view.staleCbPrice ? "stale" : dated(view.cbPriceDate),
    valuation: view.dataQuality === "date_mismatch" ? "date_mismatch" : dated(view.valuationDate),
    outstanding: view.dataQuality === "date_mismatch" ? "date_mismatch" : view.outstandingAmount === null ? "missing" : dated(view.outstandingDataDate),
    institutions: view.institutionNetUnits === null ? "missing" : dated(view.institutionDataDate),
    company: view.issuerResearch === null ? "missing" : "complete",
    events: events.length === 0 ? "missing" : "complete",
    history: "accumulating",
  };
}

function parseRecords(value: unknown): BondWorkbenchRecord[] {
  assertDenseArray(value, "bond workbench records");
  const records = value.map((entry, index) => parseRecord(entry, `bond workbench record ${index}`));
  indexByCode(records, "bond workbench records");
  if (!records.every((record, index) => index === 0 || records[index - 1].bondCode < record.bondCode)) {
    throw new TypeError("bond workbench records must be sorted by bond code");
  }
  return records;
}

function parseRecord(value: unknown, name: string): BondWorkbenchRecord {
  const record = requireRecord(value, name);
  assertExactKeys(record, RECORD_KEYS, name);
  const bondCode = readBondCode(record.bondCode, `${name}.bondCode`);
  if (record.status !== "active" && record.status !== "archived") throw new TypeError(`${name}.status is invalid`);
  const status = record.status as BondLifecycleStatus;
  const archiveReason = record.archiveReason;
  if (archiveReason !== null && (!ARCHIVE_REASONS.has(archiveReason as BondArchiveReason))) throw new TypeError(`${name}.archiveReason is invalid`);
  if (record.archivedAt !== null) assertDate(record.archivedAt, `${name}.archivedAt`);
  if ((status === "active") !== (archiveReason === null && record.archivedAt === null)) throw new TypeError(`${name} lifecycle fields are inconsistent`);
  const term = parseTerm(record.term, `${name}.term`);
  const view = parseView(record.view, `${name}.view`);
  if (term.bondCode !== bondCode || view.bondCode !== bondCode) throw new TypeError(`${name} bond code mismatch`);
  const events = parseEvents(record.events);
  if (events.some((event) => event.bondCode !== bondCode)) throw new TypeError(`${name} event bond code mismatch`);
  return { bondCode, status, archiveReason: archiveReason as BondArchiveReason | null, archivedAt: record.archivedAt as string | null, term, view, events, fieldStates: parseFieldStates(record.fieldStates, `${name}.fieldStates`), assessment: parseAssessment(record.assessment, `${name}.assessment`) };
}

type AssessmentEntry = { bondCode: string; assessment: BondAssessment };

function parseAssessments(value: unknown, name: string): AssessmentEntry[] {
  assertDenseArray(value, name);
  return value.map((entry, index) => {
    const item = requireRecord(entry, `${name} ${index}`);
    assertExactKeys(item, ["bondCode", "assessment"], `${name} ${index}`);
    return { bondCode: readBondCode(item.bondCode, `${name} ${index}.bondCode`), assessment: parseAssessment(item.assessment, `${name} ${index}.assessment`) };
  });
}

function parseAssessment(value: unknown, name: string): BondAssessment {
  const assessment = requireRecord(value, name);
  assertExactKeys(assessment, ["dimensions", "strategies"], name);
  assertDenseArray(assessment.dimensions, `${name}.dimensions`);
  assertDenseArray(assessment.strategies, `${name}.strategies`);
  const dimensions = assessment.dimensions.map((item, index) => parseAssessmentSection(item, `${name}.dimensions[${index}]`, ["price", "days", "premium", "remaining", "spread", "liquidity"], ["favorable", "watch", "risk", "pending"]));
  const strategies = assessment.strategies.map((item, index) => parseAssessmentSection(item, `${name}.strategies[${index}]`, ["stock_bond_relative", "maturity_put", "equity_relative", "stock_equivalent", "arbitrage", "dynamic_hedge"], ["met", "partial", "pending", "not_met"]));
  if (dimensions.length !== 6 || new Set(dimensions.map((item) => item.code)).size !== 6) throw new TypeError(`${name}.dimensions must contain each dimension once`);
  if (strategies.length !== 6 || new Set(strategies.map((item) => item.code)).size !== 6) throw new TypeError(`${name}.strategies must contain each strategy once`);
  for (const strategy of strategies) {
    for (const check of strategy.checks) {
      if (
        (check.code === "ttm_profit" || check.code === "revenue_trend" || check.code === "ps_percentile")
        && check.state !== "pending"
        && (check.sourceId === null || check.dataDate === null)
      ) {
        throw new TypeError(`${name} public financial check requires sourceId and dataDate`);
      }
      if (
        (check.sourceId === "approved_post_trade_spread" || check.sourceId === "approved_public_financials")
        && check.dataDate !== null
        && strategy.checks.some((peer) => peer.code === "premium_rate" && peer.dataDate !== null && peer.dataDate !== check.dataDate)
        && (check.state !== "pending" || check.missingReason !== "DATE_MISMATCH")
      ) {
        throw new TypeError(`${name} cross-date strategy check must be pending with DATE_MISMATCH`);
      }
    }
  }
  return { dimensions: dimensions as BondAssessment["dimensions"], strategies: strategies as BondAssessment["strategies"] };
}

function parseAssessmentSection(value: unknown, name: string, codes: readonly string[], states: readonly string[]): { code: string; state: string; checks: readonly import("./types.ts").AssessmentCheck[] } {
  const section = requireRecord(value, name);
  assertExactKeys(section, ["code", "state", "checks"], name);
  if (typeof section.code !== "string" || !codes.includes(section.code)) throw new TypeError(`${name}.code is invalid`);
  if (typeof section.state !== "string" || !states.includes(section.state)) throw new TypeError(`${name}.state is invalid`);
  assertDenseArray(section.checks, `${name}.checks`);
  return { code: section.code, state: section.state, checks: section.checks.map((check, index) => parseAssessmentCheck(check, `${name}.checks[${index}]`)) };
}

function parseAssessmentCheck(value: unknown, name: string): import("./types.ts").AssessmentCheck {
  const check = requireRecord(value, name);
  assertExactKeys(check, ["code", "label", "state", "actual", "threshold", "dataDate", "sourceId", "missingReason"], name);
  if (check.state !== "met" && check.state !== "partial" && check.state !== "pending" && check.state !== "not_met") throw new TypeError(`${name}.state is invalid`);
  const nullableText = (entry: unknown, field: string): string | null => entry === null ? null : readText(entry, field);
  return {
    code: readText(check.code, `${name}.code`), label: readText(check.label, `${name}.label`), state: check.state,
    actual: nullableText(check.actual, `${name}.actual`), threshold: readText(check.threshold, `${name}.threshold`),
    dataDate: check.dataDate === null ? null : readDate(check.dataDate, `${name}.dataDate`), sourceId: nullableText(check.sourceId, `${name}.sourceId`), missingReason: nullableText(check.missingReason, `${name}.missingReason`),
  };
}

function defaultAssessment(view: BondMarketView): BondAssessment {
  return evaluateBondAssessment({
    view, history: [], spreadPercent: null, spreadDataDate: null, borrowability: "unknown", conversionSuspended: null,
    publicFinancials: { ttmProfitState: "unknown", revenueTrendState: "unknown", psPercentile: null, dataDate: null, sourceId: null },
  });
}

function parseTerms(value: unknown): BondTermSummary[] {
  assertDenseArray(value, "current terms");
  return value.map((entry, index) => parseTerm(entry, `current term ${index}`));
}

function parseTerm(value: unknown, name: string): BondTermSummary {
  const term = requireRecord(value, name);
  assertExactKeys(term, TERM_KEYS, name);
  const result = {
    bondCode: readBondCode(term.bondCode, `${name}.bondCode`),
    issuerCode: readText(term.issuerCode, `${name}.issuerCode`),
    bondName: readText(term.bondName, `${name}.bondName`),
    issuerName: readText(term.issuerName, `${name}.issuerName`),
    issueDate: readOptionalDate(term.issueDate, `${name}.issueDate`),
    listingDate: readOptionalDate(term.listingDate, `${name}.listingDate`),
    maturityDate: readDate(term.maturityDate, `${name}.maturityDate`),
    issueAmount: readOptionalDecimal(term.issueAmount, `${name}.issueAmount`),
    outstandingAmount: readOptionalDecimal(term.outstandingAmount, `${name}.outstandingAmount`),
    outstandingDataDate: readOptionalDate(term.outstandingDataDate, `${name}.outstandingDataDate`),
    initialConversionPrice: readOptionalDecimal(term.initialConversionPrice, `${name}.initialConversionPrice`),
    conversionStartDate: readOptionalDate(term.conversionStartDate, `${name}.conversionStartDate`),
    conversionEndDate: readOptionalDate(term.conversionEndDate, `${name}.conversionEndDate`),
    putDates: readDates(term.putDates, `${name}.putDates`),
    putPrice: readOptionalDecimal(term.putPrice, `${name}.putPrice`),
    securedStatus: readOptionalText(term.securedStatus, `${name}.securedStatus`),
    underwriter: readOptionalText(term.underwriter, `${name}.underwriter`),
    trustee: readOptionalText(term.trustee, `${name}.trustee`),
    unitFaceValueTwd: readOptionalDecimal(term.unitFaceValueTwd, `${name}.unitFaceValueTwd`),
  };
  if (result.issueDate !== null && result.issueDate > result.maturityDate) throw new TypeError(`${name}.issueDate exceeds maturityDate`);
  if (result.listingDate !== null && (result.issueDate !== null && result.listingDate < result.issueDate || result.listingDate > result.maturityDate)) throw new TypeError(`${name}.listingDate is outside lifecycle`);
  if (result.conversionStartDate !== null && result.conversionEndDate !== null && result.conversionStartDate > result.conversionEndDate) throw new TypeError(`${name}.conversion period is invalid`);
  return result;
}

function parseViews(value: unknown): BondMarketView[] {
  assertDenseArray(value, "current views");
  return value.map((entry, index) => parseView(entry, `current view ${index}`));
}

function parseView(value: unknown, name: string): BondMarketView {
  const view = requireRecord(value, name);
  assertExactKeys(view, VIEW_KEYS, name);
  const bondCode = readBondCode(view.bondCode, `${name}.bondCode`);
  const redemptionEvent = parseRedemptionEvent(view.redemptionEvent, `${name}.redemptionEvent`);
  if (redemptionEvent !== null && redemptionEvent.bondCode !== bondCode) {
    throw new TypeError(`${name}.redemptionEvent.bondCode does not match view.bondCode`);
  }
  return {
    bondCode,
    issuerCode: readText(view.issuerCode, `${name}.issuerCode`),
    bondName: readText(view.bondName, `${name}.bondName`),
    issuerResearch: parseIssuerResearch(view.issuerResearch, `${name}.issuerResearch`),
    cbClose: readOptionalDecimal(view.cbClose, `${name}.cbClose`),
    cbPriceDate: readOptionalDate(view.cbPriceDate, `${name}.cbPriceDate`),
    cbTradeUnits: readNonNegativeInteger(view.cbTradeUnits, `${name}.cbTradeUnits`),
    stockClose: readOptionalDecimal(view.stockClose, `${name}.stockClose`),
    stockPriceDate: readOptionalDate(view.stockPriceDate, `${name}.stockPriceDate`),
    currentConversionPrice: readOptionalDecimal(view.currentConversionPrice, `${name}.currentConversionPrice`),
    conversionPriceEffectiveDate: readOptionalDate(view.conversionPriceEffectiveDate, `${name}.conversionPriceEffectiveDate`),
    valuationDate: readOptionalDate(view.valuationDate, `${name}.valuationDate`),
    valuationCbClose: readOptionalDecimal(view.valuationCbClose, `${name}.valuationCbClose`),
    valuationStockClose: readOptionalDecimal(view.valuationStockClose, `${name}.valuationStockClose`),
    conversionValue: readOptionalDecimal(view.conversionValue, `${name}.conversionValue`),
    premiumRate: readOptionalSignedDecimal(view.premiumRate, `${name}.premiumRate`),
    outstandingAmount: readOptionalDecimal(view.outstandingAmount, `${name}.outstandingAmount`),
    outstandingDataDate: readOptionalDate(view.outstandingDataDate, `${name}.outstandingDataDate`),
    outstandingReductionRate: readOptionalDecimal(view.outstandingReductionRate, `${name}.outstandingReductionRate`),
    remainingUnits: readOptionalDecimal(view.remainingUnits, `${name}.remainingUnits`),
    remainingRatio: readOptionalDecimal(view.remainingRatio, `${name}.remainingRatio`),
    dailyTurnoverRate: readOptionalDecimal(view.dailyTurnoverRate, `${name}.dailyTurnoverRate`),
    institutionDataDate: readOptionalDate(view.institutionDataDate, `${name}.institutionDataDate`),
    institutionNetUnits: readOptionalSignedInteger(view.institutionNetUnits, `${name}.institutionNetUnits`),
    institutionNet5dUnits: readOptionalSignedInteger(view.institutionNet5dUnits, `${name}.institutionNet5dUnits`),
    institutionNet20dUnits: readOptionalSignedInteger(view.institutionNet20dUnits, `${name}.institutionNet20dUnits`),
    redemptionEvent,
    maturityDate: readDate(view.maturityDate, `${name}.maturityDate`),
    daysToMaturity: readInteger(view.daysToMaturity, `${name}.daysToMaturity`),
    nextPutDate: readOptionalDate(view.nextPutDate, `${name}.nextPutDate`),
    daysToNextPut: readOptionalInteger(view.daysToNextPut, `${name}.daysToNextPut`),
    nextEventType: readNextEventType(view.nextEventType, `${name}.nextEventType`),
    nextEventDate: readDate(view.nextEventDate, `${name}.nextEventDate`),
    daysToNextEvent: readInteger(view.daysToNextEvent, `${name}.daysToNextEvent`),
    dataQuality: readDataQuality(view.dataQuality, `${name}.dataQuality`),
    staleCbPrice: readBoolean(view.staleCbPrice, `${name}.staleCbPrice`),
    missingReasons: readMissingReasons(view.missingReasons, `${name}.missingReasons`),
  };
}

function parseIssuerResearch(value: unknown, name: string): BondMarketView["issuerResearch"] {
  if (value === null) return null;
  const research = requireRecord(value, name);
  assertExactKeys(research, ISSUER_RESEARCH_KEYS, name);
  if (research.market !== "listed" && research.market !== "otc") {
    throw new TypeError(`${name}.market is invalid`);
  }
  if (research.revenueUnit !== "仟元") throw new TypeError(`${name}.revenueUnit is invalid`);
  if (typeof research.revenueMonth !== "string" || !isYearMonth(research.revenueMonth)) {
    throw new TypeError(`${name}.revenueMonth is invalid`);
  }
  return {
    market: research.market,
    industryName: readText(research.industryName, `${name}.industryName`),
    revenueMonth: research.revenueMonth,
    sourcePublishedOn: readDate(research.sourcePublishedOn, `${name}.sourcePublishedOn`),
    revenueUnit: "仟元",
    currentMonthRevenue: readCurrentMonthRevenue(research.currentMonthRevenue, `${name}.currentMonthRevenue`),
    monthOverMonthPercent: readOptionalSignedDecimal(research.monthOverMonthPercent, `${name}.monthOverMonthPercent`),
    yearOverYearPercent: readOptionalSignedDecimal(research.yearOverYearPercent, `${name}.yearOverYearPercent`),
    cumulativeRevenue: readOptionalSignedDecimal(research.cumulativeRevenue, `${name}.cumulativeRevenue`),
    cumulativeYearOverYearPercent: readOptionalSignedDecimal(research.cumulativeYearOverYearPercent, `${name}.cumulativeYearOverYearPercent`),
  };
}

function parseRedemptionEvent(value: unknown, name: string): BondMarketView["redemptionEvent"] {
  if (value === null) return null;
  try {
    return parseCbRedemptionEvent(value);
  } catch (error) {
    throw new TypeError(`${name} is invalid: ${String(error)}`);
  }
}

function parseEvents(value: unknown): BondWorkbenchEvent[] {
  assertDenseArray(value, "bond workbench events");
  const events = value.map((entry, index) => {
    const event = requireRecord(entry, `bond workbench event ${index}`);
    assertExactKeys(event, EVENT_KEYS, `bond workbench event ${index}`);
    if (!EVENT_TYPES.has(event.type as BondWorkbenchEvent["type"])) {
      throw new TypeError("bond workbench event type is invalid");
    }
    return {
      bondCode: readBondCode(event.bondCode, "bond workbench event bondCode"),
      eventId: readText(event.eventId, "bond workbench event eventId"),
      type: event.type as BondWorkbenchEvent["type"],
      date: readDate(event.date, "bond workbench event date"),
      title: readText(event.title, "bond workbench event title"),
      sourceId: readText(event.sourceId, "bond workbench event sourceId"),
      sourceUrl: event.sourceUrl === null
        ? null
        : readText(event.sourceUrl, "bond workbench event sourceUrl"),
    };
  });
  if (new Set(events.map((event) => `${event.bondCode}\u001f${event.eventId}`)).size !== events.length) throw new TypeError("duplicate bond workbench event id");
  return events.sort((left, right) => left.bondCode.localeCompare(right.bondCode) || left.date.localeCompare(right.date) || left.eventId.localeCompare(right.eventId));
}

function parseFieldStates(value: unknown, name: string): BondWorkbenchFieldStates {
  const states = requireRecord(value, name);
  assertExactKeys(states, FIELD_STATE_KEYS, name);
  for (const key of FIELD_STATE_KEYS) if (!FIELD_STATES.has(states[key] as BondFieldState)) throw new TypeError(`${name}.${key} is invalid`);
  return Object.fromEntries(FIELD_STATE_KEYS.map((key) => [key, states[key]])) as BondWorkbenchFieldStates;
}

function indexByCode<T extends { bondCode: string }>(values: readonly T[], name: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.bondCode)) throw new TypeError(`duplicate bond code in ${name}: ${value.bondCode}`);
    result.set(value.bondCode, value);
  }
  return result;
}

function redemptionDelistingDate(value: unknown): string | null {
  if (value === null) return null;
  const event = requireRecord(value, "redemption event");
  return readDate(event.delistingDate, "redemption event delistingDate");
}

function cloneRecord(value: BondWorkbenchRecord): BondWorkbenchRecord {
  return parseRecord(value, "previous bond workbench record");
}

function cloneEvent(value: BondWorkbenchEvent): BondWorkbenchEvent {
  return { ...value };
}

function isZeroDecimal(value: string | null): boolean {
  return value !== null && /^0(?:\.0+)?$/.test(value);
}

function readBondCode(value: unknown, name: string): string {
  const text = readText(value, name);
  if (!/^\d{5,6}$/.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function readText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function readOptionalText(value: unknown, name: string): string | null {
  return value === null ? null : readText(value, name);
}

function readDate(value: unknown, name: string): string {
  const text = readText(value, name);
  assertDate(text, name);
  return text;
}

function readOptionalDate(value: unknown, name: string): string | null {
  return value === null ? null : readDate(value, name);
}

function readOptionalDecimal(value: unknown, name: string): string | null {
  if (value === null) return null;
  const text = readText(value, name);
  if (!DECIMAL.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function readOptionalSignedDecimal(value: unknown, name: string): string | null {
  if (value === null) return null;
  const text = readText(value, name);
  if (!SIGNED_DECIMAL.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function readCurrentMonthRevenue(value: unknown, name: string): string {
  const text = readText(value, name);
  if (!/^(?!-0(?:\.0+)?$)-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new TypeError(`${name} is invalid`);
  }
  return text;
}

function readNonNegativeInteger(value: unknown, name: string): string {
  const text = readText(value, name);
  if (!NON_NEGATIVE_INTEGER.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function readOptionalSignedInteger(value: unknown, name: string): string | null {
  if (value === null) return null;
  const text = readText(value, name);
  if (!SIGNED_INTEGER.test(text)) throw new TypeError(`${name} is invalid`);
  return text;
}

function readInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${name} is invalid`);
  return value as number;
}

function readOptionalInteger(value: unknown, name: string): number | null {
  if (value === null) return null;
  return readInteger(value, name);
}

function readNextEventType(value: unknown, name: string): BondMarketView["nextEventType"] {
  if (value !== "redemption" && value !== "put" && value !== "maturity") {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function readDataQuality(value: unknown, name: string): BondMarketView["dataQuality"] {
  if (value !== "complete" && value !== "partial" && value !== "date_mismatch") {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function readBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${name} is invalid`);
  return value;
}

function readMissingReasons(value: unknown, name: string): string[] {
  assertDenseArray(value, name);
  return value.map((reason, index) => readText(reason, `${name}[${index}]`));
}

function readDates(value: unknown, name: string): string[] {
  assertDenseArray(value, name);
  return value.map((item, index) => readDate(item, `${name}[${index}]`));
}

function assertTimestamp(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !isIsoDateTime(value)) {
    throw new TypeError(`${name} must be a valid ISO timestamp`);
  }
}

function assertDate(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !isIsoDate(value)) {
    throw new TypeError(`${name} must be a valid ISO date`);
  }
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[], name: string): void {
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== expected.length
    || !keys.every((key) => (
      typeof key === "string"
      && expected.includes(key)
      && Object.prototype.propertyIsEnumerable.call(record, key)
    ))
  ) {
    throw new TypeError(`${name} keys do not match the verified contract`);
  }
}

function assertDenseArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be a dense array`);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== value.length + 1
    || !keys.includes("length")
    || !Array.from({ length: value.length }, (_, index) =>
      Object.prototype.propertyIsEnumerable.call(value, String(index))
    ).every(Boolean)
  ) {
    throw new TypeError(`${name} must be a dense array`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
