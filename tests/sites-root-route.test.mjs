import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Sites root redirects directly to the formal multi-page market site", async () => {
  const source = await readFile("app/page.tsx", "utf8");

  assert.match(source, /import \{ redirect \} from "next\/navigation"/);
  assert.match(source, /redirect\("\/market-site\/index\.html"\)/);
  assert.match(source, /可轉債與興櫃盤後資訊/);
  assert.doesNotMatch(source, /<Homepage\s*\/>/);
});
