import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildRuntimeBootstrap,
} from "../scripts/refresh-static-showcase-data.mjs";

test("正式展示資料只從核准的三個官方 CSV 匯入", () => {
  assert.deepEqual(OFFICIAL_SHOWCASE_SOURCES, {
    "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
    "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    "11586":
      "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  });
});

test("重新產生 runtime 時只寫入正式資料網址，不嵌入呈現程式", () => {
  const manifest = { generatedAt: "2026-07-30", datasets: [] };
  const result = buildRuntimeBootstrap(manifest);

  assert.match(result, /window\.__OFFICIAL_SHOWCASE__/);
  assert.match(result, /"manifestUrl":"\.\/data\/manifest\.json"/);
  assert.match(result, /"11406":"\.\/data\/11406\.json"/);
  assert.doesNotMatch(result, /公司代號|document\.querySelector/);
});
