import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_PRIMARY_NAVIGATION,
  renderPrimaryNavigation,
  renderPublicFooter,
} from "../static-showcase/assets/site-shell.js";

test("V5 shell keeps four research destinations and groups public source links in the footer", () => {
  assert.deepEqual(PUBLIC_PRIMARY_NAVIGATION.map((item) => item.label), ["首頁", "興櫃", "IPO", "可轉債"]);
  assert.doesNotMatch(renderPrimaryNavigation(), /資料中心/);

  const footer = renderPublicFooter();
  assert.match(footer, /市場/);
  assert.match(footer, /使用/);
  assert.match(footer, /本站/);
  assert.match(footer, /來源/);
  assert.match(footer, /TWSE/);
  assert.match(footer, /TPEx/);
  assert.doesNotMatch(footer, /系統資料狀態/);
});
