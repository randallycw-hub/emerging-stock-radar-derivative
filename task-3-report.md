# Task 3 Report — IPO Event Snapshot

## Scope

Implemented the shared IPO event snapshot in `lib/ipo-events/snapshot.ts` and its focused Node test suite in `tests/ipo-events-snapshot.test.mjs`.

The snapshot consumes only the normalized first-party source row interfaces delivered by Task 2. It does not fetch, enrich, or infer information from third-party sources. It retains only the specified official underwriting fields already present in those source rows; it does not add market-price data.

## Delivered behavior

- Aggregates records exclusively by `(companyCode, market)`; names never drive matching.
- Combines application, listing evidence, auction, and public-offering rows.
- Emits official schedule events and deduplicates each one by `(companyCode, market, kind, date)`, retaining all contributing source record IDs. Withdrawal/delay notes and cancellation flags set the record status but do not emit an event: the sources do not provide their occurrence dates.
- Produces deterministic ordering: records by company code and market; events by date and kind; source IDs lexically.
- Derives stages `A`–`D`, `listed`, and the explicit exceptional states `withdrawn`, `delayed`, and `cancelled`.
- Treats any conflicting non-empty value for a shared field as a hard `IPO_SOURCE_CONFLICT:<field>` error. Duplicate auction/public-offering rows can fill each other's `null` or empty fields without conflict.
- Preserves missing underwriting values as `null`; no fallback price is fabricated. `applicationDate` remains the specified `string` public contract and uses the approved display placeholder `—` for listing-only, auction-only, and public-offering-only records; it is never passed to date arithmetic.
- Calculates Taipei calendar-day distance from validated ISO dates without timezone-dependent local-date parsing.

## TDD evidence

1. Added the snapshot test file before implementation.
2. Ran `node --test tests/ipo-events-snapshot.test.mjs` and observed the expected `ERR_MODULE_NOT_FOUND` for the absent module.
3. Added the minimal snapshot implementation and reran the focused tests successfully.
4. Review fixes added failing tests for non-inferred exception dates, null-field completion across duplicate official rows, and missing application-date handling before the implementation was changed.
5. The second review added failing tests for cancellation flags without an event date and for the `—` application-date placeholder before the implementation was changed.

## Verification

Commands were run with `UV_THREADPOOL_SIZE=2`:

```text
node --test tests/ipo-events-snapshot.test.mjs tests/source-verification/source-ipo-events.test.mjs
10 passed, 0 failed

npm.cmd run typecheck
tsc --noEmit exited 0

git diff --check
exited 0
```

## Concerns

None. The requested snapshot type includes official provisional/final underwriting values. This implementation carries those verified source fields only and excludes any trading or market-price enrichment.
