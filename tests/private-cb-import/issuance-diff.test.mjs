import assert from "node:assert/strict";
import test from "node:test";

import { diffSnapshots } from "../../lib/private-cb-import/diff.mjs";
import { parseIssuanceRows } from "../../lib/private-cb-import/issuance-parser.mjs";

test("issuance parser maps the 18-column IPO sheet with a filename-derived source date", () => {
  const snapshot = parseIssuanceRows({
    fileName: "CB發行案件更新_20260821.xlsx",
    rows: [
      [null, "代碼", "債券代碼", "發行標的", "TCRI/擔保", "發行量\n(億)", "主辦券商", "公告日", "送件日", "生效日", "詢圈/競拍", "溢價率%", "轉換價", "掛牌日", "ASO可拆解日", "賣回條件", "年期", "備註"],
      ["掛牌\n/\n送件", "8936", "89365", "國統五", "TCRI6/台新銀", 6, "台新證", new Date("2026-05-12T00:00:00Z"), new Date("2026-07-03T00:00:00Z"), new Date("2026-07-22T00:00:00Z"), "競拍 7/31-8/4", 103.58, 55, new Date("2026-08-17T00:00:00Z"), "2026/08/24 (一)", "YTP(2)=(0%)", "3年", "測試"],
    ],
  });
  assert.equal(snapshot.sourceDate, "2026-08-21");
  assert.deepEqual(snapshot.records[0], {
    stage: "掛牌 / 送件",
    issuerCode: "8936",
    bondCode: "89365",
    bondName: "國統五",
    tcriGuarantee: "TCRI6/台新銀",
    issueAmountBillion: 6,
    underwriter: "台新證",
    announcementDate: "2026-05-12",
    filingDate: "2026-07-03",
    effectiveDate: "2026-07-22",
    marketingEvent: "競拍 7/31-8/4",
    premiumRate: 103.58,
    conversionPrice: 55,
    listingDate: "2026-08-17",
    asoSplitDate: "2026-08-24",
    putCondition: "YTP(2)=(0%)",
    tenor: "3年",
    notes: "測試",
  });
});

test("issuance parser preserves a quoted premium range or an undetermined premium", () => {
  const snapshot = parseIssuanceRows({
    fileName: "CB發行案件更新_20260814.xlsx",
    rows: [
      [null, "代碼", "債券代碼"],
      ["送件", "7631", "76311", "測試一", null, 1, null, null, null, null, null, "102~110", null],
      ["送件", "3450", "34501", "測試二", null, 1, null, null, "未定", null, null, "未定", null],
    ],
  });
  assert.deepEqual(snapshot.records.map((record) => [record.bondCode, record.premiumRate, record.conversionPrice, record.filingDate]), [
    ["76311", "102~110", null, null],
    ["34501", "未定", null, "未定"],
  ]);
});

test("difference report separates added, changed and removed bond codes", () => {
  const result = diffSnapshots(
    { records: [{ bondCode: "89365", listingDate: "2026-08-17" }, { bondCode: "30811", listingDate: null }] },
    { records: [{ bondCode: "89365", listingDate: "2026-08-24" }, { bondCode: "49731", listingDate: null }] },
  );
  assert.deepEqual(result.added.map((item) => item.bondCode), ["49731"]);
  assert.deepEqual(result.changed[0].fields, ["listingDate"]);
  assert.deepEqual(result.removed.map((item) => item.bondCode), ["30811"]);
});
