import type { Metadata } from "next";
import LegalPage from "../LegalPage";

export const metadata: Metadata = {
  title: "關於本站",
  description: "興債觀測網的定位、資料原則與維護方式。",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPage eyebrow="ABOUT" title="關於本站" summary="興債觀測網整理興櫃公司、可轉債與上市櫃進度資訊；目前先建立安全、可追溯的官方資料基線。">
      <section><h2>1. 現階段資料範圍</h2><p>上市櫃申請、審議、核准、競拍、承銷定價與買賣日等公告型事件，可依臺灣證券交易所及證券櫃檯買賣中心公開資料整理。興櫃公司及可轉債的正式資料規格仍在建置，完成來源、授權及商業利用條件確認前不提供正式資料。</p></section>
      <section><h2>2. 網站定位</h2><p>本站是公開資訊的唯讀整理工具，不接受個別委任、不代客交易，也不依個人條件提供投資分析。頁面中的日期、階段與標籤只協助查閱，不代表對任何公司或有價證券的評價或推薦。</p></section>
      <section><h2>3. 資料原則</h2><p>正式資料頁必須標示來源及更新時間。資料缺漏時顯示待確認或建置中，不以推測、fixture、mock 或未授權來源補成看似真實的內容。</p></section>
      <section><h2>4. 第一版限制</h2><p>第一版不提供會員、付款、推播或正式廣告，也不提供任何即時或延遲市場行情。</p></section>
    </LegalPage>
  );
}
