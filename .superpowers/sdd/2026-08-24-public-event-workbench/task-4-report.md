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
