import { notFound } from "next/navigation";

import {
  PreviewDataField,
  PreviewPageTitle,
  PreviewStatusBadge,
  SourceAttribution,
} from "../../_components/PreviewUi.tsx";
import {
  formatPreviewNumber,
  formatPreviewPercent,
} from "../../../../lib/preview/format.ts";
import {
  findPreviewCompany,
} from "../../../../lib/preview/data.ts";
import { loadPreviewData } from "../../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../../lib/preview/runtime.ts";

export default async function EmergingCompanyPreviewPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const { companyId } = await params;
  const company = findPreviewCompany(data, companyId);
  if (!company) notFound();

  return (
    <>
      <PreviewPageTitle
        eyebrow={`Company ${company.companyCode}`}
        title={company.companyName}
        description={`${company.industryName} · 資料年月 ${company.yearMonth} · 官方單位 ${company.revenueUnit}`}
        aside={<PreviewStatusBadge tone="amber">測試樣本</PreviewStatusBadge>}
      />

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>公司與本期資料</h2>
            <p>公司代號為本頁 fixture 關聯鍵，不建立額外公司身分推論。</p>
          </div>
        </div>
        <dl className="preview-data-grid">
          <PreviewDataField label="公司代號" value={company.companyCode} />
          <PreviewDataField label="公司名稱" value={company.companyName} />
          <PreviewDataField label="產業別" value={company.industryName} />
          <PreviewDataField label="資料年月" value={company.yearMonth} />
          <PreviewDataField label="出表日期" value={company.sourcePublishedOn} />
          <PreviewDataField
            label="累計營收（仟元）"
            value={formatPreviewNumber(company.cumulativeRevenue)}
            numeric
          />
          <PreviewDataField
            label="累計年增率"
            value={formatPreviewPercent(company.cumulativeYearOverYearPercent)}
            numeric
          />
          <PreviewDataField
            label="去年累計營收（仟元）"
            value={formatPreviewNumber(company.priorYearCumulativeRevenue)}
            numeric
          />
        </dl>
      </section>

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>單期營收比較</h2>
            <p>僅比較 fixture 已提供的本月、上月與去年同月三個欄位。</p>
          </div>
        </div>
        <div className="preview-comparison">
          <div className="preview-grid preview-grid-3">
            <article className="preview-comparison-card">
              <span>當月營收（仟元）</span>
              <strong>{formatPreviewNumber(company.currentMonthRevenue)}</strong>
            </article>
            <article className="preview-comparison-card">
              <span>上月營收（仟元）</span>
              <strong>{formatPreviewNumber(company.previousMonthRevenue)}</strong>
            </article>
            <article className="preview-comparison-card">
              <span>去年同月營收（仟元）</span>
              <strong>{formatPreviewNumber(company.priorYearMonthRevenue)}</strong>
            </article>
          </div>
          <dl className="preview-data-grid">
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
          </dl>
        </div>
      </section>

      <SourceAttribution source={company.source} fetchedAt={company.source.fetchedAt} />
    </>
  );
}
