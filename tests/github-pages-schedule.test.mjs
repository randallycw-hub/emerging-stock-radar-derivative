import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { marketRefreshNeeded } from "../scripts/check-market-refresh-needed.mjs";

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
  assert.match(workflow, /check-market-refresh-needed\.mjs/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
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

test("scheduled retry skips only a verified snapshot for the Taipei date", () => {
  const now = new Date("2026-07-30T13:30:00.000Z");

  assert.equal(
    marketRefreshNeeded({
      manifest: {
        market: {
          status: "verified",
          requestedDate: "2026-07-30",
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
        },
      },
      now,
    }),
    true,
  );
  assert.equal(marketRefreshNeeded({ manifest: null, now }), true);
});
