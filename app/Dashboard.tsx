"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Tab = "market" | "radar" | "ipo";
type StageKey = "submitted" | "review" | "board" | "contract" | "auction";

type RadarRow = {
  signal: string;
  stage: string;
  code: string;
  name: string;
  market: string;
  status: string;
  submitDays: number | string;
  mainExit: string;
  exitDate: string;
  exitDays: number | string;
  listingDate: string;
  auctionNext: string;
  reason: string;
  note: string;
};

type StageItem = {
  code: string;
  name: string;
  market: string;
  status: string;
  submitDate?: string;
  reviewDate?: string;
  boardDate?: string;
  approvalDate?: string;
  listingDate?: string;
};

type TrackerPayload = {
  generatedAt: string;
  counts: Record<string, number>;
  categories: Record<StageKey, StageItem[]>;
  radar: RadarRow[];
  upcoming: Array<{
    event: string;
    code: string;
    name: string;
    date: string;
    days: number;
    signal: string;
  }>;
  raw: Record<string, number>;
};

type CompanyProfile = {
  code: string;
  name: string;
  fullName: string;
  industry: string;
  subindustry: string;
  mainBusiness: string;
  concepts: string[];
  website: string;
  chairman: string;
  capital: number;
  listedDate: string;
  sourceUrl: string;
  checkedAt: string;
};

const EMPTY_TRACKER: TrackerPayload = {
  generatedAt: "",
  counts: {},
  categories: { submitted: [], review: [], board: [], contract: [], auction: [] },
  radar: [],
  upcoming: [],
  raw: {},
};

const NAV_ITEMS: Array<{ tab: Tab; href: string; title: string; description: string }> = [
  { tab: "market", href: "/market", title: "資料總覽", description: "來源建置狀態" },
  { tab: "radar", href: "/radar", title: "上市櫃進度", description: "公開事件整理" },
  { tab: "ipo", href: "/ipo", title: "IPO 時程", description: "申請階段與日期" },
];

async function fetchTrackerPayload(): Promise<TrackerPayload> {
  const response = await fetch("/api/tracker", { cache: "no-store" });
  const payload = await response.json() as TrackerPayload & { error?: string };
  if (!response.ok) throw new Error(payload.error || "上市櫃進度資料無法取得");
  return payload;
}

