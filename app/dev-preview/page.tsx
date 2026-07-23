import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PreviewPageTitle,
  PreviewStatusBadge,
  SourceAttribution,
} from "./_components/PreviewUi.tsx";
import { loadPreviewData } from "../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../lib/preview/runtime.ts";

export default async function DevPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();

  return (
    <>
      <PreviewPageTitle
        eyebrow="Local interface preview"
        title="興債觀測網本機預覽"
        description="以兩份已提交、經最小化的官方資料測試樣本，驗證興櫃月營收與可轉債資訊的閱讀層級、來源標示及響應式版面。"
        aside={<PreviewStatusBadge tone="amber">測試樣本</PreviewStatusBadge>}
      />

      <section className="preview-grid preview-grid-2" aria-label="資料摘要">
        <article className="preview-summary-card">
          <span>興櫃月營收摘要</span>
          <strong>{data.companies.length}</strong>
          <p>
            資料年月 {data.companies[0]?.yearMonth ?? "—"}，單位為仟元。
            僅呈現 fixture 中的公司列。
          </p>
        </article>
        <article className="preview-summary-card">
          <span>可轉債摘要</span>
          <strong>{data.bonds.length}</strong>
          <p>
            官方 fixture 資料日期 {data.bondSource.officialDataDate}。
            僅呈現發行契約與餘額欄位。
          </p>
        </article>
      </section>

      <section className="preview-grid preview-grid-2" aria-label="預覽入口">
        <Link className="preview-entry-card" href="/dev-preview/emerging">
          <span className="preview-section-label">Emerging revenue</span>
          <h2>興櫃月營收資料涵蓋公司</h2>
          <p>查看公司代號、產業別、資料年月、月營收與官方成長率。</p>
          <b>進入月營收預覽 →</b>
        </Link>
        <Link className="preview-entry-card" href="/dev-preview/bonds">
          <span className="preview-section-label">Convertible bonds</span>
          <h2>可轉債發行資料</h2>
          <p>查看發行人、契約日期、發行與目前餘額、轉換期間及擔保資訊。</p>
          <b>進入可轉債預覽 →</b>
        </Link>
      </section>

      <SourceAttribution
        source={data.revenueSource}
        fetchedAt={data.revenueSource.fetchedAt}
      />
      <SourceAttribution
        source={data.bondSource}
        fetchedAt={data.bondSource.fetchedAt}
      />
    </>
  );
}
