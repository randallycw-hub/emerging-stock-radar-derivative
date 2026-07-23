export interface PreviewSourceDto {
  sourceId: string;
  providerName: string;
  datasetName: string;
  officialUrl: string;
  licenseName: string;
  officialDataDate: string;
  fetchedAt: string;
  fixtureVersion: string;
}

export interface PreviewCompanyDto {
  companyId: string;
  companyCode: string;
  companyName: string;
  industryName: string;
  yearMonth: string;
  sourcePublishedOn: string;
  revenueUnit: "仟元";
  currentMonthRevenue: string;
  previousMonthRevenue?: string;
  priorYearMonthRevenue?: string;
  monthOverMonthPercent?: string;
  yearOverYearPercent?: string;
  cumulativeRevenue?: string;
  priorYearCumulativeRevenue?: string;
  cumulativeYearOverYearPercent?: string;
  source: PreviewSourceDto;
}

export interface PreviewBondDto {
  bondId: string;
  bondCode?: string;
  shortName: string;
  issuerCode: string;
  issuerName: string;
  issueDate: string;
  listingDate?: string;
  maturityDate: string;
  issueAmount: string;
  outstandingAmount: string;
  couponRate?: string;
  secured: boolean;
  securityDescription?: string;
  initialConversionPrice?: string;
  conversionStartDate?: string;
  conversionEndDate?: string;
  putDates: string[];
  putPrice?: string;
  underwriter?: string;
  trustee?: string;
  outstandingChangeDate?: string;
  outstandingChangeReason?: string;
  offeringMethod?: string;
  source: PreviewSourceDto;
}

export interface PreviewDataDto {
  companies: PreviewCompanyDto[];
  bonds: PreviewBondDto[];
  revenueSource: PreviewSourceDto;
  bondSource: PreviewSourceDto;
  lastUpdatedAt: string;
  fixtureNotice: "測試樣本";
}
