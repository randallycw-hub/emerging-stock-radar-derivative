import assert from "node:assert/strict";
import test from "node:test";

import {
  OFFICIAL_SHOWCASE_SOURCES,
  buildEmbeddedRuntime,
} from "../scripts/refresh-static-showcase-data.mjs";

test("正式展示資料只從核准的三個官方 CSV 匯入", () => {
  assert.deepEqual(OFFICIAL_SHOWCASE_SOURCES, {
    "94025": "https://mopsfin.twse.com.tw/opendata/t187ap05_R.csv",
    "11406": "https://www.tpex.org.tw/storage/bond_publish/ISSBD5_data.csv",
    "11586":
      "https://www.twse.com.tw/company/applylistingCsvAndHtml?selectType=Local&type=open_data",
  });
});

test("重新產生 runtime 時保留呈現程式並替換正式資料前綴", () => {
  const existing =
    'const manifest = {"old":true};\nconst embeddedData = {};\nconst revenue = [];\nconst bonds = [];\nconst ipo = [];\nconst val = () => "保留";\n';
  const manifest = { generatedAt: "2026-07-30", datasets: [] };
  const datasets = { "94025": [{ 公司代號: "1260" }], "11406": [], "11586": [] };

  const result = buildEmbeddedRuntime(existing, manifest, datasets);

  assert.match(result, /"公司代號":"1260"/);
  assert.match(result, /const val = \(\) => "保留";/);
  assert.doesNotMatch(result, /"old":true/);
});
