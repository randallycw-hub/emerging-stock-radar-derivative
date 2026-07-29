"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BondRecord = Record<string, string | undefined> & { bondCode?: string; bondName?: string };

export default function BondDetailClient({ bondCode }: { bondCode: string }) {
  const [bond, setBond] = useState<BondRecord | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "missing">("loading");
  useEffect(() => {
    let active = true;
    fetch("/api/public-snapshot", { cache: "no-store" })
      .then(response => response.json() as Promise<{ status?: string; datasets?: { "11406"?: { records?: Array<{ value?: BondRecord }> } } }>)
      .then(payload => {
        if (!active) return;
        if (payload.status !== "published") { setState("unavailable"); return; }
        const found = payload.datasets?.["11406"]?.records?.map(record => record.value || {}).find(record => record.bondCode === bondCode) || null;
        setBond(found);
        setState(found ? "ready" : "missing");
      })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, [bondCode]);

  if (state === "loading") return <main className="bond-detail-page"><p className="bond-detail-state">正在查詢正式發布快照…</p></main>;
  if (state === "unavailable") return <main className="bond-detail-page"><Link href="/bonds">← 返回可轉債契約</Link><section className="bond-detail-state"><h1>正式資料尚未發布</h1><p>目前沒有合格的官方可轉債發布快照，無法顯示 {bondCode} 的契約數值。</p></section></main>;
  if (state === "missing" || !bond) return <main className="bond-detail-page"><Link href="/bonds">← 返回可轉債契約</Link><section className="bond-detail-state"><h1>找不到債券</h1><p>正式發布快照中沒有代碼 {bondCode}。</p></section></main>;

  const fields: Array<[string, string]> = [
    ["發行人", `${bond.issuerCompanyName || "—"}${bond.issuerCompanyCode ? `（${bond.issuerCompanyCode}）` : ""}`],
    ["發行日", bond.issueDate || "—"], ["掛牌日", bond.listingDate || "—"], ["到期日", bond.maturityDate || "—"],
    ["發行總額", bond.issueAmount || "—"], ["目前餘額", bond.currentOutstandingBalance || "—"], ["票面利率", bond.couponRate || "—"],
    ["初始轉換價", bond.initialConversionPrice || "—"], ["轉換開始", bond.conversionStartDate || "—"], ["轉換截止", bond.conversionEndDate || "—"],
    ["擔保狀態", bond.guaranteeStatus || "—"], ["官方資料日期", bond.officialDataDate || "—"],
  ];
  return <main className="bond-detail-page"><Link href="/bonds">← 返回可轉債契約</Link><header><span>OFFICIAL CONTRACT DETAIL</span><h1>{bond.bondCode || bondCode}</h1><p>{bond.bondName || "官方未提供債券簡稱"}</p></header><section className="bond-detail-panel"><h2>發行條件與契約欄位</h2><dl>{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><p className="bond-detail-disclaimer">本頁僅呈現官方發布快照的契約資料，不提供成交價格、買賣價、折溢價、理論價格或投資建議。</p></main>;
}
