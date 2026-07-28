# D1 Schema Contract

The forward-only `0004_listing_application_completeness.sql` migration adds `chairman_name` to `listing_applications`, preserving the `NormalizedListingApplicationWithStage11586.chairmanName` field. Listing chronology is stored only as validated monotonic ISO dates from application through listing.

This offline schema is SQLite-compatible and is intended for a future Cloudflare D1 repository. It stores only metadata and normalized records; raw HTTP payloads, fixtures, adapters, orchestration, APIs, bindings and deployment are out of scope. Every record is linked to an immutable `source_snapshots` row. Dataset-specific tables use text identifiers, non-negative count checks, explicit enum checks, foreign keys, natural-identity uniqueness and query indexes. No market quote, volume, arbitrage, recommendation or generic JSON record table is present. Migrations are additive (`0001_pipeline_core.sql`, `0002_pipeline_dataset_records.sql`, `0003_company_profile_completeness.sql`, `0004_listing_application_completeness.sql`) and contain no destructive or seed statements. The forward-only profile migration persists `paidInCapital`, `chairperson`, and `generalManager`, completing the `NormalizedCompany28567` contract without overwriting historical migrations. D1 is not created or bound in Task I.

## Repository mapping and read boundary

The repository has four dataset mappings, each with fixed parameterized SQL and an explicit row-to-domain mapping: `94025` reads and writes `emerging_monthly_revenue`; `28567` uses `public_company_profiles`; `11406` uses `bond_issuances` with `bond_put_rights`; and `11586` uses `listing_applications` with `listing_application_underwriters`. Every dataset read is scoped to its snapshot, source, and resource. The two child collections are read only through their selected parent rows and ordered deterministically by parent identity and positive `sequence` (`bond_put_rights` and `listing_application_underwriters` respectively).

Unexpected row shapes, orphan children, mismatched source/resource/snapshot identities, invalid chronology, unsupported dataset values, and incomplete write results fail closed: no partial record is returned or persisted. A published-pointer read selects only the requested `dataset_id`, maps the allowed pointer fields explicitly, and returns `undefined` for no row, a mismatched dataset, or an invalid row shape.

D1 reads are local database operations only. They never fetch, contact, substitute, or otherwise consult an external source.
