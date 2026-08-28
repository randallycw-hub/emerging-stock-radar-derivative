import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCompanySearchResults,
  searchPublicRecords,
} from "../static-showcase/assets/site-search.js";

test("V5 search returns one company result with related CB subitems", () => {
  const results = buildCompanySearchResults("公開債", {
    bonds: [{
      bondCode: "35221",
      bondName: "公開債",
      issuerCode: "3522",
      issuerName: "公開發行人",
      sourceId: "internal",
    }],
    emerging: [{ companyCode: "3522", companyName: "公開公司" }],
    ipo: [{ companyCode: "3522", companyName: "公開公司" }],
  });

  assert.deepEqual(results, [{
    kind: "公司",
    code: "3522",
    label: "公開公司",
    href: "./company.html?code=3522",
    bonds: [{ code: "35221", label: "公開債", href: "./bonds.html?bond=35221" }],
  }]);
  assert.equal(JSON.stringify(results).includes("sourceId"), false);
});

test("V5 public site search prioritizes one exact company result and projects only safe fields", () => {
  const results = searchPublicRecords("3522", {
    bonds: [{ bondCode: "35221", bondName: "公開債", issuerCode: "3522", issuerName: "公開發行人", sourceId: "internal" }],
    emerging: [{ companyCode: "3522", companyName: "公開公司", privateNote: "do-not-leak" }],
    ipo: [{ companyCode: "3522", companyName: "公開公司", events: [] }],
  });
  assert.deepEqual(results, [
    {
      kind: "公司",
      code: "3522",
      label: "公開公司",
      href: "./company.html?code=3522",
      bonds: [{ code: "35221", label: "公開債", href: "./bonds.html?bond=35221" }],
    },
  ]);
  assert.equal(JSON.stringify(results).includes("sourceId"), false);
  assert.deepEqual(searchPublicRecords("", { bonds: [] }), []);
});

test("site search provides a keyboard-accessible mobile trigger and overlay state", async () => {
  const [js, css] = await Promise.all([
    readFile(new URL("../static-showcase/assets/site-search.js", import.meta.url), "utf8"),
    readFile(new URL("../static-showcase/assets/app.css", import.meta.url), "utf8"),
  ]);
  assert.match(js, /site-search__mobile-trigger/);
  assert.match(js, /mobileOpen/);
  assert.match(js, /keydown/);
  assert.match(css, /\.site-search__mobile-trigger/);
  assert.match(css, /\.site-search\[data-mobile-open\]/);
});

test("V5 搜尋結果以公司為唯一結果，並在卡片列出可轉債子項", async () => {
  const js = await readFile(new URL("../static-showcase/assets/site-search.js", import.meta.url), "utf8");
  assert.match(js, /buildCompanySearchResults/);
  assert.match(js, /search-result-card/);
  assert.match(js, /可轉債/);
});
