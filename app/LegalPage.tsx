import Link from "next/link";
import type { ReactNode } from "react";

export default function LegalPage({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <Link className="legal-brand" href="/market">
          <span><b>興債觀測網</b><small>興櫃公司、可轉債與上市櫃進度資訊</small></span>
        </Link>
        <nav><Link href="/market">返回首頁</Link><Link href="/about">關於本站</Link><Link href="/methodology">資料方法</Link><Link href="/disclaimer">免責聲明</Link></nav>
      </header>
      <article className="legal-document">
        <div className="legal-title"><span>{eyebrow}</span><h1>{title}</h1><p>最後更新日期：2026 年 7 月 20 日</p></div>
        <div className="legal-summary">{summary}</div>
        {children}
      </article>
      <footer className="legal-footer">
        <p>資料來源：臺灣證券交易所、證券櫃檯買賣中心、公開資訊觀測站及各資料頁標示的官方公開來源。</p>
        <p>本站僅供資訊查閱，不提供買賣建議、目標價或獲利保證。</p>
        <nav><Link href="/market">首頁</Link><Link href="/about">關於本站</Link><Link href="/methodology">資料方法</Link><Link href="/disclaimer">免責聲明</Link><Link href="/privacy">隱私權政策</Link></nav>
      </footer>
    </main>
  );
}
