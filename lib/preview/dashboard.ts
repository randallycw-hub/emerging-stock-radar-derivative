import type {
  PreviewBondDto,
  PreviewCompanyDto,
  PreviewDataDto,
} from "./types.ts";

export type PreviewTimelineType =
  | "revenue-month"
  | "revenue-source"
  | "bond-issue"
  | "bond-listing"
  | "bond-conversion-start"
  | "bond-conversion-end"
  | "bond-maturity"
  | "bond-put";

export interface PreviewTimelineEvent {
  id: string;
  type: PreviewTimelineType;
  date: string;
  label: string;
  entityId: string;
  entityLabel: string;
  href: string;
}

export interface PreviewSearchResult {
  kind: "company" | "bond";
  id: string;
  title: string;
  description: string;
  href: string;
}

export interface PreviewDashboard {
  companyCount: number;
  bondCount: number;
  latestRevenueMonth: string;
  nearestBondImportantDate?: PreviewTimelineEvent;
  revenueRows: PreviewCompanyDto[];
  bonds: PreviewBondDto[];
  importantDates: PreviewTimelineEvent[];
  timeline: PreviewTimelineEvent[];
}

const timelineOrder: Record<PreviewTimelineType, number> = {
  "bond-issue": 0,
  "bond-listing": 1,
  "bond-conversion-start": 2,
  "bond-put": 3,
  "revenue-month": 4,
  "revenue-source": 5,
  "bond-conversion-end": 6,
  "bond-maturity": 7,
};

const importantDateTypes: PreviewTimelineType[] = [
  "bond-maturity",
  "bond-conversion-start",
  "bond-conversion-end",
  "bond-put",
];

export function searchPreviewEntities(
  data: PreviewDataDto,
  query: string,
): PreviewSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];

  const companies = data.companies
    .filter((company) => [
      company.companyCode,
      company.companyName,
    ].some((value) => value.toLowerCase().includes(normalizedQuery)))
    .map((company): PreviewSearchResult => ({
      kind: "company",
      id: company.companyId,
      title: `${company.companyCode} ${company.companyName}`,
      description: `${company.industryName}・${company.yearMonth}`,
      href: `/dev-preview/emerging/${company.companyId}`,
    }));

  const bonds = data.bonds
    .filter((bond) => [
      bond.bondCode,
      bond.shortName,
      bond.issuerCode,
      bond.issuerName,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)))
    .map((bond): PreviewSearchResult => ({
      kind: "bond",
      id: bond.bondId,
      title: `${bond.bondCode ? `${bond.bondCode} ` : ""}${bond.shortName}`,
      description: `發行人：${bond.issuerName}`,
      href: `/dev-preview/bonds/${bond.bondId}`,
    }));

  return [...companies, ...bonds];
}

export function buildPreviewDashboard(data: PreviewDataDto): PreviewDashboard {
  const timeline = buildPreviewTimeline(data);
  const referenceDate = data.bondSource.officialDataDate;
  const bondEvents = timeline.filter(({ type }) => type.startsWith("bond-"));
  const nearestBondImportantDate = closestPreviewEvent(bondEvents, referenceDate);

  return {
    companyCount: data.companies.length,
    bondCount: data.bonds.length,
    latestRevenueMonth: data.companies
      .map(({ yearMonth }) => yearMonth)
      .sort()
      .at(-1) ?? "—",
    nearestBondImportantDate,
    revenueRows: [...data.companies].sort(
      (left, right) => percentValue(right.yearOverYearPercent)
        - percentValue(left.yearOverYearPercent),
    ),
    bonds: data.bonds,
    importantDates: importantDateTypes.flatMap((type) => {
      const candidates = timeline.filter((event) => event.type === type);
      const nearest = closestPreviewEvent(candidates, referenceDate);
      return nearest ? [nearest] : [];
    }),
    timeline,
  };
}

function closestPreviewEvent(
  events: PreviewTimelineEvent[],
  referenceDate: string,
): PreviewTimelineEvent | undefined {
  const referenceDay = isoDateDay(referenceDate);
  return [...events].sort((left, right) => (
    Math.abs(isoDateDay(left.date) - referenceDay)
      - Math.abs(isoDateDay(right.date) - referenceDay)
    || left.date.localeCompare(right.date)
    || left.id.localeCompare(right.id)
  ))[0];
}

function isoDateDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function buildPreviewTimeline(data: PreviewDataDto): PreviewTimelineEvent[] {
  const events: PreviewTimelineEvent[] = [];

  for (const yearMonth of new Set(data.companies.map(({ yearMonth }) => yearMonth))) {
    events.push({
      id: `revenue-month:${yearMonth}`,
      type: "revenue-month",
      date: yearMonth,
      label: "月營收資料月份",
      entityId: "revenue",
      entityLabel: data.revenueSource.datasetName,
      href: "/dev-preview/emerging",
    });
  }
  for (const publishedOn of new Set(
    data.companies.map(({ sourcePublishedOn }) => sourcePublishedOn),
  )) {
    events.push({
      id: `revenue-source:${publishedOn}`,
      type: "revenue-source",
      date: publishedOn,
      label: "月營收來源發布日",
      entityId: "revenue",
      entityLabel: data.revenueSource.datasetName,
      href: "/dev-preview/emerging",
    });
  }

  for (const bond of data.bonds) {
    const href = `/dev-preview/bonds/${bond.bondId}`;
    const entityLabel = `${bond.bondCode ? `${bond.bondCode} ` : ""}${bond.shortName}`;
    addBondEvent(events, bond, "bond-issue", bond.issueDate, "發行日", href, entityLabel);
    addBondEvent(events, bond, "bond-listing", bond.listingDate, "掛牌日", href, entityLabel);
    addBondEvent(
      events,
      bond,
      "bond-conversion-start",
      bond.conversionStartDate,
      "轉換開始日",
      href,
      entityLabel,
    );
    addBondEvent(
      events,
      bond,
      "bond-conversion-end",
      bond.conversionEndDate,
      "轉換結束日",
      href,
      entityLabel,
    );
    addBondEvent(events, bond, "bond-maturity", bond.maturityDate, "到期日", href, entityLabel);
    for (const putDate of bond.putDates) {
      addBondEvent(events, bond, "bond-put", putDate, "賣回權日期（Put date）", href, entityLabel);
    }
  }

  return events.sort((left, right) => (
    left.date.localeCompare(right.date)
    || timelineOrder[left.type] - timelineOrder[right.type]
    || left.id.localeCompare(right.id)
  ));
}

function addBondEvent(
  events: PreviewTimelineEvent[],
  bond: PreviewBondDto,
  type: PreviewTimelineType,
  date: string | undefined,
  label: string,
  href: string,
  entityLabel: string,
): void {
  if (!date) return;
  events.push({
    id: `${type}:${bond.bondId}:${date}`,
    type,
    date,
    label,
    entityId: bond.bondId,
    entityLabel,
    href,
  });
}

function percentValue(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return Number.NEGATIVE_INFINITY;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}
