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
  formatPreviewText,
} from "../../../../lib/preview/format.ts";
import { findPreviewBond } from "../../../../lib/preview/data.ts";
import { loadPreviewData } from "../../../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../../../lib/preview/runtime.ts";

export default async function BondDetailPreviewPage({
  params,
}: {
  params: Promise<{ bondId: string }>;
}) {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const { bondId } = await params;
  const bond = findPreviewBond(data, bondId);
  if (!bond) notFound();

  return (
    <>
      <PreviewPageTitle
        eyebrow={formatPreviewText(bond.bondCode)}
        title={bond.shortName}
        description={`${bond.issuerName} · 官方 fixture 資料日期 ${bond.source.officialDataDate}`}
        aside={
          <PreviewStatusBadge tone={bond.secured ? "teal" : "neutral"}>
            {bond.secured ? "有擔保" : "無擔保"}
          </PreviewStatusBadge>
        }
      />

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>基本資料與發行人</h2>
            <p>債券識別與發行契約欄位均來自經正規化的 11406 測試樣本。</p>
          </div>
        </div>
        <dl className="preview-data-grid">
          <PreviewDataField label="債券代碼" value={formatPreviewText(bond.bondCode)} />
          <PreviewDataField label="債券簡稱" value={bond.shortName} />
          <PreviewDataField label="發行人代碼" value={bond.issuerCode} />
          <PreviewDataField label="發行人名稱" value={bond.issuerName} />
          <PreviewDataField label="發行總額" value={formatPreviewNumber(bond.issueAmount)} numeric />
          <PreviewDataField
            label="目前餘額"
            value={formatPreviewNumber(bond.outstandingAmount)}
            numeric
          />
          <PreviewDataField
            label="票面利率"
            value={formatPreviewPercent(bond.couponRate)}
            numeric
          />
          <PreviewDataField label="募集方式" value={formatPreviewText(bond.offeringMethod)} />
        </dl>
      </section>

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>日期與轉換契約</h2>
            <p>空白欄位以「—」顯示，不從其他日期推算。</p>
          </div>
        </div>
        <dl className="preview-data-grid">
          <PreviewDataField label="發行日" value={bond.issueDate} />
          <PreviewDataField label="掛牌日" value={formatPreviewText(bond.listingDate)} />
          <PreviewDataField label="到期日" value={bond.maturityDate} />
          <PreviewDataField
            label="轉換期間起"
            value={formatPreviewText(bond.conversionStartDate)}
          />
          <PreviewDataField
            label="轉換期間迄"
            value={formatPreviewText(bond.conversionEndDate)}
          />
          <PreviewDataField
            label="發行時轉換價格"
            value={formatPreviewNumber(bond.initialConversionPrice)}
            numeric
          />
          <PreviewDataField
            label="賣回權日期"
            value={bond.putDates.length > 0 ? bond.putDates.join("、") : "—"}
          />
          <PreviewDataField
            label="賣回權價格"
            value={formatPreviewNumber(bond.putPrice)}
            numeric
          />
        </dl>
      </section>

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>擔保與受託資訊</h2>
            <p>只呈現官方 fixture 已提供的契約文字。</p>
          </div>
        </div>
        <dl className="preview-data-grid">
          <PreviewDataField label="擔保狀態" value={bond.secured ? "有擔保" : "無擔保"} />
          <PreviewDataField
            label="擔保說明"
            value={formatPreviewText(bond.securityDescription)}
          />
          <PreviewDataField label="承銷機構" value={formatPreviewText(bond.underwriter)} />
          <PreviewDataField label="受託人" value={formatPreviewText(bond.trustee)} />
        </dl>
      </section>

      <section className="preview-panel">
        <div className="preview-panel-head">
          <div>
            <h2>最近餘額異動</h2>
            <p>日期與原因必須同時存在；缺值時維持空白語意。</p>
          </div>
        </div>
        <dl className="preview-data-grid">
          <PreviewDataField
            label="最近餘額異動日"
            value={formatPreviewText(bond.outstandingChangeDate)}
          />
          <PreviewDataField
            label="最近餘額異動原因"
            value={formatPreviewText(bond.outstandingChangeReason)}
          />
        </dl>
      </section>

      <SourceAttribution source={bond.source} fetchedAt={bond.source.fetchedAt} />
    </>
  );
}
