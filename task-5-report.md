# Task 5 Report — 22:30 IPO refresh and same-origin API

## Delivered

- Added `refreshOfficialIpoSnapshot({ fetchImpl, now })`, which downloads the five required first-party sources in the prescribed order, limits each response to 8 MB, applies a 20-second abort timeout, and retries failed downloads up to three times with backoff.
- Reused the existing strict TWSE 11586 CSV parser/normalizer and Task 2 JSON parsers. Empty data, invalid UTF-8/JSON/CSV, parser/schema failures, non-2xx responses, and oversized responses fail closed as `IPO_REQUIRED_SOURCE_FAILED:<sourceId>`.
- Each successful candidate includes a five-entry source manifest with source URL, Taipei download time, byte count, parsed row count, and SHA-256 digest. It is built only after all five sources have been downloaded and validated.
- Added the edge `GET /api/ipo-events` endpoint using `env.PIPELINE_DB`, existing public CORS headers, and no public force-refresh parameter. It bootstraps when no snapshot exists; otherwise it refreshes only after 22:30 Asia/Taipei when the current snapshot is from an earlier Taipei date.
- The refresh guard compares dates monotonically (`current.dataDate < Taipei today`), so an accidental future-dated D1 snapshot is served unchanged rather than replaced by an older candidate.
- Publication happens only after a complete candidate is available. A refresh or publication failure returns the previous immutable snapshot with `stale: true` and a 60-second cache policy; no prior snapshot returns a no-store 503 response.

## TDD evidence

1. Added refresh and API tests before `lib/ipo-events/refresh.ts` existed.
2. Ran `node --test tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs` with `UV_THREADPOOL_SIZE=2` and observed the expected `ERR_MODULE_NOT_FOUND` failure.
3. Implemented the smallest refresh/API boundary needed for the tests, then reran the focused tests successfully.
4. Added a future-date regression case, observed it fail against the previous `!==` comparison, and changed the guard to refresh only an older snapshot.

## Verification

All verification used `UV_THREADPOOL_SIZE=2`; Node and TypeScript processes were run at Windows `BelowNormal` priority.

```text
node --test tests/ipo-events-refresh.test.mjs tests/ipo-events-api.test.mjs tests/ipo-events-snapshot.test.mjs tests/ipo-events-repository.test.mjs tests/source-verification/source-ipo-events.test.mjs tests/source-verification/source-11586.test.mjs
24 passed, 0 failed

npm.cmd run typecheck
tsc --noEmit exited 0

git diff --check
exited 0
```

## Concerns

None. The API route itself is worker-bound through `cloudflare:workers`; its environment composition is typechecked, while the refresh/fallback HTTP behavior is exercised through the exported worker-compatible response boundary.
