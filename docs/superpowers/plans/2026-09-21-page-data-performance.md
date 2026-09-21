# Page data performance repair

User reports slow data appearance after publication. Work stays in the existing isolated worktree and Site; prior publishing authorization applies.

## Evidence

CB overview sequentially loads pointer, runtime and a 9,709,229-byte decoded workbench. Its cross-market events occupy about 5.1 million compact JSON characters. Homepage and emerging page load a 10,507,151-byte shared history model. Each safeJsonFetch uses no-store, preventing browser reuse/revalidation. A local official-mirror measurement took 644 ms + 75 ms + 1,932 ms for the CB request chain; these are this machine's observations, not a promise for other networks.

## Implementation

1. Add differential tests for compact CB overview, precomputed homepage and emerging-only models. Preserve every displayed fact, date, event filter and missing value. Add staging/runtime coverage with backward compatibility for prior runtime envelopes.
2. Add scripts/lib/public-page-snapshots.mjs, deriving compact artifacts from already verified shared snapshots. Register artifact names in staging allowlists and runtime. Apply existing public metadata sanitization before publishing.
3. Switch only homepage, CB overview and emerging loaders to the scoped artifacts, with legacy full-model compatibility. Revalidate browser cached responses with no-cache instead of no-store; never serve an application-level stale fallback after a request error.
4. Materialize snapshots, measure decoded and gzip sizes, run relevant tests, full tests, typecheck, lint and production build under the user's two-core/BelowNormal limits. Verify UI and request selection locally.
5. Push exact source and verified derived artifacts to the existing mirrors, package with Sites, publish to the existing public Site, and report verified improvements and the separate unchanged market-date limitation.

## Additional root cause and verification

Global header search eagerly fetched the 10,507,151-byte market model on every page, even without search interaction. It now binds immediately and loads an exact projection of the canonical search index only on focus/input. Concurrent requests share one promise, failed loads can retry, and Escape dismissals survive late responses.

Decoded UTF-8 bytes / local gzip bytes (same verified 2026-09-08 snapshot):

| Artifact | Decoded | gzip |
| --- | ---: | ---: |
| Original CB workbench | 9,709,229 | 439,394 |
| Original shared market model | 10,507,151 | 582,218 |
| CB overview | 2,011,736 | 136,839 |
| Homepage summary | 3,390 | 909 |
| Emerging overview | 359,680 | 38,679 |
| Search index on interaction | 440,782 | 43,719 |

These are artifact sizes, not measured end-user time or guaranteed CDN transfer sizes. Local browser verification displayed 386 CB rows, two results for code 2303, canonical company/CB search results, the homepage event sections, and the emerging summary of 363 companies. Local HTTP logs confirmed scoped data requests, no shared full model for these page visits, and the search index requested only after interaction. Data revalidation returned 304 on subsequent requests. Differential tests preserve CB filter results, homepage sections, emerging rows and canonical search records; a delayed-response interaction test covers Escape dismissal. A cached module on the old preview origin required a fresh preview origin for reliable verification.

Market freshness remains separate: the active verified market snapshot is 2026-09-08. No date or price is relabeled by this performance change.

Release validation: typecheck, full lint, production build and all 1,373 full-suite tests passed. The final delayed-response interaction regression and related projection/search tests passed separately (12 tests); targeted lint passed and the staged search module hash matches the final source. Review found the Escape race above, which is fixed and covered.
