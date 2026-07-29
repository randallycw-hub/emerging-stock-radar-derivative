import Link from "next/link";

const DATASETS = [
  { label: "興櫃公司", english: "EMERGING COMPANIES", description: "查看公司資料範圍", href: "/market", accent: "teal" },
  { label: "可轉債", english: "CONVERTIBLE BONDS", description: "查看債券事件與契約欄位", href: "/bonds", accent: "blue" },
  { label: "上市櫃進度", english: "LISTING PROGRESS", description: "查看送件與公開時程", href: "/ipo", accent: "amber" },
] as const;

export default function Homepage() {
  return (
    <main className="public-home">
      <header className="public-home-nav">
        <Link className="public-home-brand" href="/">
          <span className="public-home-mark" aria-hidden="true">觀</span>
          <span><strong>興債資訊觀測站</strong><small>PUBLIC DATA OBSERVER</small></span>
        </Link>
        <nav aria-label="主要導覽">
          <Link href="/market">資料總覽</Link>
          <Link href="/bonds">可轉債契約</Link>
          <Link href="/radar">事件雷達</Link>
          <Link href="/ipo">上市進度</Link>
          <Link href="/methodology">方法與來源</Link>
        </nav>
      </header>

      <section className="public-home-hero" aria-labelledby="public-home-title">
        <div className="public-home-hero-copy">
          <p className="public-home-kicker">PUBLIC SNAPSHOT / READ-ONLY</p>
          <h1 id="public-home-title">把公開資料，整理成<br /><em>可以核對的脈絡。</em></h1>
          <p className="public-home-lede">興櫃公司、可轉債與上市櫃進度，從登錄來源逐批驗證，只有完整發布的資料才會進入公開首頁。</p>
          <div className="public-home-actions">
            <Link className="public-home-button primary" href="/methodology">查看資料方法</Link>
            <Link className="public-home-button secondary" href="/radar">瀏覽研究頁</Link>
          </div>
        </div>
        <div className="public-home-hero-note">
          <span className="public-home-note-label">CURRENT RELEASE</span>
          <strong>尚未發布</strong>
          <p>三類正式資料尚未完成同一發布批次。資料準備完成前，首頁不顯示不完整數字。</p>
          <div className="public-home-note-rule" />
          <small>Cloud Dancer × Transformative Teal</small>
        </div>
      </section>

      <section className="public-home-status" aria-labelledby="status-title">
        <div className="public-home-section-heading">
          <div><p className="public-home-kicker">RELEASE GATE</p><h2 id="status-title">公開資料發布狀態</h2></div>
          <span className="public-home-status-chip"><i />等待完整快照</span>
        </div>
        <div className="public-home-dataset-grid">
          {DATASETS.map((dataset) => (
            <Link className={`public-home-dataset ${dataset.accent}`} href={dataset.href} key={dataset.label} aria-label={`前往${dataset.label}`}>
              <span className="public-home-dataset-index">0{DATASETS.indexOf(dataset) + 1}</span>
              <span className="public-home-dataset-copy"><small>{dataset.english}</small><strong>{dataset.label}</strong><em>{dataset.description}</em><i>目前尚未發布完整快照</i></span>
              <span className="public-home-dataset-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="public-home-source-note" aria-labelledby="source-note-title">
        <div><p className="public-home-kicker">SOURCE TRANSPARENCY</p><h2 id="source-note-title">每個狀態，都能回到來源。</h2><p>目前資料同步正在處理中；在完整快照完成前，網站不會用片段或推測內容補位。</p></div>
        <div className="public-home-source-list">
          <div><span className="source-status pending" aria-hidden="true" /><strong>資料端點</strong><small>已登錄、待最新批次驗證</small></div>
          <div><span className="source-status pending" aria-hidden="true" /><strong>發布快照</strong><small>等待三類資料同批完成</small></div>
          <Link href="/methodology">查看來源與驗證方法 <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="public-home-principles" aria-labelledby="principles-title">
        <div><p className="public-home-kicker">WHY THIS SITE</p><h2 id="principles-title">先確認，再解讀。</h2><p>每一筆公開資料都保留來源、時間與發布批次。沒有完整快照，就不把片段包裝成結論。</p></div>
        <div className="public-home-principle-list">
          <article><span>01</span><div><strong>來源可查</strong><p>只使用經核准的資料端點。</p></div></article>
          <article><span>02</span><div><strong>版本一致</strong><p>三類資料同批完成才更新公開版本。</p></div></article>
          <article><span>03</span><div><strong>可回溯</strong><p>保留 snapshot、時間與資料來源脈絡。</p></div></article>
        </div>
      </section>

      <footer className="public-home-footer"><span>興債資訊觀測站</span><span>PUBLIC DATA OBSERVER</span><Link href="/disclaimer">使用說明與限制</Link></footer>
    </main>
  );
}