export default function Dashboard({ initialTab = "market" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tracker, setTracker] = useState<TrackerPayload>(EMPTY_TRACKER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("all");
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadTracker = useCallback(async () => {
    try {
      setTracker(await fetchTrackerPayload());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchTrackerPayload()
      .then(payload => { if (active) setTracker(payload); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openProfile = useCallback(async (code: string) => {
    setProfileLoading(true);
    setProfile(null);
    try {
      const response = await fetch(`/api/company?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = await response.json() as CompanyProfile & { error?: string };
      if (!response.ok) throw new Error(payload.error || "公司基本資料無法取得");
      setProfile(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const visibleRadar = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("zh-TW");
    return tracker.radar.filter(row => {
      const matchesKeyword = !keyword
        || `${row.code} ${row.name} ${row.market} ${row.status} ${row.stage}`.toLocaleLowerCase("zh-TW").includes(keyword);
      const matchesStage = stage === "all" || row.stage.startsWith(stage);
      return matchesKeyword && matchesStage;
    });
  }, [search, stage, tracker.radar]);

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <Link className="brand-block" href="/market">
          <span><strong>興債觀測網</strong><span>PUBLIC DATA OBSERVER</span></span>
        </Link>
        <nav className="side-nav" aria-label="主要導覽">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.tab}
              className={tab === item.tab ? "active" : ""}
              href={item.href}
              onClick={() => setTab(item.tab)}
            >
              <b>{item.title}</b><small>{item.description}</small>
            </Link>
          ))}
        </nav>
        <div className="rail-status">
          <div className="rail-status-line"><span className="live-dot" /><b>公開資訊唯讀整理</b></div>
          <span>資料來源建置期間不提供市場行情</span>
          <small>{tracker.generatedAt ? `事件資料更新：${tracker.generatedAt}` : "等待事件資料"}</small>
        </div>
      </aside>

      <main className="workspace">
        <header className="command-bar">
          <div className="mobile-brand"><b>興債觀測網</b><span>興櫃公司、可轉債與上市櫃進度資訊</span></div>
          <div className="breadcrumb"><span>興債觀測網</span><b>{NAV_ITEMS.find(item => item.tab === tab)?.title}</b></div>
          <div className="command-actions">
            <button className="icon-action" type="button" onClick={() => { setLoading(true); setError(""); void loadTracker(); }} aria-label="重新整理公開進度" title="重新整理公開進度">↻</button>
          </div>
        </header>

        <div className="content">
          <section className="page-intro">
            <div>
              <span>PUBLIC INFORMATION</span>
              <h1>興債觀測網</h1>
              <p>興櫃公司、可轉債與上市櫃進度資訊</p>
            </div>
            <div className="market-state"><span className="live-dot" />不提供市場行情</div>
          </section>

          {error && <div className="error-banner" role="alert">{error}</div>}
          {tab === "market" && <ConstructionView />}
          {tab === "radar" && (
            <RadarView
              tracker={tracker}
              rows={visibleRadar}
              loading={loading}
              search={search}
              setSearch={setSearch}
              stage={stage}
              setStage={setStage}
              openProfile={openProfile}
            />
          )}
          {tab === "ipo" && <IpoView tracker={tracker} loading={loading} openProfile={openProfile} />}

          <footer className="site-footer">
            <div className="footer-warning">
              <b>資訊使用提醒</b>
              <p>本站只整理公開資訊，不提供買賣建議、目標價、獲利保證或個別化投資服務。</p>
            </div>
            <div className="footer-meta">
              <b>興債觀測網</b>
              <nav>
                <Link href="/about">關於本站</Link>
                <Link href="/methodology">資料方法</Link>
                <Link href="/disclaimer">免責聲明</Link>
                <Link href="/privacy">隱私權政策</Link>
              </nav>
            </div>
            <small>資料來源：臺灣證券交易所、證券櫃檯買賣中心及公開資訊觀測站等官方公開資料。各資料頁應以其標示的來源及更新時間為準。</small>
          </footer>
        </div>
      </main>

      {(profileLoading || profile) && (
        <CompanyDrawer
          profile={profile}
          loading={profileLoading}
          onClose={() => {
            setProfile(null);
            setProfileLoading(false);
          }}
        />
      )}
    </div>
  );
}

function ConstructionView() {
  return (
    <section className="construction-panel" aria-labelledby="construction-title">
      <span>DATA SOURCE STATUS</span>
      <h2 id="construction-title">官方資料來源建置中</h2>
      <p>官方資料來源建置中，目前不提供即時或延遲行情。</p>
      <div className="construction-grid">
        <article><b>興櫃公司</b><small>資料規格、授權及商業利用條件確認中</small></article>
        <article><b>可轉債</b><small>正式來源尚未完成，不顯示 fixture 或 mock</small></article>
        <article><b>上市櫃進度</b><small>僅整理官方公告型事件，不含市場行情</small></article>
      </div>
    </section>
  );
}

function RadarView({
  tracker,
  rows,
  loading,
  search,
  setSearch,
  stage,
  setStage,
  openProfile,
}: {
  tracker: TrackerPayload;
  rows: RadarRow[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  stage: string;
  setStage: (value: string) => void;
  openProfile: (code: string) => void;
}) {
  const stages = [
    ["all", "全部階段"],
    ["A.", "送件觀察"],
    ["B.", "審議進程"],
    ["C.", "契約後"],
    ["D.", "競拍／買賣日"],
    ["E.", "已掛牌"],
  ];
  return (
    <>
      <section className="radar-banner">
        <div className="radar-copy"><span>LISTING PROGRESS</span><h2>上市櫃公開進度</h2><p>依官方申請、審議、核准、競拍與買賣日公告整理；事件標籤不是推薦。</p></div>
        <div className="radar-counts">
          <div><span>追蹤公司</span><b>{tracker.counts.total || 0}</b></div>
          <div><span>近期事件</span><b>{tracker.counts.alerts || 0}</b></div>
          <div><span>待辦時程</span><b>{tracker.counts.upcoming || 0}</b></div>
        </div>
        <div className="baseline"><span>更新時間</span><b>{tracker.generatedAt || "等待資料"}</b></div>
      </section>

      <section className="filter-surface">
        <div className="filter-grid">
          <label><span>搜尋公司</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="代號、名稱或進度" /></label>
          <label><span>進度階段</span><select value={stage} onChange={event => setStage(event.target.value)}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <div className="filter-result"><span>篩選結果</span><b>{rows.length}</b><small>筆公開進度</small></div>
      </section>

      <section className="table-surface">
        <div className="table-title"><div><span>PUBLIC EVENT TABLE</span><h2>公司進度明細</h2></div><small>來源：TWSE、TPEx 官方公開資料 · 更新：{tracker.generatedAt || "等待資料"}</small></div>
        <div className="table-wrap">
          <table className="data-table progress-table">
            <thead><tr><th>階段</th><th>代號／公司</th><th>市場</th><th>目前進度</th><th>主要事件</th><th>事件日期</th><th>分類依據</th></tr></thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.market}-${row.code}`}>
                  <td><span className={`signal-chip ${signalClass(row.signal)}`}>{row.signal}</span><span className="subtext">{row.stage}</span></td>
                  <td><button className="company-button" type="button" onClick={() => openProfile(row.code)}>{row.name}</button><span className="subtext">{row.code}</span></td>
                  <td>{row.market}</td>
                  <td>{row.status}</td>
                  <td>{row.mainExit || row.auctionNext || "尚無排定事件"}</td>
                  <td>{row.exitDate || row.listingDate || "待公告"}<span className="subtext">{formatEventDays(row.exitDays)}</span></td>
                  <td className="reason-cell">{row.reason || row.note || "依公開日期分類"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <div className="empty">{loading ? "正在整理官方進度資料" : "目前篩選條件沒有資料"}</div>}
      </section>
    </>
  );
}

function IpoView({ tracker, loading, openProfile }: { tracker: TrackerPayload; loading: boolean; openProfile: (code: string) => void }) {
  const stages: Array<{ key: StageKey; title: string; hint: string }> = [
    { key: "submitted", title: "申請送件", hint: "尚待審議" },
    { key: "review", title: "審議階段", hint: "已進入審議" },
    { key: "board", title: "審議通過", hint: "等待後續核准" },
    { key: "contract", title: "核准／契約後", hint: "等待公開時程" },
    { key: "auction", title: "競拍／買賣日", hint: "公告事件已排定" },
  ];
  return (
    <section className="ipo-stage-overview">
      <div className="table-title"><div><span>IPO TIMELINE</span><h2>上市櫃申請階段</h2></div><small>來源：TWSE、TPEx 官方公開資料 · 更新：{tracker.generatedAt || "等待資料"}</small></div>
      <div className="ipo-stage-board">
        {stages.map((stage, index) => {
          const items = tracker.categories[stage.key] || [];
          return (
            <article className={`ipo-stage-column stage-${stage.key}`} key={stage.key}>
              <header className="ipo-stage-head"><span>{String(index + 1).padStart(2, "0")}</span><div><b>{stage.title}</b><small>{stage.hint}</small></div><strong>{items.length}</strong></header>
              <div className="ipo-company-list">
                {items.slice(0, 12).map(item => (
                  <button className="ipo-company-row" type="button" key={`${item.market}-${item.code}`} onClick={() => openProfile(item.code)}>
                    <span className="ipo-company-line"><b>{item.name}</b><i>{item.market}</i></span>
                    <small>{item.code} · {item.status}</small>
                    <span className="ipo-stage-facts"><span><i>日期</i><b>{stageDate(item, stage.key)}</b></span></span>
                  </button>
                ))}
                {!items.length && <div className="ipo-stage-empty">{loading ? "資料整理中" : "目前沒有資料"}</div>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function CompanyDrawer({ profile, loading, onClose }: { profile: CompanyProfile | null; loading: boolean; onClose: () => void }) {
  const website = normalizeWebsite(profile?.website || "");
  return (
    <>
      <button className="drawer-backdrop" type="button" aria-label="關閉公司資料" onClick={onClose} />
      <aside className="drawer" aria-label="公司基本資料">
        <header className="drawer-head">
          <div><span>OFFICIAL COMPANY PROFILE</span><h2>{profile?.name || "公司資料整理中"}</h2><p>{profile ? `${profile.code} · ${profile.industry}` : "請稍候"}</p></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="關閉">×</button>
        </header>
        <div className="drawer-body">
          {loading && <div className="profile-loading"><span /><span /><span /><span /></div>}
          {profile && (
            <section className="profile-section">
              <div className="profile-section-title"><span>01</span><h3>官方公司基本資料</h3><small>查核：{formatTaipeiDateTime(profile.checkedAt)}</small></div>
              <dl className="profile-grid">
                <dt>公司全名</dt><dd>{profile.fullName || profile.name}</dd>
                <dt>產業</dt><dd>{profile.industry}</dd>
                <dt>主要業務</dt><dd>{profile.mainBusiness}</dd>
                <dt>董事長</dt><dd>{profile.chairman || "官方資料未提供"}</dd>
                <dt>資本額</dt><dd>{profile.capital ? `${profile.capital.toLocaleString("zh-TW")} 元` : "官方資料未提供"}</dd>
                <dt>登錄日期</dt><dd>{profile.listedDate || "官方資料未提供"}</dd>
              </dl>
              <div className="concept-list">{profile.concepts.map(label => <span className="tag" key={label}>{label}</span>)}</div>
              <div className="actions">
                {website ? <a className="link-button" href={website} target="_blank" rel="noopener noreferrer">公司官網 <span>↗</span></a> : <span className="link-unavailable">官方資料未登錄公司官網</span>}
                <a className="link-button primary" href={profile.sourceUrl} target="_blank" rel="noopener noreferrer">櫃買中心資料 <span>↗</span></a>
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function signalClass(signal: string) {
  return /已開標|近期事件|已掛牌/.test(signal)
    ? "exit"
    : /契約後|時程接近/.test(signal)
      ? "warning"
      : /審議進程/.test(signal)
        ? "hold"
        : "observe";
}

function formatEventDays(value: number | string) {
  const days = Number(value);
  if (!Number.isFinite(days) || value === "") return "";
  if (days === 0) return "今天";
  return days > 0 ? `${days} 天後` : `已過 ${Math.abs(days)} 天`;
}

function stageDate(item: StageItem, stage: StageKey) {
  const value = stage === "submitted"
    ? item.submitDate
    : stage === "review"
      ? item.reviewDate
      : stage === "board"
        ? item.boardDate
        : stage === "contract"
          ? item.approvalDate
          : item.listingDate;
  return shortIsoDate(value);
}

function shortIsoDate(value?: string) {
  if (!value) return "待公告";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })
    : value;
}

function formatTaipeiDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "本次開啟時";
  return date.toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function normalizeWebsite(value: string) {
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}
