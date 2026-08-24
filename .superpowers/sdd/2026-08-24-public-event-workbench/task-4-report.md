# Task 4 report — CB snapshot evidence and IPO life-cycle

## TDD evidence

- **RED:** `UV_THREADPOOL_SIZE=2 node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs` before implementation: 18 passed, 3 failed. The expected failures were the missing CB snapshot labels, missing `projectIpoLifecycle`, and missing IPO public-evidence labels.
- **GREEN (focused, low-load):** the same focused command after implementation: 21 passed, 0 failed.
- **Full low-load verification:** ran the shell at `BelowNormal` priority with `UV_THREADPOOL_SIZE=2`, then `npm test`. Build completed and Node reported 960 passed, 0 failed (14,158.694 ms).

## Delivered behavior

- Added a CB public-evidence snapshot before the status matrix with date, outstanding balance, remaining ratio, guarded change, next event, maturity, comparability, and allowlisted source links only.
- Exported `projectIpoLifecycle(row, today)` with the fixed six-stage order, unavailable defaults, and date-based complete/upcoming state.
- Added lifecycle disclosure to both desktop table rows and mobile cards after recent/next/data-date facts. Unknown events remain in the full event list.
- Suppressed underwriting, issuance, auction, and pricing presentation when no existing official evidence supports it; unavailable data is explicit rather than inferred.

## Self-review

- Checked all requirement files are limited to the six requested files plus this report.
- `git diff --check` returned no whitespace errors.
- New CSS uses existing semantic color variables and adds the CB header compact layout under the existing 900px breakpoint; existing ARIA and native `<details>` patterns are preserved.
- Source links continue through the existing exact allowlist and HTTPS validation.

## Round 1 reviewer fixes

### Root cause

- The CB snapshot used a generic `11406` fallback and rendered field values directly, so it did not require field-specific evidence.
- IPO presentation treated any `sourceRecordId` as trusted instead of resolving it through the current snapshot's approved manifest identifiers.
- IPO's active presentation path reused stage-code matching only, so old `A`–`D` records and terminal exceptions could influence the normal calendar path.

### TDD and verification evidence

- **RED:** focused low-load test command after adding three regressions: 21 passed, 3 failed, each because the new CB/IPO projection or calendar-stage contract was absent.
- **GREEN (focused):** `UV_THREADPOOL_SIZE=2 node --test tests/static-showcase-bond-ui.test.mjs tests/static-showcase-ipo-ui.test.mjs`: 24 passed, 0 failed.
- **Full low-load:** shell priority set to `BelowNormal` with `UV_THREADPOOL_SIZE=2`, then `npm test`: build completed; 963 passed, 0 failed (14,439.0952 ms).

### Changes and self-review

- CB snapshot now fails closed for data date, outstanding amount, remaining ratio, and maturity without each field's own approved evidence; its unavailable message includes the specific reason.
- IPO source-record identifiers are mapped only to known source formats and accepted only when the matching approved identifier appears in the loaded snapshot manifest. Underwriter, issuance, and auction UI consumes that normalized proof only.
- The normal IPO path and stage counters share an active predicate: only current A–D records are included. Withdrawn/cancelled records and entries whose latest known event is more than 365 days behind the snapshot date appear only under `all` history.
- `git diff --check` returned no whitespace errors. No schema or advice behavior was added.
