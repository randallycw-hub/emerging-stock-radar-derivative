# Task 8 report

## Delivered

- Replaced the single IPO navigation item across the six static pages with separate IPO Radar and IPO Calendar entries; each active page exposes `aria-current="page"`.
- Made the home IPO module lead to Radar and added a clear secondary Calendar link.
- Strengthened the editorial IPO presentation: wider desktop canvas, compact ruled summaries, explicit stage tokens in both themes, 44px touch targets, keyboard focus states, and card-first mobile handling for the Calendar table.
- Replaced the GitHub Pages deployment workflow and its retry-oriented test with a daily 22:30 Asia/Taipei (`30 14 * * *` UTC) public IPO refresh wake-up workflow. The workflow only checks out code, runs Node 22, and calls the existing public `/api/ipo-events?refresh=1` endpoint; it has no relay, Pages deployment, retry loop, or email step.
- Added a strict refresh helper that requires HTTP success, `schemaVersion: 1`, an array `records` payload, and an ISO `dataDate`; a valid stale snapshot is accepted without retrying.

## Verification

- Targeted static, IPO UI, and refresh schedule tests: 26 passed.
- Required Task 8 command (`node --test tests/static-showcase-pages.test.mjs tests/static-showcase.test.mjs tests/public-site-refresh-schedule.test.mjs`): 18 passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- Cross-task verification repaired the quarantine allowlist with exactly three already-reviewed first-party IPO literals (no wildcard or host-wide exception). The narrow quarantine suite passes 9/9.
- Full `npm.cmd test`: 382 passed, 0 failed.

## Scope notes

- No deployment was performed.
- No Cloudflare Worker relay was added.
- No method prose or price data was added to the public IPO pages.
