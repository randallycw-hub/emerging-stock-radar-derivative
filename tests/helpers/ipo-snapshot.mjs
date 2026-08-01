const hash = `sha256:${"0".repeat(64)}`;

export function createValidIpoSnapshot({
  dataDate = "2026-08-01",
  generatedAt = "2026-08-01T22:30:00+08:00",
  records,
} = {}) {
  const downloadedAt = generatedAt;
  return {
    schemaVersion: 1,
    dataDate,
    generatedAt,
    sourceManifest: [
      { sourceId: "twse-applications", sourceUrl: "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data", downloadedAt, sha256: hash, rawBytes: 100, rowCount: 1 },
      { sourceId: "tpex-applications", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_esb_applicant_companies", downloadedAt, sha256: hash, rawBytes: 100, rowCount: 1 },
      { sourceId: "tpex-ipo-listings", sourceUrl: "https://www.tpex.org.tw/openapi/v1/tpex_ipo_no_limit", downloadedAt, sha256: hash, rawBytes: 100, rowCount: 1 },
      { sourceId: "twse-auctions", sourceUrl: `https://www.twse.com.tw/announcement/auction?response=json&yy=${dataDate.slice(0, 4)}`, downloadedAt, sha256: hash, rawBytes: 100, rowCount: 1 },
      { sourceId: "twse-public-offerings", sourceUrl: `https://www.twse.com.tw/announcement/publicForm?response=json&yy=${dataDate.slice(0, 4)}`, downloadedAt, sha256: hash, rawBytes: 100, rowCount: 1 },
    ],
    records: records ?? [{
      companyCode: "7819",
      companyName: "測試公司",
      market: "上櫃",
      stage: "A",
      exceptionStatus: null,
      applicationDate: "2026-04-01",
      reviewDate: null,
      boardDate: null,
      contractDate: null,
      listingDate: null,
      auction: null,
      publicOffering: null,
      provisionalUnderwritingPrice: null,
      finalUnderwritingPrice: null,
      underwriter: "測試承銷商",
      events: [{
        companyCode: "7819",
        market: "上櫃",
        kind: "application_submitted",
        date: "2026-04-01",
        label: "申請送件",
        sourceRecordIds: ["TPEx:7819:2026-04-01"],
      }],
    }],
  };
}
