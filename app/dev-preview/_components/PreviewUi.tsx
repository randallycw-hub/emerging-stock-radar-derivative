import Link from "next/link";
import type { ReactNode } from "react";

import {
  formatPreviewText,
} from "../../../lib/preview/format.ts";
import type {
  PreviewSourceDto,
} from "../../../lib/preview/types.ts";

export function PreviewHeader() {
  return (
    <header className="preview-header">
      <div className="preview-header-inner">
        <Link className="preview-brand" href="/dev-preview">
          <span className="preview-brand-mark" aria-hidden="true">興</span>
          <span>
            <strong>興債觀測網</strong>
            <small>興櫃公司、可轉債與上市櫃進度資訊</small>
          </span>
        </Link>
        <nav className="preview-nav" aria-label="開發預覽導覽">
          <Link href="/dev-preview">預覽首頁</Link>
          <Link href="/dev-preview/emerging">月營收涵蓋</Link>
          <Link href="/dev-preview/bonds">可轉債資料</Link>
        </nav>
      </div>
    </header>
  );
}

export function PreviewBanner() {
  return (
    <aside className="preview-banner" role="note">
      <span aria-hidden="true">DEV</span>
      <p>開發預覽版：目前畫面使用經最小化的測試樣本，不代表完整或最新市場資料。</p>
    </aside>
  );
}

export function PreviewPageTitle({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return (
    <div className="preview-page-title">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {aside}
    </div>
  );
}

export function PreviewStatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "teal" | "amber";
}) {
  return <span className={`preview-status preview-status-${tone}`}>{children}</span>;
}

export function PreviewDataField({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="preview-data-field">
      <dt>{label}</dt>
      <dd className={numeric ? "preview-numeric" : undefined}>{value}</dd>
    </div>
  );
}

export function SourceAttribution({
  source,
  fetchedAt,
}: {
  source: PreviewSourceDto;
  fetchedAt: string;
}) {
  return (
    <section className="preview-source" aria-label={`資料來源：${source.datasetName}`}>
      <div>
        <span>官方資料來源</span>
        <h2>{source.datasetName}</h2>
        <p>{source.providerName}</p>
      </div>
      <dl>
        <PreviewDataField label="官方資料日期" value={formatPreviewText(source.officialDataDate)} />
        <PreviewDataField label="最後更新" value={fetchedAt} />
        <PreviewDataField label="授權" value={source.licenseName} />
        <PreviewDataField label="資料狀態" value="測試樣本" />
      </dl>
      <a href={source.officialUrl} rel="noreferrer" target="_blank">
        查看官方資源
      </a>
    </section>
  );
}

export function PreviewFooter() {
  return (
    <footer className="preview-footer">
      <strong>興債觀測網</strong>
      <span>本頁僅供本機開發介面驗證，資料內容請以官方來源為準。</span>
    </footer>
  );
}
