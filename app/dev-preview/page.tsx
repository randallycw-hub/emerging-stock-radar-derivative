import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PreviewDataField,
  PreviewStatusBadge,
  SourceAttribution,
} from "./_components/PreviewUi.tsx";
import { PreviewSearch } from "./_components/PreviewSearch.tsx";
import { buildPreviewDashboard } from "../../lib/preview/dashboard.ts";
import {
  formatPreviewNumber,
  formatPreviewPercent,
  formatPreviewText,
} from "../../lib/preview/format.ts";
import { loadPreviewData } from "../../lib/preview/loader.ts";
import { isPreviewDevelopmentRuntime } from "../../lib/preview/runtime.ts";

export default async function DevPreviewPage() {
  if (!isPreviewDevelopmentRuntime()) notFound();
  const data = await loadPreviewData();
  const dashboard = buildPreviewDashboard(data);

  return (
    <>
      <section className="preview-dashboard-hero">
        <div className="preview-hero-copy">
          <span className="preview-section-label">Daily fixture dashboard</span>
          <p className="preview-hero-brand">興債觀測網</p>
          <h1>每日興櫃與可轉債資訊儀表板</h1>
          <p className="preview-hero-subtitle">
            興櫃公司、可轉債與上市櫃進度資訊
          </p>
          <p className="preview-hero-description">
            整理興櫃公司營收、可轉債發行條款與重要日期。
          </p>
        </div>
        <PreviewSearch data={data} />
      </section>

      <section
        className="preview-dashboard-summary"
        aria-label="摘要指標"
      >
        <article className="preview-summary-card">
          <span>公司樣本數</span>
          <strong>{dashboard.companyCount}</strong>
          <p>預覽樣本</p>
        </article>
        <article className="preview-summary-card">
          <span>債券樣本數</span>
          <strong>{dashboard.bondCount}</strong>
          <p>預覽樣本</p>
        </article>
        <article className="preview-summary-card">
          <span>最新資料月份</span>
          <strong>{dashboard.latestRevenueMonth}</strong>
          <p>預覽樣本</p>
        </article>
        <article className="preview-summary-card">
          <span>最近一個可轉債重要日期</span>
          <strong>{formatPreviewText(dashboard.nearestBondImportantDate?.date)}</strong>
          <p>
            預覽樣本
            {dashboard.nearestBondImportantDate
              ? `・${dashboard.nearestBondImportantDate.entityLabel} ${dashboard.nearestBondImportantDate.label}`
              : ""}
          </p>
        </article>
      </section>

      <section className="preview-visual-overview" aria-label="資料狀態視覺摘要">
        <div className="preview-visual-overview-head">
          <div>
            <span className="preview-section-label">Snapshot signal</span>
            <h2>目前資料輪廓</h2>
          </div>
          <PreviewStatusBadge tone="teal">fixture 可核對</PreviewStatusBadge>
        </div>
        <div className="preview-visual-overview-grid">
          <article className="preview-visual-card preview-visual-card-teal">
            <span>公司涵蓋</span><strong>{dashboard.companyCount}</strong><small>筆月營收樣本</small>
            <div className="preview-visual-track"><i style={{ width: `${Math.min(100, dashboard.companyCount * 25)}%` }} /></div>
          </article>
          <article className="preview-visual-card preview-visual-card-ink">
            <span>債券條款</span><strong>{dashboard.bondCount}</strong><small>筆契約樣本</small>
            <div className="preview-visual-track"><i style={{ width: `${Math.min(100, dashboard.bondCount * 25)}%` }} /></div>
          </article>
          <article className="preview-visual-card preview-visual-card-clay">
            <span>資料月份</span><strong>{dashboard.latestRevenueMonth}</strong><small>官方資料日期</small>
            <div className="preview-visual-rule" />
          </article>
        </div>
      </section>

      <section className="preview-panel" id="revenue-summary">
        <div className="preview-panel-head">
          <div>
            <h2>預覽樣本營收摘要</h2>
            <p>依年增率由高至低排列，不延伸為評比或判斷。</p>
          </div>
          <PreviewStatusBadge tone="teal">
            {dashboard.latestRevenueMonth}
          </PreviewStatusBadge>
        </div>
        <div className="preview-table-region">
          <div className="preview-table-scroll">
            <table className="preview-table preview-dashboard-revenue-table">
              <thead>
                <tr>
                  <th>公司</th>
                  <th>月份</th>
                  <th className="preview-align-right">當月營收</th>
                  <th className="preview-align-right">月增率</th>
                  <th className="preview-align-right">年增率</th>
                  <th className="preview-align-right">累計年增率</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.revenueRows.map((company) => (
                  <tr key={company.companyId}>
                    <td>
                      <Link href={`/dev-preview/emerging/${company.companyId}`}>
                        {company.companyCode} {company.companyName}
                      </Link>
                    </td>
                    <td>{company.yearMonth}</td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewNumber(company.currentMonthRevenue)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewPercent(company.monthOverMonthPercent)}
                    </td>
                    <td className="preview-align-right preview-numeric">
                      {formatPreviewPercent(company.yearOverYearPercent)}
                      <span className="preview-growth-meter" aria-hidden="true"><i style={{ width: `${percentWidth(company.yearOverYearPercent)}%` }} /></span>
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
          {dashboard.revenueRows.map((company) => (
            <article className="preview-mobile-card" key={company.companyId}>
              <h2>
                <Link href={`/dev-preview/emerging/${company.companyId}`}>
                  {company.companyCode} {company.companyName}
                </Link>
              </h2>
              <p>{company.yearMonth}</p>
              <dl className="preview-data-grid">
                <PreviewDataField
                  label="當月營收"
                  numeric
                  value={formatPreviewNumber(company.currentMonthRevenue)}
                />
                <PreviewDataField
                  label="月增率"
                  numeric
                  value={formatPreviewPercent(company.monthOverMonthPercent)}
                />
                <PreviewDataField
                  label="年增率"
                  numeric
                  value={formatPreviewPercent(company.yearOverYearPercent)}
                />
                <PreviewDataField
                  label="累計年增率"
                  numeric
                  value={formatPreviewPercent(company.cumulativeYearOverYearPercent)}
                />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="preview-panel" id="bond-contracts">
        <div className="preview-panel-head">
          <div>
            <h2>可轉債發行條款</h2>
            <p>僅呈現官方 fixture 內的發行契約與餘額欄位。</p>
          </div>
          <PreviewStatusBadge>{dashboard.bondCount} 筆</PreviewStatusBadge>
        </div>
        <div className="preview-dashboard-bond-grid">
          {dashboard.bonds.map((bond) => (
            <article className="preview-bond-card" key={bond.bondId}>
              <div className="preview-bond-card-head">
                <div>
                  <span>{formatPreviewText(bond.bondCode)}</span>
                  <h3>
                    <Link href={`/dev-preview/bonds/${bond.bondId}`}>
                      {bond.shortName}
                    </Link>
                  </h3>
                  <p>發行人：{bond.issuerName}</p>
                </div>
                <PreviewStatusBadge tone={bond.secured ? "teal" : "neutral"}>
                  {bond.secured ? "有擔保" : "無擔保"}
                </PreviewStatusBadge>
              </div>
              <dl className="preview-data-grid preview-bond-data-grid">
                <PreviewDataField
                  label="發行總額"
                  numeric
                  value={formatPreviewNumber(bond.issueAmount)}
                />
                <PreviewDataField
                  label="目前餘額"
                  numeric
                  value={formatPreviewNumber(bond.outstandingAmount)}
                />
                <PreviewDataField
                  label="轉換期間"
                  value={`${formatPreviewText(bond.conversionStartDate)}－${formatPreviewText(bond.conversionEndDate)}`}
                />
                <PreviewDataField label="到期日" value={bond.maturityDate} />
              </dl>
              <div className="preview-bond-meta"><span>條款狀態</span><strong>{bond.secured ? "已標示擔保" : "未標示擔保"}</strong><span>資料來源</span><strong>{bond.source.providerName}</strong></div>
            </article>
          ))}
        </div>
      </section>

      <section className="preview-panel" id="important-dates">
        <div className="preview-panel-head">
          <div>
            <h2>重要日期</h2>
            <p>各類型依官方資料日期選取最近一筆 fixture 日期。</p>
          </div>
          <PreviewStatusBadge tone="amber">日期提醒</PreviewStatusBadge>
        </div>
        <div className="preview-important-date-grid">
          {dashboard.importantDates.map((event) => (
            <article className="preview-important-date-card" key={event.type}>
              <PreviewStatusBadge tone="amber">{event.label}</PreviewStatusBadge>
              <strong>{event.date}</strong>
              <Link href={event.href}>{event.entityLabel}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="preview-panel" id="timeline">
        <div className="preview-panel-head">
          <div>
            <h2>資料時間軸</h2>
            <p>依預覽樣本日期自動整理</p>
          </div>
          <PreviewStatusBadge>{dashboard.timeline.length} 個事件</PreviewStatusBadge>
        </div>
        <ol className="preview-timeline">
          {dashboard.timeline.map((event) => (
            <li key={event.id}>
              <time dateTime={event.date}>{event.date}</time>
              <div>
                <strong>{event.label}</strong>
                <Link href={event.href}>{event.entityLabel}</Link>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="preview-panel" id="quick-links">
        <div className="preview-panel-head">
          <div>
            <h2>快速入口</h2>
            <p>前往預覽資料頁或本頁指定區段。</p>
          </div>
        </div>
        <nav className="preview-quick-links" aria-label="預覽快速入口">
          <Link href="/dev-preview/emerging">興櫃月營收</Link>
          <Link href="/dev-preview/bonds">可轉債資料</Link>
          <Link href="#important-dates">重要日期</Link>
          <Link href="#data-sources">資料來源</Link>
        </nav>
      </section>

      <section className="preview-panel preview-listing-placeholder" id="listing-progress">
        <div className="preview-panel-body">
          <PreviewStatusBadge tone="amber">來源驗證中</PreviewStatusBadge>
          <h2>上市櫃進度</h2>
          <p>官方資料來源尚在驗證中，完成後將提供申請、審議與掛牌進度。</p>
          <div className="preview-listing-stages" aria-label="上市櫃進度資料狀態">
            <div><strong>申請</strong><span>尚未納入預覽</span></div>
            <div><strong>審議</strong><span>等待來源驗證</span></div>
            <div><strong>掛牌</strong><span>不以推測內容補位</span></div>
          </div>
        </div>
      </section>

      <section className="preview-panel" id="data-sources">
        <div className="preview-panel-head">
          <div>
            <h2>資料透明度</h2>
            <p>本頁僅使用已提交、經最小化的官方資料測試樣本。</p>
          </div>
        </div>
        <div className="preview-transparency-grid">
          <article>
            <h3>{data.revenueSource.datasetName}</h3>
            <dl>
              <PreviewDataField label="樣本列數" value={data.companies.length} />
              <PreviewDataField label="擷取時間" value={data.revenueSource.fetchedAt} />
              <PreviewDataField label="授權" value={data.revenueSource.licenseName} />
            </dl>
          </article>
          <article>
            <h3>{data.bondSource.datasetName}</h3>
            <dl>
              <PreviewDataField label="樣本列數" value={data.bonds.length} />
              <PreviewDataField label="擷取時間" value={data.bondSource.fetchedAt} />
              <PreviewDataField label="授權" value={data.bondSource.licenseName} />
            </dl>
          </article>
        </div>
        <p className="preview-transparency-note">
          預覽樣本僅供介面驗證，正式版資料仍以官方來源為準。
        </p>
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

function percentWidth(value?: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(6, Math.abs(numeric)));
}
