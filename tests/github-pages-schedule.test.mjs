import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { checkPublishedMarket, marketRefreshNeeded } from "../scripts/check-market-refresh-needed.mjs";

test("GitHub Pages retries after close and contains no Worker relay", async () => {
  const workflow = await readFile(
    ".github/workflows/deploy-github-pages.yml",
    "utf8",
  );

  assert.match(workflow, /cron:\s*["']30 12 \* \* 1-5["']/);
  assert.match(workflow, /cron:\s*["']30 13 \* \* 1-5["']/);
  assert.match(workflow, /cron:\s*["']0 15 \* \* 1-5["']/);
  assert.match(workflow, /node-version:\s*22/);
  assert.match(workflow, /npm\.cmd|npm ci/);
  assert.match(workflow, /snapshot:showcase/);
  assert.match(workflow, /github\.event_name == 'push'/);
  assert.match(workflow, /steps\.refresh\.outcome == 'success'/);
  assert.match(workflow, /check-market-refresh-needed\.mjs/);
  assert.match(workflow, /actions\/cache\/restore@v4/);
  assert.match(workflow, /actions\/cache\/save@v4/);
  assert.match(workflow, /\.cache\/official-market/);
  assert.match(workflow, /\.cache\/published-history/);
  assert.match(workflow, /published-history-\$\{\{ runner\.os \}\}-/);
  assert.match(workflow, /TZ=Asia\/Taipei date \+%F/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /run:\s*npm run test:showcase/);
  assert.doesNotMatch(workflow, /run:\s*npm test\s*$/m);
  assert.match(workflow, /- "lib\/\*\*"/);
  assert.match(workflow, /- "package\*\.json"/);
  assert.doesNotMatch(workflow, /cloudflare|workers\.dev|relay-approved/i);

  await assert.rejects(
    access(".github/workflows/relay-public-snapshot.yml"),
    /ENOENT/,
  );
  await assert.rejects(
    access("scripts/relay-approved-sources.mjs"),
    /ENOENT/,
  );
});

test("default build stages the formal site and recursive tests cover nested pipeline suites", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:showcase"], "node --test");
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.test, /npm run test:showcase/);
  assert.match(packageJson.scripts.build, /stage-static-showcase\.mjs/);
});

test("tracked showcase excludes fixtures while generated snapshots stay ignored", async () => {
  await assert.rejects(access("static-showcase/data/emerging-market.json"), /ENOENT/);
  const gitignore = await readFile(".gitignore", "utf8");
  assert.match(gitignore, /^\/static-showcase\/data\/current\.json$/m);
  assert.match(gitignore, /^\/static-showcase\/data\/generations\/$/m);
});

test("scheduled retry skips only a verified snapshot for the Taipei date", () => {
  const now = new Date("2026-07-30T13:30:00.000Z");

  assert.equal(
    marketRefreshNeeded({
      manifest: {
        market: {
          status: "verified",
          requestedDate: "2026-07-30",
          dataDate: "2026-07-30",
        },
      },
      now,
    }),
    false,
  );
  assert.equal(
    marketRefreshNeeded({
      manifest: {
        market: {
          status: "verified",
          requestedDate: "2026-07-29",
          dataDate: "2026-07-29",
        },
      },
      now,
    }),
    true,
  );
  assert.equal(
    marketRefreshNeeded({
      manifest: {
        market: {
          status: "failed",
          requestedDate: "2026-07-30",
          dataDate: "2026-07-30",
        },
      },
      now,
    }),
    true,
  );
  assert.equal(
    marketRefreshNeeded({
      manifest: {
        market: {
          status: "verified",
          requestedDate: "2026-07-30",
          dataDate: "2026-07-29",
        },
      },
      now,
    }),
    true,
  );
  assert.equal(marketRefreshNeeded({ manifest: null, now }), true);
});

test("published freshness resolves current generation and fails open for stale or invalid pointers", async () => {
  const now = new Date("2026-07-30T13:30:00.000Z");
  const urls = ["https://site.test/project/data/current.json", "https://site.test/project/data/generations/a/runtime.json", "https://site.test/project/data/generations/a/manifest.json"];
  const requested = [];
  const fetchImpl = async (url) => new Response(JSON.stringify(
    (requested.push(String(url)), String(url)) === urls[0] ? { runtimeUrl: "./data/generations/a/runtime.json" }
      : String(url) === urls[1] ? { manifestUrl: "./data/generations/a/manifest.json" }
      : { market: { status: "verified", dataDate: "2026-07-30" } },
  ), { status: 200 });
  assert.equal(await checkPublishedMarket({ manifestUrl: urls[0], fetchImpl, now }), false);
  assert.deepEqual(requested, urls);
  assert.equal(await checkPublishedMarket({ manifestUrl: urls[0], fetchImpl: async () => new Response("{}", { status: 200 }), now }), true);
  assert.equal(await checkPublishedMarket({ manifestUrl: urls[0], fetchImpl: async () => new Response("", { status: 404 }), now }), true);
});
