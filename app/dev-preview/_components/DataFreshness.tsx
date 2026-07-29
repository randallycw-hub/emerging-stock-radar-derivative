import type { MarketSourceRef } from "../../../lib/preview/types.ts";
import { formatDateOrDash } from "../../../lib/preview/format.ts";

export function DataFreshness({ source }: { source: MarketSourceRef }) {
  return (
    <div className="data-freshness" aria-label="資料新鮮度">
      <span>資料日期：{formatDateOrDash(source.asOf)}</span>
      <span>資料來源：{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}</span>
    </div>
  );
}
