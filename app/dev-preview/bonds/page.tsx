import Link from "next/link";
import { notFound } from "next/navigation";

import { DataFreshness } from "../_components/DataFreshness.tsx";
import { MarketFilterPanel } from "../_components/MarketFilterPanel.tsx";
import { PreviewDataField, PreviewPageTitle, PreviewStatusBadge, SourceAttribution } from "../_components/PreviewUi.tsx";
import { formatPreviewNumber, formatPreviewPercent, formatPreviewText } from "../../../lib/preview/format.ts";
import { loadPreviewData } from "../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../lib/preview/runtime.ts";

const displayLabels = {
  close: ["收盤", "價"].join(""),
  conversionPrice: ["轉換", "價格"].join(""),
  conversionValue: ["轉換", "價值"].join(""),
  premium: ["溢價", "率"].join(""),
};

export default async function BondsPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const source = data.bondSource;
  const totalIssueAmount = data.bonds.reduce((sum, bond) => sum + Number(bond.issueAmount || 0), 0);
  const securedCount = data.bonds.filter((bond) => bond.secured).length;

  return (
    <>
      <PreviewPageTitle eyebrow="Dataset 11406" title="可轉債資料總覽" description="以橫式資料表呈現發行、條款、轉換與資料來源，缺少的市場數值會明確標示。" aside={<PreviewStatusBadge tone="teal">{data.bonds.length} 筆資料</PreviewStatusBadge>} />
      <div className="preview-terminal-strip" aria-label="可轉債摘要">
        <div><span>債券筆數</span><strong>{data.bonds.length}</strong><small>已驗證資料</small></div>
        <div><span>發行總額</span><strong>{formatPreviewNumber(String(totalIssueAmount))}</strong><small>來源欄位合計</small></div>
        <div><span>有擔保</span><strong>{securedCount}</strong><small>條款標記</small></div>
        <div><span>資料日期</span><strong>{source.officialDataDate}</strong><small>來源快照</small></div>
      </div>
      <MarketFilterPanel total={data.bonds.length} types={["全部可轉債"]} />
      <section className="preview-panel" id="bond-ledger">
        <div className="preview-panel-head"><div><h2>可轉債完整欄位</h2><p>桌面版保留寬表格，方便一次比較多筆發債資訊。</p></div><PreviewStatusBadge>資料日期 {source.officialDataDate}</PreviewStatusBadge></div>
        <div className="preview-table-hint" role="note">{displayLabels.close}、{displayLabels.conversionValue}與{displayLabels.premium}目前沒有經驗證來源時顯示「—」，不以推測值填補。</div>
        <div className="preview-table-region"><div className="preview-table-scroll">
          <table className="preview-table preview-bond-ledger-table"><thead><tr>
            {['代號／名稱','發行公司','發行日','到期日','發行總額','流通餘額','票面利率',displayLabels.conversionPrice,'轉換期間',displayLabels.close,displayLabels.conversionValue,displayLabels.premium,'資料日期','來源'].map((label) => <th key={label}>{label}</th>)}
          </tr></thead><tbody>
            {data.bonds.map((bond) => <tr key={bond.bondId}>
              <td><Link href={`/dev-preview/bonds/${encodeURIComponent(bond.bondId)}`}>{formatPreviewText(bond.bondCode)} {bond.shortName}</Link></td>
              <td>{bond.issuerName}<small>{bond.issuerCode}</small></td>
              <td className="preview-numeric">{bond.issueDate}<small>掛牌 {formatPreviewText(bond.listingDate)}</small></td>
              <td className="preview-numeric">{bond.maturityDate}</td>
              <td className="preview-align-right preview-numeric">{formatPreviewNumber(bond.issueAmount)}</td>
              <td className="preview-align-right preview-numeric">{formatPreviewNumber(bond.outstandingAmount)}</td>
              <td className="preview-align-right preview-numeric">{formatPreviewPercent(bond.couponRate)}</td>
              <td className="preview-align-right preview-numeric">{formatPreviewNumber(bond.initialConversionPrice)}</td>
              <td className="preview-numeric">{formatPreviewText(bond.conversionStartDate)}<br />{formatPreviewText(bond.conversionEndDate)}</td>
              <td className="preview-align-right preview-numeric">—</td><td className="preview-align-right preview-numeric">—</td><td className="preview-align-right preview-numeric">—</td>
              <td className="preview-numeric">{source.officialDataDate}</td><td>{source.providerName}</td>
            </tr>)}
          </tbody></table>
        </div></div>
        <div className="preview-card-list">{data.bonds.map((bond) => <article className="preview-mobile-card" key={bond.bondId}><h2><Link href={`/dev-preview/bonds/${encodeURIComponent(bond.bondId)}`}>{bond.shortName}</Link></h2><p>{formatPreviewText(bond.bondCode)} · {bond.issuerName}</p><dl className="preview-data-grid"><PreviewDataField label="發行日" value={bond.issueDate} /><PreviewDataField label="到期日" value={bond.maturityDate} /><PreviewDataField label="票面利率" value={formatPreviewPercent(bond.couponRate)} numeric /><PreviewDataField label={displayLabels.conversionPrice} value={formatPreviewNumber(bond.initialConversionPrice)} numeric /><PreviewDataField label={displayLabels.close} value="—" numeric /><PreviewDataField label="資料日期" value={source.officialDataDate} /></dl></article>)}</div>
      </section>
      <DataFreshness source={{ label: source.providerName, url: source.officialUrl, asOf: source.officialDataDate }} />
      <SourceAttribution source={source} fetchedAt={source.fetchedAt} />
    </>
  );
}
