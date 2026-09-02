import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseCbUnderwritingHtml,
} from "../../lib/source-verification/source-cb-underwriting.ts";

const fixtureUrl = new URL(
  "../fixtures/source-verification/cb-underwriting/current-year-minimal.html",
  import.meta.url,
);

const fixtureHtml = await readFile(fixtureUrl, "utf8");

test("filters only domestic convertible-bond underwriting cases", () => {
  const result = parseCbUnderwritingHtml(fixtureHtml);

  assert.equal(result.rocYear, 115);
  assert.equal(result.notice, "本公告系統僅供參考，相關資料以正式刊登報紙之公告內容為準。");
  assert.deepEqual(result.records, [
    {
      referenceNumber: "115003",
      filedDate: "2025/12/26",
      leadUnderwriter: "富邦綜合證券股份有限公司",
      issuerName: "志聖工業股份有限公司",
      guaranteeType: "unsecured",
      placementMethods: ["詢價圈購"],
      caseStatus: "正常",
    },
    {
      referenceNumber: "115012",
      filedDate: "2026/01/02",
      leadUnderwriter: "永豐金證券股份有限公司",
      issuerName: "十銓科技股份有限公司",
      guaranteeType: "secured",
      placementMethods: ["競價拍賣"],
      caseStatus: "正常",
    },
  ]);
});

test("accepts the current official layout wrapper around the verified result table", () => {
  const currentOfficialShape = fixtureHtml
    .replace(
      '<table id="ctl00_cphMain_gvResult">',
      '<table class="style1"><tr><td><table id="ctl00_cphMain_gvResult">',
    )
    .replace('</tbody>\n    </table>', '</tbody>\n    </table></td></tr></table>');

  const result = parseCbUnderwritingHtml(currentOfficialShape);

  assert.equal(result.rocYear, 115);
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].issuerName, "志聖工業股份有限公司");
});

test("validates Gregorian filed dates within the verified carry-over window", async (t) => {
  await t.test("accepts the previous Gregorian year", () => {
    assert.equal(parseCbUnderwritingHtml(fixtureHtml).records[0].filedDate, "2025/12/26");
  });

  const rejectedDates = [
    ["invalid date", "2025/02/30"],
    ["too-old year", "2024/12/26"],
    ["future year", "2027/12/26"],
  ];
  for (const [name, filedDate] of rejectedDates) {
    await t.test(name, () => {
      assert.throws(
        () => parseCbUnderwritingHtml(fixtureHtml.replaceAll("2025/12/26", filedDate)),
        /filed date/,
      );
    });
  }
});

test("fails closed on notice, result table, header, or row-width drift", () => {
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("本公告系統僅供參考", "")),
    /notice/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("ctl00_cphMain_gvResult", "changed")),
    /result table/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("主辦承銷商", "承銷公司")),
    /headers/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("<td>正常</td>", "")),
    /row 1.*11 fields/,
  );
});

test("fails closed on page-title and notice-structure drift", () => {
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("115年－承銷公告", "114年－承銷公告")),
    /page title/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("<p>本公告系統", "<p>前綴本公告系統")),
    /notice/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("。</p>", "。後綴</p>")),
    /notice/,
  );
  assert.throws(
    () => parseCbUnderwritingHtml(fixtureHtml.replace("<p>本公告系統", "<div>本公告系統").replace("。</p>", "。</div>")),
    /notice/,
  );
});

test("fails closed when more than one verified result table appears", () => {
  const resultTable = fixtureHtml.match(/<table id="ctl00_cphMain_gvResult">[\s\S]*?<\/table>/)?.[0];
  assert.ok(resultTable);

  const withDuplicateResultTable = fixtureHtml.replace("\n  </body>", `\n    ${resultTable}\n  </body>`);

  assert.throws(() => parseCbUnderwritingHtml(withDuplicateResultTable), /result table/);
});
