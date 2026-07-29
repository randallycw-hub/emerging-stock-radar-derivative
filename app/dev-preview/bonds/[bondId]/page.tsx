import { notFound } from "next/navigation";

import { DataFreshness } from "../../_components/DataFreshness.tsx";
import { PreviewDataField, PreviewPageTitle, PreviewStatusBadge, SourceAttribution } from "../../_components/PreviewUi.tsx";
import { formatPreviewNumber, formatPreviewPercent, formatPreviewText } from "../../../../lib/preview/format.ts";
import { findPreviewBond } from "../../../../lib/preview/data.ts";
import { loadPreviewData } from "../../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../../lib/preview/runtime.ts";

export default async function BondDetailPreviewPage({ params }: { params: Promise<{ bondId: string }> }) {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const { bondId } = await params;
  const bond = findPreviewBond(data, bondId);
  if (!bond) notFound();
  const fields = [
    ["債券代碼", bond.bondCode], ["債券簡稱", bond.shortName], ["發行人代碼", bond.issuerCode], ["發行人", bond.issuerName],
    ["發行方式", bond.offeringMethod], ["票面利率", formatPreviewPercent(bond.couponRate)], ["發行總額", formatPreviewNumber(bond.issueAmount)],
    ["目前餘額", formatPreviewNumber(bond.outstandingAmount)], ["擔保狀態", bond.secured ? "有擔保" : "無擔保"], ["擔保描述", bond.securityDescription],
    ["承銷商", bond.underwriter], ["受託人", bond.trustee],
  ] as const;
  const presentCount = fields.filter(([, value]) => value !== undefined && value !== "").length;
  return <div className="preview-bond-command">
    <PreviewPageTitle eyebrow={`${formatPreviewText(bond.bondCode)} · 可轉債查核工作台`} title={bond.shortName}
      description={`${bond.issuerName} 的發行契約、轉換權利、到期與餘額資訊集中呈現；每個欄位均保留官方日期與來源，方便交易前快速核對。`}
      aside={<PreviewStatusBadge tone={bond.secured ? "teal" : "neutral"}>{bond.secured ? "有擔保" : "無擔保"}</PreviewStatusBadge>} />
    <div className="preview-bond-workbench">
      <aside className="preview-bond-rail" aria-label="可轉債查核導覽">
        <span className="preview-bond-rail-kicker">CB LEDGER</span>
        <a href="#bond-overview">總覽</a>
        <a href="#bond-terms">契約條款</a>
        <a href="#bond-events">重要事件</a>
        <a href="#bond-source">資料來源</a>
      </aside>
      <main className="preview-bond-workspace">
    <section id="bond-overview" className="preview-grid preview-grid-3 preview-trader-summary" aria-label="交易前摘要">
      <article className="preview-summary-card"><span>目前餘額</span><strong>{formatPreviewNumber(bond.outstandingAmount)}</strong><p>原始發行額 {formatPreviewNumber(bond.issueAmount)}</p></article>
      <article className="preview-summary-card preview-summary-card-ink"><span>票面利率</span><strong>{formatPreviewPercent(bond.couponRate)}</strong><p>到期日 {bond.maturityDate}</p></article>
      <article className="preview-summary-card preview-summary-card-clay"><span>資料完整度</span><strong>{presentCount}/{fields.length}</strong><p>只計入 fixture 已提供欄位，不代填缺漏資料</p></article>
    </section>
    <section className="preview-panel preview-trader-grid"><div className="preview-panel-head"><div><h2>契約生命週期</h2><p>先看日期與權利窗口，再進入完整欄位核對。</p></div><PreviewStatusBadge tone="amber">官方日期 {bond.source.officialDataDate}</PreviewStatusBadge></div>
      <ol className="preview-timeline preview-bond-lifecycle">
        <li><time>{bond.issueDate}</time><div><strong>發行</strong><span>發行總額 {formatPreviewNumber(bond.issueAmount)}</span></div></li>
        <li><time>{formatPreviewText(bond.listingDate)}</time><div><strong>掛牌</strong><span>進入可轉債交易查核範圍</span></div></li>
        <li><time>{formatPreviewText(bond.conversionStartDate)}</time><div><strong>開始轉換</strong><span>轉換價 {formatPreviewNumber(bond.initialConversionPrice)}</span></div></li>
        <li><time>{formatPreviewText(bond.conversionEndDate)}</time><div><strong>轉換截止</strong><span>交易人需注意停止轉換窗口</span></div></li>
        <li><time>{bond.maturityDate}</time><div><strong>到期</strong><span>以官方契約與公告為準</span></div></li>
      </ol>
    </section>
    <section id="bond-terms" className="preview-grid preview-grid-2">
      <section className="preview-panel"><div className="preview-panel-head"><div><h2>發行與轉換條款</h2><p>交易前最常需要交叉核對的契約欄位。</p></div></div><dl className="preview-data-grid">
        <PreviewDataField label="發行日" value={bond.issueDate} /><PreviewDataField label="掛牌日" value={formatPreviewText(bond.listingDate)} /><PreviewDataField label="到期日" value={bond.maturityDate} />
        <PreviewDataField label="轉換開始" value={formatPreviewText(bond.conversionStartDate)} /><PreviewDataField label="轉換截止" value={formatPreviewText(bond.conversionEndDate)} /><PreviewDataField label="初始轉換價" value={formatPreviewNumber(bond.initialConversionPrice)} numeric />
        <PreviewDataField label="賣回日期" value={bond.putDates.length ? bond.putDates.join("、") : "—"} /><PreviewDataField label="賣回價格" value={formatPreviewNumber(bond.putPrice)} numeric />
      </dl></section>
      <section className="preview-panel"><div className="preview-panel-head"><div><h2>權利、擔保與餘額異動</h2><p>把可能影響持有決策的事件放在同一區。</p></div></div><dl className="preview-data-grid">
        <PreviewDataField label="擔保狀態" value={bond.secured ? "有擔保" : "無擔保"} /><PreviewDataField label="擔保描述" value={formatPreviewText(bond.securityDescription)} />
        <PreviewDataField label="餘額異動日" value={formatPreviewText(bond.outstandingChangeDate)} /><PreviewDataField label="餘額異動原因" value={formatPreviewText(bond.outstandingChangeReason)} />
        <PreviewDataField label="承銷商" value={formatPreviewText(bond.underwriter)} /><PreviewDataField label="受託人" value={formatPreviewText(bond.trustee)} />
      </dl></section>
    </section>
    <section id="bond-events" className="preview-panel"><div className="preview-panel-head"><div><h2>完整欄位核對</h2><p>缺漏顯示為「—」，不以推測值補齊；適合逐欄比對公告。</p></div></div><dl className="preview-data-grid preview-completeness-grid">
      {fields.map(([label, value]) => <PreviewDataField key={label} label={label} value={formatPreviewText(value)} />)}
    </dl></section>
    <section className="preview-panel" aria-label="交易摘要"><div className="preview-panel-head"><div><h2>交易摘要</h2><p>沒有經驗證的行情欄位以破折號顯示。</p></div></div><dl className="preview-data-grid"><PreviewDataField label="收盤價" value="—" numeric /><PreviewDataField label="轉換價值" value="—" numeric /><PreviewDataField label="溢價率" value="—" numeric /><PreviewDataField label="資料日期" value={bond.source.officialDataDate} /></dl></section>
    <section id="bond-source" className="preview-bond-source"><DataFreshness source={{ label: bond.source.providerName, url: bond.source.officialUrl, asOf: bond.source.officialDataDate }} /><SourceAttribution source={bond.source} fetchedAt={bond.source.fetchedAt} /></section>
      </main>
    </div>
  </div>;
}
