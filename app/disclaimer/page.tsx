import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "免責聲明",
  description: "興債觀測網的網站定位、資料限制與防詐騙提醒。",
};

export default function DisclaimerPage() {
  return (
    <LegalPage eyebrow="DISCLAIMER" title="免責聲明" summary="本站內容只供資訊查閱與一般研究參考，不構成投資建議、招攬、推介、交易指示、目標價或收益保證。">
      <aside className="fraud-alert" aria-labelledby="fraud-alert-title">
        <h2 id="fraud-alert-title">防詐騙提醒</h2>
        <p>本站目前未設立或經營任何 LINE、Telegram、Discord 或其他投資群組，不會招攬會員、收取費用、代為操作、提供明牌、保證獲利，或要求匯款及提供帳戶密碼、驗證碼。</p>
        <p>如有人冒用「興債觀測網」名義索取金錢或個人資料，請勿回應或付款，並向相關平台及主管機關查證。</p>
      </aside>
      <section><h2>1. 網站定位與獨立性</h2><p>本站與所引用的主管機關、交易所、櫃買中心及公司均無隸屬、代理或背書關係，除非另有清楚書面揭露。</p></section>
      <section><h2>2. 不提供投資服務</h2><p>本站不是證券投資顧問事業，不接受個別委任、不代客交易、不收受或代管資金，也不提供買賣建議、目標價、獲利保證或個別有價證券的價值分析。</p></section>
      <section><h2>3. 事件標籤不是推薦</h2><p>申請階段、事件日期、承銷公告與顯示順序只用於整理公開資訊，不代表選股、評等、價格預測或對未來報酬的判斷。</p></section>
      <section><h2>4. 資料限制</h2><p>公開資料可能因來源延誤、錯誤、遺漏、修正、網路中斷或欄位變動而不完整。重要資訊應回到主管機關、交易所、櫃買中心、公開資訊觀測站及公司正式公告查核。</p></section>
      <section><h2>5. 使用者責任</h2><p>使用者應在採取任何交易或申購行動前查閱最新公開說明書及公告，必要時諮詢具資格的專業人士。</p></section>
    </LegalPage>
  );
}
