import assert from "node:assert/strict";
import test from "node:test";

import { assertExactCbasSheetNames, parseCbasRows } from "../../lib/private-cb-import/cbas-parser.mjs";

const QUOTE_HEADERS = [
  "名稱", "代號", "擔保", "TCRI", "百元報價", "折現率", "選擇權到期日", "賣回日", "年期", "賣回價",
  "轉換價", "轉換價值", "CB市價", "溢/折價", "參考單價", "餘額", "發行張數", "波動度(21D)", "承作限制", "備註", "可承作起日", "", "spread",
];

test("CBAS row parser maps quotes, upcoming redemption and close-conversion sections", () => {
  const parsed = parseCbasRows({
    quoteRows: [
      [null, "日期：", new Date("2026-08-24T00:00:00Z")],
      QUOTE_HEADERS,
      ["長興二", "17172", "無", 3, 0.0938, 0.0325, new Date("2029-05-25T00:00:00Z"), new Date("2029-06-08T00:00:00Z"), 2.79, 100, 75.7, 0.9458, 132.4, 0.3998, 41780, 1, 20000, 0.684, "確認額度", null, null, "長興二", 0.003],
    ],
    dueRows: [
      ["狀態", "標的", "名稱", "CB市價", "賣回價", "賣回日", "CB餘額", "流通%", "到期日", "強制贖回日"],
      ["強贖", "89964", "高力四", 463, 100.7519, new Date("2026-12-06T00:00:00Z"), 71, 0.0071, new Date("2028-12-06T00:00:00Z"), new Date("2026-08-27T00:00:00Z")],
      ["到期", "12345", "測試債", 100, 100, new Date("2026-12-06T00:00:00Z"), 1, 0.01, new Date("2028-12-06T00:00:00Z"), "--"],
    ],
    stopRows: [
      ["債券代碼\nBond Code", "債券簡稱\nShort Name", "停止轉(交)換起日\nStart Date", "停止轉(交)換迄日\nDue Date", "停止轉(交)換事由\nReason of Close Conversion"],
      ["11011", "台泥一永", "2026/09/14", "2026/10/13", "股東臨時會"],
    ],
  });

  assert.equal(parsed.sourceDate, "2026-08-24");
  assert.equal(parsed.quoteRecords[0].bondCode, "17172");
  assert.equal(parsed.quoteRecords[0].cbMarketPrice, 132.4);
  assert.equal(parsed.dueRecords[0].forceRedemptionDate, "2026-08-27");
  assert.equal(parsed.dueRecords[1].forceRedemptionDate, null);
  assert.equal(parsed.conversionStops[0].startDate, "2026-09-14");
});

test("CBAS worksheet allowlist rejects unknown worksheets and duplicate canonical rows", () => {
  assert.throws(() => assertExactCbasSheetNames(["金融交易部資產交換選擇權報價表", "未知"]), /unknown CBAS worksheet/i);
  assert.throws(() => parseCbasRows({
    quoteRows: [[null, "日期：", new Date("2026-08-24T00:00:00Z")], QUOTE_HEADERS, ["甲", "17172"], ["乙", "17172"]],
    dueRows: [["狀態", "標的", "名稱", "CB市價", "賣回價", "賣回日", "CB餘額", "流通%", "到期日", "強制贖回日"]],
    stopRows: [["債券代碼", "債券簡稱", "起日", "迄日", "事由"]],
  }), /duplicate/i);
});
