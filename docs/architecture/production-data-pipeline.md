# Production Data Pipeline Architecture

## Boundaries

The pipeline is divided into source adapters, transport validation, normalization, repository persistence, publication, query services, and presentation. Adapters consume one Registry-approved resource only. Suspended resources are never selected by retry or fallback logic.

## Source approval gate

`CANDIDATE` sources are documentation-only. `APPROVED_FOR_V1_DESIGN` sources may define models and fixtures. `VERIFIED_FOR_IMPLEMENTATION` resources may have formal adapters. `APPROVED_FOR_PRODUCTION` is required before production scheduling or publication. `SUSPENDED` immediately disables synchronization while retaining prior audit records.

Current implementation resources are 11406 CSV, the selected 94025 primary resource, 11586 CSV, and 28567 CSV. 11586 and 28567 dataset-level status remains design approval. Their OpenAPI resources remain suspended.

## Ingestion state machine

```text
RUNNING -> RAW_CAPTURED -> VALIDATED -> NORMALIZED -> STAGED -> PUBLISHED
    |          |             |             |            |
    +----------+-------------+-------------+------------+-> FAILED/PARTIAL
```

`PARTIAL` is a health state only. It cannot be a published snapshot. A failure leaves the previous published pointer and records source health, error class, response hash when available, and run timestamps.

## Data flow

1. Create an ingestion run with source/resource IDs and UTC start time.
2. Fetch the exact approved URL with HTTPS, host/path, content-type, size, timeout, and redirect checks.
3. Save raw metadata: HTTP status, content type, response hash, byte count, raw row count, fetched UTC time, and adapter/schema versions.
4. Parse and strictly validate transport fields; reject unknown, missing, malformed, duplicate, and semantically shifted records.
5. Normalize official dates as Asia/Taipei calendar dates and numeric strings without timezone conversion.
6. Build integrity reports, including 94025 coverage identity and 28567 exact enrichment joins.
7. Write all normalized records to a staging snapshot.
8. Compute deterministic diffs and derived events against the previous published snapshot.
9. Verify completeness and source health for every required resource.
10. Atomically change the published snapshot pointer only after all checks pass.
11. Query services read the pointer and attach source attribution, published time, fetched time, and stale/suspended health.

## Repository and D1 design

The `Repository` interface is the only persistence dependency of services and orchestration. `InMemoryRepository` is mandatory for unit and contract tests. `D1Repository` is a later implementation of the same interface.

Tables are `ingestion_runs`, `source_snapshots`, `emerging_monthly_revenue`, `public_company_profiles`, `bond_issuances`, `listing_applications`, `published_snapshots`, `record_diffs`, `derived_events`, and `source_health`. Every domain row includes source ID, dataset ID, snapshot ID, and created/updated UTC timestamps. Official dates are text in `YYYY-MM-DD`.

Required indexes are `(sourceId, companyCode)`, `(sourceId, bondId)`, `(eventDate, eventKind)`, `(sourceId, fetchedAt)`, and a unique published pointer by logical dataset. Lists use these indexes and cursor pagination; they do not scan full tables per request.

Because multiple requests cannot be assumed to share one transaction, staging tables and a published pointer provide atomic visibility. Retain the previous pointer until a later retention job confirms a newer complete snapshot.

## Source-specific rules

### 94025

The monthly revenue CSV builds the coverage set by `yearMonth + companyCode`. Source ratios remain source values; revenue units are explicit. Coverage removal is not emitted when a run fails.

### 28567

28567 is enrichment-only. Join only exact company codes already present in the 94025 coverage set. Missing and ambiguous matches are diagnostics, not merged records. No current-emerging, listing, termination, market-status, or completeness claim is derived from this dataset.

### 11406

Store issuance terms, dates, balances, conversion periods, put rights, and balance-change reasons. Never read `bond_cb_daily` or generate market-price, quote, volume, discount, theoretical-price, or arbitrage fields.

### 11586

Use only the approved CSV resource. Preserve valid application dates and chronology warnings; exclude underwriting price from normalized and published models. The suspended OpenAPI cannot generate applications or fallback data.

## Failure, rollback, and health

Failures are classified as transport, HTTP, content-type, size, parse, schema drift, identity, integrity, authorization, or repository errors. Retry is bounded and applies only to the same approved resource. No error selects another source.

Health records include last success, last failure, consecutive failures, stale threshold, response hash, accepted/rejected counts, and suspension state. The UI displays the last successful published time and an update-warning state; it never displays partial data as complete.

## Testing layers

Fixture contract tests validate schemas and mappings without network. Adapter unit tests use mock HTTP responses for timeout, errors, empty payloads, malformed content, and semantic drift. Repository contract tests run against in-memory storage. D1 integration tests run only in staging. Live smoke scripts report diagnostics, do not publish, and are excluded from `npm test`.

## Deployment and approval gate

No D1, worker schedule, hosting binding, or production adapter is enabled until the resource is `APPROVED_FOR_PRODUCTION`, staging rollback is demonstrated, attribution pages are verified, and a human reviewer signs the acceptance checklist. This design document does not execute those actions.
