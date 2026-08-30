import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCbRedemptionDetail,
  validateApprovedCbRedemptionDetailUrl,
} from "../../lib/source-verification/source-cb-rights-event.ts";

const discovery = Object.freeze({
  issuerCode: "3167",
  issuerName: "大量",
  bondCode: "31672",
  bondName: "大量二",
  announcementDate: "2026-08-13",
  delistingDate: "2026-10-01",
  subject: "公告大量股份有限公司國內第二次無擔保轉換公司債(簡稱：大量二，代碼：31672)發行公司行使債券贖回權暨訂於115年10月01日終止櫃檯買賣等相關事宜。",
  detailUrl: "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3167&date1=20260813&seq_no=1&pub_class=0&firstin=1",
});
const detailHtml = `
<html><body>
公開資訊觀測站 轉換公司債強制贖回及下櫃公告
公司代號：3167 公司簡稱：大量 債券代碼：31672 債券簡稱：大量二
三、依據：依大量科技國內第二次無擔保轉換公司債發行及轉換辦法第十八條規定辦理。
四、公告事項：發行公司於115/09/01 至115/09/30 行使債券贖回權，贖回權價格為債券面額之100.0000%。
一、通知及受理轉換公司債收回期間：115年9月1日起至115年9月30日止
證券商受理期間：115年8月31日起至115年9月29日止
二、轉換公司債收回基準日：115年9月30日
三、轉換公司債終止櫃檯買賣日期：115年10月1日
四、每張債券收回價格：新台幣100,000元整。
五、本公司執行收回請求，債券持有人請求轉換之最後期限為本轉換公司債終止櫃檯買賣日後第二個營業日(應於115年10月2日前向往來券商提出申請)。
</body></html>
`;

test("parses official redemption detail dates, price, reason and stable source identity", () => {
  const event = parseCbRedemptionDetail(
    detailHtml,
    discovery,
    "2026-08-30T00:00:00.000Z",
  );

  assert.deepEqual(
    {
      eventId: event.eventId,
      eventType: event.eventType,
      announcementDate: event.announcementDate,
      acceptStartDate: event.acceptStartDate,
      acceptEndDate: event.acceptEndDate,
      brokerAcceptStartDate: event.brokerAcceptStartDate,
      brokerAcceptEndDate: event.brokerAcceptEndDate,
      recordDate: event.recordDate,
      lastTradingDate: event.lastTradingDate,
      lastConversionDate: event.lastConversionDate,
      redemptionPrice: event.redemptionPrice,
      redemptionPricePercent: event.redemptionPricePercent,
      sourceUrl: event.sourceUrl,
    },
    {
      eventId: "mops-redemption:31672:2026-08-13:1",
      eventType: "early_redemption",
      announcementDate: "2026-08-13",
      acceptStartDate: "2026-09-01",
      acceptEndDate: "2026-09-30",
      brokerAcceptStartDate: "2026-08-31",
      brokerAcceptEndDate: "2026-09-29",
      recordDate: "2026-09-30",
      lastTradingDate: "2026-10-01",
      lastConversionDate: "2026-10-02",
      redemptionPrice: "100000",
      redemptionPricePercent: "100",
      sourceUrl: discovery.detailUrl,
    },
  );
  assert.match(event.reason ?? "", /第十八條/u);
  assert.match(event.rawSourceId, /^mops-redemption:31672:2026-08-13:1$/);
  assert.match(event.rawTextHash, /^sha256:[a-f0-9]{64}$/);
});

test("rejects a MOPS redemption detail URL that is not the discovery contract", () => {
  assert.throws(
    () => validateApprovedCbRedemptionDetailUrl(
      "https://mopsov.twse.com.tw/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3167&date1=20260813&seq_no=1&pub_class=0",
    ),
    /query parameters/i,
  );
  assert.throws(
    () => validateApprovedCbRedemptionDetailUrl(
      "https://example.com/mops/web/ajax_t120sb23?TYPEK=otc&co_id=3167&date1=20260813&seq_no=1&pub_class=0&firstin=1",
    ),
    /unapproved/i,
  );
});
