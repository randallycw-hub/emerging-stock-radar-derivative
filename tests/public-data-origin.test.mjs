import assert from "node:assert/strict";
import test from "node:test";

import {
  PUBLIC_DATA_POINTER_URL,
  resolvePublishedDataUrl,
  configuredPublishedPointerUrl,
} from "../static-showcase/assets/public-data-origin.js";

test('all localhost pages use the same local generation even when legacy runtime points to production',()=>{
  assert.equal(String(configuredPublishedPointerUrl({generationPointerUrl:PUBLIC_DATA_POINTER_URL.href},'http://127.0.0.1:4176/market-site/data/current.json')),'http://127.0.0.1:4176/market-site/data/current.json');
});

test("published snapshots resolve generation artifacts from the approved GitHub data mirror", () => {
  const runtimeUrl = resolvePublishedDataUrl(
    "./data/generations/3b9f982ea995602c/runtime.json",
    PUBLIC_DATA_POINTER_URL,
  );

  assert.equal(
    String(runtimeUrl),
    "https://raw.githubusercontent.com/randallycw-hub/emerging-stock-radar-derivative/main/static-showcase/data/generations/3b9f982ea995602c/runtime.json",
  );
});

test("published snapshots refuse generated data references outside the approved mirror", () => {
  assert.equal(
    resolvePublishedDataUrl("https://untrusted.example/data.json", PUBLIC_DATA_POINTER_URL),
    null,
  );
});

test("local preview keeps resolving root-relative generation artifacts", () => {
  assert.equal(
    String(resolvePublishedDataUrl(
      "./data/generations/abcdef/runtime.json",
      "file:///preview/static-showcase/data/current.json",
    )),
    "file:///preview/static-showcase/data/generations/abcdef/runtime.json",
  );
});
