import { notFound } from "next/navigation";

import { DataFreshness } from "../_components/DataFreshness.tsx";
import { PreviewPageTitle, PreviewStatusBadge } from "../_components/PreviewUi.tsx";
import { loadPreviewData } from "../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../lib/preview/runtime.ts";

export default async function IpoPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  return (
    <>
      <PreviewPageTitle
        eyebrow="IPO 時程"
        title="IPO 申請與掛牌時程"
        description="時程資料只呈現已驗證的日期與事件；目前沒有可發布的 IPO fixture 時，保留空狀態而不填入推測資料。"
        aside={<PreviewStatusBadge tone="amber">資料待發布</PreviewStatusBadge>}
      />
      <section className="preview-panel preview-empty-state" aria-live="polite">
        <h2>目前沒有可發布的 IPO 時程資料</h2>
        <p>待 IPO 來源完成欄位驗證後，將依事件日期升冪顯示申請、承銷、掛牌等階段。</p>
        <DataFreshness source={{ label: data.revenueSource.providerName, url: data.revenueSource.officialUrl, asOf: "" }} />
      </section>
    </>
  );
}
