import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "隱私權政策",
  description: "興債觀測網的資料蒐集、Cookie 與外部連結隱私說明。",
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="PRIVACY POLICY" title="隱私權政策" summary="本站現階段不要求註冊帳號，不提供留言、付款或聯絡表單，也不設置正式廣告。">
      <section><h2>1. 適用範圍</h2><p>本政策說明「興債觀測網」在訪客瀏覽網站時可能處理的使用資訊，不適用於連結的主管機關、交易所、櫃買中心、公開資訊觀測站或公司網站。</p></section>
      <section><h2>2. 技術資訊</h2><p>本站不要求訪客提供姓名、電話、身分證字號或投資部位。託管服務可能為安全與效能處理 IP 位址、瀏覽器類型、請求時間、頁面及錯誤紀錄。</p></section>
      <section><h2>3. Cookie 與本機儲存</h2><p>本站目前不主動設置跨站追蹤 Cookie，也不以瀏覽資料判斷個別訪客的投資偏好。</p></section>
      <section><h2>4. 官方外部連結</h2><p>點擊官方來源或公司官網後，資料處理方式由該網站的隱私權政策與服務條款規範；連結不表示彼此有合作、授權或背書關係。</p></section>
      <section><h2>5. 未來功能</h2><p>第一版不做會員、付款、推播或正式廣告。若日後功能或法規要求變更，本站會在啟用前更新本政策。</p></section>
    </LegalPage>
  );
}
