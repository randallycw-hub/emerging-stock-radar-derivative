import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "興債觀測網｜前端展示版",
  description: "可轉債交易查核工作台前端展示版。",
};

export default function ShowcasePage() {
  return (
    <main className="showcase-page">
      <style>{`
        .showcase-page{min-height:100vh;padding:32px 20px;color:#ece8df;background:#211e2c;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}
        .showcase-shell{width:min(1120px,100%);margin:auto;border:1px solid #4a5365;background:#29273a;box-shadow:0 22px 60px #10101a80}
        .showcase-top{display:flex;align-items:end;justify-content:space-between;padding:28px 32px;border-bottom:1px solid #53566a}
        .showcase-top h1{margin:0;font-size:clamp(26px,4vw,44px);letter-spacing:.02em}.showcase-top p{margin:8px 0 0;color:#b8bdc8;font-size:13px}
        .showcase-status{padding:8px 11px;color:#211e2c;background:#e6c364;font-size:11px;font-weight:800;white-space:nowrap}
        .showcase-body{display:grid;grid-template-columns:86px 1fr;min-height:540px}.showcase-rail{display:grid;align-content:start;gap:12px;padding:20px 14px;background:#181723;border-right:1px solid #484957}.showcase-rail span{display:grid;place-items:center;height:48px;color:#aeb2c0;border:1px solid #4e5161;font-size:11px}.showcase-rail span:first-child{color:#211e2c;background:#e6c364;border-color:#e6c364}
        .showcase-main{padding:28px 32px}.showcase-kicker{color:#8fa9bb;font-size:10px;letter-spacing:.14em}.showcase-main h2{margin:8px 0 20px;font-size:25px}.showcase-work{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}.showcase-sheet{padding:18px;border:1px solid #56586b;background:#272536}.showcase-sheet h3{margin:0 0 11px;color:#d7d9e1;font-size:13px}.showcase-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid #47495a;color:#b6b9c3;font-size:12px}.showcase-row strong{color:#f5f1e8;text-align:right}.showcase-callout{padding:18px;border-left:5px solid #e4865b;background:#323043}.showcase-callout small{color:#b8bdc8}.showcase-callout strong{display:block;margin-top:14px;color:#e6c364;font-size:31px}.showcase-timeline{display:grid;grid-template-columns:repeat(4,1fr);margin-top:22px;border-top:2px solid #718a98}.showcase-timeline div{position:relative;padding:15px 9px 5px;border-left:1px solid #454858;color:#9ea8b3;font-size:11px}.showcase-timeline div:before{position:absolute;top:-8px;left:10px;width:11px;height:11px;background:#e4865b;border:2px solid #211e2c;border-radius:50%;content:""}.showcase-timeline b{display:block;margin-top:6px;color:#e5e1d7}.showcase-note{margin-top:24px;padding:13px 15px;color:#aeb2c0;background:#211e2c;border-left:3px solid #e6c364;font-size:11px;line-height:1.7}.showcase-note strong{color:#e6c364}@media(max-width:700px){.showcase-top{display:block;padding:22px}.showcase-status{display:inline-block;margin-top:15px}.showcase-body{grid-template-columns:54px 1fr}.showcase-rail{padding:12px 7px}.showcase-main{padding:21px 16px}.showcase-work{grid-template-columns:1fr}.showcase-timeline{grid-template-columns:repeat(2,1fr);row-gap:10px}}
      `}</style>
      <div className="showcase-shell">
        <header className="showcase-top">
          <div><h1>可轉債契約藍圖</h1><p>研究帳式查核 · Blueprint Rail navigation · CB 6248</p></div>
          <span className="showcase-status">前端展示版</span>
        </header>
        <div className="showcase-body">
          <nav className="showcase-rail" aria-label="展示導覽"><span>總覽</span><span>條款</span><span>事件</span><span>來源</span></nav>
          <section className="showcase-main">
            <div className="showcase-kicker">CONVERTIBLE BOND / CONTRACT LEDGER</div>
            <h2>示例可轉債 · 交易前核對</h2>
            <div className="showcase-work">
              <article className="showcase-sheet"><h3>契約欄位</h3><div className="showcase-row"><span>發行總額</span><strong>20 億元</strong></div><div className="showcase-row"><span>目前餘額</span><strong>12.4 億元</strong></div><div className="showcase-row"><span>票面利率</span><strong>1.25%</strong></div><div className="showcase-row"><span>擔保狀態</span><strong>無擔保</strong></div></article>
              <article className="showcase-callout"><small>轉換權查核</small><strong>100.00</strong><div className="showcase-row"><span>開始</span><strong>2025.07.01</strong></div><div className="showcase-row"><span>截止</span><strong>2030.05.20</strong></div></article>
            </div>
            <div className="showcase-timeline"><div>發行<b>2025.06.20</b></div><div>掛牌<b>2025.06.25</b></div><div>轉換窗口<b>2025.07—2030.05</b></div><div>到期<b>2030.06.20</b></div></div>
            <p className="showcase-note"><strong>展示說明</strong>　此頁用於確認前端版面與操作方向，不代表即時行情；正式資料會顯示官方資料日期、抓取時間與原始來源。</p>
          </section>
        </div>
      </div>
    </main>
  );
}
