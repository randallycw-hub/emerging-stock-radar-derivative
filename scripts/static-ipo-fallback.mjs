const EVENT_LABELS = {
  application_submitted: "送件日期",
  review_completed: "審議日期",
  board_approved: "董事會通過",
  contract_approved: "契約備查",
  listing_date: "掛牌／上市日期",
};

const SOURCE_URLS = {
  twseApplications: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  tpexApplications: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies",
};

export function buildStaticIpoSnapshot({ twseRows = [], tpexRows = [], dataDate, generatedAt }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataDate ?? ""))) throw new TypeError("static IPO dataDate must be ISO");
  const byIdentity = new Map();
  for (const row of twseRows.map(toTwseApplication).filter(Boolean)) mergeLatest(byIdentity, row);
  for (const row of tpexRows.map(toTpexApplication).filter(Boolean)) mergeLatest(byIdentity, row);

  const records = [...byIdentity.values()]
    .map((application) => toTimelineRecord(application, dataDate))
    .sort((left, right) => left.companyCode.localeCompare(right.companyCode) || left.market.localeCompare(right.market));

  return {
    schemaVersion: 1,
    dataDate,
    generatedAt: generatedAt ?? `${dataDate}T16:30:00+08:00`,
    sourceManifest: [
      { sourceId: "twse-applications", sourceUrl: SOURCE_URLS.twseApplications, rowCount: twseRows.length },
      { sourceId: "tpex-applications", sourceUrl: SOURCE_URLS.tpexApplications, rowCount: tpexRows.length },
    ],
    records,
  };
}

function toTwseApplication(row) {
  const companyCode = text(row?.公司代號);
  const applicationDate = toIsoDate(row?.申請日期);
  if (!/^\d{4}$/.test(companyCode) || !applicationDate) return null;
  return {
    companyCode,
    companyName: text(row?.公司簡稱) || companyCode,
    market: "上市",
    applicationDate,
    reviewDate: toIsoDate(row?.上市審議委員會審議日期),
    boardDate: toIsoDate(row?.交易所董事會通過上市日期),
    contractDate: toIsoDate(row?.["上市契約報請主管機關備查(主管機關核准)日期"]),
    listingDate: toIsoDate(row?.股票上市買賣日期),
    underwriter: text(row?.承銷商),
    underwritingPrice: decimal(row?.承銷價),
    note: text(row?.備註),
    sourceRecordId: `TWSE:${companyCode}:${applicationDate}`,
  };
}

function toTpexApplication(row) {
  const companyCode = text(row?.SecuritiesCompanyCode);
  const applicationDate = toIsoDate(row?.Date);
  if (!/^\d{4}$/.test(companyCode) || !applicationDate) return null;
  return {
    companyCode,
    companyName: text(row?.CompanyName) || companyCode,
    market: "上櫃",
    applicationDate,
    reviewDate: toIsoDate(row?.TPExListingScreeningCommitteeDate),
    boardDate: toIsoDate(row?.TPExSanctionedDate),
    contractDate: toIsoDate(row?.TPExApprovedTradingDate),
    listingDate: toIsoDate(row?.ListingDate),
    underwriter: text(row?.LeadUnderwriter),
    underwritingPrice: decimal(row?.OfferingPrice),
    note: text(row?.Note),
    sourceRecordId: `TPEx:${companyCode}:${applicationDate}`,
  };
}

function mergeLatest(map, candidate) {
  const key = `${candidate.market}\u0000${candidate.companyCode}`;
  const current = map.get(key);
  if (!current || candidate.applicationDate >= current.applicationDate) map.set(key, candidate);
}

function toTimelineRecord(application, dataDate) {
  const fields = [
    ["application_submitted", application.applicationDate],
    ["review_completed", application.reviewDate],
    ["board_approved", application.boardDate],
    ["contract_approved", application.contractDate],
    ["listing_date", application.listingDate],
  ];
  const events = fields
    .filter(([, date]) => date)
    .map(([kind, date]) => ({
      companyCode: application.companyCode,
      market: application.market,
      kind,
      date,
      label: EVENT_LABELS[kind],
      sourceRecordIds: [application.sourceRecordId],
    }))
    .sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind));
  const stage = application.listingDate && application.listingDate <= dataDate
    ? "listed"
    : application.contractDate
      ? "C"
      : application.boardDate || application.reviewDate
        ? "B"
        : "A";
  return {
    companyCode: application.companyCode,
    companyName: application.companyName,
    market: application.market,
    stage,
    exceptionStatus: null,
    applicationDate: application.applicationDate,
    reviewDate: application.reviewDate,
    boardDate: application.boardDate,
    contractDate: application.contractDate,
    listingDate: application.listingDate,
    auction: null,
    publicOffering: null,
    provisionalUnderwritingPrice: application.underwritingPrice,
    finalUnderwritingPrice: null,
    underwriter: application.underwriter,
    events,
  };
}

function text(value) {
  const result = String(value ?? "").trim();
  return result === "-" || result === "--" ? "" : result;
}

function decimal(value) {
  const result = text(value).replaceAll(",", "");
  return /^\d+(?:\.\d+)?$/.test(result) ? result : null;
}

function toIsoDate(value) {
  const textValue = text(value);
  if (!textValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return textValue;
  const gregorian = /^(\d{4})(\d{2})(\d{2})$/.exec(textValue);
  if (gregorian) return validIsoDate(`${gregorian[1]}-${gregorian[2]}-${gregorian[3]}`);
  const match = /^(\d{3})(\d{2})(\d{2})$/.exec(textValue);
  if (!match) return null;
  const year = Number(match[1]) + 1911;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = `${year}-${match[2]}-${match[3]}`;
  return validIsoDate(result);
}

function validIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3])
    ? value
    : null;
}
