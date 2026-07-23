import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PreviewDataField,
  PreviewPageTitle,
  PreviewStatusBadge,
  SourceAttribution,
} from "../_components/PreviewUi.tsx";
import {
  formatPreviewNumber,
  formatPreviewPercent,
} from "../../../lib/preview/format.ts";
import { loadPreviewData } from "../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../lib/preview/runtime.ts";

export default async function EmergingPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const source = data.revenueSource;

  return (
    <>
      <PreviewPageTitle
        eyebrow="Dataset 94025"
        title="興櫃月營收資料涵蓋公司"
        description="呈現同一資料年月中已成功發布的測試樣本列；公司下一期未出現時，不在本頁推論身分變動。"
        aside={<PreviewStatusBadge tone="teal">{data.companies.length} 筆測試樣本</PreviewStatusBadge>}
      />

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>月營收資料</h2>
            <p>官方單位：仟元；百分比保存來源值，不另行重算。</p>
          </div>
          <PreviewStatusBadge>資料年月 {data.companies[0]?.yearMonth ?? "—"}</PreviewStatusBadge>
        </div>

        <div className="preview-table-region">
          <div className="preview-table-scroll">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>公司代號</th>
                  <th>公司名稱</th>
                  <th>產業別</th>
                  <th>資料年月</th>
                  <th className="preview-align-right">當月營收</th>
                  <th className="preview-align-right">月增率</th>
                  <th className="preview-align-right">年增率</th>
                  <th className="preview-align-right">累計年增率</th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map((company) => (
                  <tr key={company.companyId}>
                    <td className="preview-numeric">{company.companyCode}</td>
                    <td>
                      <Link href={`/dev-preview/emerging/${company.companyId}`}>
                        {company.companyName}
                      </Link>
                    </td>
                    <td>{company.industryName}</td>
                    <td className="preview-numeric">{company.yearMonth}</td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewNumber(company.currentMonthRevenue)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewPercent(company.monthOverMonthPercent)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewPercent(company.yearOverYearPercent)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewPercent(company.cumulativeYearOverYearPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="preview-card-list">
          {data.companies.map((company) => (
            <article className="preview-mobile-card" key={company.companyId}>
              <h2>
                <Link href={`/dev-preview/emerging/${company.companyId}`}>
                  {company.companyName}
                </Link>
              </h2>
              <p>{company.companyCode} · {company.industryName}</p>
              <dl className="preview-data-grid">
                <PreviewDataField label="資料年月" value={company.yearMonth} />
                <PreviewDataField
                  label="當月營收（仟元）"
                  value={formatPreviewNumber(company.currentMonthRevenue)}
                  numeric
                />
                <PreviewDataField
                  label="月增率"
                  value={formatPreviewPercent(company.monthOverMonthPercent)}
                  numeric
                />
                <PreviewDataField
                  label="年增率"
                  value={formatPreviewPercent(company.yearOverYearPercent)}
                  numeric
                />
                <PreviewDataField
                  label="累計年增率"
                  value={formatPreviewPercent(company.cumulativeYearOverYearPercent)}
                  numeric
                />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <SourceAttribution source={source} fetchedAt={source.fetchedAt} />
    </>
  );
}
