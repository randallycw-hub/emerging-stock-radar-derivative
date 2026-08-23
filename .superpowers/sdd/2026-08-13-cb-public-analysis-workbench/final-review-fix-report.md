# Final review repair report

Date: 2026-08-23
Scope: one focused offline repair round; no live fetch, publication, deployment, or push.

## 1. Active legacy history rejected before migration

- Root cause: `readPublishedBondHistoryFromActive` sent the active generation's legacy seven-key rows directly to the strict fourteen-key parser. Cache overlap also silently preferred the active row instead of proving equality.
- Failing tests added first: `published history verifies and migrates a declared legacy active generation before merging cache`; `published history rejects conflicting cache values for the same active legacy identity`.
- RED output: `tests 2`, `pass 0`, `fail 2`; both failed with `INVALID_PUBLISHED_BOND_HISTORY:bond market history point 0 keys must match contract`.
- Fix: read raw JSON, verify the active manifest hash/raw byte metadata/count, migrate only the exact legacy key set by filling the seven unavailable fields with `null`, then run the strict parser. Duplicate cache/active identities must be byte-value-equivalent after normalization or fail with `CONFLICTING_PUBLISHED_BOND_HISTORY`.
- Coverage: the checked-in active generation test proves all `4,393` identities and all seven legacy values are preserved; a separate count-tamper test proves fail-closed manifest verification.
- GREEN output: `checked-in active legacy history preserves all 4,393 identities and values during migration` and `published legacy history verifies manifest count before migration` both passed (`tests 2`, `pass 2`, `fail 0`).

## 2. Producer discarded verified workbench events

- Root cause: the producer and staged verifier both hard-coded `currentEvents: []` / `events: []` even though normalized 11406 terms and the verified redemption snapshot were already loaded.
- Failing tests added first: production publication expected put/maturity events; a pure event projection expected redemption/delisting events; consistency verification was required to reject an emptied event list.
- RED output: `tests 3`, `pass 0`, `fail 3`; production returned `[]`, the event helper was absent, and forged event removal was accepted.
- Fix: deterministically generate listing, put, and maturity events from 11406 plus redemption and delisting events from the verified TPEx redemption snapshot. Event provenance is restricted to the two already-approved exact source IDs and URLs. Both staged and outer verification independently reconstruct the expected events.
- GREEN output: the three focused event/verification tests passed (`tests 3`, `pass 3`, `fail 0`).

## 3. Stale optional evidence appeared complete

- Root cause: field-state construction considered only whether company/institution values existed, losing the optional source outcome that produced or retained them.
- Failing test added first: `optional source outcomes override value presence in workbench field states`.
- RED output: `tests 1`, `pass 0`, `fail 1`; the builder rejected the missing source-state contract.
- Fix: add a strict per-bond source-state input, derive it from supplemental and issuer-research snapshots, and map stale/unavailable evidence to `stale`/`missing`. Workbench consistency independently recomputes the mapping, including stale retained snapshots, so forged `complete` states fail.
- GREEN output: focused field-state test passed (`tests 1`, `pass 1`, `fail 0`); the stale cross-file verification path also passed and rejects forged complete labels.

## 4. List used reduction and put-only fields

- Root cause: the list header and renderers bound “流通餘額比例” to `outstandingReductionRate` and “下一事件” to `nextPutDate`, bypassing canonical `remainingRatio` and `nextEventType/nextEventDate/daysToNextEvent`.
- Failing tests added first: exact sort-key assertions and a pure redemption presentation test.
- RED output (combined with item 5): `tests 3`, `pass 0`, `fail 3`; the old sort keys remained and `bondListPresentation` did not exist.
- Fix: desktop and mobile renderers share the same pure presentation helper, use `remainingRatio`, and label canonical redemption/put/maturity events. Sort keys are now `remainingRatio` and `nextEventDate`; legacy fallback records also populate canonical event fields.
- GREEN output (combined with item 5): `tests 3`, `pass 3`, `fail 0`.

## 5. Same-day zero-trade null close could look usable

- Root cause: null-close equivalent quotes were filtered before missing-reason construction, so an older traded close could be retained without recording that the current day had no CB close.
- Failing test added first: `marks a same-day zero-trade null CB quote unusable even when an older close exists`.
- RED output: failed because `missingReasons` did not contain `NO_CB_CLOSE`.
- Fix: detect an exact same-day equivalent quote with `close: null` and zero trading units, add `NO_CB_CLOSE`, retain the older close only as visibly stale context, and make list quality require complete quality with no missing reasons.
- GREEN output: the zero-trade test passed; the focused three-test UI/quality run reported `pass 3`, `fail 0`.

## 6. Unreachable legacy list-detail renderer remained

- Root cause: the page had switched to `renderBondDetail`/`bindBondDetail`, but the old `renderWorkbench`, `drawHistoryChart`, canvas helpers, section constants, and conversion-price fetch remained unreachable.
- Regression check: page source must not contain either legacy function; staged-page acceptance now expects only datasets the live page loader actually reads.
- Fix: remove the dead renderer/chart/helper block and unused conversion dataset request. The active accessible candlestick/detail implementation is unchanged.
- GREEN output: `bond page exposes the complete sortable CB workbench`, staged-page acceptance, desktop/mobile disclosure, keyboard, and mobile-card tests all passed.

## Final verification (BelowNormal priority, `UV_THREADPOOL_SIZE=2`, test concurrency 1)

- Focused repair suite: `tests 176`, `pass 176`, `fail 0`, `duration_ms 11844.7456`.
- Full Node suite: `node --test --test-concurrency=1 --test-reporter=dot` exited `0` (dot reporter emitted no failures).
- TypeScript: `npm run typecheck` exited `0` (`tsc --noEmit`).
- Modified-file lint: `npx eslint ...` exited `0` with no output.
- Packaging: `npm run build` exited `0`; output ended with `Build complete. Run vinext start to start the production server.` No server was started.
- Whitespace: `git diff --check` exited `0` with no output.

No live source request, secret access, publish/deploy operation, push, amend, rebase, or worktree cleanup was performed.

## Post-repair visual QA compatibility fix

- Root cause: the checked-in active generation predates the workbench schema and has no `remainingRatio`, `nextEvent*`, or `dataQuality` keys. The corrected list renderer consequently showed blank ratio/event fields until the next verified nightly refresh.
- Failing tests added first: `page loader projects legacy market fields into canonical list fields until the next refresh`; initially all four canonical list values were `undefined`, then the quality assertion failed with `dataQuality: undefined`.
- Fix: apply a list-boundary adapter only when the canonical properties are absent. It derives the legacy remaining ratio from the published reduction rate, preserves an explicit canonical value (including `null`), projects the already-published put/maturity event fields, and marks legacy quality complete only when a CB close exists and the published missing-reason array is explicitly empty.
- Green output: `tests/static-showcase-bond-ui.test.mjs` passed `10/10` at BelowNormal priority. Browser reload of the existing active generation rendered `100%`, `賣回 497 天`, and `可用` in the first row, with no desktop horizontal overflow.
