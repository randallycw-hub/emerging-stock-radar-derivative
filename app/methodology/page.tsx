import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "資料方法與分類說明",
  description: "興債觀測網的官方來源、更新時間與上市櫃事件分類原則。",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return (
    <LegalPage eyebrow="METHODOLOGY" title="資料方法與分類說明" summary="本站只採用已確認來源、授權及商業利用條件的官方公開資料；API 失敗時不切換到券商網站或未授權來源。">
      <section><h2>1. 資料來源與更新時間</h2><p>每個正式資料頁都必須顯示資料來源及更新時間。來源暫時不可用時，頁面應清楚標示無法更新，不得轉向未授權的替代服務。</p></section>
      <section><h2>2. 上市櫃事件分類</h2><p>進度依官方公開日期分為申請送件、審議、核准或契約後、競拍或買賣日排定，以及已掛牌。近期事件只表示公開日期接近，不是買賣時點或投資建議。</p></section>
      <section><h2>3. 承銷定價欄位</h2><p>暫定承銷價、最低投標價、得標價、實際承銷價與股票上市或上櫃買賣日為不同公告欄位，不互相推定。這些事件欄位不會與市場行情比較，也不用於計算溢價、報酬或交易訊號。</p></section>
      <section><h2>4. 興櫃與可轉債資料</h2><p>正式來源尚未完成前，資料區只顯示建置狀態，不載入開發用 fixture 或 mock。未來新增來源前，必須先確認官方性、授權範圍及商業利用條件。</p></section>
    </LegalPage>
  );
}
