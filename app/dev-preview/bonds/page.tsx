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
  formatPreviewText,
} from "../../../lib/preview/format.ts";
import { loadPreviewData } from "../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../lib/preview/runtime.ts";

export default async function BondsPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const source = data.bondSource;
  const totalIssueAmount = data.bonds.reduce((sum, bond) => sum + Number(bond.issueAmount || 0), 0);
  const securedCount = data.bonds.filter((bond) => bond.secured).length;

  return (
    <>
      <PreviewPageTitle
        eyebrow="Dataset 11406"
        title="可轉債發行資料"
        description="呈現官方發行契約、日期與餘額測試樣本；無代碼列仍保留來源所能確定的複合識別。"
        aside={<PreviewStatusBadge tone="teal">{data.bonds.length} 筆測試樣本</PreviewStatusBadge>}
      />

      <div className="preview-terminal-strip" aria-label="可轉債資料摘要">
        <div><span>LEDGER</span><strong>{data.bonds.length}</strong><small>合約樣本</small></div>
        <div><span>ISSUE AMOUNT</span><strong>{formatPreviewNumber(String(totalIssueAmount))}</strong><small>合計發行總額</small></div>
        <div><span>SECURED</span><strong>{securedCount}</strong><small>有擔保債券</small></div>
        <div><span>AS-OF</span><strong>{source.officialDataDate}</strong><small>官方資料日期</small></div>
      </div>

      <div className="preview-bond-layout">
        <aside className="preview-index-rail" aria-label="可轉債頁面索引">
          <span>INDEX</span>
          <a href="#bond-ledger">01 <b>發行合約</b></a>
          <a href="#bond-fields">02 <b>欄位說明</b></a>
          <a href="#bond-source">03 <b>資料來源</b></a>
        </aside>
        <div className="preview-bond-main">

      <section className="preview-panel" id="bond-ledger">
        <div className="preview-panel-head">
          <div>
            <h2>發行契約與餘額</h2>
            <p>寬版合約台：向右滑動即可查看完整發債條件；金額沿用 parser 正規化結果，日期統一為 ISO 格式。</p>
          </div>
          <PreviewStatusBadge>資料日期 {source.officialDataDate}</PreviewStatusBadge>
        </div>

        <div className="preview-table-region">
          <div className="preview-table-hint" role="note">桌機可直接檢視全部欄位；窄螢幕請左右滑動資料表。</div>
          <div className="preview-table-scroll">
            <table className="preview-table preview-bond-ledger-table">
              <thead>
                <tr>
                  <th>債券代碼／簡稱</th>
                  <th>發行人</th>
                  <th>發行日</th>
                  <th>到期日</th>
                  <th className="preview-align-right">發行總額</th>
                  <th className="preview-align-right">目前餘額</th>
                  <th className="preview-align-right">票面利率</th>
                  <th className="preview-align-right">初始轉換價</th>
                  <th>轉換期間</th>
                  <th>賣回條件</th>
                  <th>擔保</th>
                </tr>
              </thead>
              <tbody>
                {data.bonds.map((bond) => (
                  <tr key={bond.bondId}>
                    <td>
                      <Link href={`/dev-preview/bonds/${encodeURIComponent(bond.bondId)}`}>
                        {formatPreviewText(bond.bondCode)} · {bond.shortName}
                      </Link>
                    </td>
                    <td>{bond.issuerName}<small>{bond.issuerCode}</small></td>
                    <td className="preview-numeric">{bond.issueDate}<small>掛牌 {formatPreviewText(bond.listingDate)}</small></td>
                    <td className="preview-numeric">{bond.maturityDate}</td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewNumber(bond.issueAmount)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewNumber(bond.outstandingAmount)}
                    </td>
                    <td className="preview-align-right preview-numeric">{formatPreviewPercent(bond.couponRate)}</td>
                    <td className="preview-align-right preview-numeric">{formatPreviewNumber(bond.initialConversionPrice)}</td>
                    <td className="preview-numeric preview-ledger-period">
                      {formatPreviewText(bond.conversionStartDate)}<br />
                      {formatPreviewText(bond.conversionEndDate)}
                    </td>
                    <td className="preview-numeric">
                      {bond.putDates.length ? bond.putDates.join("、") : "—"}<small>{formatPreviewNumber(bond.putPrice)}</small>
                    </td>
                    <td>
                      <PreviewStatusBadge tone={bond.secured ? "teal" : "neutral"}>
                        {bond.secured ? "有擔保" : "無擔保"}
                      </PreviewStatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="preview-card-list">
          {data.bonds.map((bond) => (
            <article className="preview-mobile-card" key={bond.bondId}>
              <h2>
                <Link href={`/dev-preview/bonds/${encodeURIComponent(bond.bondId)}`}>
                  {bond.shortName}
                </Link>
              </h2>
              <p>{formatPreviewText(bond.bondCode)} · {bond.issuerName}</p>
              <dl className="preview-data-grid">
                <PreviewDataField label="發行日" value={bond.issueDate} />
                <PreviewDataField label="掛牌日" value={formatPreviewText(bond.listingDate)} />
                <PreviewDataField label="到期日" value={bond.maturityDate} />
                <PreviewDataField
                  label="發行總額"
                  value={formatPreviewNumber(bond.issueAmount)}
                  numeric
                />
                <PreviewDataField
                  label="目前餘額"
                  value={formatPreviewNumber(bond.outstandingAmount)}
                  numeric
                />
                <PreviewDataField label="票面利率" value={formatPreviewPercent(bond.couponRate)} numeric />
                <PreviewDataField label="初始轉換價" value={formatPreviewNumber(bond.initialConversionPrice)} numeric />
                <PreviewDataField
                  label="擔保"
                  value={bond.secured ? "有擔保" : "無擔保"}
                />
                <PreviewDataField
                  label="轉換期間"
                  value={`${formatPreviewText(bond.conversionStartDate)} ～ ${formatPreviewText(bond.conversionEndDate)}`}
                />
                <PreviewDataField label="賣回日期" value={bond.putDates.length ? bond.putDates.join("、") : "—"} />
                <PreviewDataField label="賣回價格" value={formatPreviewNumber(bond.putPrice)} numeric />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="preview-panel preview-field-note" id="bond-fields">
        <span className="preview-section-label">FIELD MAP</span>
        <h2>閱讀順序</h2>
        <p>先以發行額與目前餘額掌握規模，再對照票面利率、初始轉換價與轉換期間；賣回條件與擔保狀態保留原始契約語意，不做推測性評級。</p>
      </section>

      <div id="bond-source"><SourceAttribution source={source} fetchedAt={source.fetchedAt} /></div>
        </div>
      </div>
    </>
  );
}
